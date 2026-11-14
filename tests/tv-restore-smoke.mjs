import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const code=readFileSync('tv.js','utf8');
assert.match(code,/LAST_PLAYLIST_KEY='mevicar-tv-last-playlist-v1'/);
assert.match(code,/rememberPlaylist\('xtream',a\.name,'live'\)/,'Successful IPTV connect must remember last list');
assert.match(code,/rememberPlaylist\('m3u',source\.id\)/,'Imported M3U source must be remembered');
assert.match(code,/function restoreLastPlaylist\(\)/,'IPTV must be restored when opened');
assert.match(code,/restoreLastPlaylist\(\);\}/,'TV mount must restore last list');
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
console.log('MeviTV last-list restore: saved PIN, single reconnection, category, no autoplay, remount OK');
