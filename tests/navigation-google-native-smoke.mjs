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
const window={MeviNativeBridge:bridge};
const document={getElementById:id=>nodes[id]||null,querySelector:()=>null};
runInNewContext(source,{window,localStorage,document,console,setTimeout,clearTimeout,
 setInterval,clearInterval,Intl});
const api=window.MeviGoogleNav;
assert.equal(api.isNativeMode(),true);
assert.equal(api.hasKey(),true,'Android must never be gated by a web Maps key');
assert.match(api.mapBackdrop(),/Google Navigation SDK · Android/);
assert.match(api.mapBackdrop(),/Google-Karte öffnen/);
assert.match(api.mapBackdrop(),/Ziel suchen/);
assert.doesNotMatch(api.mapBackdrop(),/Google Maps einrichten/);
assert.equal(await api.openNativeMap(),true);
assert.equal(await api.openNativeSearch(),true);
await api.pick('favorites',0);
assert.equal(await api.calculateRoute(),'native');
assert.deepEqual(commands.map(x=>x.action),[
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
console.log('Android native map, Places, favorites and routing work without a browser API key.');
