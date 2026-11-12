/* MeviCar Next YouTube – offline regression of the actual player.
   No Google API key, test videos, remote requests or false GPS permissions. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../youtube.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../youtube.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
new Function(src);
function fixture({compact=false,width=600,height=350,focusedHeight=280}={}){
 const records={watches:[],cleared:[],intervals:[],intervalsCleared:[],
  popups:[],audio:[],stored:[],frames:[],pageEvents:new Map(),docEvents:new Map()};
 const elements=new Map();
 const classes=new Set(['mevi-youtube-shell',...(compact?['is-compact']:[])]);
 const root={classList:{add:s=>classes.add(s),remove:s=>classes.delete(s),
   contains:s=>classes.has(s),toggle:(k,v)=>{if(v)classes.add(k);else classes.delete(k)}}};
 const holder={innerHTML:'',children:[],
  getBoundingClientRect:()=>({width,height:classes.has('mevi-youtube-focus')?focusedHeight:height}),
  replaceChildren(...children){this.children=children;this.innerHTML=''}};
 elements.set('mevi-youtube-input',{value:'https://youtu.be/dQw4w9WgXcQ'});
 elements.set('mevi-youtube-frame',holder);
 elements.set('mevi-youtube-status',{textContent:''});
 elements.set('mevi-youtube-detail',{textContent:''});
 elements.set('mevi-youtube-stop',{disabled:true});
 const document={hidden:false,
  querySelector:selector=>selector==='.mevi-youtube-shell'?root:null,
  getElementById:id=>elements.get(id)||null,
  createElement:tag=>{
   assert.equal(tag,'iframe');
   const frame={tagName:'IFRAME',listeners:new Map(),
    addEventListener(name,fn){this.listeners.set(name,fn)},
    setAttribute(){},
    removeAttribute(key){if(key==='src')this.src=''},
    remove(){this.removed=true}};
   records.frames.push(frame);return frame;
  },
  addEventListener:(name,fn)=>records.docEvents.set(name,fn)
 };
 const navigator={geolocation:{
  watchPosition:(success,error,opts)=>{records.watches.push({success,error,opts});return 9},
  clearWatch:id=>records.cleared.push(id)
 }};
 const window={addEventListener:(name,fn)=>records.pageEvents.set(name,fn),
  open:(url,target,features)=>records.popups.push({url,target,features}),
  meviMediaStopForSource:source=>records.audio.push(['media',source]),
  meviSpotifyPauseForSource:source=>records.audio.push(['spotify',source])};
 const localStorage={getItem:()=>null,setItem:(k,v)=>records.stored.push({key:k,value:v})};
 const ctx={document,window,navigator,localStorage,URL,URLSearchParams,Date,Intl,Number,JSON,Math,console,
   setInterval:fn=>{records.intervals.push(fn);return records.intervals.length},
   clearInterval:id=>records.intervalsCleared.push(id)};
 runInNewContext(src,ctx);
 return{api:window.MeviYouTube,records,document,elements,holder,root,classes};
}
{
 const {api}=fixture();
 const id='dQw4w9WgXcQ';
 for(const raw of [id,'https://youtu.be/'+id,'https://www.youtube.com/watch?v='+id,
   'https://m.youtube.com/shorts/'+id,'https://www.youtube.com/live/'+id,
   'https://www.youtube-nocookie.com/embed/'+id]){
  assert.equal(api.parseLink(raw)?.video,id,'Supported video link '+raw);
 }
 const playlist='PLxk9M6LElZzW9s6M6k18';
 const p=api.parseLink('https://www.youtube.com/playlist?list='+playlist);
 assert.equal(p.playlist,playlist);
 assert.equal(p.video,null);
 assert.match(api.embedUrl(p),/youtube-nocookie\.com\/embed\/videoseries/);
 assert.match(api.embedUrl(p),/listType=playlist/);
 assert.match(api.embedUrl(p),/autoplay=0/,'No autoplay and automatic tracking before click');
 assert.equal(api.parseLink('https://youtu.be/'+id+'?list='+playlist).playlist,playlist);
 for(const evil of ['javascript:alert(1)','http://www.youtube.com/watch?v='+id,
   'https://youtube.com.evil.org/watch?v='+id,
   'https://www.youtube.com@evil.example/watch?v='+id,
   'https://www.youtube.com/watch?v=bad','https://www.youtube.com/redirect?q=x',
   'https://www.youtube.com/watch?v='+id+'&list=invalid!']){
  assert.equal(api.parseLink(evil),null,'Reject URL '+evil);
 }
 assert.equal(api.publicUrl(p),'https://www.youtube.com/playlist?list='+playlist);
 assert.match(api.html(true),/is-compact/);
 assert.match(api.html(false),/NUR IM STAND/);
 assert.match(api.html(false),/MeviYouTube\.load\(\)/);
}
{
 const {api,records,holder,elements,root}=fixture();
 api.mount();
 assert.equal(records.watches.length,1);
 assert.equal(api.debug().watchActive,true);
 assert.equal(api.load(),false,'No GPS must not enable a video');
 assert.equal(records.frames.length,0);
 // GPS speed=0, good accuracy and a fresh timestamp.
 records.watches[0].success({timestamp:Date.now(),coords:{
  latitude:49.712,longitude:10.895,accuracy:8,speed:0,heading:null
 }});
 assert.equal(api.currentFix().ok,true);
 assert.equal(api.load(),true,'Actual GPS stand authorizes user-initiated load');
 assert.equal(records.frames.length,1);
 assert.equal(holder.children.length,1);
 assert.ok(records.frames[0].src.startsWith('https://www.youtube-nocookie.com/embed/'));
 assert.equal(records.audio.length,2,'MeviMedia and Spotify pause before YouTube starts');
 assert.equal(elements.get('mevi-youtube-stop').disabled,false);
 assert.equal(api.debug().playing,true);
 assert.equal(records.stored[0].key,'mevicar-next-youtube-v1');
 assert.ok(!records.stored.some(e=>/token|secret|gps/i.test(e.value)));
 // Movement or loss of GPS immediately tears down the iframe and audio.
 records.watches[0].success({timestamp:Date.now(),coords:{latitude:49.712,longitude:10.895,
  accuracy:7,speed:1.8}});
 assert.equal(api.debug().playing,false);
 assert.equal(holder.children.length,1,'Old fake holder kept until real DOM removal; iframe must be removed');
 assert.equal(records.frames[0].removed,true);
 assert.match(holder.innerHTML,/Video oder Playlist laden/);
 api.unmount();
 assert.deepEqual(records.cleared,[9]);
 assert.equal(records.intervalsCleared.length,1);
}
{
 const {api,records,document}=fixture();
 api.mount();
 records.watches[0].success({timestamp:Date.now()-16000,coords:{accuracy:4,speed:0}});
 assert.equal(api.currentFix().ok,false,'Stale GPS is rejected');
 assert.equal(api.load(),false);
 records.watches[0].success({timestamp:Date.now(),coords:{accuracy:100,speed:0}});
 assert.equal(api.load(),false,'Inaccurate GPS is rejected');
 records.watches[0].success({timestamp:Date.now(),coords:{accuracy:5,speed:null}});
 assert.equal(api.load(),false,'Unknown speed must not be treated as standstill');
 records.watches[0].success({timestamp:Date.now(),coords:{accuracy:5,speed:0}});
 assert.equal(api.load(),true);
 document.hidden=true;
 records.docEvents.get('visibilitychange')();
 assert.equal(api.debug().playing,false,'Background tab stops embedded video');
 document.hidden=false;
 assert.equal(api.load(),true);
 records.pageEvents.get('pagehide')();
 assert.equal(api.debug().playing,false,'Page hide also stops YouTube');
 api.unmount();
}
{
 const {api,records,classes}=fixture({compact:true,width:335,height:145,focusedHeight:250});
 api.mount();
 records.watches[0].success({timestamp:Date.now(),coords:{accuracy:4,speed:0}});
 assert.equal(api.load(),true,'Compact split must expand player to 200px+');
 assert.equal(classes.has('mevi-youtube-focus'),true);
 api.stop('Gestoppt');
 assert.equal(classes.has('mevi-youtube-focus'),false,'Player controls return on Stop');
 api.unmount();
}
{
 const {api,records}=fixture({compact:true,width:200,height:140,focusedHeight:180});
 api.mount();
 records.watches[0].success({timestamp:Date.now(),coords:{accuracy:5,speed:0}});
 assert.equal(api.load(),false,'Never embed below official minimum 200x200');
 assert.equal(records.frames.length,0);
 api.openExternal();
 assert.equal(records.popups.length,1);
 assert.equal(records.popups[0].target,'_blank');
 assert.ok(records.popups[0].url.startsWith('https://www.youtube.com/watch?v='));
 assert.equal(records.popups[0].features,'noopener,noreferrer');
 api.unmount();
}
assert.match(css,/\.youtube-host/);
assert.match(css,/\.mevi-youtube-shell\.is-compact\.mevi-youtube-focus/);
assert.match(html,/youtube\.js/);
assert.match(html,/youtube\.css/);
assert.match(html,/s\.app==='youtube'\)return window\.MeviYouTube\?\.html/);
assert.match(html,/class="full youtube-host"/);
assert.match(html,/MeviYouTube\.mount\(\)/);
assert.match(pages,/mevicar-youtube-script/);
assert.match(pages,/youtube\.js youtube\.css/);
assert.match(sw,/youtube\.js/);
assert.match(sw,/youtube\.css/);
console.log('YouTube: official player, videos/playlists, GPS standby, compact 200x200, media-stop, privacy and teardown passed.');
