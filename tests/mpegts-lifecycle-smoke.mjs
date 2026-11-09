import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../tv.js',import.meta.url),'utf8');
const events={},nodes=new Map(),jobs=[],requests=[],timeouts=new Map(),intervals=new Map();
let timerId=0,now=0,streamName='',fetchCount=0;
const DateMock=class extends Date { static now(){return now;} };
const video={
 src:'',currentSrc:'',paused:false,videoWidth:1920,currentTime:0,
 canPlayType(){return '';},play(){this.paused=false;return Promise.resolve();},
 pause(){this.paused=true;},load(){},removeAttribute(name){if(name==='src'){this.src='';this.currentSrc='';}},
 addEventListener(name,fn){events[name]=fn;},removeEventListener(name){delete events[name];}
};
const root={
 classList:{add(){},toggle(){}},
 querySelector(key){
  if(key==='video')return video;
  if(!nodes.has(key))nodes.set(key,{
   textContent:'',innerHTML:'',value:'',hidden:false,
   setAttribute(){},removeAttribute(){},
   close(){},showModal(){}
  });
  return nodes.get(key);
 },
 addEventListener(name,fn){events['root:'+name]=fn;},
 removeEventListener(name){delete events['root:'+name];}
};
const document={
 hidden:false,querySelector(){return root;},
 addEventListener(name,fn){events['document:'+name]=fn;},
 removeEventListener(name){delete events['document:'+name];}
};
const engine={
 isSupported:()=>true,getFeatureList:()=>({mseLivePlayback:true}),
 Events:{ERROR:'error'},
 createPlayer(data){
  const job={
   data,active:true,destroyed:false,handlers:{},on(name,callback){this.handlers[name]=callback;},
   attachMediaElement(){video.currentSrc='blob:test-mpegts';},
   load(){},play(){video.paused=false;return Promise.resolve();},
   pause(){},unload(){},detachMediaElement(){},
   destroy(){this.active=false;this.destroyed=true;}
  };
  jobs.push(job);return job;
 }
};
const account={credentials:{bridge:true,host:'https://mevitv.mtankurt.synology.me'},items:{
 live:[...Array(80)].map((_,i)=>({id:String(i+1),name:'Testsender '+i,extension:'ts'})),
 movie:[],series:[]
},categories:{live:[],movie:[],series:[]}};
const api={
 state:{kind:'live',group:'ALL',query:'',accounts:[],active:'test'},
 active:()=>null,
 view:()=>[],
 async playbackURL(_credentials,type,id,ext,transport='default'){
  requests.push({id,type,ext,transport});
  return 'https://mevitv.mtankurt.synology.me/'+(transport==='raw'
   ?'stream/live/'+id+'.ts':'remux/live/'+id+'/index.m3u8')+
   '?exp=1950000000&sig='+'a'.repeat(64);
 }
};
const fakeHls=function(){this.on=()=>{};this.loadSource=()=>{};this.attachMedia=()=>{};this.destroy=()=>{};};
fakeHls.isSupported=()=>true;
const window={document,meviXtream:api,mpegts:engine,Hls:fakeHls};
const fetch=async()=>{
 fetchCount++;
 return {ok:true,status:200,body:{cancel:async()=>{}},json:async()=>({})};
};
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
runInNewContext(source,{
 window,document,URL,Date:DateMock,fetch,
 localStorage:{getItem:()=>null,setItem(){}},
 setTimeout(fn){const id=++timerId;timeouts.set(id,fn);return id;},
 clearTimeout(id){timeouts.delete(id);},
 setInterval(fn){const id=++timerId;intervals.set(id,fn);return id;},
 clearInterval(id){intervals.delete(id);}
});
window.meviTVMount();
api.active=()=>account;
const choose=id=>events['root:click']({target:{closest:()=>({dataset:{xtItem:String(id)}})}});
for(let i=1;i<=40;i++)choose(i);
await flush();
assert.equal(jobs.length,1,'only latest of 40 rapid requests may start a player');
assert.equal(jobs[0].data.url.includes('/40.ts'),true);
assert.equal(intervals.size,1);
for(let i=41;i<=75;i++){
 choose(i);await flush();
 assert.equal(jobs.filter(x=>x.active).length,1,'one active player after each zap');
 assert.equal(intervals.size,1,'one health watchdog after each zap');
 assert.equal(timeouts.size,1,'one start deadline after each zap');
}
assert.equal(jobs.filter(x=>x.destroyed).length,jobs.length-1);
assert.equal(requests.every(x=>x.transport==='raw'),true,'no FFmpeg fallback during healthy playback');
assert.equal(fetchCount,0,'no HLS request during healthy MPEGTS playback');
// Simulate a browser media error; it must destroy MPEGTS and switch once to HLS.
video.error={code:4};events.error();
await flush();
assert.equal(jobs.filter(x=>x.active).length,0,'media error releases MPEGTS player');
assert.equal(intervals.size,0,'media error releases watchdog');
assert.equal(requests.filter(x=>x.transport==='default').length,1,'one HLS fallback on media error');
events.error();await flush();
assert.equal(requests.filter(x=>x.transport==='default').length,1,'duplicate errors do not trigger repeated fallback');
choose(76);await flush();
assert.equal(jobs.filter(x=>x.active).length,1);
// After 18 seconds of no progress, switch to HLS only when playback is active.
now+=19000;
for(const fn of [...intervals.values()])fn();
await flush();
assert.equal(jobs.filter(x=>x.active).length,0,'stalled player gets released');
assert.equal(requests.filter(x=>x.transport==='default').length,2,'stalled stream triggers one fallback');
choose(77);await flush();
video.paused=true;now+=24000;
for(const fn of [...intervals.values()])fn();
await flush();
assert.equal(jobs.filter(x=>x.active).length,1,'paused player is not considered stalled');
// Cleanup must release the decoder even if one library method throws.
const broken=jobs.find(x=>x.active);
broken.unload=()=>{throw Error('simulated player unload exception');};
choose(78);await flush();
assert.equal(broken.destroyed,true,'destroy still runs after unload exception');
assert.equal(jobs.filter(x=>x.active).length,1);
window.meviTVUnmount();
assert.equal(jobs.filter(x=>x.active).length,0,'unmount releases player');
assert.equal(intervals.size,0,'unmount clears watchdog');
assert.equal(timeouts.size,0,'unmount clears startup timer');
console.log('MPEGTS zapping OK: 40 rapid requests, 35 sequential zaps, no player/timer leaks, one-shot fallback, stall and pause behavior.');
