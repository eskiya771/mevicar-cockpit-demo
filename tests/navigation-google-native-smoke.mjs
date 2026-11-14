/* Verify that only hybrid APKs with an advertised SDK capability hand
   turn-by-turn guidance to native Android. Web guidance stays backward compatible. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../navigation-google.js',import.meta.url),'utf8');
const target={name:'Erlangen Arcaden',address:'Erlangen',lat:49.597,lng:11.004};

async function run(nativeSupported){
 const requests=[];
 let gpsCount=0,watchCount=0;
 const mapSdk={maps:{importLibrary:async(name)=>name==='routes'?{
  Route:{computeRoutes:async()=>({routes:[{
   distanceMeters:3200,durationMillis:300000,
   path:[{lat:49.59,lng:11.00},target],
   legs:[{steps:[]}],createPolylines:()=>[]
  }]})}
 }:{} }};
 const nodes={
  'mg-status':{textContent:'',hidden:false,classList:{add(){}}},
  'mg-map-notice':{hidden:true},
  'mg-change-key':{hidden:false},
  'mg-manual-origin':{hidden:true}
 };
 const native={postMessage(raw){
  const input=JSON.parse(raw);requests.push(input);
  const answer=input.action==='capabilities'
   ?{id:input.id,ok:true,capabilities:{googleNavigation:nativeSupported}}
   :{id:input.id,ok:true,state:'connecting'};
  setTimeout(()=>native.onmessage?.({data:JSON.stringify(answer)}),0);
 }};
 const window={
  google:mapSdk,
  MeviNativeBridge:native,
  meviGoogleDestination(){},
  meviGoogleRouteReady(){}
 };
 const localStorage={
  getItem:key=>key==='mevicar-next-google-maps-key-v1'?'TEST-KEY':
   key==='mevicar-next-destinations-v1'?JSON.stringify({favorites:[target],recent:[]}):null,
  setItem(){}
 };
 const navigator={geolocation:{
  getCurrentPosition(success){gpsCount++;success({coords:{latitude:49.59,longitude:11.00}})},
  watchPosition(){watchCount++;return 55},
  clearWatch(){}
 }};
 const document={
  getElementById:id=>nodes[id]||null,
  querySelector:()=>null,createElement:()=>({})
 };
 runInNewContext(source,{window,google:mapSdk,localStorage,navigator,document,
  Intl,console,setTimeout,clearTimeout,setInterval,clearInterval});
 const nav=window.MeviGoogleNav;
 await nav.pick('favorites',0);
 assert.equal(await nav.calculateRoute(),true);
 const result=await nav.startGuidance();
 return {result,requests,gpsCount,watchCount};
}
const sdk=await run(true);
assert.equal(sdk.result,'native','Android should own real guidance');
assert.equal(sdk.watchCount,0,'Do not start competing Web GPS tracking');
assert.deepEqual(sdk.requests.map(x=>x.action),['capabilities','navigation.open']);
assert.equal(sdk.requests[1].lat,target.lat);
assert.equal(sdk.requests[1].lng,target.lng);
assert.equal(sdk.requests[1].title,target.name);
assert.equal(sdk.requests[1].id.startsWith('navigation-'),true);
const legacy=await run(false);
assert.equal(legacy.result,true,'Older hybrid builds keep Web guidance');
assert.equal(legacy.watchCount,1);
assert.deepEqual(legacy.requests.map(x=>x.action),['capabilities']);
console.log('Native Google navigation capability and Web fallback contract passed.');
