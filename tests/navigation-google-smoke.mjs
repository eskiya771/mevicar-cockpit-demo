/* Regression for MeviCar Web Maps: manual route start and GPS timeout handling.
   No real Google API key, position, network call or browser account required. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../navigation-google.js',import.meta.url),'utf8');
new Function(source);
const destination={name:'Erlangen Arcaden',address:'Erlangen',lat:49.597,lng:11.004};
function harness(gps='timeout'){
 const notice={hidden:false},keyButton={hidden:false},manualButton={hidden:true},message={textContent:'',hidden:false,classList:{add(){}}};
 const targets={'mg-map-notice':notice,'mg-change-key':keyButton,'mg-manual-origin':manualButton,'mg-status':message};
 let routeInput=null,gpsCalls=0;
 const Google={maps:{
  importLibrary:async(lib)=>lib==='routes'?{Route:{computeRoutes:async request=>{
   routeInput=request;
   return{routes:[{distanceMeters:12340,durationMillis:900000,path:[],createPolylines:()=>[]}]};
  }}}:{},
 }};
 const storage={
  getItem:k=>k==='mevicar-next-google-maps-key-v1'?'TEST-KEY-NOT-REAL':k==='mevicar-next-destinations-v1'?JSON.stringify({favorites:[],recent:[destination]}):null,
  setItem(){}
 };
 const doc={
  getElementById:id=>targets[id]||null,
  querySelector:()=>null,
  createElement:()=>({}),
 };
 const geolocation={
  getCurrentPosition(onSuccess,onError,options){
   gpsCalls++;
   if(gps==='denied')onError({code:1,message:'User denied Geolocation'});
   else if(gps==='timeout')onError({code:3,message:'Timeout expired'});
   else onSuccess({coords:{latitude:49.597,longitude:11.004}});
  },
  clearWatch(){}
 };
 const window={google:Google,meviGoogleDestination(){}};
 runInNewContext(source,{window,document:doc,localStorage:storage,
  navigator:{geolocation},google:Google,Intl,setTimeout,clearTimeout,console});
 return {api:window.MeviGoogleNav,notice,keyButton,manualButton,message,
  route:()=>routeInput,gpsCalls:()=>gpsCalls};
}
{
 const h=harness('timeout');
 await h.api.pick('stored',0);
 assert.equal(await h.api.calculateRoute(),false,'Cannot silently route from a guessed GPS position');
 assert.equal(h.gpsCalls(),2,'Try precise GPS then coarse location');
 assert.match(h.message.textContent,/Zeitüberschreitung/);
 assert.equal(h.keyButton.hidden,true,'GPS timeout must not offer changing the Google API key');
 assert.equal(h.manualButton.hidden,false,'Provide manual origin on GPS timeout');
 h.api.selectOriginOnMap();
 assert.match(h.api.mapBackdrop(),/Startpunkt wählen/);
 h.api.chooseOriginPoint({lat:49.565,lng:10.982});
 assert.equal(h.api.isManualOrigin(),true);
 assert.equal(await h.api.calculateRoute(),true,'Manual origin must work without GPS');
 assert.equal(h.route().origin.lat,49.565);
 assert.equal(h.route().origin.lng,10.982);
 assert.equal(h.gpsCalls(),2,'Manual route does not retry failed GPS');
 assert.equal(h.api.routeInfo().includes('12,3 km'),true);
 assert.equal(h.keyButton.hidden,true,'Successful route must not expose key reset');
}
{
 const h=harness('denied');
 await h.api.pick('stored',0);
 assert.equal(await h.api.calculateRoute(),false);
 assert.equal(h.gpsCalls(),1,'Do not retry denied GPS permission');
 assert.match(h.message.textContent,/Standortzugriff verweigert/);
 assert.equal(h.keyButton.hidden,true);
 assert.equal(h.manualButton.hidden,false);
}
{
 const h=harness('ok');
 await h.api.pick('stored',0);
 assert.equal(await h.api.calculateRoute(),true);
 assert.equal(h.route().origin.lat,49.597);
 assert.equal(h.gpsCalls(),1);
}
console.log('Google Maps navigation: manual origin, GPS retry, permissions and route rendering contract passed.');
