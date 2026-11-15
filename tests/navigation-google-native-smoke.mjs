/* APK must use the Android Navigation and Places SDKs without a Maps JavaScript
   browser key; browser/PWA behavior remains independently configured. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../navigation-google.js',import.meta.url),'utf8');
const favorite={name:'Erlangen Arcaden',address:'Erlangen',lat:49.597,lng:11.004};
const commands=[];
const bridge={postMessage(raw){
 const request=JSON.parse(raw);commands.push(request);
 const result=request.action==='capabilities'?
  {id:request.id,ok:true,capabilities:{nativeMap:true,nativePlacesSearch:true,googleNavigation:true}}:
  {id:request.id,ok:true,state:'connecting'};
 setTimeout(()=>bridge.onmessage?.({data:JSON.stringify(result)}),0);
}};
const localStorage={
 getItem(key){
  if(key==='mevicar-next-destinations-v1')return JSON.stringify({favorites:[favorite],recent:[]});
  return null; // Deliberately no browser Google Maps API key.
 },
 setItem(){}
};
const nodes={'mg-status':{textContent:'',hidden:false,classList:{add(){}}},
 'mg-map-notice':{hidden:false},'mg-change-key':{hidden:true},
 'mg-manual-origin':{hidden:true}};
let mapRect={left:0,top:16,right:1200,width:1200,height:700};
nodes['mg-map']={getBoundingClientRect:()=>mapRect};
const window={MeviNativeBridge:bridge,innerWidth:1200,innerHeight:800};
const document={getElementById:id=>nodes[id]||null,querySelector:()=>null};
runInNewContext(source,{window,localStorage,document,console,setTimeout,clearTimeout,
 setInterval:(fn,ms)=>setInterval(fn,ms).unref(),clearInterval,Intl});
const api=window.MeviGoogleNav;
assert.equal(api.isNativeMode(),true);
assert.equal(api.hasKey(),true,'Android must never be gated by a web Maps key');
await api.mount('browse');
let layout=commands.find(x=>x.action==='navigation.layout');
assert.deepEqual(
 [layout.visible,layout.x,layout.y,layout.width,layout.height,layout.viewportWidth,layout.viewportHeight],
 [true,0,16,1200,700,1200,800],
 'Android map must cover just the map surface, preserving the dock'
);
assert.equal(layout.favorites.length,1);
assert.equal(layout.favorites[0].title,favorite.name);
mapRect={left:0,top:16,right:700,width:700,height:700};
api.syncNativeLayout();
layout=commands.filter(x=>x.action==='navigation.layout').at(-1);
assert.equal(layout.width,700,'Split layout must leave 500 CSS pixels free for the side app');
assert.equal(layout.height,700);
api.syncNativeLayout();
assert.equal(commands.filter(x=>x.action==='navigation.layout').length,2,
 'Unchanged layout must not trigger repeated native bridge work');
delete nodes['mg-map'];
api.syncNativeLayout();
layout=commands.filter(x=>x.action==='navigation.layout').at(-1);
assert.equal(layout.visible,false,'Hide native map when the main content is a full-screen app');
nodes['mg-map']={getBoundingClientRect:()=>mapRect};
assert.match(api.mapBackdrop(),/Google Navigation SDK · Android/);
assert.match(api.mapBackdrop(),/Google-Karte öffnen/);
assert.match(api.mapBackdrop(),/Ziel suchen/);
assert.doesNotMatch(api.mapBackdrop(),/Google Maps einrichten/);
assert.equal(await api.openNativeMap(),true);
assert.equal(await api.openNativeSearch(),true);
await api.pick('favorites',0);
assert.equal(await api.calculateRoute(),'native');
assert.deepEqual(commands.map(x=>x.action),[
 'capabilities', // one check whether the APK owns the address book
 'navigation.layout','navigation.layout',
 'navigation.status', // covered map: the header asks for the trip once
 'navigation.layout',
 'capabilities','navigation.show',
 'capabilities','navigation.search',
 'capabilities','navigation.open',
 'capabilities','navigation.open'
]);
const opens=commands.filter(x=>x.action==='navigation.open');
assert.equal(opens.length,2);
for(const request of opens){
 assert.equal(request.lat,favorite.lat);
 assert.equal(request.lng,favorite.lng);
 assert.equal(request.title,favorite.name);
}
assert.equal(window.google,undefined,'Do not initialize Maps JavaScript in the APK');
assert.equal(commands.some(x=>x.action==='navigation.favorites.import'),false,
 'An older APK without the capability never receives the import message');
assert.match(api.mapBackdrop(),/Erlangen Arcaden/,'An older APK keeps the Web favourites');
// An updated APK can place controls in a separate rectangle above the map.
let headerEnabled=false;
let headerVisible=true;
nodes['mg-native-header-slot']={
 parentElement:{classList:{add:()=>{headerEnabled=true}}},
 getBoundingClientRect:()=>headerEnabled&&headerVisible?
  {left:0,top:0,right:330,bottom:40,width:330,height:40}:{width:0,height:0}
};
const originalPost=bridge.postMessage;
bridge.postMessage=function(raw){
 const request=JSON.parse(raw);
 if(request.action!=='capabilities')return originalPost.call(this,raw);
 setTimeout(()=>this.onmessage({data:JSON.stringify({id:request.id,ok:true,
  capabilities:{nativeNavigationHeader:true}})}),0);
};
mapRect={left:0,top:42,right:1200,width:1200,height:700};
api.syncNativeLayout();
for(let attempt=0;!headerEnabled&&attempt<20;attempt++){
 await new Promise(resolve=>setTimeout(resolve,5));
}
assert.deepEqual(commands.filter(x=>x.action==='navigation.layout').at(-1).header,
 {x:0,y:0,width:330,height:40});
headerVisible=false;
api.syncNativeLayout();
assert.equal(commands.filter(x=>x.action==='navigation.layout').at(-1).header,undefined);
// The native controls follow the cockpit theme: one message per change.
const themes=()=>commands.filter(x=>x.action==='navigation.theme');
assert.equal(themes().length,0,'No theme message before the theme is known');
document.documentElement={dataset:{theme:'cyberpunk'}};
api.syncNativeLayout();
assert.equal(themes().length,1);
assert.deepEqual(Object.keys(themes()[0]).sort(),['action','id','theme']);
assert.equal(themes()[0].theme,'cyberpunk');
api.syncNativeLayout(true);
await api.mount('browse');
assert.equal(themes().length,1,'Unchanged theme must not be sent again');
document.documentElement.dataset.theme='matrix';
api.syncNativeLayout(true);
assert.equal(themes().length,1,'Only the three cockpit themes are sent');
// An older APK does not know the action; layout sync must keep working.
const modernPost=bridge.postMessage;
bridge.postMessage=function(raw){
 const request=JSON.parse(raw);
 if(request.action!=='navigation.theme')return modernPost.call(this,raw);
 commands.push(request);
 setTimeout(()=>this.onmessage({data:JSON.stringify({id:request.id,ok:false,
  error:'Unbekannte Funktion'})}),0);
};
document.documentElement.dataset.theme='liquidglass';
const layoutsBefore=commands.filter(x=>x.action==='navigation.layout').length;
api.syncNativeLayout(true);
await new Promise(resolve=>setTimeout(resolve,10));
assert.equal(themes().length,2);
assert.equal(themes()[1].theme,'liquidglass');
assert.equal(commands.filter(x=>x.action==='navigation.layout').length,layoutsBefore+1);
api.syncNativeLayout(true);
assert.equal(themes().length,2,'A rejected theme is not retried until it changes');
// One address book: an APK with navigationFavoritesImport takes the Web favourites over once.
async function handover({stored,importOk=true}){
 const sent=[],store=new Map([['mevicar-next-destinations-v1',JSON.stringify(stored)]]);
 const run=async()=>{
  const nativeBridge={postMessage(raw){
   const request=JSON.parse(raw);sent.push(request);
   const result=request.action==='capabilities'?
    {id:request.id,ok:true,capabilities:{nativeMap:true,navigationFavoritesImport:true}}:
    request.action==='navigation.favorites.import'&&!importOk?
    {id:request.id,ok:false,error:'Favoriten konnten nicht übernommen werden'}:
    {id:request.id,ok:true,added:1,duplicates:0,discarded:0};
   setTimeout(()=>nativeBridge.onmessage?.({data:JSON.stringify(result)}),0);
  }};
  const win={MeviNativeBridge:nativeBridge,innerWidth:1200,innerHeight:800};
  const doc={getElementById:id=>id==='mg-map'?{getBoundingClientRect:()=>
   ({left:0,top:16,right:1200,width:1200,height:700})}:null,querySelector:()=>null};
  runInNewContext(source,{window:win,document:doc,console,setTimeout,clearTimeout,setInterval,clearInterval,Intl,
   localStorage:{getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,String(value))}});
  await win.MeviGoogleNav.mount('browse');
  await new Promise(resolve=>setTimeout(resolve,20));
  win.MeviGoogleNav.syncNativeLayout(true);
  await new Promise(resolve=>setTimeout(resolve,5));
  return win.MeviGoogleNav;
 };
 return {sent,store,run};
}
const flag='mevicar-next-destinations-native-import-v1';
const imports=list=>list.filter(x=>x.action==='navigation.favorites.import');
let take=await handover({stored:{favorites:[
 {name:'  Erlangen\nArcaden ',address:'Erlangen',lat:49.597,lng:11.004},
 {name:'Kaputt',lat:'x',lng:11},
 {name:'Büro',lat:48.14,lng:11.58}],recent:[]}});
let nav=await take.run();
assert.equal(imports(take.sent).length,1);
assert.deepEqual(Object.keys(imports(take.sent)[0]).sort(),['action','entries','id']);
assert.deepEqual(imports(take.sent)[0].entries,[
 {lat:49.597,lng:11.004,title:'Erlangen Arcaden',address:'Erlangen'},
 {lat:48.14,lng:11.58,title:'Büro',address:''}],'Only valid favourites, as plain text, are handed over');
assert.equal(take.store.get(flag),'1');
assert.equal(take.sent.filter(x=>x.action==='navigation.layout').at(-1).favorites,undefined,
 'After the takeover the favourites are no longer appended to the layout');
assert.doesNotMatch(nav.mapBackdrop(),/Büro/,'The native address book is the only list in the APK');
await take.run(); // next app start
assert.equal(imports(take.sent).length,1,'The takeover happens exactly once');
take=await handover({stored:{favorites:[],recent:[]}});
await take.run();
assert.equal(imports(take.sent).length,0,'Nothing to hand over: no message');
assert.equal(take.store.get(flag),'1');
take=await handover({stored:{favorites:[{name:'Büro',lat:48.14,lng:11.58}],recent:[]},importOk:false});
await take.run();
assert.equal(imports(take.sent).length,2,'A failed takeover is retried with the next layout');
assert.equal(take.store.get(flag),undefined,'A failed takeover is not marked as done');
/* Header trip line: asked only while the native map is covered; old APK shows nothing. */
{
 const eta=new Date(2026,10,15,14,32).getTime();
 const answers={trip:{state:'guiding',etaEpochMs:eta,remainingSeconds:600,remainingMeters:5000,title:'Zuhause',stops:[],
  maneuver:{type:'right',text:'Rechts abbiegen auf <b>Musterweg</b>',distanceMeters:348}}};
 let reply=answers.trip,polls=0,ticks=[],cleared=0,covered=false;
 const tripBridge={postMessage(raw){
  const request=JSON.parse(raw);
  if(request.action==='navigation.status')polls++;
  const result=request.action==='capabilities'?{id:request.id,ok:true,capabilities:{googleNavigation:true}}:
   request.action==='navigation.status'?(reply?{id:request.id,ok:true,...reply}:{id:request.id,ok:false,error:'Unbekannte Aktion'}):
   {id:request.id,ok:true};
  setTimeout(()=>tripBridge.onmessage?.({data:JSON.stringify(result)}),0);
 }};
 const made=[];let tripRow=false;
 const cockpit={classList:{toggle(name,on){if(name==='mg-trip-active')tripRow=on}}};
 const header={insertBefore(node){made.push(node)}};
 const slot={parentElement:header,nextSibling:null,getBoundingClientRect:()=>({width:0,height:0})};
 const doc={querySelector:()=>null,
  createElement:()=>({hidden:false,textContent:'',attributes:{},setAttribute(k,v){this.attributes[k]=v}}),
  getElementById:id=>id==='cockpit'?cockpit:id==='mg-native-header-slot'?slot:id==='mg-native-trip'?(made[0]||null):
   id==='mg-map'&&!covered?{getBoundingClientRect:()=>({left:0,top:16,right:1200,width:1200,height:700})}:null};
 const win={MeviNativeBridge:tripBridge,innerWidth:1200,innerHeight:800};
 runInNewContext(source,{window:win,document:doc,console,setTimeout,clearTimeout,Intl,
  setInterval:(fn,ms)=>{ticks.push({fn,ms});return ticks.length},clearInterval:()=>{cleared++},
  localStorage:{getItem:()=>null,setItem(){}}});
 const wait=()=>new Promise(resolve=>setTimeout(resolve,10));
 const trip=()=>made[0];
 await win.MeviGoogleNav.mount('browse');await wait();
 assert.equal(polls,0,'A visible native map needs no status polling');
 assert.equal(typeof win.meviNavigationNativeEvent,'function');
 assert.equal(win.MeviGoogleNav.nativeBusy(),true,'A visible native map keeps the screensaver away');
 covered=true;win.MeviGoogleNav.syncNativeLayout();await wait();
 assert.equal(polls,1);assert.equal(ticks.length,1);assert.equal(ticks[0].ms,5000);
 assert.equal(trip().textContent,'in 350 m · Rechts abbiegen auf <b>Musterweg</b> · Ankunft 14:32',
  'SDK text is shown as plain text, never as markup');
 assert.equal(trip().hidden,false);assert.equal(trip().attributes.role,'status');
 assert.equal(tripRow,true,'The hidden cockpit header becomes a trip row under other apps');
 assert.equal(win.MeviGoogleNav.nativeBusy(),true,'Guidance behind another app keeps the screensaver away');
 win.MeviGoogleNav.syncNativeLayout();await wait();
 assert.equal(ticks.length,1,'A covered map starts exactly one poll timer');
 win.meviNavigationNativeEvent({type:'navigation.event',event:'gpsLost'});await wait();
 assert.match(trip().textContent,/^GPS-Signal fehlt · in 350 m/);
 win.meviNavigationNativeEvent({type:'navigation.event',event:'gpsRestored'});await wait();
 assert.doesNotMatch(trip().textContent,/GPS/);
 reply={...answers.trip,maneuver:{type:'roundabout',text:'',distanceMeters:1240}};
 win.meviNavigationNativeEvent({type:'navigation.event',event:'rerouted'});await wait();
 assert.equal(trip().textContent,'in 1,2 km · Kreisverkehr · Ankunft 14:32');
 let before=polls;
 win.meviNavigationNativeEvent({type:'navigation.event',event:'somethingNew'});
 win.meviNavigationNativeEvent({type:'other',event:'rerouted'});
 win.meviNavigationNativeEvent(null);await wait();
 assert.equal(polls,before,'Unknown messages are ignored');
 win.meviNavigationNativeEvent({type:'navigation.event',event:'arrived'});
 assert.equal(trip().hidden,true,'Arrival clears the trip line at once');
 reply={state:'guiding',etaEpochMs:eta,remainingSeconds:600,remainingMeters:5000,title:'Zuhause',stops:[]};
 ticks[0].fn();await wait();
 assert.equal(trip().textContent,'Ankunft 14:32','Package 1 APK without manoeuvre: arrival time only');
 reply={state:'idle'};ticks[0].fn();await wait();
 assert.equal(trip().hidden,true,'Old APK or no guidance: no trip fields, nothing shown');
 assert.equal(tripRow,false);
 assert.equal(win.MeviGoogleNav.nativeBusy(),false,'Covered map without guidance: the screensaver may start');
 reply=answers.trip;ticks[0].fn();await wait();assert.equal(trip().hidden,false);
 reply=null;ticks[0].fn();await wait();
 assert.equal(trip().hidden,true,'A rejected status request shows nothing');
 reply=answers.trip;ticks[0].fn();await wait();
 covered=false;before=polls;win.MeviGoogleNav.syncNativeLayout();await wait();
 assert.equal(trip().hidden,true,'The native map shows its own guidance when visible');
 assert.equal(cleared,1);assert.equal(polls,before);
 win.meviNavigationNativeEvent({type:'navigation.event',event:'rerouted'});await wait();
 assert.equal(polls,before,'No polling while the map is visible');
}
{
 const saver=readFileSync(new URL('../screensaver.js',import.meta.url),'utf8');
 assert.ok(saver.includes('window.MeviGoogleNav?.nativeBusy?.()'),'The screensaver asks the native navigation before starting');
 assert.match(saver,/&&!nativeNavActive;/);
}
console.log('Android native map, split viewport, dock visibility, Places, favorites and routing work without a browser API key.');
