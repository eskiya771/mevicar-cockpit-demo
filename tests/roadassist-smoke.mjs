/* Road Assist: deterministic route and HA integration tests, without GPS/HA access. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const js=readFileSync(new URL('../roadassist.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../roadassist.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const nav=readFileSync(new URL('../navigation-google.js',import.meta.url),'utf8');
const ha=readFileSync(new URL('../homeassistant.js',import.meta.url),'utf8');
const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
const quality=readFileSync(new URL('../.github/workflows/quality.yml',import.meta.url),'utf8');
new Function(js);
let now=1770000000000;
const FakeDate={now:()=>now};
function harness(cameras=[],options={}){
 let connected=options.connected!==false;
 let latest=cameras,updatedAt=now,services=[],announcements=[];
 const stores=[];
 const fakeHA={
  debug:()=>({connected}),
  cameraSnapshot:()=>({connected,updatedAt,cameras:latest}),
  refresh:async()=>true,
  requestService:async(path,opts)=>{
   services.push({path,opts});
   if(path==='/api/states/device_tracker.mevicar_route_scan')
    return {attributes:{latitude:49.6,longitude:11.0}};
   if(path.includes('blitzer/refresh_controls'))
    return{service_response:{controls:[{id:'scanner1',latitude:49.6,longitude:11.005,
      vmax:80,type:'fixed',street:'Teststrecke'}]}};
   return [];
  }
 };
 const window={MeviHA:fakeHA,MeviGoogleNav:{announceRoadAssist:msg=>announcements.push(msg),...(options.nav||{})}};
 const localStorage={getItem:key=>options.stored?.[key]??null,setItem:(k,v)=>stores.push([k,v])};
 const elements=new Map();
 const document={getElementById:id=>elements.get(id)||null};
 runInNewContext(js,{window,document,localStorage,Intl,Date:FakeDate,AbortController,
  setTimeout:(cb)=>{queueMicrotask(cb);return 1},clearTimeout(){},
  setInterval:()=>37,clearInterval(){},console,Number,Math,Map,Set});
 return{app:window.MeviRoadAssist,ha:fakeHA,services,announcements,elements,stores,
  setConnected:v=>{connected=v},setCameras:v=>{latest=v;updatedAt=now}};
}
const route=[
 {lat:49.6,lng:11.0000},
 {lat:49.6,lng:11.0100},
 {lat:49.6,lng:11.0200}
];
const camera=(id,lat,lng,vmax=80)=>({id,lat,lng,vmax,type:'fixed',street:'Teststrecke',city:'Erlangen'});
{
 const h=harness([camera('good',49.6002,11.005),camera('off',49.6008,11.005),
   camera('later',49.6,11.015)]);
 const r=h.app;
 r.onRoute({path:route});
 const matches=r.routeState().matched;
 assert.equal(matches.length,2,'Only cameras within 35m lateral corridor may match');
 assert.ok(matches[0].lateral<35&&matches[0].lateral>10);
 assert.ok(!matches.some(x=>x.id==='off'),'Reject camera 89m beside route');
 assert.equal(r.routeState().routePoints,3);
 assert.match(r.summaryHTML(),/ROAD ASSIST/);
 assert.match(r.summaryHTML(),/2 Kameras/);
 assert.match(r.summaryHTML(),/Road Assist öffnen/);
 assert.equal(r.routeState().guiding,false);
 r.onGuidanceStart(false);
 r.onPosition({lat:49.6,lng:11.0000},{accuracy:8,timestamp:now});
 assert.equal(r.routeState().positionValid,true);
 assert.equal(r.routeState().currentMatch.id,'good','First camera ahead selected');
 assert.equal(h.announcements.length,1,'One 500m pre-warning');
 assert.match(h.announcements[0],/Fester Blitzer/);
 assert.match(r.overlayHTML(),/BLITZER VORAUS/);
 r.onPosition({lat:49.6,lng:11.0002},{accuracy:8,timestamp:now});
 assert.equal(h.announcements.length,1,'No repeated warning at same threshold');
 now+=2000;
 r.onPosition({lat:49.6,lng:11.0047},{accuracy:8,timestamp:now});
 assert.equal(h.announcements.length,2,'35m urgent warning must be independent of early alert');
 assert.match(h.announcements[1],/jetzt/);
 assert.match(r.overlayHTML(),/mevi-ra-urgent/);
 now+=2000;
 r.onPosition({lat:49.6,lng:11.0080},{accuracy:8,timestamp:now});
 assert.equal(r.routeState().currentMatch.id,'later','Passed camera must be ignored');
 now+=2000;
 r.onPosition({lat:49.602,lng:11.0145},{accuracy:8,timestamp:now});
 assert.equal(r.routeState().positionValid,false,'Never claim route match while off-route');
 assert.equal(r.routeState().currentMatch,null,'No route camera warning when 200m off course');
 r.onGuidanceStop();
 assert.equal(r.routeState().currentMatch,null,'Stop clears live warning');
}
{
 const h=harness([camera('x',49.6,11.005)]);
 h.app.onRoute(route);h.app.onGuidanceStart(false);
 h.app.onPosition({lat:49.6,lng:11.0047},{accuracy:100,timestamp:now});
 assert.equal(h.app.routeState().currentMatch,null,'Inaccurate GPS must not produce a warning');
 h.app.onPosition({lat:49.6,lng:11.0047},{accuracy:5,timestamp:now-20000});
 assert.equal(h.app.routeState().currentMatch,null,'Stale GPS must not produce a warning');
 assert.equal(h.announcements.length,0);
 h.app.onGuidanceStart(true);
 h.app.onPosition({lat:49.6,lng:11.0047},{accuracy:5,timestamp:now});
 assert.match(h.app.overlayHTML(),/DEMO/);
 assert.equal(h.announcements.length,0,'Demo mode must never speak real warnings');
 h.app.onGuidanceStop();
}
{
 const h=harness([camera('same1',49.6,11.005),camera('same2',49.6,11.005),
  camera('beyond',49.6005,11.015)]);
 h.app.onRoute({path:route});
 assert.equal(h.app.routeState().matched.length,1,'Repeated entities at same coordinates deduped');
 h.setConnected(false);h.app.onHAChange();
 assert.equal(h.app.routeState().matched.length,0,'Never keep stale HA camera matches after disconnection');
 assert.match(h.app.summaryHTML(),/nicht verbunden/);
 assert.equal(h.stores.length,0,'No camera coordinates or tokens persisted by Road Assist');
}
{
 const h=harness([camera('a',49.6,11.005)]);
 h.app.onRoute({path:route});
 h.app.setEnabled(false);h.app.onGuidanceStart(false);
 h.app.onPosition({lat:49.6,lng:11.0047},{accuracy:5,timestamp:now});
 assert.equal(h.announcements.length,0,'Disabled alerts must not speak');
 assert.match(h.app.overlayHTML(),/ROAD ASSIST AUS/);
 h.app.setEnabled(true);h.app.setVoice(false);
 h.app.onPosition({lat:49.6,lng:11.0046},{accuracy:5,timestamp:now});
 assert.equal(h.announcements.length,0,'Separate Road Assist voice toggle works');
 assert.equal(h.app.setConfigId('bad'),false);
 assert.equal(h.app.setConfigId('01M6C1Y358N92TR48VGWX9R5EZ'),true);
 assert.deepEqual(JSON.parse(h.stores.at(-1)[1]).configId,'01M6C1Y358N92TR48VGWX9R5EZ');
 assert.ok(!JSON.stringify(h.stores).includes('Bearer '));
}
{
 const h=harness([]);
 h.app.onRoute({path:route});
 assert.ok(h.app.sampleRoute().length>=2,'Route scan samples at least beginning and end');
 assert.equal(await h.app.scan(),false,'Scanner requires explicit config id');
 assert.equal(h.services.length,0,'No HA mutations without explicit complete config');
 assert.equal(h.app.setConfigId('01M6C1Y358N92TR48VGWX9R5EZ'),true);
 // Use short route with all tracker confirmations matching the mocked fixed initial position.
 const pointRoute=[{lat:49.6,lng:11.0},{lat:49.6,lng:11.0005}];
 h.app.onRoute({path:pointRoute});
 assert.equal(await h.app.scan(),true,'Explicit opt-in route scan completes');
 assert.ok(h.services.some(x=>x.path==='/api/services/device_tracker/see'));
 assert.ok(h.services.some(x=>x.path==='/api/services/blitzer/refresh_controls?return_response'));
 assert.equal(h.app.routeState().scanState,'completed');
 assert.equal(h.app.routeState().scanTotal,1,'Short route only samples start');
 assert.equal(h.app.routeState().settings.configSet,true);
}
const TRIP_KEY='mevicar-next-roadassist-trips-v1';
const settle=async()=>{for(let i=0;i<6;i++)await new Promise(done=>setImmediate(done))};
{
 // Road Assist as its own app (browser engine): planned route, trip record without coordinates.
 const h=harness([camera('good',49.6002,11.005),camera('later',49.6,11.015)],
  {nav:{destinationName:()=>'Erlangen Zentrum'}});
 const r=h.app;
 assert.match(r.appHTML(false),/id="mevi-ra-app"/);
 assert.match(r.appHTML(false),/Keine Route geplant/);
 assert.match(r.appHTML(true),/ra-compact/);
 r.onRoute({path:route});
 const planned=r.appHTML(false);
 assert.match(planned,/Geplante Route/);
 assert.match(planned,/Erlangen Zentrum/);
 assert.match(planned,/Teststrecke/);
 assert.match(planned,/Noch keine Fahrt/);
 assert.equal(r.model().native,false);
 assert.equal(r.model().hits.length,2);
 r.onGuidanceStart(false);
 assert.equal(r.model().trips[0].outcome,'active');
 assert.equal(h.stores.length,0,'A running trip is not written to storage');
 r.onPosition({lat:49.6,lng:11.0080},{accuracy:8,timestamp:now});
 assert.equal(r.model().hits.map(x=>x.passed).join(),'true,false','Passed cameras are marked along the route');
 r.onGuidanceStop();r.onRoute([]);
 assert.equal(r.model().trips.length,1,'Stop followed by route reset records exactly one trip');
 const trip=r.model().trips[0];
 assert.equal(trip.outcome,'stopped');
 assert.equal(trip.destination,'Erlangen Zentrum');
 assert.ok(trip.drivenMeters>500&&trip.drivenMeters<650);
 assert.equal(trip.cameras.length,2);
 const saved=h.stores.filter(([key])=>key===TRIP_KEY).at(-1)[1];
 assert.doesNotMatch(saved,/"lat"|"lng"|latitude|49\.6|11\.0/,'Trips never store coordinates');
 r.toggleTrip(0);
 assert.match(r.appHTML(false),/aria-expanded="true"/);
 assert.match(r.appHTML(false),/Fahrt löschen/);
 r.removeTrip(0);
 assert.equal(r.model().trips.length,0);
 assert.equal(JSON.parse(h.stores.filter(([key])=>key===TRIP_KEY).at(-1)[1]).length,0);
 r.onRoute({path:route});r.onGuidanceStart(true);r.onGuidanceStop();
 assert.equal(r.model().trips.length,0,'Demo guidance must not create a trip');
 r.onGuidanceStart(false);r.onGuidanceStop();
 assert.equal(r.model().trips.length,1);
 r.clearTrips();
 assert.match(r.appHTML(false),/Wirklich alle löschen\?/);
 assert.equal(r.model().trips.length,1,'Clearing needs a second tap');
 r.clearTrips();
 assert.equal(r.model().trips.length,0);
 // Stored trips are restored and sanitised; the app view repaints into its host element.
 const again=harness([],{stored:{[TRIP_KEY]:JSON.stringify([{...trip,lat:49.6,outcome:'weird'},{broken:true}])}});
 assert.equal(again.app.model().trips.length,1);
 assert.equal(again.app.model().trips[0].outcome,'stopped');
 assert.equal('lat' in again.app.model().trips[0],false);
 const host={innerHTML:''};
 again.elements.set('mevi-ra-app',host);
 again.app.mount();
 assert.match(host.innerHTML,/Bisherige Fahrten/);
 assert.match(host.innerHTML,/Erlangen Zentrum/);
 again.app.toggleDiag();
 assert.match(host.innerHTML,/Routenscan starten/);
 again.app.unmount();
}
{
 // APK: Android matches cameras and keeps trips; the web side delivers HA cameras and mirrors the state.
 const calls=[];
 const status={ok:true,enabled:true,voice:true,connected:true,updatedAt:now,cameraCount:1,route:true,guiding:true,
  destination:'Nürnberg',plannedMeters:18400,onRoute:true,
  hits:[{id:'n1',title:'A73',street:'A73',city:'Fürth',label:'Fester Blitzer',meters:5200,passed:false,limit:100}]};
 let nativeTrips=[{id:'abc',startedAt:now-3600000,endedAt:now-1800000,destination:'Bamberg',plannedMeters:40000,
  drivenMeters:39900,outcome:'arrived',dataAvailable:true,
  cameras:[{title:'B4',city:'',label:'Mobiler Blitzer',meters:1000,passed:true}]}];
 const nativeRequest=async(action,fields)=>{
  calls.push({action,fields});
  if(action==='capabilities')return{ok:true,capabilities:{roadAssistNative:1}};
  if(action==='roadassist.scanpoints')return{ok:true,points:[{lat:49.6,lng:11.0}]};
  if(action==='roadassist.trips.remove')nativeTrips=nativeTrips.filter(t=>t.id!==fields.tripId);
  if(action==='roadassist.trips.clear')nativeTrips=[];
  if(action.startsWith('roadassist.trips'))return{ok:true,trips:nativeTrips};
  return status;
 };
 const h=harness([camera('good',49.6002,11.005)],{nav:{isNativeMode:()=>true,nativeRequest}});
 const host={innerHTML:''};
 h.elements.set('mevi-ra-app',host);
 h.app.mount();await settle();
 const count=name=>calls.filter(c=>c.action===name).length;
 assert.equal(count('capabilities'),1);
 assert.equal(count('roadassist.cameras'),1);
 const pushed=calls.find(c=>c.action==='roadassist.cameras').fields;
 assert.equal(pushed.connected,true);
 assert.equal(pushed.cameras.length,1);
 assert.equal(pushed.cameras[0].vmax,80);
 h.app.onHAChange();await settle();
 assert.equal(count('roadassist.cameras'),1,'Unchanged HA data is not pushed again');
 assert.equal(h.app.model().native,true);
 assert.match(host.innerHTML,/Nürnberg/);
 assert.match(host.innerHTML,/A73/);
 assert.match(host.innerHTML,/Zielführung aktiv/);
 assert.match(host.innerHTML,/Bamberg/);
 h.app.setVoice(false);await settle();
 assert.equal(calls.filter(c=>c.action==='roadassist.settings').at(-1).fields.voice,false);
 h.app.toggleTrip(0);
 assert.match(host.innerHTML,/Mobiler Blitzer/);
 h.app.removeTrip(0);await settle();
 assert.equal(calls.find(c=>c.action==='roadassist.trips.remove').fields.tripId,'abc');
 assert.equal(h.app.model().trips.length,0);
 assert.ok(!h.stores.some(([key])=>key===TRIP_KEY),'Native trips are not duplicated in web storage');
 assert.equal(h.app.setConfigId('01M6C1Y358N92TR48VGWX9R5EZ'),true);
 assert.equal(await h.app.scan(),true,'Native scan uses the scan points of the Android route');
 assert.equal(count('roadassist.scanpoints'),1);
 assert.ok(h.services.some(x=>x.path==='/api/services/device_tracker/see'));
 h.app.unmount();
}
{
 // APK without the capability: no native Road Assist calls, the web engine stays in charge.
 const calls=[];
 const h=harness([],{nav:{isNativeMode:()=>true,nativeRequest:async action=>{calls.push(action);return{ok:true,capabilities:{}}}}});
 h.app.onHAChange();await settle();
 assert.deepEqual(calls,['capabilities']);
 assert.equal(h.app.model().native,false);
}
assert.match(html,/\['roadassist','Road Assist'/);
assert.match(html,/MeviRoadAssist\?\.appHTML\(s\.mode==='split'\)/);
assert.match(html,/roadassist-host/);
assert.match(html,/MeviRoadAssist\?\.unmount/);
assert.match(html,/MeviRoadAssist\?\.mount/);
assert.match(html,/"roadassist":"<path/);
assert.match(nav,/isNativeMode:nativeMode,nativeRequest,/);
assert.match(nav,/destinationName:/);
assert.doesNotMatch(ha,/radarHTML|radar:'Road Assist'/,'Road Assist no longer lives inside Home Assistant');
assert.match(css,/\.roadassist-host/);
assert.match(css,/\.ra-app button\{[^}]*min-height:44px/);
assert.match(css,/data-theme="cyberpunk"\] \.ra-/);
assert.match(css,/data-theme="liquidglass"\] \.ra-/);
assert.match(html,/roadassist\.js/);
assert.match(html,/roadassist\.css/);
assert.match(html,/mevi-ra-overlay/);
assert.match(html,/mevi-ra-summary/);
assert.match(ha,/cameraSnapshot/);
assert.match(ha,/requestService/);
assert.match(ha,/onHAChange/);
assert.match(nav,/MeviRoadAssist\?\.onRoute/);
assert.match(nav,/MeviRoadAssist\?\.onPosition/);
assert.match(nav,/announceRoadAssist/);
assert.match(css,/\.mevi-ra-urgent/);
assert.match(pages,/tests\/roadassist-smoke\.mjs/);
assert.match(quality,/tests\/roadassist-smoke\.mjs/);
console.log('Road Assist smoke passed: 35m corridor, 500m/35m alerts, GPS quality, ahead-only, HA disconnect, opt-in scanner, own app with trips, native bridge.');
