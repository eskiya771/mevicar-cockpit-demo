/* Web route stop / corridor integration – Google mocks, no real key, network or GPS.
 * Google Maps JS Routes.computeRoutes intermediates -> real waypoint routing.
 * Stops commit only after success, retaining Road Assist + active GPS guidance.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext, Script} from 'node:vm';

const source=readFileSync(new URL('../navigation-google.js',import.meta.url),'utf8');
const shell=readFileSync(new URL('../index.html',import.meta.url),'utf8');
new Script(source);
assert.match(shell,/MeviWebNavParity\.openStopSearch\(\)/);
assert.match(shell,/MeviGoogleNav\.removeRouteStop\(/);
const original={name:'Ziel Bamberg',address:'Bamberg',lat:49.89,lng:10.91};
const origin={lat:49.60,lng:11.01};
const waypoint={name:'Tankstelle',address:'Unterwegs',lat:49.74,lng:10.97,placeId:'ChIJFuel111'};
const far={name:'Weit entfernt',address:'Berlin',lat:52.52,lng:13.40,placeId:'ChIJFarAway'};
let routeRequests=[],placeRequests=[],events=[],routeShouldFail=false,watches=0,clearedWatches=0;
const route={
 path:[{...origin},{lat:49.71,lng:10.98},{...original}],
 distanceMeters:40000,durationMillis:2400000,
 legs:[{steps:[{instructions:'Weiterfahren',maneuver:'STRAIGHT',distanceMeters:15000,
  startLocation:{...origin},endLocation:{lat:49.71,lng:10.98},path:[{...origin},{lat:49.71,lng:10.98}]},
  {instructions:'Ziel',maneuver:'STRAIGHT',distanceMeters:25000,
   startLocation:{lat:49.71,lng:10.98},endLocation:{...original},path:[{lat:49.71,lng:10.98},{...original}]}]}],
 createPolylines:()=>[]
};
const Google={maps:{
 importLibrary:async kind=>kind==='routes'?{Route:{computeRoutes:async request=>{
  routeRequests.push(request);if(routeShouldFail)throw new Error('Google route unavailable');
  return{routes:[route]};
 }}}:kind==='places'?{Place:class {
  static async searchByText(request){
   placeRequests.push(request);
   return{places:[
    {id:waypoint.placeId,displayName:waypoint.name,formattedAddress:waypoint.address,
     location:{lat:waypoint.lat,lng:waypoint.lng},types:['gas_station']},
    {id:far.placeId,displayName:far.name,formattedAddress:far.address,
     location:{lat:far.lat,lng:far.lng},types:['gas_station']}
   ]};
  }
  constructor({id}){this.id=id}
  async fetchFields(){this.location={lat:49.74,lng:10.97};this.formattedAddress='Importierter Zwischenhalt'}
 },SearchByTextRankPreference:{DISTANCE:'DISTANCE',RELEVANCE:'RELEVANCE'}}:{}
}};
const status={textContent:'',hidden:false,classList:{add(){}}};
const targets={'mg-status':status,'mg-map-notice':{hidden:false},
 'mg-change-key':{hidden:true},'mg-manual-origin':{hidden:true}};
const doc={getElementById:id=>targets[id]||null,querySelector:()=>null,createElement:()=>({})};
const storage={getItem:key=>key==='mevicar-next-google-maps-key-v1'?'WEB-ONLY-TEST-KEY':
 key==='mevicar-next-destinations-v1'?JSON.stringify({favorites:[original],recent:[]}):null,
 setItem(){}};
const geo={
 getCurrentPosition(ok){ok({coords:{latitude:origin.lat,longitude:origin.lng,accuracy:10}})},
 watchPosition(){watches++;return 77},clearWatch(id){if(id===77)clearedWatches++}
};
const W={google:Google,
 MeviRoadAssist:{onRoute:()=>events.push('route'),onGuidanceStart:()=>events.push('guidance-start'),
  onGuidanceStop:()=>events.push('guidance-stop'),onPosition:()=>events.push('position')},
 meviGoogleDestination(){},meviGoogleRerender(){},meviGoogleRouteReady(){}};
runInNewContext(source,{window:W,document:doc,localStorage:storage,navigator:{geolocation:geo},
 google:Google,Intl,setTimeout,clearTimeout,setInterval:()=>1,clearInterval:()=>{},console});
const api=W.MeviGoogleNav;
await api.pick('stored',0);
assert.equal(await api.calculateRoute(),true);
assert.equal(api.routeContext().hasRoute,true);
assert.equal(api.routeContext().stops.length,0);
assert.equal(api.routeContext().destination.name,original.name);
assert.equal(routeRequests.length,1);
const imported=await api.webResolveStop({name:'Importierter Favorit',placeId:'ChIJImportedOnly'});
assert.equal(imported.lat,49.74,'Resolve imported Android Place-ID-only entry');
assert.equal(imported.lng,10.97);
assert.equal(api.routeContext().destination.name,original.name,'Place resolution must not replace destination');
assert.equal(api.routeContext().stops.length,0);
assert.equal(routeRequests.length,1,'Place resolution must not calculate a new route by itself');

assert.equal(await api.addRouteStop(waypoint),true,'Accept valid stop');
assert.equal(routeRequests.length,2,'Adding stop must request real Google route');
assert.equal(routeRequests[1].intermediates.length,1);
assert.equal(routeRequests[1].intermediates[0].location.lat,waypoint.lat);
assert.equal(routeRequests[1].intermediates[0].location.lng,waypoint.lng);
assert.equal(api.routeContext().stops.length,1);
assert.equal(api.routeContext().destination.name,original.name,'Never replace final destination');
assert.equal(await api.addRouteStop(waypoint),false,'No duplicate stop');
assert.equal(routeRequests.length,2,'Reject duplicate without Google request');

routeShouldFail=true;
assert.equal(await api.addRouteStop({...waypoint,name:'Different stop',placeId:'',lat:49.78}),false,
 'Failed Google route leaves original intact');
assert.equal(api.routeContext().stops.length,1,'Rollback uncommitted waypoint');
assert.equal(api.routeContext().destination.name,original.name);
assert.equal(api.hasPlannedRoute(),true,'Keep old route after failed waypoint');
routeShouldFail=false;

assert.equal(await api.webPoi('fuel','Tankstelle',null,{alongRoute:true}),true);
assert.equal(api.webData().poiAlongRoute,true);
assert.equal(api.webData().poiResults.length,1,'Corridor filters out far-away Google Places results');
assert.equal(api.webData().poiResults[0].placeId,waypoint.placeId);
assert(placeRequests.length<=4,'Maximum four billable Places queries along route');
assert(placeRequests.length>=1);
assert(placeRequests.every(x=>x.textQuery==='Tankstelle'&&x.includedType==='gas_station'));
assert(placeRequests.every(x=>x.locationBias?.radius===14000),'Circle must be a bias only');
assert.equal(api.routeContext().stops.length,1,'POI search must not change active route');

assert.equal(await api.removeRouteStop(0),true);
assert.equal(api.routeContext().stops.length,0);
assert.equal(routeRequests.at(-1).intermediates,undefined,'Remove stop uses direct route');

assert.equal(await api.startGuidance(),true,'Start normal live GPS guidance');
assert.equal(api.routeContext().active,true);
assert.equal(watches,1);
assert.equal(clearedWatches,0);
const stopsBefore=events.filter(e=>e==='guidance-stop').length;
assert.equal(await api.addRouteStop(waypoint),true,'Adding during live guidance');
assert.equal(api.routeContext().active,true,'Retain live guidance');
assert.equal(watches,1,'Existing live GPS watch kept');
assert.equal(clearedWatches,0,'No interruption of live watch');
assert.equal(events.filter(e=>e==='guidance-stop').length,stopsBefore,'Do not stop Road Assist');
assert(events.filter(e=>e==='guidance-start').length>=2,'Road Assist notified of the new route');

api.stopGuidance();
assert.equal(api.routeContext().hasRoute,false);
assert.equal(api.routeContext().stops.length,0);
assert.equal(clearedWatches,1);
console.log('Route waypoint commit/rollback, Google intermediates, bounded POI corridor, ongoing GPS and Road Assist: passed.');
