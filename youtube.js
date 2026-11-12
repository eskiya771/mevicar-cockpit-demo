/* MeviCar Next · YouTube
   Classic-compatible: official iframe, video/playlist link, stationary GPS guard.
   No YouTube Data API key, no background playback, no secret storage. */
(function(){
'use strict';
const STORE='mevicar-next-youtube-v1', FRESH_MS=10000, MAX_ACCURACY=30, MAX_SPEED=0.5;
const state={input:'',parsed:null,recent:[],favorites:[],watchId:null,timer:null,fix:null,loading:false,
  playing:false,status:'YouTube · Wiedergabe nur im Stand mit aktuellem GPS-Signal.',
  detail:'',mounted:false,checking:false,checkingSerial:0,iframe:null};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
try{const s=JSON.parse(localStorage.getItem(STORE)||'{}');if(typeof s.link==='string'&&s.link.length<1500)state.input=s.link;if(Array.isArray(s.recent))state.recent=s.recent.filter(x=>typeof x==='string'&&x.length<1500).slice(0,12);if(Array.isArray(s.favorites))state.favorites=s.favorites.filter(x=>typeof x==='string'&&x.length<1500).slice(0,20)}catch{}
function parseLink(raw){
 const value=String(raw||'').trim();
 if(!value||value.length>1500)return null;
 if(/^[\w-]{11}$/.test(value))return{video:value,playlist:null};
 let u;
 try{u=new URL(value)}catch{return null}
 if(u.protocol!=='https:'||u.username||u.password)return null;
 const host=u.hostname.toLowerCase(),path=u.pathname,videoId=/^[\w-]{11}$/,listId=/^[A-Za-z0-9_-]{10,128}$/;
 if(!['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','www.youtube-nocookie.com','youtube-nocookie.com','youtu.be','www.youtu.be'].includes(host))return null;
 let video=null,playlist=null;
 if(host==='youtu.be'||host==='www.youtu.be')video=path.split('/')[1]||'';
 else if(path==='/watch')video=u.searchParams.get('v');
 else if(/^\/(shorts|live|embed)\//.test(path))video=path.split('/')[2]||'';
 else if(path==='/playlist'||path==='/embed/videoseries')video=null;
 else return null;
 if(video&&!videoId.test(video))return null;
 const list=u.searchParams.get('list');
 if(list){if(!listId.test(list))return null;playlist=list}
 if(!video&&!playlist)return null;
 return{video:video||null,playlist:playlist||null};
}
function embedUrl(item){
 if(!item)return '';
 const id=item.video||'videoseries';
 const params=new URLSearchParams({autoplay:'0',playsinline:'1',rel:'0'});
 if(item.playlist){params.set('list',item.playlist);if(!item.video)params.set('listType','playlist')}
 return 'https://www.youtube-nocookie.com/embed/'+id+'?'+params.toString();
}
function publicUrl(item){
 if(!item)return '';
 if(item.video)return 'https://www.youtube.com/watch?v='+item.video+(item.playlist?'&list='+item.playlist:'');
 return 'https://www.youtube.com/playlist?list='+item.playlist;
}
function readInput(){
 const el=document.getElementById('mevi-youtube-input');
 return String(el?.value??state.input).trim();
}
function saveLink(){
 try{localStorage.setItem(STORE,JSON.stringify({link:state.input,recent:state.recent,favorites:state.favorites}))}catch{}
}
function remember(value){
 state.recent=[value,...state.recent.filter(x=>x!==value)].slice(0,12);saveLink();
}
function bookmark(){
 const value=readInput(),item=parseLink(value);
 if(!item){showStatus('Bitte zuerst einen gültigen YouTube-Link eingeben.');return}
 const canonical=publicUrl(item);state.input=canonical;
 if(state.favorites.includes(canonical))state.favorites=state.favorites.filter(x=>x!==canonical);
 else state.favorites=[canonical,...state.favorites].slice(0,20);
 saveLink();refreshLibrary();
 showStatus(state.favorites.includes(canonical)?'Favorit gespeichert.':'Favorit entfernt.');
}
function chooseLink(type,index){
 const items=type==='favorite'?state.favorites:state.recent;
 const value=items[index];if(!value||!parseLink(value))return;
 state.input=value;const input=document.getElementById('mevi-youtube-input');if(input)input.value=value;
 refreshLibrary();showStatus('Video ausgewählt. Auf „Laden“ tippen.');
}
function libraryHTML(){
 const row=(items,type)=>items.length?'<div class="mevi-youtube-chips">'+items.map((value,i)=>{
  const item=parseLink(value);if(!item)return '';
  const name=item.video?'▶ '+item.video:'☷ Playlist '+item.playlist.slice(0,12);
  return '<button type="button" class="mevi-youtube-chip" title="'+esc(value)+'" onclick="MeviYouTube.chooseLink(\''+type+'\','+i+')">'+esc(name)+'</button>';
 }).join('')+'</div>':'<small>Noch keine Einträge</small>';
 return '<div class="mevi-youtube-library"><div><strong>Favoriten</strong>'+row(state.favorites,'favorite')+'</div><div><strong>Zuletzt</strong>'+row(state.recent,'recent')+'</div></div>';
}
function refreshLibrary(){const el=document.getElementById('mevi-youtube-library');if(el)el.innerHTML=libraryHTML();
 const btn=document.getElementById('mevi-youtube-favorite');if(btn){const item=parseLink(readInput());btn.textContent=item&&state.favorites.includes(publicUrl(item))?'★ Favorit':'☆ Favorit'}
}
function showStatus(message,detail=''){
 state.status=message;state.detail=detail;
 const el=document.getElementById('mevi-youtube-status'),info=document.getElementById('mevi-youtube-detail');
 if(el)el.textContent=message;
 if(info)info.textContent=detail;
}
function feedback(){
 if(!state.mounted)return;
 showStatus(state.status,state.detail);
 const box=document.querySelector('.mevi-youtube-shell');
 box?.classList.toggle('mevi-youtube-playing',state.playing);
 const stop=document.getElementById('mevi-youtube-stop');
 if(stop)stop.disabled=!state.playing;
}
function currentFix(){
 const p=state.fix;
 if(!p)return{ok:false,text:'Kein aktueller GPS-Standort verfügbar.'};
 const age=Date.now()-p.timestamp;
 if(!Number.isFinite(p.timestamp)||age>FRESH_MS||age< -2000)return{ok:false,text:'GPS-Signal zu alt. Erneut prüfen.'};
 if(!Number.isFinite(p.accuracy)||p.accuracy<0||p.accuracy>MAX_ACCURACY)
  return{ok:false,text:'GPS zu ungenau (benötigt höchstens 30 m Genauigkeit).'};
 if(!Number.isFinite(p.speed)||p.speed<0)
  return{ok:false,text:'GPS liefert keine Geschwindigkeit. Im Cockpit keine Videofreigabe.'};
 if(p.speed>MAX_SPEED)return{ok:false,text:'Video gesperrt · Fahrzeug in Bewegung ('+Math.round(p.speed*3.6)+' km/h).'};
 return{ok:true,text:'Stand erkannt · GPS ±'+Math.round(p.accuracy)+' m · '+Math.round(p.speed*3.6*10)/10+' km/h.'};
}
function idleHTML(){
 return '<div class="mevi-youtube-idle"><span class="mevi-youtube-playmark">▶</span>'+
 '<strong>Video oder Playlist laden</strong>'+
 '<p>Für die Wiedergabe sind ein aktuelles GPS-Signal, eine Genauigkeit von maximal 30 m und Stillstand erforderlich.</p>'+
 '<p>Ohne GPS lässt sich der Link über „Extern“ in YouTube öffnen.</p></div>';
}
function stop(reason){
 const root=document.querySelector('.mevi-youtube-shell');
 root?.classList.remove('mevi-youtube-focus');
 if(state.iframe){
  try{state.iframe.removeAttribute('src');state.iframe.remove()}catch{}
  state.iframe=null;
 }
 const holder=document.getElementById('mevi-youtube-frame');
 if(holder)holder.innerHTML=idleHTML();
 state.playing=false;state.loading=false;
 if(reason)showStatus(reason);
 feedback();
}
function applyFix(position){
 const c=position?.coords||{};
 state.fix={timestamp:Number(position?.timestamp)||Date.now(),accuracy:Number(c.accuracy),speed:c.speed===null||c.speed===undefined?null:Number(c.speed),
  lat:Number(c.latitude),lng:Number(c.longitude)};
 const gate=currentFix();
 if(!gate.ok&&state.playing)stop(gate.text);
 else showStatus(gate.text,state.playing?'YouTube-Wiedergabe · Standort wird laufend überprüft.':'Video oder Playlist einfügen und „Laden“ tippen.');
}
function onGpsError(error){
 state.fix=null;
 if(state.playing)stop('Video gestoppt · Standort verloren.');
 else showStatus('Standort nicht verfügbar: '+(error?.code===1?'Browserfreigabe fehlt.':error?.code===3?'GPS-Zeitüberschreitung.':'Standort nicht bestimmbar.'));
}
function verifyContinuously(){
 if(!state.mounted)return;
 if(document.hidden){if(state.playing)stop('Video gestoppt · MeviCar ist im Hintergrund.');return}
 const gate=currentFix();
 if(state.playing&&!gate.ok)stop(gate.text);
 if(!state.playing&&state.fix&&!gate.ok&&state.status.startsWith('Stand erkannt'))showStatus(gate.text);
}
function beginWatching(){
 if(state.watchId!==null||!state.mounted||!navigator.geolocation)return;
 try{
  state.watchId=navigator.geolocation.watchPosition(applyFix,onGpsError,{enableHighAccuracy:true,timeout:12000,maximumAge:2000});
 }catch(e){showStatus('Standortprüfung nicht möglich: '+(e?.message||e))}
}
function mount(){
 const element=document.querySelector('.mevi-youtube-shell');
 if(!element){unmount();return}
 if(state.mounted)return;
 state.mounted=true;
 beginWatching();
 if(state.timer!==null)clearInterval(state.timer);
 state.timer=setInterval(verifyContinuously,1000);
 feedback();refreshLibrary();
}
function unmount(){
 state.checkingSerial++;
 state.mounted=false;
 stop();
 if(state.watchId!==null){try{navigator.geolocation?.clearWatch(state.watchId)}catch{}state.watchId=null}
 if(state.timer!==null){clearInterval(state.timer);state.timer=null}
 state.fix=null;
}
function setInput(v){
 state.input=String(v||'').slice(0,1500);refreshLibrary();
}
function load(){
 if(!state.mounted)return false;
 const value=readInput();
 const item=parseLink(value);
 if(!item){showStatus('Ungültiger YouTube-Link oder Video-/Playlist-ID.');return false}
 state.input=value;state.parsed=item;remember(publicUrl(item));refreshLibrary();
 const gate=currentFix();
 if(!gate.ok){showStatus('Nicht geladen · '+gate.text,'Für Desktop ohne GPS: „In YouTube öffnen“ verwenden.');return false}
 const holder=document.getElementById('mevi-youtube-frame');
 if(!holder){showStatus('Playerbereich nicht verfügbar.');return false}
 const root=document.querySelector('.mevi-youtube-shell');
 if(root?.classList.contains('is-compact'))root.classList.add('mevi-youtube-focus');
 const bounds=holder.getBoundingClientRect();
 if(bounds.width<200||bounds.height<200){
  root?.classList.remove('mevi-youtube-focus');
  showStatus('Zu wenig Platz für den YouTube-Player (mindestens 200 × 200).','YouTube-Symbol erneut antippen, um die App im Vollbild zu öffnen.');
  return false;
 }
 stop();
 if(root?.classList.contains('is-compact'))root.classList.add('mevi-youtube-focus');
 // Like Classic, other cockpit audio stops before YouTube starts, but the YouTube
 // player itself never automatically starts playback: user presses its official Play.
 window.meviSpotifyPauseForSource?.('youtube');
 window.meviMediaStopForSource?.('youtube');
 const frame=document.createElement('iframe');
 frame.className='mevi-youtube-iframe';
 frame.title='Offizieller YouTube-Player';
 frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
 frame.allowFullscreen=true;
 frame.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
 frame.setAttribute('loading','eager');
 frame.addEventListener('error',()=>stop('YouTube nicht erreichbar. Internet prüfen und erneut laden.'));
 frame.src=embedUrl(item);
 holder.replaceChildren(frame);
 state.iframe=frame;state.playing=true;
 showStatus('Player geladen · Wiedergabe nur im Stand.','Zum Starten auf ▶ im YouTube-Player tippen. Bei Bewegung oder GPS-Verlust wird der Player geschlossen.');
 feedback();return true;
}
function openExternal(){
 const item=parseLink(readInput())||state.parsed;
 if(!item){showStatus('Bitte zuerst einen gültigen YouTube-Link eingeben.');return}
 state.input=readInput()||state.input;state.parsed=item;remember(publicUrl(item));refreshLibrary();
 const url=publicUrl(item);
 window.open?.(url,'_blank','noopener,noreferrer');
}
function html(compact=false){
 const source=esc(state.input);
 return '<section class="mevi-youtube-shell'+(compact?' is-compact':'')+'" aria-label="YouTube in MeviCar">'+
 '<header class="mevi-youtube-header"><div class="mevi-youtube-heading"><small>MEVICAR NEXT · VIDEO</small><strong>YouTube</strong></div>'+
 '<span class="mevi-youtube-guard">◉ NUR IM STAND</span></header>'+
 '<div class="mevi-youtube-controls"><label class="mevi-youtube-input-wrap" for="mevi-youtube-input">'+
 '<span>VIDEO ODER PLAYLIST</span><input id="mevi-youtube-input" type="url" inputmode="url" autocomplete="off" '+
 'placeholder="YouTube-Link oder Video-ID" value="'+source+'" oninput="MeviYouTube.setInput(this.value)" /></label>'+
 '<button type="button" class="mevi-youtube-load" onclick="MeviYouTube.load()">▶ Laden</button>'+
 '<button type="button" class="mevi-youtube-external" onclick="MeviYouTube.openExternal()">Extern ↗</button>'+ 
 '<button type="button" class="mevi-youtube-favorite" id="mevi-youtube-favorite" onclick="MeviYouTube.bookmark()">☆ Favorit</button>'+
 '<button type="button" class="mevi-youtube-stop" id="mevi-youtube-stop" onclick="MeviYouTube.stop(\'Video gestoppt.\')"'+
 (state.playing?'':' disabled')+'>■ Stopp</button></div>'+
 '<div class="mevi-youtube-feedback" role="status"><span id="mevi-youtube-status">'+esc(state.status)+
 '</span><small id="mevi-youtube-detail">'+esc(state.detail)+'</small></div>'+
 '<div class="mevi-youtube-library-host" id="mevi-youtube-library">'+libraryHTML()+'</div>'+ 
 '<div class="mevi-youtube-stage" id="mevi-youtube-frame">'+idleHTML()+'</div>'+
 '<footer class="mevi-youtube-footer">Offizieller YouTube-Player · keine Wiedergabe im Hintergrund · '+ 
 'Videos mit Einbettungssperre können nicht angezeigt werden</footer></section>';
}
document.addEventListener('visibilitychange',()=>{
 if(document.hidden&&state.playing)stop('Video gestoppt · MeviCar ist im Hintergrund.');
});
window.addEventListener('pagehide',()=>{
 if(state.playing)stop('Video gestoppt · MeviCar wurde verlassen.');
});
window.MeviYouTube={html,mount,unmount,load,stop,setInput,openExternal,bookmark,chooseLink,
 parseLink,embedUrl,publicUrl,currentFix,
 debug:()=>({mounted:state.mounted,playing:state.playing,hasFix:!!state.fix,
    status:state.status,source:state.input,watchActive:state.watchId!==null})};
})();