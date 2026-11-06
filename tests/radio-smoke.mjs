/* Stateful radio regression: no network, deterministic media events and timers. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../mevimedia.js',import.meta.url),'utf8');
const saved={},audios=[],timers=new Map(),listeners={},sessionHandlers={};
let timerId=0,redraws=0,rejectNext=null;
function media(kind){
  const handlers={};
  return {kind,src:'',paused:true,volume:.8,currentTime:0,duration:240,removed:false,error:null,
    addEventListener(event,fn){handlers[event]=fn;},
    emit(event){handlers[event]?.();},
    setAttribute(){},
    removeAttribute(name){if(name==='src')this.src='';},
    load(){},remove(){this.removed=true;},
    play(){this.paused=false;this.emit('play');if(kind==='audio'&&rejectNext){const pending=new Promise((resolve,reject)=>{rejectNext.reject=reject;});rejectNext=null;return pending;}return Promise.resolve();},
    pause(){this.paused=true;this.emit('pause');}
  };
}
const local=media('video'),overlay={hidden:true,setAttribute(){},appendChild(){},innerHTML:''};
const nodes=new Map();
const document={
  body:{appendChild(){}},querySelector(){return null;},
  getElementById(id){return nodes.get(id)||null;},
  createElement(type){if(type==='video')return local;if(type==='section')return overlay;if(type==='audio'){const a=media(type);audios.push(a);return a;}throw Error(type);}
};
const navigator={mediaSession:{setActionHandler(action,fn){sessionHandlers[action]=fn;},metadata:null,playbackState:'none'}};
const win={render(){redraws++;},addEventListener(event,fn){listeners[event]=fn;},MediaMetadata:class{constructor(data){Object.assign(this,data);}}};
const storage={getItem:key=>saved[key]||null,setItem(key,val){saved[key]=val;}};
const init=()=>new Function('window','document','navigator','localStorage','URL','setTimeout','clearTimeout','TextDecoder',source)(
 win,document,navigator,storage,{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},
 fn=>{const id=++timerId;timers.set(id,fn);return id;},id=>timers.delete(id),TextDecoder);
init();
assert.equal(audios.length,0,'No network/audio on module load');
assert.equal((win.meviRadioHTML(true).match(/class="mm-demo-item /g)||[]).length,13);
assert.doesNotMatch(win.meviRadioHTML(true),/Demo-Sender|Kein Radioempfang/);
win.meviRadioAction('select',-1);assert.equal(audios.length,0);
win.meviRadioAction('select',0);
let a=audios.at(-1);
assert.match(a.src,/br1\/franken/);assert.equal(a.paused,false);
assert.match(win.meviRadioHTML(true),/Livestream wird geladen/);
assert.equal(navigator.mediaSession.metadata.title,'BAYERN 1 Franken');
const before=redraws;a.emit('playing');
assert.equal(redraws,before,'Media events must not replace the screen DOM');
assert.match(win.meviRadioHTML(true),/LIVE · BAYERN 1 Franken/);
assert.equal(timers.size,0);
win.meviRadioHTML(false);win.meviRadioHTML(true);
assert.equal(audios.length,1,'Layout changes retain the playing element');
win.meviRadioAction('volume',35);assert.equal(a.volume,.35);
win.meviRadioAction('favorite');win.meviRadioAction('filter');
assert.equal((win.meviRadioHTML(true).match(/class="mm-demo-item /g)||[]).length,1);
assert.equal(JSON.parse(saved['mevicar-radio-v1']).volume,.35);
win.meviRadioAction('filter');
win.meviRadioAction('next');assert.equal(a.removed,true);assert.equal(a.src,'');
a.emit('error');assert.match(win.meviRadioHTML(true),/Livestream wird geladen/,'Ignore stale events');
a=audios.at(-1);a.emit('playing');
sessionHandlers.pause();assert.equal(a.removed,true);assert.equal(a.src,'');assert.equal(timers.size,0);
sessionHandlers.play();a=audios.at(-1);assert.match(a.src,/br3/);
a.emit('error');assert.match(win.meviRadioHTML(true),/Stream nicht erreichbar/);assert.equal(a.removed,true);
win.meviRadioAction('toggle');a=audios.at(-1);a.emit('waiting');
assert.match(win.meviRadioHTML(true),/gepuffert/);
[...timers.values()][0]();assert.equal(a.removed,true);assert.match(win.meviRadioHTML(true),/antwortet nicht/);
const deferred={};rejectNext=deferred;
win.meviRadioAction('toggle');a=audios.at(-1);
win.meviRadioAction('next');deferred.reject({name:'NotAllowedError'});await Promise.resolve();
assert.match(win.meviRadioHTML(true),/Livestream wird geladen/,'Old play rejection must not stop new station');
listeners.offline();assert.match(win.meviRadioHTML(true),/Offline/);assert.equal(audios.at(-1).src,'');
win.meviRadioAction('toggle');a=audios.at(-1);
win.meviMediaStopForSource('spotify');assert.equal(a.src,'');
const count=audios.length;sessionHandlers.play();assert.equal(audios.length,count,'Spotify must not start radio');
win.meviRadioAction('select',5);assert.match(audios.at(-1).src,/sslstream.dlf/);
sessionHandlers.nexttrack();assert.match(audios.at(-1).src,/br2/);
assert.equal(sessionHandlers.seekto,null,'Live streams are not seekable');
// Local playback must stop radio, and radio must pause local playback.
await win.meviMediaLoadFiles([{name:'sample.mp3',size:20,lastModified:1,type:'audio/mpeg',webkitRelativePath:'',
 slice(){return {arrayBuffer:async()=>new Uint8Array(32).buffer};}}],'Test');
win.meviMediaPlay(0);await Promise.resolve();
assert.equal(audios.at(-1).removed,true);assert.equal(local.paused,false);
win.meviRadioAction('toggle');assert.equal(local.paused,true);
local.emit('ended');assert.equal(local.paused,true,'A late local ended event cannot reclaim radio audio');
const radioTitle=navigator.mediaSession.metadata.title;
await Promise.resolve();await Promise.resolve();
assert.equal(navigator.mediaSession.metadata.title,radioTitle,'Late artwork must not overwrite radio metadata');
win.meviMediaStopForSource('media');assert.equal(audios.at(-1).removed,true);
sessionHandlers.play();assert.equal(local.paused,false);
win.meviRadioAction('select',12);sessionHandlers.nexttrack();assert.match(audios.at(-1).src,/br1\/franken/);
win.meviMediaStopForSource('spotify');
const denied={};rejectNext=denied;win.meviRadioAction('toggle');denied.reject({name:'NotAllowedError'});await Promise.resolve();
assert.match(win.meviRadioHTML(true),/Browser blockiert/);assert.equal(audios.at(-1).removed,true);
const after=audios.length;
init();assert.equal(audios.length,after,'Restore preferences without autoplay');
assert.match(win.meviRadioHTML(true),/value="35"/);
saved['mevicar-radio-v1']=JSON.stringify({station:'bad',favorites:'bad',volume:'bad'});
init();assert.match(win.meviRadioHTML(true),/value="80"/);
assert.equal(timers.size,0);
console.log('Radio OK: catalog, live states, stop/retry, timeout, offline, stale events, favorites, persistence, media-session and exclusive audio.');
