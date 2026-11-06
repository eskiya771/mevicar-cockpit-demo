/* Stateful radio regression: no network, deterministic media events and timers. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../mevimedia.js',import.meta.url),'utf8');
const saved={},audios=[],timers=new Map(),listeners={},sessionHandlers={};
let timerId=0,redraws=0,rejectNext=null;
function media(kind){
  const handlers={};
  return {kind,src:'',paused:true,volume:.8,currentTime:0,duration:240,removed:false,error:null,readyState:0,
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
const navigator={onLine:true,mediaSession:{setActionHandler(action,fn){sessionHandlers[action]=fn;},metadata:null,playbackState:'none'}};
const win={render(){redraws++;},addEventListener(event,fn){listeners[event]=fn;},MediaMetadata:class{constructor(data){Object.assign(this,data);}}};
const storage={getItem:key=>saved[key]||null,setItem(key,val){saved[key]=val;}};
class MockURL extends URL{static createObjectURL(){return 'blob:test'}static revokeObjectURL(){}}
const init=()=>new Function('window','document','navigator','localStorage','URL','setTimeout','clearTimeout','TextDecoder',source)(
 win,document,navigator,storage,MockURL,
 fn=>{const id=++timerId;timers.set(id,fn);return id;},
 id=>timers.delete(id),TextDecoder);
function fireTimers(){const pending=[...timers.entries()];timers.clear();for(const [,fn] of pending)fn();}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
const rows=html=>(html.match(/class="mm-demo-item /g)||[]).length;
const status=()=>win.meviRadioHTML(true).match(/id="mm-radio-status"[^>]*>([^<]*)</)?.[1]||'';

init();
assert.equal(audios.length,0,'No network/audio on module load');
let html=win.meviRadioHTML(true);
assert.equal(rows(html),13);
assert.doesNotMatch(html,/Demo-Sender|Kein Radioempfang/);
assert.match(html,/13 Sender/);
assert.match(html,/id="mm-radio-search"/);
assert.match(html,/id="mm-radio-add"/);
assert.match(html,/HTTPS/);

// Search filters the list without replacing the screen DOM.
const redrawBeforeSearch=redraws;
win.meviRadioAction('query','franken');
assert.equal(redraws,redrawBeforeSearch,'Search updates only the list');
html=win.meviRadioHTML(true);
assert.equal(rows(html),1);
assert.match(html,/1 von 13 Sendern/);
assert.match(html,/BAYERN 1 Franken/);
win.meviRadioAction('query','zzz');
html=win.meviRadioHTML(true);
assert.equal(rows(html),0);
assert.match(html,/Keine Sender gefunden/);
win.meviRadioAction('query','');
assert.equal(rows(win.meviRadioHTML(true)),13);

// Catalog playback, layout retention and volume.
win.meviRadioAction('select',0);
let a=audios.at(-1);
assert.match(a.src,/br1\/franken/);assert.equal(a.paused,false);
assert.match(win.meviRadioHTML(true),/Livestream wird geladen/);
assert.equal(navigator.mediaSession.metadata.title,'BAYERN 1 Franken');
const beforePlay=redraws;a.emit('playing');
assert.equal(redraws,beforePlay,'Media events must not replace the screen DOM');
assert.match(win.meviRadioHTML(true),/LIVE · BAYERN 1 Franken/);
assert.equal(timers.size,0);
const audioCountLayout=audios.length;
win.meviRadioHTML(false);win.meviRadioHTML(true);
assert.equal(audios.length,audioCountLayout,'Layout changes retain the playing element');
win.meviRadioAction('volume',35);assert.equal(a.volume,.35);
assert.equal(JSON.parse(saved['mevicar-radio-v1']).volume,.35);
win.meviRadioAction('favorite');win.meviRadioAction('filter');
html=win.meviRadioHTML(true);
assert.equal(rows(html),1);
assert.match(html,/1 von 13 Sendern/);
assert.equal(JSON.parse(saved['mevicar-radio-v1']).volume,.35);
win.meviRadioAction('filter');

// Automatic retry with backoff after a stream error.
a.emit('error');
assert.equal(a.removed,true);
assert.match(status(),/Stream nicht erreichbar/);
assert.match(status(),/4 s \(1\/3\)/);
assert.equal(timers.size,1);
fireTimers();
a=audios.at(-1);
assert.match(a.src,/br1\/franken/);
assert.equal(timers.size,1,'Watchdog timer for the retried stream');
a.emit('error');
assert.match(status(),/10 s \(2\/3\)/);
fireTimers();
a=audios.at(-1);
a.emit('error');
assert.match(status(),/25 s \(3\/3\)/);
fireTimers();
a=audios.at(-1);
a.emit('error');
assert.match(status(),/Erneut versuchen/);
assert.doesNotMatch(status(),/Neuer Versuch/);
assert.equal(timers.size,0,'No automatic retry after three attempts');

// A manual stop cancels pending retries.
win.meviRadioAction('toggle');
a=audios.at(-1);
a.emit('playing');
assert.equal(timers.size,0);
a.emit('error');
assert.equal(timers.size,1);
const stoppedCount=audios.length;
sessionHandlers.pause();
assert.equal(timers.size,0);
assert.doesNotMatch(status(),/Neuer Versuch/);
fireTimers();
assert.equal(audios.length,stoppedCount,'Manual stop cancels the pending retry');

// Errors from an abandoned stream must not schedule retries for the new one.
win.meviRadioAction('toggle');
const staleAudio=audios.at(-1);
staleAudio.emit('playing');
win.meviRadioAction('select',1);
staleAudio.emit('error');
assert.match(status(),/Livestream wird geladen/,'Stale error events are ignored');
assert.equal(timers.size,1,'Only the active watchdog timer remains');
win.meviRadioAction('select',0);
a=audios.at(-1);
a.emit('playing');

// Offline pauses retries; the online event resumes a stream the user still wants.
navigator.onLine=false;
listeners.offline();
assert.equal(a.removed,true);
assert.match(status(),/Offline/);
assert.equal(timers.size,0,'Offline does not keep retrying');
const offlineCount=audios.length;
win.meviRadioAction('toggle');
assert.equal(audios.length,offlineCount,'Offline start does not create audio');
assert.match(status(),/Offline/);
navigator.onLine=true;
listeners.online();
assert.equal(audios.length,offlineCount+1);
a=audios.at(-1);
assert.match(a.src,/br1\/franken/);
a.emit('playing');
assert.match(status(),/LIVE/);
sessionHandlers.stop();
const onlineStopCount=audios.length;
listeners.online();
assert.equal(audios.length,onlineStopCount,'Online event must not restart a manually stopped stream');

// Blocked or unsupported playback stops with a clear message instead of retrying.
const denied={};rejectNext=denied;
win.meviRadioAction('select',1);
a=audios.at(-1);
denied.reject({name:'NotAllowedError'});await flush();
assert.match(status(),/Browser blockiert/);
assert.equal(a.removed,true);
assert.equal(timers.size,0,'Blocked playback is not retried');

// A stale rejection from an abandoned station must not stop the new one.
const deferred={};rejectNext=deferred;
win.meviRadioAction('select',2);
const stale=audios.at(-1);
win.meviRadioAction('select',3);
deferred.reject({name:'NotAllowedError'});await flush();
assert.match(status(),/Livestream wird geladen/,'Old play rejection must not stop the new station');
assert.equal(stale.removed,true);
audios.at(-1).emit('playing');

const unsupported={};rejectNext=unsupported;
win.meviRadioAction('select',4);
a=audios.at(-1);
unsupported.reject({name:'NotSupportedError'});await flush();
assert.match(status(),/nicht unterstützt/);
assert.equal(a.removed,true);
assert.equal(timers.size,0,'Unsupported playback is not retried');

// Watchdog timeout triggers the retry state.
win.meviRadioAction('select',5);
a=audios.at(-1);
a.emit('waiting');
assert.match(status(),/gepuffert/);
fireTimers();
assert.equal(a.removed,true);
assert.match(status(),/antwortet nicht/);
assert.match(status(),/4 s \(1\/3\)/);
sessionHandlers.pause();
assert.equal(timers.size,0);

// Media-session transport follows the station list and stays unseekable.
win.meviRadioAction('select',6);
audios.at(-1).emit('playing');
const beforeNext=audios.length;
sessionHandlers.nexttrack();
assert.equal(audios.length,beforeNext+1);
assert.match(audios.at(-1).src,/br24/);
assert.equal(sessionHandlers.seekto,null,'Live streams are not seekable');

// Local playback and radio remain mutually exclusive.
await win.meviMediaLoadFiles([{name:'sample.mp3',size:20,lastModified:1,type:'audio/mpeg',webkitRelativePath:'',
 slice(){return {arrayBuffer:async()=>new Uint8Array(32).buffer};}}],'Test');
win.meviMediaPlay(0);await Promise.resolve();
assert.equal(audios.at(-1).removed,true);
assert.equal(local.paused,false);
win.meviRadioAction('toggle');
assert.equal(local.paused,true);
win.meviMediaStopForSource('spotify');
assert.equal(audios.at(-1).removed,true);
assert.equal(timers.size,0);

// Custom HTTPS streams: validation, playback, two-step removal and persistence.
assert.equal(win.meviRadioAddStation('Test','http://insecure.example/live.mp3'),false);
assert.match(win.meviRadioHTML(true),/Ungültige Stream-URL/);
assert.equal(win.meviRadioAddStation('Test','https://user:pass@example.com/live.mp3'),false);
assert.equal(win.meviRadioAddStation('Mein Sender','https://radio.example/live.mp3'),true);
html=win.meviRadioHTML(true);
assert.equal(rows(html),14);
assert.match(html,/Mein Sender/);
assert.match(html,/EIGEN/);
assert.match(html,/id="mm-radio-remove"/);
let stored=JSON.parse(saved['mevicar-radio-v1']);
assert.equal(stored.custom.length,1);
assert.equal(stored.custom[0].url,'https://radio.example/live.mp3');
assert.equal(stored.station,stored.custom[0].id);
assert.equal(win.meviRadioAddStation('Doppelt','https://radio.example/live.mp3'),false);
assert.match(win.meviRadioHTML(true),/bereits vorhanden/);

win.meviRadioAction('select',13);
a=audios.at(-1);
assert.equal(a.src,'https://radio.example/live.mp3');
a.emit('playing');
assert.match(status(),/LIVE · Mein Sender/);
win.meviRadioRemoveStation();
html=win.meviRadioHTML(true);
assert.equal(rows(html),14,'First remove tap only arms confirmation');
assert.match(html,/Erneut auf Entfernen tippen/);
assert.match(html,/id="mm-radio-remove"[^>]*selected/);
win.meviRadioRemoveStation();
assert.equal(a.removed,true,'Removing the active custom station stops playback');
assert.equal(rows(win.meviRadioHTML(true)),13);
assert.match(status(),/Eigener Sender entfernt/);
assert.equal(JSON.parse(saved['mevicar-radio-v1']).custom.length,0);

// Preferences and custom stations survive a reload without autoplay.
assert.equal(win.meviRadioAddStation('Persistence','https://persist.example/stream.mp3'),true);
const beforeReload=audios.length;
init();
assert.equal(audios.length,beforeReload,'Restore preferences without autoplay');
html=win.meviRadioHTML(true);
assert.equal(rows(html),14);
assert.match(html,/Persistence/);
assert.match(html,/value="35"/);
assert.equal(timers.size,0);

// At most 20 custom stations are kept.
for(let i=0;i<19;i++)assert.equal(win.meviRadioAddStation('S'+i,'https://s'+i+'.example/live.mp3'),true);
assert.equal(win.meviRadioAddStation('Zu viel','https://overflow.example/live.mp3'),false);
assert.match(status(),/Maximal 20 eigene Sender/);

saved['mevicar-radio-v1']=JSON.stringify({station:'bad',favorites:'bad',volume:'bad',custom:[{url:'http://bad'}]});
init();
html=win.meviRadioHTML(true);
assert.equal(rows(html),13);
assert.match(html,/value="80"/);
assert.equal(timers.size,0);
console.log('Radio OK: catalog, live states, search, custom streams, retry/backoff, offline recovery, stale events, favorites, persistence, media-session and exclusive audio.');
