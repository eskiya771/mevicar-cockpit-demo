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
 const window={MeviHA:fakeHA,MeviGoogleNav:{announceRoadAssist:msg=>announcements.push(msg)}};
 const localStorage={getItem:()=>null,setItem:(k,v)=>stores.push([k,v])};
 const elements=new Map();
 const document={getElementById:id=>elements.get(id)||null};
 runInNewContext(js,{window,document,localStorage,Intl,Date:FakeDate,AbortController,
  setTimeout:(cb)=>{queueMicrotask(cb);return 1},clearTimeout(){},console,Number,Math,Map,Set});
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
 assert.match(r.summaryHTML(),/Routenscan/);
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
console.log('Road Assist smoke passed: 35m corridor, 500m/35m alerts, GPS quality, ahead-only, HA disconnect, opt-in scanner.');
