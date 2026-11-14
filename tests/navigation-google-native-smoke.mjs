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
 setInterval,clearInterval,Intl});
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
 'navigation.layout','navigation.layout','navigation.layout',
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
console.log('Android native map, split viewport, dock visibility, Places, favorites and routing work without a browser API key.');
