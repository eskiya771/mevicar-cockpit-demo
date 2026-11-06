/* Regression test for the browser-only MeviMedia player.
   Run: node tests/mevimedia-smoke.mjs */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../mevimedia.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../mevimedia.css',import.meta.url),'utf8');
new Function(source);
assert.ok(css.includes('.mm-shell')&&css.includes('.mm-transport')&&css.includes('.mm-video-overlay'));
/* Guard against cropped and oversized transport SVGs in landscape split-screen. */
for (const fragment of [
  'grid-template-rows:minmax(0,1fr) auto auto',
  'env(safe-area-inset-bottom',
  '.mm-shell.is-compact .mm-transport button',
  'max-width:80%;max-height:80%',
  'aspect-ratio:1',
  'flex:1 1 0',
]) assert.ok(css.includes(fragment),'Media transport safe-layout rule missing: '+fragment);

const handlers=new Map(),saved={},urls=[];
let redrawCount=0;
const player={
  src:'',paused:true,duration:240,currentTime:0,volume:.85,
  addEventListener(type,fn){handlers.set(type,fn)},
  setAttribute(){},load(){},
  play(){this.paused=false;handlers.get('play')?.();return Promise.resolve()},
  pause(){this.paused=true;handlers.get('pause')?.()}
};
const overlay={
  hidden:true,children:[],setAttribute(){},
  appendChild(element){this.children.push(element)},
  set innerHTML(value){this.html=value}
};
const document={
  body:{appendChild(){}},
  getElementById(id){return id==='mm-video-title'?{textContent:''}:null},
  querySelector(){return null},
  createElement(type){
    if(type==='section')return overlay;
    if(type==='video')return player;
    throw new Error('Unexpected element: '+type);
  }
};
const win={isSecureContext:true,render(){redrawCount++}};
const localStorage={getItem:k=>saved[k]||null,setItem(k,v){saved[k]=v}};
const mockUrl={createObjectURL(file){const id='blob:test-'+urls.length;urls.push(id);return id},revokeObjectURL(){}};
new Function('window','document','navigator','localStorage','URL','setTimeout','TextDecoder',source)(
  win,document,{},localStorage,mockUrl,setTimeout,TextDecoder
);
const getHTML=()=>win.meviMediaHTML(false);
let html=getHTML();
assert.match(html,/Deine Musik\. Dein Cockpit\./);
assert.doesNotMatch(html,/Midnight Drive/);
assert.match(html,/Ordner auswählen/);
assert.doesNotMatch(html,/class="mm-search"/,'Empty library must not show a useless search box');
assert.doesNotMatch(html,/class="mm-tabs"/,'Empty library must not show empty category tabs');
assert.equal((html.match(/onclick="meviMediaFolder\(\)"/g)||[]).length,1,'Single folder-import action when empty');
assert.equal((html.match(/onclick="meviMediaFiles\(\)"/g)||[]).length,1,'Single file-import action when empty');
assert.ok(html.includes('class="mm-transport"'));
function file(name,folder,type){
  return {name,size:10000,lastModified:123,type,webkitRelativePath:folder+'/'+name,
    slice(){return {arrayBuffer:async()=>new Uint8Array(32).buffer}}};
}
await win.meviMediaLoadFiles([
  file('Artist - Night Drive.mp3','Music/Album A','audio/mpeg'),
  file('Morning Air.mp3','Music/Album A','audio/mpeg'),
  file('Trip.mp4','Videos','video/mp4')
],'Test');
assert.equal(win.meviMediaDebug().count,3);
html=getHTML();
for(const id of ['Titel','Favoriten','Interpreten','Alben','Ordner','Videos']){
  assert.ok(html.includes(id),'Missing Classic library tab '+id+' after import');
}
assert.match(html,/Night Drive/);
assert.match(html,/Morning Air/);
assert.doesNotMatch(html,/Midnight Drive/);

win.meviMediaSection('artists');
assert.match(getHTML(),/Artist/);
win.meviMediaSection('songs');
win.meviMediaSearch('Night Drive');
assert.ok(getHTML().includes('value="Night Drive"'));
win.meviMediaSearch('');
win.meviMediaPlay(1); // Alphabetical sort: Night Drive follows Morning Air.
await Promise.resolve();
assert.equal(win.meviMediaDebug().playing,true);
assert.equal(win.meviMediaDebug().queue,2);
assert.ok(urls.length>=1);
win.meviMediaFav(1);
assert.equal(JSON.parse(saved['mevicar-media-favorites-v1']).length,1);
win.meviMediaSection('favorites');
assert.match(getHTML(),/Night Drive/);
win.meviMediaSection('videos');
assert.match(getHTML(),/Trip/);

win.meviMediaPlay(2);
await Promise.resolve();
assert.equal(overlay.hidden,false);
assert.equal(win.meviMediaDebug().queue,1);
win.meviMediaCloseVideo();
assert.equal(overlay.hidden,true);
assert.equal(win.meviMediaDebug().playing,false);
win.meviMediaVolume(60);
assert.equal(player.volume,.6);
win.meviMediaShuffle();
win.meviMediaRepeat();
assert.deepEqual([win.meviMediaDebug().shuffle,win.meviMediaDebug().repeat],[true,1]);
assert.ok(win.meviMediaHTML(true).includes('Bibliothek'));
assert.ok(redrawCount>4);

win.meviMediaStopForSource('spotify');
assert.equal(player.paused,true);
console.log('MeviMedia smoke checks passed: import, library, group, search, play, queue, favorites, video, volume, source switch.');
