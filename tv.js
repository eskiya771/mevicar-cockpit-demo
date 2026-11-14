/* MeviTV: public broadcaster HLS streams, local favorites and user playlists. */
(function(global){
'use strict';
const CATALOG=[
{id:'ard',name:'Das Erste',country:'DE',url:'https://daserste-live.ard-mcdn.de/daserste/live/hls/de/master.m3u8',web:'https://www.ardmediathek.de/live'},
{id:'zdf',name:'ZDF',country:'DE',url:'https://zdf-hls-15.akamaized.net/hls/live/2016498/de/high/master.m3u8',web:'https://www.zdf.de/live-tv'},
{id:'zdfneo',name:'ZDFneo',country:'DE',url:'https://zdf-hls-16.akamaized.net/hls/live/2016499/de/high/master.m3u8',web:'https://www.zdf.de/live-tv'},
{id:'zdfinfo',name:'ZDFinfo',country:'DE',url:'https://zdf-hls-17.akamaized.net/hls/live/2016500/de/high/master.m3u8',web:'https://www.zdf.de/live-tv'},
{id:'br',name:'BR Süd',country:'DE',url:'https://mcdn.br.de/br/fs/bfs_sued/hls/de/master.m3u8',web:'https://www.br.de/mediathek/live'},
{id:'trt1',name:'TRT 1',country:'TR',url:'https://tv-trt1.medya.trt.com.tr/master.m3u8',web:'https://www.trt.net.tr/yayin-akisi?kanal=trt-1'},
{id:'trthaber',name:'TRT Haber',country:'TR',url:'https://tv-trthaber.medya.trt.com.tr/master.m3u8',web:'https://www.trthaber.com/canli.html'},
{id:'trtturk',name:'TRT Türk',country:'TR',url:'https://tv-trtturk.medya.trt.com.tr/master.m3u8',web:'https://www.trt.net.tr/yayin-akisi?kanal=trt-turk'}
];
function safeURL(value){try{const u=new URL(String(value).trim());return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
function parseM3U(text){if(text.length>1000000)throw Error('Datei zu groß (max. 1 MB).');if(/#EXT-X-/i.test(text))throw Error('Das ist ein Videostream. Bitte seine URL als einzelnen Sender hinzufügen.');const out=[];let name='';for(const line of text.split(/\r?\n/)){const s=line.trim();if(s.startsWith('#EXTINF:')){name=s.slice(s.indexOf(',')+1).trim();continue;}if(!s||s.startsWith('#'))continue;const url=safeURL(s);if(url&&!out.some(c=>c.url===url)){out.push({name:(name||'Eigener Sender').slice(0,80),url,country:'OTHER'});if(out.length>=100)break;}name='';}return out;}
function filtered(items,q,country,favorites,only){const query=q.toLocaleLowerCase('de');return items.filter(c=>(country==='ALL'||c.country===country)&&(!only||favorites.includes(c.id))&&c.name.toLocaleLowerCase('de').includes(query));}
if(typeof module!=='undefined'&&module.exports)module.exports={CATALOG,safeURL,parseM3U,filtered};
if(!global.document)return;
const KEY='mevicar-tv-v1',esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let sources=[],custom=[],favorites=[],selected='zdf',root=null,video=null,hls=null,mpegtsPlayer=null,mpegtsHealthTimer=null,mpegtsFail=null,generation=0,deadline=null;
let networkTimer=null,networkBusy=false,networkWaits=0,networkStarted=0,vodDiagnostic='';
let proxyUpdateBusy=false,moviPromise=null,moviElement=null,moviLog=[],moviSessionInfo=new Map(),moviSeekTimer=null,moviRangeTimer=null,moviSeekTrace=null,moviSeekHistory=[],moviSeekSummaryTimers=[],moviBenchmark=null,moviEverPlayed=false,moviSeekBusy=false;
let showDiagnostics=false;try{showDiagnostics=localStorage.getItem('mevicar-tv-diagnostics')==='1';}catch{}
 let query='',country='ALL',only=false,libraryPromise=null,mpegtsPromise=null,xtPlayback=null,activePlaybackName='',playbackFormat='',xtRequestSeq=0,xtProbe=null,playerTransition=false,playerFault='',mpegtsFallback=null;
try{const data=JSON.parse(localStorage.getItem(KEY)||'{}');sources=(Array.isArray(data.sources)?data.sources:[]).filter(x=>x&&typeof x.id==='string'&&typeof x.name==='string'&&safeURL(x.url)).slice(0,30).map(x=>({id:x.id,name:x.name.slice(0,80),url:safeURL(x.url),updated:x.updated||''}));custom=(Array.isArray(data.custom)?data.custom:[]).filter(c=>c&&typeof c.name==='string'&&typeof c.id==='string'&&safeURL(c.url)).slice(0,100).map(c=>({...c,country:'OTHER',url:safeURL(c.url)}));favorites=(Array.isArray(data.favorites)?data.favorites:[]).filter(x=>typeof x==='string');selected=typeof data.selected==='string'?data.selected:selected;}catch{}
// Persist only the last selected catalogue identity, never its session token or provider credentials.
const LAST_PLAYLIST_KEY='mevicar-tv-last-playlist-v1';
let lastPlaylist=null,restoreInFlight=null;
try{const stored=JSON.parse(localStorage.getItem(LAST_PLAYLIST_KEY)||'null');if(stored&&['xtream','m3u','public'].includes(stored.type)&&typeof stored.name==='string'&&stored.name.length<=80){lastPlaylist={type:stored.type,name:stored.name,kind:['live','movie','series'].includes(stored.kind)?stored.kind:'live'};}}catch{}
if(lastPlaylist?.type==='m3u') {const first=custom.find(x=>x.sourceId===lastPlaylist.name);if(first){country='OTHER';if(!custom.some(x=>x.id===selected&&x.sourceId===lastPlaylist.name))selected=first.id;}}
function rememberPlaylist(type,name='',kind='live'){
 lastPlaylist={type: ['xtream','m3u'].includes(type)?type:'public',name:String(name||'').slice(0,80),kind:['live','movie','series'].includes(kind)?kind:'live'};
 try{localStorage.setItem(LAST_PLAYLIST_KEY,JSON.stringify(lastPlaylist));}catch{}
}
function channels(){return [...CATALOG,...custom];}
function current(){return channels().find(c=>c.id===selected)||CATALOG[1];}
function save(){try{localStorage.setItem(KEY,JSON.stringify({sources,custom,favorites,selected}));}catch{status('Einstellungen konnten nicht gespeichert werden.');}}
function status(text){const el=root?.querySelector('.tv-status');if(el)el.textContent=text;}
function html(){return '<section class="tv-root"><aside class="tv-library"><header><strong>MeviTV <span>LIVE</span></strong></header><input class="tv-search" type="search" placeholder="Sender suchen" aria-label="Sender suchen"><div class="tv-filters"><select class="tv-country" aria-label="Land"><option value="ALL">Alle Länder</option><option value="DE">Deutschland</option><option value="TR">Türkiye</option><option value="OTHER">Eigene</option></select><button data-act="favorites" aria-label="Nur Favoriten" aria-pressed="false">☆</button></div><div class="tv-list"></div><div class="tv-xtream-catalog" hidden><div class="tv-xtream-tools"><input class="tv-xtream-search" type="search" placeholder="IPTV durchsuchen" aria-label="Katalog durchsuchen"><select class="tv-xtream-group" aria-label="Kategorie"></select><div class="tv-live-filter-row"><select class="tv-live-country" aria-label="IPTV-Land"></select><button class="tv-live-favorites" data-act="xt-favorites-filter" aria-label="Nur IPTV-Favoriten" aria-pressed="false" title="Alle Favoriten unabhängig vom Land anzeigen">☆ Favoriten</button></div></div><div class="tv-xtream-list"></div></div></aside><section class="tv-player"><header><div class="tv-xtream-tabs"><button data-kind="live">Live</button><button data-kind="movie">Filme</button><button data-kind="series">Serien</button><button class="tv-xtream-switch" data-act="xtream-back" title="Normale Live-TV-Sender" aria-label="Normale Live-TV-Sender">TV</button></div><button data-act="list" aria-label="Senderliste umschalten">☷ Sender</button><button class="tv-settings" data-act="xtream" title="IPTV-Einstellungen" aria-label="IPTV-Einstellungen">⚙</button></header><div class="tv-actions"><button data-act="fullscreen" aria-label="Video im Vollbild">⛶ <span>Vollbild</span></button><button class="tv-public-action" data-act="sources" aria-label="Quellen verwalten">Quellen</button><button class="tv-public-action" data-act="add" aria-label="Sender hinzufügen">＋</button><a class="tv-web" target="_blank" rel="noopener noreferrer">Senderseite ↗</a></div><div class="tv-stage"><video controls playsinline preload="none" aria-label="TV-Livestream"></video><div class="tv-empty">Sender auswählen und Wiedergabe starten</div></div><div class="tv-program"><img class="tv-playing-logo" alt="" hidden><strong class="tv-title"></strong><div class="tv-epg-now" aria-live="polite"></div><button data-act="epg" aria-label="TV-Programm öffnen" hidden>EPG</button></div><div class="tv-status" role="status" aria-live="polite">Bereit</div><details class="tv-movi-diagnostics" hidden><summary>MKV-Diagnose · Lock Up / Codec / Netzwerk</summary><pre class="tv-movi-log" aria-live="polite"></pre><button data-act="movi-index-check">MKV-Index prüfen (max. 4 MiB)</button><button data-act="movi-seek-75">75-%-Seek-Test starten</button><button data-act="movi-copy-log">Protokoll kopieren</button></details><div class="tv-network" hidden role="status" aria-live="off">Netzwerkdiagnose: IPTV auswählen</div></section><dialog class="tv-dialog tv-proxy-dialog" aria-label="Synology Proxy Update"><div class="tv-proxy-head"><h3>Synology Proxy</h3><span class="tv-proxy-status" role="status">Verbinde …</span></div><div class="tv-proxy-versions"><div class="tv-proxy-version"><span class="tv-proxy-label">Installierte Version</span><strong class="tv-proxy-installed">–</strong></div><div class="tv-proxy-version"><span class="tv-proxy-label">GitHub-Version</span><strong class="tv-proxy-latest">–</strong></div></div><p class="tv-proxy-details" role="status">Versionsinformationen werden geladen …</p><p class="tv-proxy-note">Updateprüfung beim Öffnen. Installation nur nach Bestätigung.</p><div class="tv-proxy-actions"><button data-act="proxy-refresh">Status prüfen</button><button data-act="proxy-update" disabled>Proxy aktualisieren</button><button data-act="proxy-rollback" disabled>Vorherige Version</button><button data-act="proxy-close">Schließen</button></div></dialog><dialog class="tv-dialog tv-epg-dialog" aria-label="TV-Programm"><h3>TV-Programm</h3><p class="tv-epg-channel"></p><div class="tv-epg-content"></div><details class="tv-epg-diagnostics"><summary>EPG-Diagnose</summary><p class="tv-epg-diagnostic-text"></p></details><div class="tv-epg-actions"><button data-act="epg-refresh">Aktualisieren</button><button data-act="epg-close">Schließen</button></div></dialog><dialog class="tv-dialog tv-custom-dialog"><form class="tv-form"><h3>Eigene TV-Sender</h3><label>Name<input name="name" maxlength="80" required placeholder="Sendername"></label><label>HTTPS-Stream<input name="url" type="url" required placeholder="https://…/master.m3u8"></label><button type="submit">Sender speichern</button></form><label class="tv-import">M3U-Senderliste importieren<input class="tv-file" type="file" accept=".m3u,.m3u8,text/plain"></label><p class="tv-import-status" role="status"></p><p>Eigene Sender bleiben auf diesem Gerät. Maximal 100 Sender.</p><div class="tv-custom"></div><button data-act="close">Schließen</button></dialog><dialog class="tv-dialog tv-sources-dialog"><h3>M3U-Quellen</h3><form class="tv-source-form"><label>Name<input name="name" maxlength="80" required placeholder="Meine TV-Liste"></label><label>M3U-URL (HTTPS)<input name="url" type="url" required placeholder="https://…/playlist.m3u"></label><button type="submit">Quelle hinzufügen und laden</button></form><p class="tv-source-status" role="status">M3U-URLs müssen den Browserzugriff (CORS) erlauben. URLs können Zugangsdaten enthalten und werden nur lokal in diesem Browser gespeichert.</p><div class="tv-source-list"></div><button data-act="sources-close">Schließen</button></dialog><dialog class="tv-dialog tv-xtream-dialog"><h3>MeviTV Einstellungen</h3><div class="tv-preferences"><label><input type="checkbox" class="tv-diagnostics-toggle"> Diagnose anzeigen (MKV und Netzwerk)</label><div class="tv-preference-actions"><button data-act="network" aria-expanded="false">Netzwerkdaten ein-/ausblenden</button><button data-act="proxy-status">Proxy-Status / Update</button></div></div><form class="tv-xtream-form"><p>Proxy: mevitv.mtankurt.synology.me</p><label>Bezeichnung<input name="name" maxlength="80" required value="MeviTV"></label><p>Den vierstelligen Zugangscode bitte unter Settings → Zugänge &amp; Schlüssel eingeben.</p><button type="button" data-act="xtream-settings">PIN in Settings öffnen</button><button type="submit">Katalog verbinden</button></form><p class="tv-xtream-status" role="status">Der Code wird auf der Synology geprüft. Die Anmeldesitzung bleibt im Arbeitsspeicher.</p><div class="tv-xtream-accounts"></div><button data-act="xtream-close">Schließen</button></dialog></section>';}
let epgSelection=null,epgItems=[],epgMessage='',epgRequest=0,epgController=null,epgTimer=null;
function clearEPG(){
 epgRequest++;epgController?.abort();epgController=null;clearInterval(epgTimer);epgTimer=null;
 epgSelection=null;epgItems=[];epgMessage='';
 if(root){root.querySelector('[data-act="epg"]').hidden=true;root.querySelector('.tv-epg-now').textContent='';root.querySelector('.tv-epg-dialog').close();}
}
function epgClock(ms){return new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit'}).format(ms);}
function paintEPG(){
 if(!root||!epgSelection)return;
 const now=Date.now(),current=epgItems.find(x=>x.start!==null&&x.start<=now&&x.end>now),next=epgItems.find(x=>x.start!==null&&x.start>now);
 const providerTimes=epgItems.some(x=>x.start===null);
 const summary=current?'Jetzt: '+current.title+(next?' · Danach: '+next.title:''):next?'Ab '+epgClock(next.start)+': '+next.title:providerTimes?'Programm verfügbar · Uhrzeiten laut Anbieter':epgMessage||'Keine aktuellen Programmdaten verfügbar.';
 const line=root.querySelector('.tv-epg-now');line.textContent=summary;line.title=summary;
 root.querySelector('[data-act="epg"]').hidden=false;
 root.querySelector('.tv-epg-channel').textContent=epgSelection.name+(providerTimes?' · Anbieterzeiten ohne Zeitzonenangabe':' · Zeiten in deiner lokalen Zeitzone');
 const schedule=epgItems.filter(x=>x.end===null||x.end>now);
 const d=epgItems.diagnostics;
 root.querySelector('.tv-epg-diagnostic-text').textContent=d?'Kurzabfrage: '+(d.shortError||'OK')+' · Format: '+(d.format||'unbekannt')+' · Quelle: '+d.source+' · empfangen: '+d.received+' · lesbar: '+d.usable+' · ohne Zeitzone: '+d.providerTimes+(d.fullReceived!==undefined?' · vollständige Abfrage: '+d.fullReceived+' Einträge':'')+(d.fullError?' · vollständige Abfrage: '+d.fullError:''):'Noch keine Antwort erhalten.';
 root.querySelector('.tv-epg-content').innerHTML=schedule.length?(epgMessage.startsWith('EPG derzeit')?'<p role="status">'+esc(epgMessage)+' Zuletzt geladenes Programm:</p>':'')+schedule.map(x=>{
  const live=x.start!==null&&x.start<=now&&x.end>now,date=x.start===null?'':new Intl.DateTimeFormat('de-DE',{weekday:'short',day:'2-digit',month:'2-digit'}).format(x.start);
  const when=x.start===null?x.providerStart+' – '+x.providerEnd+' · Anbieterzeit':date+' · '+epgClock(x.start)+'–'+epgClock(x.end)+(live?' · Jetzt':'');
  return '<details class="tv-epg-entry"'+(live?' open':'')+'><summary><small>'+esc(when)+'</small><strong>'+esc(x.title)+'</strong></summary><p>'+esc(x.description||'Keine Beschreibung verfügbar.')+'</p></details>';
 }).join(''):'<p role="status">'+esc(epgMessage||'Keine aktuellen Programmdaten verfügbar.')+'</p>';
}
async function refreshEPG(force=false){
 if(!root||!epgSelection)return;
 epgController?.abort();const controller=new AbortController();epgController=controller;
 const request=++epgRequest,selection=epgSelection,owner=root;
 const valid=()=>root===owner&&epgSelection===selection&&request===epgRequest;
 if(!epgItems.length){epgMessage='Programmdaten werden geladen …';paintEPG();}
 try{
  const items=await selection.api.epg(selection.account,selection.id,{signal:controller.signal,force});
  if(!valid())return;epgItems=items;const d=items.diagnostics;
  epgMessage=d?.shortError?'EPG derzeit nicht verfügbar. Bitte erneut versuchen.':d?.fullError==='HTTP 400'?'Die Kurzabfrage liefert keine aktuellen Einträge. Für die vollständige EPG-Abfrage bitte den MeviTV-Proxy aktualisieren.':d?.format==='unrecognized'?'EPG-Antwort ohne erkennbare Programmliste. Siehe EPG-Diagnose.':d?.received&&!d.usable?'EPG-Daten empfangen, aber das Zeitformat ist nicht lesbar. Siehe EPG-Diagnose.':items.length?'Keine aktuellen Programmdaten verfügbar.':'Die EPG-Abfragen liefern für diesen Sender keine Einträge.';paintEPG();
 }catch(e){if(!valid())return;epgMessage='EPG derzeit nicht verfügbar. Bitte erneut versuchen.';paintEPG();}
 finally{if(epgController===controller)epgController=null;}
}
function selectEPG(api,account,type,id,name){
 clearEPG();if(type!=='live'||typeof api.epg!=='function')return;
 epgSelection={api,account,id,name};refreshEPG();
 epgTimer=setInterval(()=>{if(!document.hidden)refreshEPG();},60000);
}

function paintList(){if(!root)return;root.querySelector('.tv-list').innerHTML=filtered(channels(),query,country,favorites,only).map(c=>'<div class="tv-row '+(current().id===c.id?'selected':'')+'"><button data-channel="'+esc(c.id)+'"><span class="tv-logo" aria-hidden="true">'+esc(c.name.split(' ').map(x=>x[0]).join('').slice(0,3))+'</span><span>'+esc(c.name)+'<small>'+({DE:'Deutschland',TR:'Türkiye',OTHER:'Eigener Sender'}[c.country])+'</small></span></button><button data-fav="'+esc(c.id)+'" aria-label="'+esc(c.name)+' als Favorit" aria-pressed="'+favorites.includes(c.id)+'">'+(favorites.includes(c.id)?'★':'☆')+'</button></div>').join('')||'<p>Keine Sender gefunden.</p>';root.querySelector('[data-act="favorites"]').setAttribute('aria-pressed',String(only));}
function paintTitle(){const c=current();setPlayingLogo(null);root.querySelector('.tv-title').textContent=c.name;const a=root.querySelector('.tv-web');a.hidden=!c.web;if(c.web)a.href=c.web;else a.removeAttribute('href');}
function cleanup(){moviBenchmark?.cancel?.();moviBenchmark=null;moviEverPlayed=false;moviSeekBusy=false;for(const t of moviSeekSummaryTimers)clearTimeout(t);moviSeekSummaryTimers=[];moviSeekHistory=[];moviSeekTrace=null;clearInterval(moviRangeTimer);moviRangeTimer=null;clearTimeout(moviSeekTimer);moviSeekTimer=null;if(moviElement){try{moviElement.pause?.();moviElement.destroy?.();moviElement.remove();}catch{}moviElement=null;}if(video)video.hidden=false;networkWaits=0;networkStarted=Date.now();generation++;clearTimeout(deadline);deadline=null;clearInterval(mpegtsHealthTimer);mpegtsHealthTimer=null;mpegtsFail=null;if(xtProbe){xtProbe.abort();xtProbe=null;}playerTransition=true;mpegtsFallback=null;if(mpegtsPlayer){const previous=mpegtsPlayer;mpegtsPlayer=null;for(const operation of ['pause','unload','detachMediaElement','destroy']){try{previous[operation]?.();}catch{}}}if(hls){hls.destroy();hls=null;}if(video){video.pause();video.removeAttribute('src');video.load();}}
function loadMpegts(){if(global.mpegts)return Promise.resolve(global.mpegts);if(!mpegtsPromise)mpegtsPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./vendor/mpegts-1.8.2.min.js';s.onload=()=>global.mpegts?resolve(global.mpegts):(mpegtsPromise=null,reject(Error('mpegts.js ist nicht verfügbar')));s.onerror=()=>{s.remove();mpegtsPromise=null;reject(Error('mpegts.js konnte nicht geladen werden'));};document.head.appendChild(s);});return mpegtsPromise;}
function supportsMpegts(engine){return !!(engine?.isSupported?.()&&engine?.getFeatureList?.()?.mseLivePlayback);}
function loadHls(){if(global.Hls)return Promise.resolve(global.Hls);if(!libraryPromise)libraryPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='./vendor/hls-1.6.15.min.js';s.onload=()=>global.Hls?resolve(global.Hls):reject(Error('Player fehlt'));s.onerror=()=>{s.remove();libraryPromise=null;reject(Error('Player konnte nicht geladen werden'));};document.head.appendChild(s);});return libraryPromise;}
async function play(){if(!root)return;clearEPG();xtRequestSeq++;xtPlayback=null;activePlaybackName='';playbackFormat='';cleanup();const token=generation,v=video,c=current();root.classList.add('tv-watching');root.querySelector('.tv-empty').hidden=true;status('Verbinde mit '+c.name+' …');paintTitle();save();
 global.meviMediaStopForSource?.('tv');global.meviSpotifyPauseForSource?.('tv');
 const valid=()=>root&&video===v&&generation===token;
 const start=()=>{if(!valid())return;playerTransition=false;const result=v.play();result?.catch(e=>{if(valid())status(e.name==='NotAllowedError'?'Bitte ▶ im Videoplayer antippen.':'Wiedergabe nicht möglich. Erneut laden oder Senderseite öffnen.');});};
 deadline=setTimeout(()=>{if(valid()){cleanup();status('Keine Verbindung. Erneut laden oder Senderseite öffnen.');}},25000);
 try{
  if(v.canPlayType('application/vnd.apple.mpegurl')||/\.mp4(?:[?#]|$)/i.test(c.url)){v.src=c.url;start();}
  else{const Hls=await loadHls();if(!valid())return;if(!Hls.isSupported())throw Error('HLS wird von diesem Browser nicht unterstützt.');hls=new Hls({maxBufferLength:20,maxMaxBufferLength:40});hls.on(Hls.Events.MANIFEST_PARSED,start);hls.on(Hls.Events.ERROR,(_,data)=>{if(valid()&&data.fatal){cleanup();status('Stream nicht erreichbar oder gesperrt. Neu laden oder Senderseite öffnen.');}});hls.loadSource(c.url);hls.attachMedia(v);}
 }catch(e){if(valid()){cleanup();status(e.message||'Stream konnte nicht gestartet werden.');}}
}
function onPlaying(){if(playerTransition)return;playerFault='';clearTimeout(deadline);deadline=null;status('▶ '+(activePlaybackName||current().name));}
function onError(){if(playerTransition||!video?.currentSrc&&!video?.src)return;if(playbackFormat==='mpegts'&&mpegtsFail){mpegtsFail('Browserdecoder: '+(video?.error?.code||0));return;}clearTimeout(deadline);const code=video.error?.code||0;if(xtPlayback){if(playerFault){status('HLS-Fehler: '+playerFault);return;}if(playbackFormat==='hls'){status('HLS-Medienfehler '+code+': Decoder/Codec oder beschädigtes Segment.');}else if(playbackFormat==='ts'){status('MPEG-TS kann vom Browser nicht direkt decodiert werden.');}else{status('Film-/Serienfehler '+code+': '+(vodDiagnostic||'Dateiformat oder Audio-/Videocodec nicht unterstützt.'));}return;}status('Stream nicht verfügbar. Möglich sind Netz-, Länder- oder Senderbeschränkungen.');}
function onWaiting(){if(!playerTransition){networkWaits++;status('Puffere …');}}
function stop(){xtRequestSeq++;xtPlayback=null;activePlaybackName='';playbackFormat='';cleanup();setPlayingLogo(null);status('Gestoppt');}
function paintSources(){if(!root)return;const list=root.querySelector('.tv-source-list');if(!list)return;list.innerHTML=sources.map(x=>'<div class="tv-source-row"><span>'+esc(x.name)+' <small>'+custom.filter(c=>c.sourceId===x.id).length+' Sender</small></span><button data-source-refresh="'+esc(x.id)+'">Aktualisieren</button><button data-source-delete="'+esc(x.id)+'">Löschen</button></div>').join('')||'<p>Noch keine M3U-URL hinzugefügt.</p>';}
function sourceStatus(message){const e=root?.querySelector('.tv-source-status');if(e)e.textContent=message;}
async function fetchPlaylist(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);try{const response=await fetch(url,{signal:controller.signal,credentials:'omit',redirect:'follow'});if(!response.ok)throw Error('HTTP '+response.status);const length=Number(response.headers.get('content-length')||0);if(length>1000000)throw Error('Liste zu groß (max. 1 MB).');const reader=response.body?.getReader();if(!reader)return parseM3U(await response.text());let total=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>1000000){await reader.cancel();throw Error('Liste zu groß (max. 1 MB).');}chunks.push(value);}const bytes=new Uint8Array(total);let off=0;for(const chunk of chunks){bytes.set(chunk,off);off+=chunk.length;}return parseM3U(new TextDecoder().decode(bytes));}finally{clearTimeout(timer);}}
async function syncSource(source){const owner=root;sourceStatus('Lade '+source.name+' …');try{const items=await fetchPlaylist(source.url);if(root!==owner)return false;if(!items.length)throw Error('Keine gültigen HTTPS-Sender gefunden.');const old=custom.filter(c=>c.sourceId===source.id);const oldByURL=new Map(old.map(c=>[c.url,c]));const free=100-custom.filter(c=>c.sourceId!==source.id).length;if(free<1)throw Error('Limit von 100 eigenen Sendern erreicht.');const fresh=items.slice(0,free).map((c,i)=>({...c,id:oldByURL.get(c.url)?.id||'src-'+source.id+'-'+Math.random().toString(36).slice(2,10),sourceId:source.id}));const used=new Set(channels().filter(c=>c.sourceId!==source.id).map(c=>c.url));const unique=fresh.filter(c=>!used.has(c.url));if(!sources.some(x=>x.id===source.id))sources.push(source);else sources=sources.map(x=>x.id===source.id?{...x,name:source.name,url:source.url}:x);custom=[...custom.filter(c=>c.sourceId!==source.id),...unique];const changed=sources.find(x=>x.id===source.id);changed.updated=new Date().toISOString();if(!channels().some(c=>c.id===selected)){stop();selected='zdf';paintTitle();}const first=custom.find(c=>c.sourceId===source.id);if(first){selected=first.id;country='OTHER';rememberPlaylist('m3u',source.id);paintTitle();}save();paintSources();paintList();sourceStatus(source.name+': '+unique.length+' Sender eingelesen.');return true;}catch(e){if(root===owner)sourceStatus('Import fehlgeschlagen: '+(e.name==='AbortError'?'Zeitüberschreitung':e.message)+'. Die bisherigen Sender bleiben erhalten.');return false;}}
let xtreamView=false,xtreamSelected=null;
const XT_FILTER_KEY='mevicar-xtream-live-filters-v1';
const COUNTRY_NAMES={DE:'Deutschland',TR:'Türkei',AT:'Österreich',CH:'Schweiz',GB:'Großbritannien',UK:'Großbritannien',US:'USA',FR:'Frankreich',IT:'Italien',ES:'Spanien',NL:'Niederlande',BE:'Belgien',PL:'Polen',GR:'Griechenland',PT:'Portugal',RO:'Rumänien',BG:'Bulgarien',RU:'Russland',UA:'Ukraine',AL:'Albanien',BA:'Bosnien',HR:'Kroatien',RS:'Serbien',XK:'Kosovo',MK:'Nordmazedonien',AR:'Argentinien',BR:'Brasilien',IN:'Indien',PK:'Pakistan'};
let xtCountry='ALL',xtFavoritesOnly=false,xtFavorites=[];
try{const stored=JSON.parse(localStorage.getItem(XT_FILTER_KEY)||'{}');xtCountry=typeof stored.country==='string'&&/^(ALL|OTHER|[A-Z]{2})$/.test(stored.country)?stored.country:'ALL';xtFavoritesOnly=stored.favoritesOnly===true;xtFavorites=Array.isArray(stored.favorites)?stored.favorites.filter(x=>typeof x==='string'&&x.length<220).slice(0,5000):[];}catch{}
function saveXtFilters(){try{localStorage.setItem(XT_FILTER_KEY,JSON.stringify({country:xtCountry,favoritesOnly:xtFavoritesOnly,favorites:xtFavorites}));}catch{}}
function xtFavoriteKey(account,item){return account.credentials.host+'|'+item.id;}
function countryFlag(code){
 const iso=code==='GB'?'GB':code==='XK'?'XK':code;
 if(!/^[A-Z]{2}$/.test(iso))return code==='ALL'?'🌍':'🌐';
 return String.fromCodePoint(...[...iso].map(c=>127397+c.charCodeAt(0)));
}
function safeChannelLogo(url){
 try{
  const u=new URL(String(url||''));
  return u.protocol==='https:'&&!u.username&&!u.password&&u.href.length<=1500?u.href:'';
 }catch{return '';}
}
function channelInitials(name){
 const cleaned=String(name||'').replace(/^[A-Z]{2}\s*:\s*/,'').trim();
 return cleaned.split(/\s+/).slice(0,2).map(x=>x.charAt(0)).join('').toUpperCase().slice(0,3)||'TV';
}
function channelLogoHTML(item){
 const url=safeChannelLogo(item.poster);
 return '<span class="tv-channel-identity" aria-hidden="true">'+
 (url?'<img src="'+esc(url)+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'')+
 '<span class="tv-channel-fallback"'+(url?' hidden':'')+'>'+esc(channelInitials(item.name))+'</span></span>';
}
function setPlayingLogo(item){
 const image=root?.querySelector('.tv-playing-logo'),url=safeChannelLogo(item?.poster);
 if(!image)return;
 image.hidden=true;image.removeAttribute('src');
 if(url){image.src=url;image.hidden=false;}
}
function logoError(event){
 const img=event.target;
 if(!(img instanceof HTMLImageElement))return;
 if(img.matches('.tv-channel-identity img')){
  img.hidden=true;img.removeAttribute('src');
  const fallback=img.nextElementSibling;if(fallback)fallback.hidden=false;
 }else if(img.matches('.tv-playing-logo')){img.hidden=true;img.removeAttribute('src');}
}
function xtCountryCode(item,categoryNames){
 const raw=String(item.name||'').trim().toUpperCase();
 const prefix=/^([A-Z]{2})\s*[:|\-]\s*/.exec(raw);
 if(prefix&&COUNTRY_NAMES[prefix[1]])return prefix[1]==='UK'?'GB':prefix[1];
 const category=String(categoryNames.get(item.category)||'').trim().toUpperCase();
 const group=/^(?:\[)?([A-Z]{2})(?:\])?\s*[:|\-]/.exec(category);
 if(group&&COUNTRY_NAMES[group[1]])return group[1]==='UK'?'GB':group[1];
 for(const [code,name] of Object.entries(COUNTRY_NAMES)){if(category===name.toUpperCase()||category.startsWith(name.toUpperCase()+' '))return code==='UK'?'GB':code;}
 return 'OTHER';
}
function xtLiveCountries(account){
 const categories=new Map((account.categories.live||[]).map(c=>[c.id,c.name]));
 const codes=new Set((account.items.live||[]).map(item=>xtCountryCode(item,categories)).filter(c=>c!=='OTHER'));
 return [...codes].sort((a,b)=>(COUNTRY_NAMES[a]||a).localeCompare(COUNTRY_NAMES[b]||b,'de'));
}
function xtFilteredItems(api,account){
 const base=api.view();
 if(api.state.kind!=='live')return base;
 const cats=new Map((account.categories.live||[]).map(c=>[c.id,c.name]));
 const list=account.items.live||[],needle=api.state.query.toLocaleLowerCase('de');
 return list.filter(item=>(api.state.group==='ALL'||item.category===api.state.group)&&item.name.toLocaleLowerCase('de').includes(needle)&&
 (xtFavoritesOnly?xtFavorites.includes(xtFavoriteKey(account,item)):xtCountry==='ALL'||xtCountryCode(item,cats)===xtCountry)).slice(0,500);
}
function xtStatus(v){const e=root?.querySelector('.tv-xtream-status');if(e)e.textContent=v;}
function restoreLastPlaylist(){
 const api=global.meviXtream;
 if(!root||!api)return;
 const pin=String(global.MeviCredentials?.tvPin?.()||'');
 // Android WebView and a regular browser have separate local storage. On a first
 // APK launch there may be a saved PIN but no previously connected catalogue.
 // In that case use the application's configured default Xtream list.
 if(!lastPlaylist&&/^\d{4}$/.test(pin))rememberPlaylist('xtream','MeviTV','live');
 if(lastPlaylist?.type!=='xtream')return;
 const existing=api.state.accounts.find(a=>a.name===lastPlaylist.name);
 if(existing){
  api.state.active=existing.id;
  api.state.kind=lastPlaylist.kind;
  paintXtream();
  return;
 }
 if(restoreInFlight||api.state.busy)return;
 if(!/^\d{4}$/.test(pin)){status('Zuletzt verwendete IPTV-Liste: PIN in Settings → Zugänge speichern.');return;}
 const name=lastPlaylist.name,owner=root;
 const button=owner.querySelector('.tv-xtream-form button[type=submit]');
 if(button)button.disabled=true;
 status('Lade zuletzt verwendete IPTV-Liste '+name+' …');
 restoreInFlight=(async()=>{
  const credentials=await api.pinCredentials(pin);
  // A new short-lived proxy session and catalogue are required after every page reload.
  const account=await api.connect(name,credentials,message=>{if(root)status(message);});
  if(lastPlaylist?.type!=='xtream'){api.state.active=null;return;}
  api.state.kind=lastPlaylist.kind;
  if(root){paintXtAccounts();paintXtream();status(account.name+' automatisch geladen.');}
 })().catch(error=>{
  if(!root)return;
  const message=String(error?.message||'');
  const explanation=error?.name==='TypeError'?'Netzwerk oder CORS nicht erreichbar':
   /401|403|invalid|ungültig|PIN|code/i.test(message)?'Zugangscode oder Proxy-Anmeldung abgelehnt':
   /timeout|aborted|Zeitüberschreitung/i.test(message)?'Zeitüberschreitung':'Proxy oder IPTV-Katalog nicht erreichbar';
  status('IPTV konnte nicht automatisch geladen werden: '+explanation+'. Unter ⚙ erneut verbinden.');
 })
 .finally(()=>{restoreInFlight=null;if(button)button.disabled=false;});
}
function paintXtAccounts(){const api=global.meviXtream,e=root?.querySelector('.tv-xtream-accounts');if(!api||!e)return;e.innerHTML=api.state.accounts.map(a=>'<div class="tv-source-row"><span>'+esc(a.name)+' <small>'+a.items.live.length+' Live · '+a.items.movie.length+' Filme · '+a.items.series.length+' Serien</small></span><button data-xt-account="'+esc(a.id)+'">Öffnen</button><button data-xt-delete="'+esc(a.id)+'">Löschen</button></div>').join('')||'<p>Noch kein Xtream-Katalog verbunden.</p>';}
function paintXtream(){const api=global.meviXtream,area=root?.querySelector('.tv-xtream-catalog');if(!api||!area)return;const a=api.active();xtreamView=!!a;root.classList.toggle('tv-xtream-mode',xtreamView);root.querySelector('.tv-list').hidden=xtreamView;root.querySelector('.tv-search').hidden=xtreamView;root.querySelector('.tv-filters').hidden=xtreamView;area.hidden=!xtreamView;if(!a)return;root.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(api.state.kind===b.dataset.kind)));const isLive=api.state.kind==='live';
 const categories=a.categories[api.state.kind]||[];
 let availableCategories=categories;
 if(isLive&&(xtCountry!=='ALL'||xtFavoritesOnly)){
  const categoryNames=new Map(categories.map(c=>[c.id,c.name]));
  const relevant=(a.items.live||[]).filter(item=>xtFavoritesOnly?xtFavorites.includes(xtFavoriteKey(a,item)):xtCountryCode(item,categoryNames)===xtCountry);
  const categoryIds=new Set(relevant.map(item=>item.category));
  availableCategories=categories.filter(c=>categoryIds.has(c.id));
 }
 if(api.state.group!=='ALL'&&!availableCategories.some(c=>c.id===api.state.group))api.state.group='ALL';
 const opts=[{id:'ALL',name:'Alle Kategorien'},...availableCategories];
 area.querySelector('.tv-xtream-group').innerHTML=opts.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
 area.querySelector('.tv-xtream-group').value=api.state.group;area.querySelector('.tv-xtream-search').value=api.state.query;
 const live=api.state.kind==='live',countryRow=area.querySelector('.tv-live-filter-row'),countrySelect=area.querySelector('.tv-live-country'),favoriteFilter=area.querySelector('.tv-live-favorites');
 countryRow.hidden=!live;
 if(live){const countries=xtLiveCountries(a);if(xtCountry!=='ALL'&&xtCountry!=='OTHER'&&!countries.includes(xtCountry)){xtCountry='ALL';saveXtFilters();}
 countrySelect.innerHTML='<option value="ALL">🌍 Alle Länder</option>'+countries.map(code=>'<option value="'+esc(code)+'">'+countryFlag(code)+' '+esc(COUNTRY_NAMES[code]||code)+'</option>').join('')+'<option value="OTHER">🌐 Sonstige</option>';
 countrySelect.value=xtCountry;countrySelect.disabled=xtFavoritesOnly;countrySelect.title=xtFavoritesOnly?'Favoriten werden unabhängig vom Land angezeigt':'Live-TV nach Land filtern';
 favoriteFilter.setAttribute('aria-pressed',String(xtFavoritesOnly));favoriteFilter.textContent=(xtFavoritesOnly?'★':'☆')+' Favoriten';}
 area.querySelector('.tv-xtream-list').innerHTML=xtFilteredItems(api,a).map(x=>{
 const saved=live&&xtFavorites.includes(xtFavoriteKey(a,x));
 return '<div class="tv-xtream-row"><button class="tv-xtream-item" data-xt-item="'+esc(x.id)+'">'+(live?channelLogoHTML(x):'')+'<span class="tv-channel-text"><strong>'+esc(x.name)+'</strong><small>'+esc(x.rating?('Bewertung '+x.rating):'')+'</small></span></button>'+(live?'<button class="tv-xtream-star" data-xt-favorite="'+esc(x.id)+'" aria-label="'+(saved?'Favorit entfernen: ':'Als Favorit speichern: ')+esc(x.name)+'" aria-pressed="'+String(!!saved)+'">'+(saved?'★':'☆')+'</button>':'')+'</div>';
 }).join('')||'<p>Keine Einträge gefunden.</p>';}
async function selectXtItem(id){const api=global.meviXtream,a=api?.active(),item=a?.items[api.state.kind]?.find(x=>x.id===id);if(!item)return;if(api.state.kind==='series'){const box=root.querySelector('.tv-xtream-list');box.textContent='Lade Staffeln und Folgen …';try{const episodes=await api.episodes(a,item);box.innerHTML='<button data-act="xtream-series-back">← Serien</button>'+episodes.map(x=>'<button class="tv-xtream-item" data-xt-episode="'+esc(x.id)+'"><strong>Staffel '+esc(x.season)+' · Folge '+esc(x.number)+'</strong> '+esc(x.name)+'</button>').join('');xtreamSelected={item,episodes};}catch(e){box.textContent='Folgen konnten nicht geladen werden: '+e.message;}return;}startXtMedia(api,a,api.state.kind==='movie'?'movie':'live',item.id,item.extension,item.name);}
async function startXtMedia(api,a,type,id,extension,name){
 if(!root)return;
 const activeItem=a.items[type]?.find(x=>x.id===String(id));setPlayingLogo(type==='live'?activeItem:null);
 selectEPG(api,a,type,id,name);
 xtPlayback={api,a,type,id,extension,name};
 activePlaybackName=name;
 vodDiagnostic='';
 const mountRoot=root,request=++xtRequestSeq;
 cleanup();status('Verbinde mit '+name+' …');
 const stillCurrent=()=>root===mountRoot&&request===xtRequestSeq;
 const fallback=async(reason)=>{
  if(!stillCurrent())return;
  status('mpegts.js nicht nutzbar ('+String(reason).slice(0,90)+'). Wechsle zu HLS/FFmpeg …');
  const hlsUrl=await api.playbackURL(a.credentials,type,id,extension);
  if(!stillCurrent())return;
  await playXtMedia(hlsUrl,name,async()=>{
   const ffmpeg=await api.playbackURL(a.credentials,'live',id,'ts');
   if(stillCurrent())await playXtMedia(ffmpeg,name);
  });
 };
 try{
  if(type!=='live'||!a.credentials.bridge){
   const convert=type!=='live'&&a.credentials.bridge&&['mkv','avi'].includes(String(extension||'').replace(/^\./,'').toLowerCase());
   const url=await api.playbackURL(a.credentials,type,id,extension,'default');
   if(!stillCurrent())return;
   if(convert)await playMoviVod(url,name,stillCurrent);
   else await playXtMedia(url,name);
   return;
  }
  if(type==='live'&&a.credentials.bridge){
   let engine=null;
   try{engine=await loadMpegts();}catch(e){if(!stillCurrent())return;return fallback(e.message);}
   if(!stillCurrent())return;
   if(supportsMpegts(engine)){
    let direct;
    try{direct=await api.playbackURL(a.credentials,'live',id,'ts','raw');}
    catch(e){if(stillCurrent())await fallback('Direkter TS-Zugriff: '+e.message);return;}
    if(!stillCurrent())return;
    return playMpegts(direct,name,engine,stillCurrent,fallback);
   }
  }
  if(stillCurrent())await fallback('MPEG-TS im Browser nicht unterstützt');
 }catch(e){if(stillCurrent())status('Wiedergabeadresse nicht verfügbar: '+e.message);}
}
async function playMpegts(url,name,engine,stillCurrent,fallback){
 if(!stillCurrent())return;
 cleanup();const token=generation,v=video,valid=()=>root&&video===v&&generation===token&&stillCurrent();
 root.classList.add('tv-watching');root.querySelector('.tv-empty').hidden=true;
 root.querySelector('.tv-title').textContent=name;
 playbackFormat='mpegts';playerFault='';
 const fail=reason=>{
  if(!valid()||!mpegtsFallback)return;
  const next=mpegtsFallback;mpegtsFallback=null;mpegtsFail=null;
  status('mpegts.js: '+String(reason).slice(0,90));
  cleanup();
  Promise.resolve().then(()=>{if(stillCurrent())return next(reason);})
   .catch(e=>{if(stillCurrent())status('HLS-Fallback: '+e.message);});
 };
 mpegtsFallback=fallback;mpegtsFail=fail;
 try{
  mpegtsPlayer=engine.createPlayer({type:'mpegts',isLive:true,url,cors:true,withCredentials:false},{
   enableWorker:false,enableStashBuffer:true,stashInitialSize:768*1024,autoCleanupSourceBuffer:true,
   // Prefer a stable several-second buffer over chasing the live edge (default max latency 1.5 s).
   liveBufferLatencyChasing:false,liveSync:false
  });
  mpegtsPlayer.on(engine.Events.ERROR,(kind,detail)=>fail(String(kind)+': '+String(detail)));
  mpegtsPlayer.attachMediaElement(v);
  mpegtsPlayer.load();
  playerTransition=false;
  status('mpegts.js: Verbinde mit '+name+' …');
  const started=mpegtsPlayer.play();started?.catch(e=>{if(valid()&&e.name!=='NotAllowedError')fail(e.message||'Video start failed');else if(valid())status('Bitte ▶ im Videoplayer antippen.');});
  deadline=setTimeout(()=>{if(valid()&&!v.videoWidth&&!v.paused)fail('Kein Videobild nach 25 Sekunden');},25000);
  // Detect a stream that goes silent after initially playing. This runs only
  // while the player is actually playing, not when paused or changing tabs.
  let lastPosition=Number(v.currentTime)||0,lastProgress=Date.now();
  mpegtsHealthTimer=setInterval(()=>{
   if(!valid()||v.paused||document.hidden)return;
   const position=Number(v.currentTime)||0;
   if(Math.abs(position-lastPosition)>0.15){lastPosition=position;lastProgress=Date.now();return;}
   if(v.videoWidth>0&&Date.now()-lastProgress>18000)
    fail('Kein Wiedergabefortschritt seit 18 Sekunden');
  },4000);
 }catch(e){fail(e.message||'MPEG-TS-Player konnte nicht starten');}
}
async function playVodTransportStream(url,name){
 // VOD MPEG-TS must be opened as a seekable file, never as a live stream.
 // This leaves the proven Live-TV player and its FFmpeg fallback untouched.
 const engine=await loadMpegts();
 if(!supportsMpegts(engine))throw Error('mpegts.js / MediaSource wird von diesem Browser nicht unterstützt.');
 cleanup();
 const token=generation,v=video,valid=()=>root&&video===v&&generation===token;
 root.classList.add('tv-watching');root.querySelector('.tv-empty').hidden=true;
 root.querySelector('.tv-title').textContent=name;
 playbackFormat='vod-mpegts';playerFault='';
 try{
  mpegtsPlayer=engine.createPlayer({type:'mpegts',isLive:false,url,cors:true,withCredentials:false},{
   enableWorker:false,enableStashBuffer:true,stashInitialSize:384*1024,
   autoCleanupSourceBuffer:false,lazyLoad:true,accurateSeek:true
  });
  mpegtsPlayer.on(engine.Events.ERROR,(kind,detail)=>{
   if(valid())status('VOD-MPEG-TS: '+String(kind)+': '+String(detail).slice(0,100));
  });
  mpegtsPlayer.attachMediaElement(v);mpegtsPlayer.load();
  playerTransition=false;
  status('Film wird über mpegts.js geladen …');
  const started=mpegtsPlayer.play();
  started?.catch(e=>{if(valid())status(e.name==='NotAllowedError'?'Bitte ▶ im Videoplayer antippen.':'VOD-MPEG-TS: '+String(e.message).slice(0,100));});
 }catch(e){if(valid()){cleanup();status('VOD-MPEG-TS konnte nicht starten: '+e.message);}}
}
async function probeVod(url,valid){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
 try{
  const response=await fetch(url,{headers:{Range:'bytes=0-1'},credentials:'omit',cache:'no-store',signal:controller.signal});
  if(!valid()){await response.body?.cancel?.();return false;}
  if(!response.ok){let detail='';try{const data=await response.json();if(typeof data.error==='string')detail=data.error.slice(0,110);}catch{}
   vodDiagnostic='HTTP '+response.status+(detail?' – '+detail:'');
   status('Filmdaten nicht erreichbar: '+vodDiagnostic);return false;
  }
  const type=(response.headers.get('content-type')||'').toLowerCase();
  await response.body?.cancel?.();
  if(type.includes('application/json')||type.includes('text/html')){vodDiagnostic='Anstelle eines Videos liefert der Server '+type;status(vodDiagnostic);return false;}
  vodDiagnostic='Datei erreichbar (HTTP '+response.status+'); Browser oder Codec prüfen';
  return true;
 }catch(e){
  if(valid()){vodDiagnostic=e.name==='AbortError'?'Zeitüberschreitung':'Netzwerkfehler: '+String(e.message).slice(0,100);status('Filmprüfung fehlgeschlagen: '+vodDiagnostic);}
  return false;
 }finally{clearTimeout(timer);}
}
function moviLogText(){
 const pinned=[...moviSessionInfo.values()];
 return [...pinned,...moviLog.filter(line=>!pinned.includes(line))].join('\n');
}
function moviReport(message,level='info',key=''){
 // Never log signed URLs, provider paths or credentials.
 const safe=String(message).replace(/https?:\/\/\S+/gi,'[URL entfernt]').slice(0,260);
 const line=new Date().toLocaleTimeString('de-DE')+' · '+safe;
 if(key)moviSessionInfo.set(key,line);
 moviLog.push(line);if(moviLog.length>70)moviLog.shift();
 const box=root?.querySelector('.tv-movi-log');if(box)box.textContent=moviLogText();
 if(level==='error')console.error('[MeviTV MKV]',safe);else console.info('[MeviTV MKV]',safe);
}
function moviAssetBase(){
 return './vendor/movi-mevitv-mkv-size-2/';
}
function loadMoviPlayer(){
 if(customElements.get('movi-player'))return Promise.resolve();
 if(!moviPromise)moviPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src=moviAssetBase()+'element.slim.global.js';
  script.async=true;
  script.onload=()=>customElements.whenDefined('movi-player').then(resolve,reject);
  script.onerror=()=>reject(Error('MeviCar-Player konnte nicht geladen werden. Bitte die App neu laden.'));
  document.head.appendChild(script);
 }).catch(e=>{moviPromise=null;throw e;});
 return moviPromise;
}
function moviTrackReport(tracks){
 const valid=track=>track&&typeof track==='object';
 const list=Array.isArray(tracks)?tracks.filter(valid):['video','audio','subtitle'].flatMap(type=>
  (Array.isArray(tracks?.[type])?tracks[type]:[]).filter(valid).map(track=>({...track,type:track.type||type})));
 const group=type=>list.filter(t=>String(t.type||t.kind||t.codec_type||'').toLowerCase()===type).map(t=>[t.codec||t.codecName||t.codec_id||'Codec unbekannt',t.language||t.lang||'',t.width&&t.height?t.width+'x'+t.height:''].filter(Boolean).join(' '));
 moviReport('Video-Tracks: '+(group('video').join(' | ')||'nicht gemeldet')+' · insgesamt '+list.length+' Tracks','info','video-tracks');
 moviReport('Audio-Tracks: '+(group('audio').join(' | ')||'nicht gemeldet'),'info','audio-tracks');
}
function moviSourceReport(element){
 const d=element.player?.getReadDiagnostics?.();
 if(!d){moviReport('HTTP-Quelldiagnose nicht verfügbar (Player ohne Größen-Fix)','info','source');return;}
 const bytes=n=>Number.isSafeInteger(n)&&n>0?String(n):'unbekannt';
 const capacity=Number.isFinite(d.bufferCapacityBytes)?(d.bufferCapacityBytes/1048576).toFixed(1):'?';
 moviReport('Datei/Demuxer: '+bytes(d.fileSizeBytes)+'/'+bytes(d.demuxerFileSizeBytes)+' Bytes · HTTP-Puffer: '+capacity+' MiB · HEAD-Length: '+(d.headContentLength??'?')+' · Größe per '+(d.sizeSource||'?')+' · Patch '+d.revision,'info','source');
}
async function moviBridgeReason(response){
 if(!(response.headers.get('content-type')||'').toLowerCase().includes('application/json')){
  await response.body?.cancel?.();return '';
 }
 const reader=response.body?.getReader?.();if(!reader)return '';
 let text='',size=0;const decoder=new TextDecoder();
 try{
  for(;;){
   const {value,done}=await reader.read();if(done)break;
   size+=value.byteLength;if(size>4096)return '';
   text+=decoder.decode(value,{stream:true});
  }
  text+=decoder.decode();
  const message=JSON.parse(text)?.error;if(typeof message!=='string')return '';
  // Only relay the bridge's defined messages; never arbitrary upstream bodies.
  if(message==='Expired media ticket')return 'Wiedergabe-Link abgelaufen. Film erneut starten.';
  if(/^Medienserver [a-z0-9.-]{1,253} ist nicht freigegeben\. In MEVITV_VOD_REDIRECT_HOSTS eintragen\.$/.test(message)||
     /^Unsichere Medienserver-Weiterleitung \([A-Z_]{1,48}\)$/.test(message)||
     /^Provider media HTTP [1-5][0-9]{2}$/.test(message)||
     /^Provider-Verbindung fehlgeschlagen \([A-Z0-9_]{2,48}\)$/.test(message)||
     message==='Zu viele Medienserver-Weiterleitungen')return message;
  return '';
 }catch{return '';}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
async function moviNetworkCheck(url,valid){
 try{
  const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),8000);
  try{
   const response=await fetch(url,{method:'GET',headers:{Range:'bytes=0-1'},cache:'no-store',credentials:'omit',signal:ctrl.signal});
   if(!valid()){await response.body?.cancel?.();return false;}
   const range=response.headers.get('content-range');
   moviReport('Range-Test: HTTP '+response.status+(range?' · Content-Range '+range.slice(0,80):' · Content-Range nicht sichtbar')+(response.status===206?' · Partial Content':response.status===200?' · Range ignoriert':' · HTTP-Fehler'),response.ok?'info':'error');
   if(!response.ok){
    const reason=await moviBridgeReason(response);if(!valid())return false;
    const detail='HTTP '+response.status+(reason?' · '+reason:' · Bridge/Provider liefert keine erreichbare Filmdatei');
    moviReport('Bridge-Fehler: '+detail,'error','bridge-error');
    status('Videodatei nicht erreichbar: '+detail);
    return false;
   }
   await response.body?.cancel?.();return true;
  }finally{clearTimeout(timeout);}
 }catch(e){
  if(!valid())return false;
  moviReport('Range/CORS-Test: '+(e.name==='AbortError'?'Timeout':'Netzwerk oder CORS blockiert'),'error');
  return true; // Inconclusive probe: retain Movi's own network recovery.
 }
}
async function moviCheckMkvIndex(){
 const element=moviElement,src=element?.src;
 if(!element||!src){moviReport('MKV-Index: bitte zuerst einen MKV-Film starten');return;}
 const token=generation;
 const valid=()=>generation===token&&moviElement===element&&root;
 const button=root?.querySelector('[data-act="movi-index-check"]');
 if(button?.disabled)return;
 if(button)button.disabled=true;
 moviReport('MKV-Index: lese nur Container-Metadaten (max. 4 MiB, ohne Transcoding) …');
 try{
  const module=await import('./mkv-index-probe.mjs');
  if(!valid())return;
  const probe=async(start,len)=>{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
   try{
    const response=await fetch(src,{headers:{Range:'bytes='+start+'-'+(start+len-1)},credentials:'omit',cache:'no-store',signal:controller.signal});
    if(response.status!==206)throw Error('HTTP '+response.status+' – Byte-Range nicht unterstützt');
    const data=new Uint8Array(await response.arrayBuffer());
    if(data.length!==len)throw Error('Range liefert '+data.length+' statt '+len+' Bytes');
    return data;
   }finally{clearTimeout(timer);}
  };
  const response=await fetch(src,{headers:{Range:'bytes=0-1'},credentials:'omit',cache:'no-store'});
  const cr=response.headers.get('content-range')||'';
  await response.body?.cancel?.();
  const m=/^bytes 0-1\/(\d+)$/.exec(cr);
  if(!m)throw Error('Dateigröße nicht über Content-Range ermittelbar');
  const result=await module.inspectMkvIndex(probe,Number(m[1]),Number(element.duration));
  if(!valid())return;
  moviReport('MKV-Index: '+result.state+' · '+result.detail+' · '+result.requests+' Ranges · '+(result.bytes/1048576).toFixed(2)+' MiB');
  if(result.cues!==undefined)moviReport('Cues-Offset: '+result.cues+' Bytes · vollständige Einträge: '+(result.entries??'?')+(result.partial?' (nur Teilbereich gelesen)':''));
  if(result.nearest)moviReport('75%-Ziel: '+Math.round(result.targetSeconds)+' s · Cue davor: '+Math.round(result.nearest.timeSeconds)+' s bei Byte '+result.nearest.bytePosition);
  if(result.state==='unknown')moviReport('Hinweis: Nicht gefundener Index ist KEIN Nachweis für fehlende Cues.');
 }catch(e){if(valid())moviReport('MKV-Index-Prüfung: '+String(e?.message||e).slice(0,160),'error');}
 finally{if(button)button.disabled=false;}
}
function moviBenchmark75(){
 const element=moviElement;
 const duration=Number(element?.duration);
 if(!element||!Number.isFinite(duration)||duration<=0){
  moviReport('75%-Test: Film zuerst laden und Metadaten abwarten','error');return;
 }
 if(moviBenchmark){moviReport('75%-Test: läuft bereits');return;}
 if(!moviEverPlayed||moviSeekBusy){moviReport('75%-Test: Startwiedergabe noch nicht abgeschlossen – erst normales playing abwarten, damit kein Seek in einen laufenden Start-Seek fällt','error');return;}
 const target=duration*0.75;
 const token=generation,started=performance.now(),startedAt=new Date().toISOString();
 const button=root?.querySelector('[data-act="movi-seek-75"]');
 const valid=()=>generation===token&&moviElement===element&&Boolean(root);
 let seeked=false,finished=false,timer=null,seekCount=0;
 const cleanupTest=()=>{
  clearTimeout(timer);
  element.removeEventListener('seeking',onSeeking);
  element.removeEventListener('seeked',onSeeked);
  element.removeEventListener('playing',onPlaying);
  element.removeEventListener('error',onError);
  if(button){button.disabled=false;button.textContent='75-%-Seek-Test starten';}
  if(moviBenchmark===test)moviBenchmark=null;
 };
 const done=(outcome,detail)=>{
  if(finished)return;
  finished=true;
  const elapsed=Math.round(performance.now()-started);
  if(valid())moviReport('75%-Benchmark: '+outcome+' · '+elapsed+' ms · Seek-Ereignisse '+seekCount+' · Ziel '+target.toFixed(1)+' s · Position '+(Number(element.currentTime)||0).toFixed(1)+' s · '+detail+' · MEVICAR NEXT');
  cleanupTest();
 };
 const onSeeking=()=>{if(!valid())return;seeked=false;seekCount++;moviReport('75%-Benchmark: seeking #'+seekCount+' nach '+Math.round(performance.now()-started)+' ms');};
 const onSeeked=()=>{if(!valid())return;seeked=true;moviReport('75%-Benchmark: seeked nach '+Math.round(performance.now()-started)+' ms · warte auf playing');};
 const onPlaying=()=>{
  if(!valid()||!seeked)return;
  const position=Number(element.currentTime);
  // A playing event alone does not establish a rendered video frame.
  if(!Number.isFinite(position)||Math.abs(position-target)>30){
   done('ungültige Position','playing außerhalb ±30 s; kein bestandener Seek-Test');return;
  }
  done('playing erreicht','seeked + playing gemeldet; Bilddarstellung nicht bestätigt');
 };
 const onError=()=>{if(valid())done('Playerfehler','Wiedergabe konnte nicht gestartet werden');};
 const test={cancel:()=>{finished=true;cleanupTest();}};
 moviBenchmark=test;
 if(button){button.disabled=true;button.textContent='75-%-Test läuft …';}
 element.addEventListener('seeking',onSeeking);
 element.addEventListener('seeked',onSeeked);
 element.addEventListener('playing',onPlaying);
 element.addEventListener('error',onError);
 timer=setTimeout(()=>{if(valid())done('Timeout','kein erfolgreicher Seek mit playing innerhalb 90 s');else test.cancel();},90000);
 moviReport('75%-Benchmark START · '+startedAt+' · MEVICAR NEXT · Dauer '+duration.toFixed(1)+' s · Ziel '+target.toFixed(1)+' s · Ausgang '+(Number(element.currentTime)||0).toFixed(1)+' s');
 try{
  // Begin measuring before assigning currentTime. The user's normal play state is retained.
  element.currentTime=target;
  const result=element.play?.();
  result?.catch?.(error=>{if(valid())done('Play-Fehler',String(error?.message||error).slice(0,90));});
 }catch(error){done('Seek-Fehler',String(error?.message||error).slice(0,90));}
}
function moviDesktopBufferMB(){
 // 100 MB desktop experiment showed no reliable seek benefit; use 50 MB on all platforms.
 return 50;
}
function moviBeginSeekTrace(targetSeconds){
 moviSeekTrace={start:Date.now(),end:null,targetSeconds:Number.isFinite(targetSeconds)?targetSeconds:null,requests:new Map()};
 moviSeekHistory.push(moviSeekTrace);
 if(moviSeekHistory.length>8)moviSeekHistory.shift();
}
function moviFinishSeekTrace(){
 const trace=moviSeekTrace;if(!trace)return;
 trace.end=Date.now();
 moviSeekTrace=null;
 const timer=setTimeout(()=>{
  moviSeekSummaryTimers=moviSeekSummaryTimers.filter(x=>x!==timer);
  if(!moviSeekHistory.includes(trace))return;
  const rows=[...trace.requests.values()];
  const completed=rows.filter(x=>x.state==='complete');
  const bytes=rows.reduce((sum,x)=>sum+(Number(x.bytes)||0),0);
  const headerTimes=rows.map(x=>x.header_ms).filter(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0);
  const maxHeader=headerTimes.length?Math.max(...headerTimes):null;
  const ranges=rows.map(x=>{
   const m=String(x.range||'').match(/^(\d+)-(\d+)$/);
   return m?{start:Number(m[1]),end:Number(m[2])}:null;
  }).filter(Boolean).sort((a,b)=>a.start-b.start);
  let overlap=0,coveredEnd=-1;
  for(const range of ranges){
   if(range.start<=coveredEnd)overlap+=Math.max(0,Math.min(range.end,coveredEnd)-range.start+1);
   coveredEnd=Math.max(coveredEnd,range.end);
  }
  moviReport('Seek-Netzwerk: '+rows.length+' Ranges ('+completed.length+' vollständig) · '+(bytes/1048576).toFixed(1)+' MiB · Überlappung '+(overlap/1048576).toFixed(1)+' MiB · max. Header '+(maxHeader??'?')+' ms');
  if(ranges.length)moviReport('Seek-Dateibereiche: '+(ranges[0].start/1048576).toFixed(1)+'–'+(coveredEnd/1048576).toFixed(1)+' MiB · Ziel '+(trace.targetSeconds===null?'unbekannt':Math.round(trace.targetSeconds)+' s')+' (nur Proxy-Ranges, keine bestätigte Demuxer-Landeposition)');
  moviSeekHistory=moviSeekHistory.filter(x=>x!==trace);
 },3200);
 moviSeekSummaryTimers.push(timer);
}
function monitorMoviRanges(valid){
 const playback=xtPlayback;
 const c=playback?.a?.credentials;
 if(!c?.bridge||!c?.host||!c?.token||!/^\d{1,15}$/.test(String(playback.id)))return;
 const seen=new Map();let unavailable=false;
 async function check(){
  if(!valid()||unavailable)return;
  try{
   const response=await fetch(c.host+'/diagnostics/mkv-ranges?id='+encodeURIComponent(playback.id),{
    headers:{Authorization:'Bearer '+c.token},credentials:'omit',cache:'no-store'
   });
   if(response.status===404){unavailable=true;moviReport('Range-Diagnose: Synology-Proxy auf Build 7 aktualisieren');return;}
   if(!response.ok)return;
   const data=await response.json();
   if(!valid())return;
   for(const r of Array.isArray(data.requests)?data.requests:[]){
    for(const trace of moviSeekHistory){
     if(r.at>=trace.start-300&&(trace.end===null||r.at<=trace.end+800))trace.requests.set(r.seq,r);
    }
    const prev=seen.get(r.seq);
    if(prev===r.state)continue;
    seen.set(r.seq,r.state);
    if(r.state==='opening')continue;
    // Individual Range events remain in the browser console; UI stays compact during seeks.
    if(moviSeekHistory.length)continue;
    if(r.state==='streaming'&&prev)continue;
    const info='#'+r.seq+' · '+String(r.range||'').slice(0,40)+' · HTTP '+r.status+' · Header '+(r.header_ms??'?')+' ms · erstes Byte '+(r.first_byte_ms??'?')+' ms';
    if(r.state==='streaming'){moviReport('Range '+info);continue;}
    moviReport('Range-Ende '+info+' · '+Math.round((Number(r.bytes)||0)/1024)+' KiB · '+(r.duration_ms??'?')+' ms · '+r.state);
   }
  }catch(e){if(valid()&&!unavailable){moviReport('Range-Diagnose derzeit nicht erreichbar');unavailable=true;}}
 }
 void check();
 moviRangeTimer=setInterval(()=>{if(valid())void check();},2500);
}
async function playMoviVod(url,name,stillCurrent){
 if(!root||!video)return;
 cleanup();
 const token=generation,valid=()=>root&&generation===token&&stillCurrent();
 root.classList.add('tv-watching');root.querySelector('.tv-empty').hidden=true;
 root.querySelector('.tv-title').textContent=name;
 activePlaybackName=name;playbackFormat='movi';
 moviLog=[];moviSessionInfo.clear();
 const diagnostic=root.querySelector('.tv-movi-diagnostics');
 if(diagnostic){diagnostic.hidden=!showDiagnostics;diagnostic.open=showDiagnostics;}
 const vodFormat=String(xtPlayback?.extension||'mkv').replace(/^\./,'').toUpperCase();
 moviReport(vodFormat+'-Wiedergabe gestartet: '+name);
 const moviBufferMB=moviDesktopBufferMB();
 status(vodFormat+' wird clientseitig geladen (Movi Player, '+moviBufferMB+' MB Hintergrundpuffer) …');
 moviReport('Pufferlimit: '+moviBufferMB+' MB · Startschwelle unverändert','info','buffer-limit');
 global.meviMediaStopForSource?.('tv');global.meviSpotifyPauseForSource?.('tv');
 try{
  if(!await moviNetworkCheck(url,valid)||!valid())return;
  await loadMoviPlayer();
  if(!valid())return;
  const element=document.createElement('movi-player');
  element.setAttribute('controls','');
  element.setAttribute('playsinline','');
  element.setAttribute('aria-label',name);
  element.setAttribute('buffersize',String(moviBufferMB));
  // AVI commonly contains legacy MPEG-4 Part 2 (DivX/Xvid), which WebCodecs does not decode reliably.
  // Movi already bundles FFmpeg/WASM's MPEG-4 decoder; explicitly select it for AVI only.
  if(vodFormat==='AVI'){
   element.setAttribute('sw','');
   moviReport('AVI: FFmpeg/WASM-Softwaredecoder erzwungen (MPEG-4 Part 2 / DivX / Xvid)');
  }
  element.setAttribute('wasmurl',new URL(moviAssetBase()+'movi.wasm',document.baseURI).href);
  element.addEventListener('playing',()=>{if(valid()){moviEverPlayed=true;moviSeekBusy=false;status('▶ '+name+' · Movi Player');moviReport('Wiedergabe läuft');}});
  element.addEventListener('loadedmetadata',()=>{if(valid()){moviReport('Metadaten empfangen · Dauer '+(Number(element.duration)||0).toFixed(0)+' s');moviSourceReport(element);}});
  let seekStartedAt=null,seekReadyAt=null,seekWatchdog=null,lastSeekState='';
  const onSeekState=state=>{
   if(state==='seeking'){moviSeekBusy=true;}
   if(state==='seeking'&&seekStartedAt===null){
    seekStartedAt=performance.now();seekReadyAt=null;moviBeginSeekTrace(Number(element.currentTime));
    moviSourceReport(element);
    moviReport('Spulen gestartet · Ziel '+(Number.isFinite(Number(element.currentTime))?Math.round(Number(element.currentTime))+' s':'unbekannt')+' · Player sucht Schlüsselbild und Dateibereich');
    seekWatchdog=moviSeekTimer=setTimeout(()=>{
     if(valid()&&seekStartedAt!==null)moviReport('Spulen dauert länger als 12 Sekunden · prüfe Netzwerk/Range und Decoder','error');
    },12000);
   }
   if(state==='playing'){moviEverPlayed=true;moviSeekBusy=false;}
   if(seekStartedAt!==null&&state==='playing'&&lastSeekState!=='playing'){
    moviReport('Spulen bis Wiedergabe · '+Math.round(performance.now()-seekStartedAt)+' ms'+(seekReadyAt!==null?' · Ready→Playing '+Math.round(performance.now()-seekReadyAt)+' ms':''));
    seekStartedAt=null;clearTimeout(seekWatchdog);seekWatchdog=null;moviSeekTimer=null;moviFinishSeekTrace();
   }
   lastSeekState=state;
  };
  element.addEventListener('seeking',()=>{
   if(!valid())return;
   if(seekStartedAt===null)onSeekState('seeking');
  });
  element.addEventListener('seeked',()=>{
   if(!valid()||seekStartedAt===null)return;
   moviReport('Seek-Ereignis abgeschlossen nach '+Math.round(performance.now()-seekStartedAt)+' ms; warte auf Bild');
  });
  element.addEventListener('trackschange',e=>{if(valid())moviTrackReport(e.detail);});
  element.addEventListener('loadeddata',()=>{if(valid())moviReport('Videodaten verfügbar (loadeddata; nicht zwingend gerendert)');});
  element.addEventListener('statechange',e=>{if(!valid())return;const state=String(e.detail?.state||e.detail||'unbekannt').slice(0,80);moviReport('Player-Zustand: '+state);onSeekState(state);});
  element.addEventListener('linearmode',()=>{if(valid())moviReport('Range nicht unterstützt: nur lineares Streaming möglich','error');});
  element.addEventListener('stalled',()=>{if(valid())moviReport(seekStartedAt!==null?'Beim Spulen: Warte auf Dateibereich · '+Math.round(performance.now()-seekStartedAt)+' ms':'Pufferung: Daten werden nachgeladen (noch kein nachgewiesener Fehler)');});
  element.addEventListener('waiting',()=>{if(valid())moviReport('Warten auf Videodaten / Decoder');});
  element.addEventListener('canplay',()=>{if(valid()){if(seekStartedAt!==null)seekReadyAt=performance.now();moviReport('Wiedergabepuffer bereit');}});
  element.addEventListener('smoothwarning',e=>{if(valid()){const d=e.detail||{};moviReport('Leistungswarnung: '+String(d.message||'Decoder oder Datenrate').slice(0,100)+(d.software?' · Softwaredecoder':'')+(d.link?' · Netzwerkdatenrate':'')+(d.neededBps?' · benötigt '+Math.round(d.neededBps/1000)+' kbit/s':'')+(d.measuredBps?' · gemessen '+Math.round(d.measuredBps/1000)+' kbit/s':''),'error');}});
  element.addEventListener('error',e=>{if(valid()){const message=String(e.detail?.message||e.detail?.error||e.detail||'unbekannter Fehler');moviReport('Player-Fehler: '+message,'error');status(vodFormat+'-Fehler: '+message.slice(0,100)+'');}});
  element.addEventListener('errordisplay',e=>{if(valid()){const d=e.detail||{};moviReport('Decoder/Codec: '+String(d.title||'Fehler')+' · '+String(d.message||''),'error');}});
  const stage=root.querySelector('.tv-stage');
  stage.appendChild(element);moviElement=element;video.hidden=true;
  moviReport('Engine: '+String(element.build||'slim')+' · WASM separat geladen · MEVICAR NEXT','info','engine');
  monitorMoviRanges(valid);
  element.src=url;
  const started=element.play?.();
  started?.catch?.(e=>{if(valid()){moviReport('Start: '+String(e.message||e),'error');status('Movi Player: '+String(e.message||e).slice(0,110));}});
 }catch(e){if(valid()){moviReport('Initialisierung: '+e.message,'error');status('Movi Player nicht verfügbar: '+e.message+'');}}
}
async function playXtMedia(url,name,onHlsFailure=null){
 if(!root)return;
 cleanup();const token=generation,v=video,valid=()=>root&&generation===token&&video===v;
 root.classList.add('tv-watching');root.querySelector('.tv-empty').hidden=true;
 root.querySelector('.tv-title').textContent=name;
 const web=root.querySelector('.tv-web');if(web){web.hidden=true;web.removeAttribute('href');}
 status('Verbinde mit '+name+' …');
 global.meviMediaStopForSource?.('tv');global.meviSpotifyPauseForSource?.('tv');
 playerFault='';
 const pathname=new URL(url).pathname.toLowerCase();
 const isHls=pathname.endsWith('.m3u8');
 const isTs=pathname.endsWith('.ts');
 playbackFormat=isHls?'hls':isTs?'ts':'file';
 const msg='Diese IPTV-Quelle liefert MPEG-TS. Der Browser kann dieses Format möglicherweise nicht abspielen; hierfür wird eine HLS-Umsetzung oder ein nativer Player benötigt.';
 const start=()=>{if(!valid())return;v.play().catch(e=>{if(!valid())return;status(e.name==='NotAllowedError'?'Bitte ▶ im Videoplayer antippen.':(isTs?msg:'Wiedergabe nicht möglich: '+(e.message||'Browser- oder Streamfehler')));});};
 if(isHls){
  // The bridge currently returns HTTP 415 for HLS: diagnose it before handing
  // a JSON error response to native HLS or hls.js.
  try{const controller=new AbortController();xtProbe=controller;const response=await fetch(url,{cache:'no-store',credentials:'omit',signal:controller.signal});if(xtProbe===controller)xtProbe=null;if(!valid()){await response.body?.cancel?.();return;}if(!response.ok){let detail='';try{const data=await response.json();detail=typeof data.error==='string'?data.error.slice(0,120):'';}catch{}if(onHlsFailure&&response.status===502&&/Provider HLS HTTP (403|404)/.test(detail)){status('HLS nicht verfügbar; versuche MPEG-TS über FFmpeg …');try{await onHlsFailure();}catch(e){if(valid())status('TS-Fallback fehlgeschlagen: '+e.message);}return;}status(response.status===415?'HLS-Relay auf der Synology noch nicht aktiv (HTTP 415).':'HLS-Abruf fehlgeschlagen (HTTP '+response.status+')'+(detail?': '+detail:'')+'.');return;}await response.body?.cancel?.();}catch(e){if(valid()&&e.name!=='AbortError')status('Streamabruf fehlgeschlagen: '+(e.message||'Netzwerkfehler'));return;}
  try{
   // Prefer hls.js/MSE on desktop Chromium. Native HLS is reserved for devices
   // without MediaSource (notably iOS Safari), where hls.js cannot operate.
   const Hls=await loadHls();if(!valid())return;
   if(Hls.isSupported()){
    hls=new Hls({maxBufferLength:16,maxMaxBufferLength:32});let networkRetries=0,mediaRetries=0;
    hls.on(Hls.Events.MANIFEST_PARSED,start);
    hls.on(Hls.Events.ERROR,(_,data)=>{
     if(!valid()||!data.fatal)return;
     const detail=String(data.details||data.type||'unbekannt').slice(0,90);
     if(data.type===Hls.ErrorTypes.NETWORK_ERROR&&networkRetries++<1){status('HLS-Netzwerkfehler, versuche erneut: '+detail);hls.startLoad();return;}
     if(data.type===Hls.ErrorTypes.MEDIA_ERROR&&mediaRetries++<1){status('HLS-Medienfehler, starte Decoder erneut: '+detail);hls.recoverMediaError();return;}
     playerFault=detail+(data.response?.code?' (HTTP '+data.response.code+')':'');
     status('HLS-Fehler: '+playerFault);hls.destroy();hls=null;
    });
    playerTransition=false;hls.loadSource(url);hls.attachMedia(v);return;
   }
   if(v.canPlayType('application/vnd.apple.mpegurl')){playerTransition=false;v.src=url;start();return;}
   throw Error('HLS weder über MediaSource noch nativ verfügbar.');
  }catch(e){
   if(!valid())return;
   if(v.canPlayType('application/vnd.apple.mpegurl')){playerTransition=false;v.src=url;start();}
   else status('HLS-Player konnte nicht geladen werden: '+e.message);
  }
  return;
 }
 if(xtPlayback&&(xtPlayback.type==='movie'||xtPlayback.type==='series')){
  if(!await probeVod(url,valid))return;
  if(!valid())return;
  if(isTs){
   try{await playVodTransportStream(url,name);}
   catch(e){if(valid())status('MPEG-TS-Film nicht abspielbar: '+e.message);}
   return;
  }
  if(/\.(mkv|avi)$/i.test(pathname)){
   status('Der Anbieter liefert '+pathname.split('.').pop().toUpperCase()+'. Browser unterstützen dieses Filmformat meist nicht; eine serverseitige Umwandlung ist nötig.');
   return;
  }
 }
 playerTransition=false;v.src=url;start();
 if(isTs)status('MPEG-TS erkannt. Wiedergabe wird versucht; Browserunterstützung ist nicht garantiert.');
}
async function refreshNetwork(){
 const panel=root?.querySelector('.tv-network');
 if(!panel||panel.hidden||networkBusy)return;
 const api=global.meviXtream,a=api?.active(),credentials=xtPlayback?.a?.credentials||a?.credentials;
 const buffer=video?.buffered;let ahead=0;
 if(buffer&&video){for(let i=0;i<buffer.length;i++){if(buffer.start(i)<=video.currentTime&&buffer.end(i)>=video.currentTime){ahead=Math.max(0,buffer.end(i)-video.currentTime);break;}}}
 const quality=video?.getVideoPlaybackQuality?.(),drop=quality?quality.droppedVideoFrames:null;
 const player='Puffer '+ahead.toFixed(1)+' s · Aussetzer '+networkWaits+(drop===null?'':' · verlorene Frames '+drop);
 if(!credentials?.bridge||!credentials.host||!credentials.token){panel.textContent=player+' · Proxy-Daten nur bei verbundenem Synology-IPTV';return;}
 networkBusy=true;
 const currentRoot=root;
 try{
  const response=await fetch(String(credentials.host).replace(/\/$/,'')+'/metrics',{headers:{Authorization:'Bearer '+credentials.token},cache:'no-store',signal:AbortSignal.timeout(4500)});
  if(!response.ok)throw Error('HTTP '+response.status);
  const result=await response.json();
  if(root!==currentRoot||panel.hidden)return;
  const mbps=Number(result.mbps),peak=Number(result.peak_mbps),active=Number(result.active_stream_requests);
  if(!Number.isFinite(mbps)||!Number.isFinite(peak)||!Number.isFinite(active))throw Error('Ungültige Messwerte');
  panel.textContent='Proxy-Ausgang '+mbps.toFixed(2)+' Mbit/s (10 s) · Spitze '+peak.toFixed(2)+' Mbit/s · Anfragen '+active+' · '+player+' · Alle Proxy-Clients; keine Messung der Upload-Kapazität';
 }catch(e){if(root===currentRoot&&!panel.hidden)panel.textContent=player+' · Proxy-Messung nicht verfügbar ('+String(e.message).slice(0,70)+'). Synology-Bridge aktualisieren.';}
 finally{networkBusy=false;}
}
function syncDiagnostics(){if(!root)return;const d=root.querySelector('.tv-movi-diagnostics'),check=root.querySelector('.tv-diagnostics-toggle'),panel=root.querySelector('.tv-network'),btn=root.querySelector('[data-act="network"]');if(check)check.checked=showDiagnostics;if(d){d.hidden=!showDiagnostics||playbackFormat!=='movi';d.open=showDiagnostics;}if(!showDiagnostics&&panel){panel.hidden=true;if(btn)btn.setAttribute('aria-expanded','false');clearInterval(networkTimer);networkTimer=null;}}
function toggleNetwork(){
 if(!showDiagnostics)return;
 const panel=root?.querySelector('.tv-network'),button=root?.querySelector('[data-act="network"]');
 if(!panel||!button)return;
 panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));
 clearInterval(networkTimer);networkTimer=null;
 if(!panel.hidden){refreshNetwork();networkTimer=setInterval(refreshNetwork,2500);}
}
function setProxyState(message,state='info'){
 const dialog=root?.querySelector('.tv-proxy-dialog');if(!dialog)return;
 const info=dialog.querySelector('.tv-proxy-details'),badge=dialog.querySelector('.tv-proxy-status');
 info.textContent=message;badge.dataset.state=state;
 badge.textContent=state==='ok'?'Aktuell':state==='update'?'Update verfügbar':state==='error'?'Fehler':state==='busy'?'Wird aktualisiert':'Prüfe …';
}
async function refreshProxyUpdate(force=false){
 const dialog=root?.querySelector('.tv-proxy-dialog');
 if(!dialog||!dialog.open||proxyUpdateBusy)return;
 const button=dialog.querySelector('[data-act="proxy-update"]'),rollbackButton=dialog.querySelector('[data-act="proxy-rollback"]');
 const account=global.meviXtream?.active(),c=account?.credentials;
 if(!c?.bridge){setProxyState('Bitte zuerst die Synology-IPTV-Verbindung herstellen.','error');button.disabled=true;return;}
 proxyUpdateBusy=true;button.disabled=true;rollbackButton.disabled=true;setProxyState('Prüfe die aktuelle GitHub-Version …');
 try{
  const response=await fetch(c.host+'/update/status'+(force?'?force=1':''),{headers:{Authorization:'Bearer '+c.token},cache:'no-store',signal:AbortSignal.timeout(6000)});
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();
  if(!dialog.open)return;
  const version=(ver,build,sha)=>Number.isSafeInteger(build)&&build>0?(ver?'v'+ver+' · ':'')+'Build '+build:(/^[a-f0-9]{40}$/.test(sha||'')?sha.slice(0,8):'Unbekannt');
  dialog.querySelector('.tv-proxy-installed').textContent=version(data.installed_version,data.installed_build,data.installed);
  dialog.querySelector('.tv-proxy-latest').textContent=version(data.latest_version,data.latest_build,data.latest);
  const busy=data.state==='installing'||data.state==='restarting';
  const failed=['check_failed','update_failed','rollback','not_configured'].includes(data.state);
  if(failed)setProxyState(data.message||'Proxy-Status konnte nicht ermittelt werden.','error');
  else if(busy)setProxyState(data.message||'Der Proxy startet neu …','busy');
  else if(data.available)setProxyState('Eine neue Proxy-Version kann installiert werden.','update');
  else setProxyState('Dein Proxy ist auf dem aktuellen Stand.','ok');
  button.disabled=!data.available||busy||failed;
  rollbackButton.disabled=!data.rollback_available||busy;
  rollbackButton.textContent=data.rollback_available?'Zurück zu '+version(data.previous_version,data.previous_build,null):'Keine Vorgängerversion';
 }catch(e){if(dialog.open){setProxyState('Versionsabfrage nicht verfügbar: '+e.message,'error');button.disabled=true;rollbackButton.disabled=true;}}
 finally{proxyUpdateBusy=false;}
}
async function applyProxyUpdate(){
 const dialog=root?.querySelector('.tv-proxy-dialog'),c=global.meviXtream?.active()?.credentials;
 if(!dialog?.open||!c?.bridge)return;
 if(!confirm('Proxy-Update jetzt installieren? Die IPTV-Wiedergabe wird während des Neustarts unterbrochen.'))return;
 const button=dialog.querySelector('[data-act="proxy-update"]');button.disabled=true;
 setProxyState('Lade Update herunter und starte den Proxy anschließend neu …','busy');
 try{
  const response=await fetch(c.host+'/update/apply',{method:'POST',headers:{Authorization:'Bearer '+c.token},cache:'no-store',signal:AbortSignal.timeout(6000)});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'HTTP '+response.status);
  setProxyState('Update angefordert. Nach dem Neustart bitte den Status erneut prüfen.','busy');
 }catch(e){setProxyState('Update konnte nicht gestartet werden: '+e.message,'error');}
}
async function applyProxyRollback(){
 const dialog=root?.querySelector('.tv-proxy-dialog'),c=global.meviXtream?.active()?.credentials;
 if(!dialog?.open||!c?.bridge)return;
 const button=dialog.querySelector('[data-act="proxy-rollback"]');
 if(button.disabled)return;
 if(!confirm('Wirklich die vorherige Proxy-Version aktivieren? Die Wiedergabe wird kurz unterbrochen.'))return;
 button.disabled=true;
 setProxyState('Vorherige Version wird aktiviert und Proxy neu gestartet …','busy');
 try{
  const response=await fetch(c.host+'/update/rollback',{method:'POST',headers:{Authorization:'Bearer '+c.token},cache:'no-store',signal:AbortSignal.timeout(6000)});
  const data=await response.json();
  if(!response.ok)throw Error(data.error||'HTTP '+response.status);
  setProxyState('Rückkehr angefordert. Nach dem Neustart Status erneut prüfen.','busy');
 }catch(e){setProxyState('Rückkehr nicht möglich: '+e.message,'error');button.disabled=false;}
}
function openProxyDialog(){
 const dialog=root?.querySelector('.tv-proxy-dialog');if(!dialog)return;
 dialog.showModal();refreshProxyUpdate(true);
}
function closeProxyDialog(){root?.querySelector('.tv-proxy-dialog')?.close();}
function paintCustom(){root.querySelector('.tv-custom').innerHTML=custom.map(c=>'<div>'+esc(c.name)+' <button data-delete="'+esc(c.id)+'" aria-label="'+esc(c.name)+' löschen">Löschen</button></div>').join('');}
function add(items){let n=0;for(const c of items){if(custom.length>=100)break;if(channels().some(x=>x.url===c.url))continue;custom.push({...c,id:'custom-'+Date.now().toString(36)+'-'+n+'-'+Math.random().toString(36).slice(2,7),country:'OTHER'});n++;}save();paintList();paintCustom();return n;}
function click(e){const b=e.target.closest('button');if(!b)return;if(b.dataset.xtAccount){const api=global.meviXtream;if(api){api.state.active=b.dataset.xtAccount;api.state.kind='live';api.state.group='ALL';api.state.query='';const account=api.active();if(account)rememberPlaylist('xtream',account.name,'live');paintXtream();root.querySelector('.tv-xtream-dialog').close();}return;}if(b.dataset.xtDelete){const api=global.meviXtream;api?.remove(b.dataset.xtDelete);const account=api?.active();if(account)rememberPlaylist('xtream',account.name,api.state.kind);else rememberPlaylist('public');paintXtAccounts();paintXtream();return;}if(b.dataset.kind){const api=global.meviXtream;if(api){api.state.kind=b.dataset.kind;api.state.group='ALL';api.state.query='';const account=api.active();if(account)rememberPlaylist('xtream',account.name,api.state.kind);paintXtream();}return;}if(b.dataset.xtFavorite){const api=global.meviXtream,a=api?.active(),item=a?.items.live?.find(x=>x.id===b.dataset.xtFavorite);if(!a||!item)return;const key=xtFavoriteKey(a,item);xtFavorites=xtFavorites.includes(key)?xtFavorites.filter(x=>x!==key):[...xtFavorites,key];saveXtFilters();paintXtream();return;}if(b.dataset.xtItem){selectXtItem(b.dataset.xtItem);return;}if(b.dataset.xtEpisode){const api=global.meviXtream,a=api?.active(),ep=xtreamSelected?.episodes.find(x=>x.id===b.dataset.xtEpisode);if(ep&&a)startXtMedia(api,a,'series',ep.id,ep.extension,ep.name);return;}if(b.dataset.channel){selected=b.dataset.channel;const ch=channels().find(x=>x.id===selected);if(ch?.sourceId)rememberPlaylist('m3u',ch.sourceId);else rememberPlaylist('public');paintList();play();return;}if(b.dataset.fav){const id=b.dataset.fav;favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];save();paintList();return;}if(b.dataset.sourceRefresh){const x=sources.find(s=>s.id===b.dataset.sourceRefresh);if(x)syncSource(x);return;}if(b.dataset.sourceDelete){const id=b.dataset.sourceDelete;const x=sources.find(s=>s.id===id);if(!x)return;if(!confirm('Quelle „'+x.name+'“ und ihre Sender löschen?'))return;if(lastPlaylist?.type==='m3u'&&lastPlaylist.name===id)rememberPlaylist('public');sources=sources.filter(s=>s.id!==id);custom=custom.filter(c=>c.sourceId!==id);favorites=favorites.filter(id=>channels().some(c=>c.id===id));if(!channels().some(c=>c.id===selected)){stop();selected='zdf';paintTitle();}save();paintList();paintSources();sourceStatus('Quelle gelöscht.');return;}if(b.dataset.delete){const id=b.dataset.delete;if(selected===id){stop();selected='zdf';paintTitle();}custom=custom.filter(c=>c.id!==id);favorites=favorites.filter(x=>x!==id);save();paintCustom();paintList();return;}switch(b.dataset.act){case'xt-favorites-filter':xtFavoritesOnly=!xtFavoritesOnly;saveXtFilters();paintXtream();break;case'movi-index-check':void moviCheckMkvIndex();break;case'movi-seek-75':moviBenchmark75();break;case'movi-copy-log':navigator.clipboard?.writeText(moviLogText());break;case'proxy-status':openProxyDialog();break;case'proxy-close':closeProxyDialog();break;case'proxy-refresh':refreshProxyUpdate(true);break;case'proxy-update':applyProxyUpdate();break;case'proxy-rollback':applyProxyRollback();break;case'network':toggleNetwork();break;case'epg':paintEPG();root.querySelector('.tv-epg-dialog').showModal();break;case'epg-close':root.querySelector('.tv-epg-dialog').close();break;case'epg-refresh':refreshEPG(true);break;case'play':if(xtPlayback){const p=xtPlayback;startXtMedia(p.api,p.a,p.type,p.id,p.extension,p.name);}else play();break;case'stop':stop();break;case'favorites':only=!only;paintList();break;case'list':root.classList.toggle('tv-watching');break;case'xtream':paintXtAccounts();root.querySelector('.tv-xtream-dialog').showModal();break;case'xtream-settings':root.querySelector('.tv-xtream-dialog').close();global.meviOpenCredentialSettings?.();break;case'xtream-close':root.querySelector('.tv-xtream-dialog').close();break;case'xtream-back':global.meviXtream.state.active=null;rememberPlaylist('public');paintXtream();paintList();break;case'xtream-series-back':paintXtream();break;case'sources':paintSources();root.querySelector('.tv-sources-dialog').showModal();break;case'sources-close':root.querySelector('.tv-sources-dialog').close();break;case'add':paintCustom();root.querySelector('.tv-custom-dialog').showModal();break;case'close':root.querySelector('.tv-custom-dialog').close();break;case'fullscreen':if(moviElement){if(moviElement.requestFullscreen)moviElement.requestFullscreen().catch(()=>status('Vollbild nicht verfügbar.'));break;}if(video.webkitEnterFullscreen)video.webkitEnterFullscreen();else if(video.requestFullscreen)video.requestFullscreen().catch(()=>status('Vollbild nicht verfügbar.'));else status('Vollbild nicht verfügbar.');break;}}
function input(e){if(e.target.matches('.tv-xtream-mode')){const form=e.target.closest('form'),bridge=e.target.value==='bridge';form.querySelector('[name=username]').required=!bridge;form.querySelector('[name=password]').required=!bridge;form.querySelector('[name=token]').required=bridge;form.querySelector('[name=username]').closest('label').hidden=bridge;form.querySelector('[name=password]').closest('label').hidden=bridge;form.querySelector('[name=token]').closest('label').hidden=!bridge;return;}if(e.target.matches('.tv-xtream-search')){global.meviXtream.state.query=e.target.value;paintXtream();return;}if(e.target.matches('.tv-search')){query=e.target.value;paintList();}}
async function change(e){if(e.target.matches('.tv-diagnostics-toggle')){showDiagnostics=e.target.checked;try{localStorage.setItem('mevicar-tv-diagnostics',showDiagnostics?'1':'0');}catch{}syncDiagnostics();return;}if(e.target.matches('.tv-xtream-mode')){const form=e.target.closest('form'),bridge=e.target.value==='bridge';for(const name of ['username','password','token']){const field=form.querySelector('[name='+name+']');if(field){field.required=name==='token'?bridge:!bridge;field.closest('label').hidden=name==='token'?!bridge:bridge;}}form.querySelector('[name=server]').placeholder=bridge?'https://meine-bridge.example':'https://anbieter.example:443';return;}if(e.target.matches('.tv-live-country')){xtCountry=e.target.value;saveXtFilters();paintXtream();return;}if(e.target.matches('.tv-xtream-group')){global.meviXtream.state.group=e.target.value;paintXtream();return;}if(e.target.matches('.tv-country')){country=e.target.value;paintList();}if(e.target.matches('.tv-file')){const file=e.target.files?.[0],owner=root;if(!file)return;const out=root.querySelector('.tv-import-status');try{if(file.size>1000000)throw Error('Datei zu groß (max. 1 MB).');const items=parseM3U(await file.text());if(root!==owner)return;out.textContent=add(items)+' Sender importiert. Ungültige URLs und Duplikate wurden übersprungen.';}catch(err){if(root===owner)out.textContent=err.message;}e.target.value='';}}
function submit(e){if(e.target.matches('.tv-xtream-form')){e.preventDefault();const api=global.meviXtream;if(!api)return xtStatus('Xtream-Modul nicht geladen.');if(restoreInFlight)return xtStatus('Die gespeicherte IPTV-Liste wird bereits geladen.');const form=e.target,data=new FormData(form),pin=String(global.MeviCredentials?.tvPin?.()||'');if(!/^[0-9]{4}$/.test(pin)){xtStatus('Zugangscode fehlt. Bitte Settings → Zugänge öffnen.');return;}const button=form.querySelector('button[type=submit]');if(button)button.disabled=true;api.pinCredentials(pin).then(c=>api.connect(data.get('name'),c,xtStatus)).then(a=>{if(!root)return;rememberPlaylist('xtream',a.name,'live');api.state.kind='live';paintXtAccounts();paintXtream();xtStatus(a.name+' verbunden. Kataloge geladen.');}).catch(err=>xtStatus('Verbindung fehlgeschlagen: '+(err.name==='TypeError'?'Netzwerk/CORS prüfen':err.message))).finally(()=>{if(button)button.disabled=false;});return;}if(e.target.matches('.tv-source-form')){e.preventDefault();const data=new FormData(e.target),name=String(data.get('name')||'').trim().slice(0,80),url=safeURL(data.get('url'));if(!name||!url){sourceStatus('Bitte Name und gültige HTTPS-M3U-Adresse eingeben.');return;}if(sources.length>=30){sourceStatus('Maximal 30 Quellen.');return;}if(sources.some(x=>x.url===url)){sourceStatus('Quelle existiert bereits.');return;}const source={id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),name,url};syncSource(source);return;}if(!e.target.matches('.tv-form'))return;e.preventDefault();const data=new FormData(e.target),url=safeURL(data.get('url')),name=String(data.get('name')||'').trim();const out=root.querySelector('.tv-import-status');if(!url||!name){out.textContent='Name und gültige HTTPS-Adresse ohne Benutzername/Passwort eingeben.';return;}out.textContent=add([{name:name.slice(0,80),url}])?'Sender gespeichert.':'Sender bereits vorhanden oder Liste voll.';}
function visibility(){if(document.hidden&&root)stop();}
function unmount(){clearInterval(networkTimer);networkTimer=null;networkBusy=false;clearEPG();xtRequestSeq++;cleanup();xtPlayback=null;activePlaybackName='';playbackFormat='';if(root){root.removeEventListener('click',click);root.removeEventListener('input',input);root.removeEventListener('change',change);root.removeEventListener('submit',submit);root.removeEventListener('error',logoError,true);}if(video){video.removeEventListener('playing',onPlaying);video.removeEventListener('error',onError);video.removeEventListener('waiting',onWaiting);}document.removeEventListener('visibilitychange',visibility);root=null;video=null;}
function mount(){unmount();root=document.querySelector('.tv-root');if(!root)return;video=root.querySelector('video');root.addEventListener('click',click);root.addEventListener('input',input);root.addEventListener('change',change);root.addEventListener('submit',submit);root.addEventListener('error',logoError,true);video.addEventListener('playing',onPlaying);video.addEventListener('error',onError);video.addEventListener('waiting',onWaiting);document.addEventListener('visibilitychange',visibility);root.querySelector('.tv-search').value=query;root.querySelector('.tv-country').value=country;paintTitle();paintList();paintXtream();syncDiagnostics();restoreLastPlaylist();}
global.meviTVHTML=html;global.meviTVMount=mount;global.meviTVUnmount=unmount;global.meviTVStopForSource=source=>{if(source!=='tv'&&root)stop();};
})(typeof window==='undefined'?globalThis:window);
