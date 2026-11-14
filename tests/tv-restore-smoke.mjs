import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const code=readFileSync('tv.js','utf8');
assert.match(code,/LAST_PLAYLIST_KEY='mevicar-tv-last-playlist-v1'/);
assert.match(code,/rememberPlaylist\('xtream',a\.name,'live'\)/,'Successful IPTV connect must remember last list');
assert.match(code,/rememberPlaylist\('m3u',source\.id\)/,'Imported M3U source must be remembered');
assert.match(code,/function restoreLastPlaylist\(\)/,'IPTV must be restored when opened');
assert.match(code,/restoreLastPlaylist\(\);/,'TV mount must reuse or restore last list');
assert.match(code,/void restoreLastPlaylist\(\);/,'IPTV must preload as the app starts');
assert.doesNotMatch(code,/localStorage\.setItem\([^;]*(?:credentials|\.token|pin)/,'Do not persist proxy session credentials in TV preferences');

// Model a reload after the user's PIN and last Xtream list have been saved.
const store=new Map([['mevicar-tv-last-playlist-v1',JSON.stringify({type:'xtream',name:'MeviTV',kind:'movie'})]]);
const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const nodes=new Map(),events={},video={hidden:false,paused:true,
 addEventListener(){},removeEventListener(){},pause(){},load(){},removeAttribute(){},
 canPlayType:()=>false,play(){throw Error('Autoplay must never start during catalogue restore');}};
const node=key=>{
 if(!nodes.has(key)){
  const value={hidden:false,value:'',innerHTML:'',textContent:'',disabled:false,
   classList:{toggle(){},add(){},remove(){}},
   setAttribute(){},removeAttribute(){},close(){},querySelector:node,querySelectorAll:()=>[]};
  nodes.set(key,value);
 }
 return nodes.get(key);
};
const classNames=new Set();
const root={classList:{
 add:x=>classNames.add(x),remove:x=>classNames.delete(x),
 toggle:(x,enabled)=>{if(enabled===undefined? !classNames.has(x):enabled)classNames.add(x);else classNames.delete(x);}
},querySelector:key=>key==='video'?video:node(key),querySelectorAll:()=>[],
 addEventListener:(type,cb)=>{events[type]=cb},removeEventListener:type=>{delete events[type]}};
const doc={querySelector:()=>root,hidden:false,addEventListener(){},removeEventListener(){}};
const state={accounts:[],active:null,kind:'live',group:'ALL',query:'',busy:false};
let pinCalls=0,connections=0;
const xtream={
 state,active:()=>state.accounts.find(a=>a.id===state.active)||null,view:()=>[],
 pinCredentials:async pin=>{assert.equal(pin,'1234');pinCalls++;return {host:'https://bridge.example',bridge:true,token:'temporary'};},
 connect:async(name,c,onProgress)=>{
  connections++;state.busy=true;onProgress('Lade Kategorien');
  const a={id:'x1',name,credentials:c,categories:{live:[],movie:[],series:[]},items:{live:[],movie:[],series:[]}};
  state.accounts.push(a);state.active=a.id;state.busy=false;return a;
 }
};
const win={document:doc,meviXtream:xtream,MeviCredentials:{tvPin:()=> '1234'}};
runInNewContext(code,{window:win,document:doc,URL,localStorage:storage,setTimeout,clearTimeout,setInterval,clearInterval,console});
for(let i=0;i<8;i++)await Promise.resolve();
assert.equal(pinCalls,1,'PIN must be read before opening TV');
assert.equal(connections,1,'Last IPTV catalogue must start loading at app launch');
assert.equal(state.kind,'movie','Last IPTV category must be restored in the background');
win.meviTVMount();
for(let i=0;i<8;i++)await Promise.resolve();
assert.equal(pinCalls,1,'Restored PIN must be submitted exactly once');
assert.equal(connections,1,'Last IPTV catalogue must be reconnected once');
assert.equal(state.kind,'movie','Last IPTV category should be preserved');
assert(classNames.has('tv-xtream-mode'),'Last IPTV catalogue should be visible');
assert.equal(node('.tv-status').textContent,'MeviTV automatisch geladen.');
win.meviTVMount();
for(let i=0;i<4;i++)await Promise.resolve();
assert.equal(connections,1,'Remount must reuse existing catalogue, not load it twice');
win.meviTVUnmount();

// Regression: the Android APK has its own browser storage. A previously connected
// Web-App catalogue is absent, but the user entered/saved the PIN in APK settings.
store.delete('mevicar-tv-last-playlist-v1');
const firstRunState={accounts:[],active:null,kind:'live',group:'ALL',query:'',busy:false};
let firstRunConnects=0;
const firstRunApi={
 state:firstRunState,
 active:()=>firstRunState.accounts.find(a=>a.id===firstRunState.active)||null,
 view:()=>[],
 pinCredentials:async pin=>{assert.equal(pin,'1234');return {host:'https://bridge.example',bridge:true,token:'temporary'};},
 connect:async(name,c)=>{
  firstRunConnects++;
  assert.equal(name,'MeviTV');
  const a={id:'x2',name,credentials:c,categories:{live:[],movie:[],series:[]},items:{live:[],movie:[],series:[]}};
  firstRunState.accounts.push(a);firstRunState.active=a.id;return a;
 }
};
const freshWindow={document:doc,meviXtream:firstRunApi,MeviCredentials:{tvPin:()=> '1234'}};
runInNewContext(code,{window:freshWindow,document:doc,URL,localStorage:storage,setTimeout,clearTimeout,setInterval,clearInterval,console});
for(let i=0;i<8;i++)await Promise.resolve();
assert.equal(firstRunConnects,1,'Saved APK PIN must preload default MeviTV without opening TV');
freshWindow.meviTVMount();
for(let i=0;i<8;i++)await Promise.resolve();
assert.equal(firstRunConnects,1,'Saved APK PIN must restore default MeviTV on first launch');
assert.equal(firstRunState.active,'x2');
assert.deepEqual(JSON.parse(store.get('mevicar-tv-last-playlist-v1')),{type:'xtream',name:'MeviTV',kind:'live'});
freshWindow.meviTVUnmount();

// Selecting ordinary TV must not be overridden by a saved PIN.
store.set('mevicar-tv-last-playlist-v1',JSON.stringify({type:'public',name:'',kind:'live'}));
const publicWindow={document:doc,meviXtream:firstRunApi,MeviCredentials:{tvPin:()=> '1234'}};
runInNewContext(code,{window:publicWindow,document:doc,URL,localStorage:storage,setTimeout,clearTimeout,setInterval,clearInterval,console});
for(let i=0;i<4;i++)await Promise.resolve();
assert.equal(firstRunConnects,1,'Public TV must not preload IPTV');
publicWindow.meviTVMount();
for(let i=0;i<4;i++)await Promise.resolve();
assert.equal(firstRunConnects,1,'Public-TV selection must not reconnect the IPTV proxy');
publicWindow.meviTVUnmount();
console.log('MeviTV restore: prior catalogue, first-APK PIN-only setup, no autoplay, remount, public-TV choice OK');
