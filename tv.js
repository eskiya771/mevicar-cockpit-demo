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
let proxyUpdateBusy=false,moviPromise=null,moviElement=null,moviLog=[];
let query='',country='ALL',only=false,libraryPromise=null,mpegtsPromise=null,xtPlayback=null,activePlaybackName='',playbackFormat='',xtRequestSeq=0,xtProbe=null,playerTransition=false,playerFault='',mpegtsFallback=null;
try{const data=JSON.parse(localStorage.getItem(KEY)||'{}');sources=(Array.isArray(data.sources)?data.sources:[]).filter(x=>x&&typeof x.id==='string'&&typeof x.name==='string'&&safeURL(x.url)).slice(0,30).map(x=>({id:x.id,name:x.name.slice(0,80),url:safeURL(x.url),updated:x.updated||''}));custom=(Array.isArray(data.custom)?data.custom:[]).filter(c=>c&&typeof c.name==='string'&&typeof c.id==='string'&&safeURL(c.url)).slice(0,100).map(c=>({...c,country:'OTHER',url:safeURL(c.url)}));favorites=(Array.isArray(data.favorites)?data.favorites:[]).filter(x=>typeof x==='string');selected=typeof data.selected==='string'?data.selected:selected;}catch{}
function channels(){return [...CATALOG,...custom];}
function current(){return channels().find(c=>c.id===selected)||CATALOG[1];}
function save(){try{localStorage.setItem(KEY,JSON.stringify({sources,custom,favorites,selected}));}catch{status('Einstellungen konnten nicht gespeichert werden.');}}
function status(text){const el=root?.querySelector('.tv-status');if(el)el.textContent=text;}
function html(){return '<section class="tv-root"><aside class="tv-library"><header><strong>MeviTV <span>LIVE</span></strong></header><input class="tv-search" type="search" placeholder="Sender suchen" aria-label="Sender suchen"><div class="tv-filters"><select class="tv-country" aria-label="Land"><option value="ALL">Alle Länder</option><option value="DE">Deutschland</option><option value="TR">Türkiye</option><option value="OTHER">Eigene</option></select><button data-act="favorites" aria-label="Nur Favoriten" aria-pressed="false">☆</button></div><div class="tv-list"></div><div class="tv-xtream-catalog" hidden><div class="tv-xtream-tools"><input class="tv-xtream-search" type="search" placeholder="IPTV durchsuchen" aria-label="Katalog durchsuchen"><select class="tv-xtream-group" aria-label="Kategorie"></select></div><div class="tv-xtream-list"></div></div></aside><section class="tv-player"><header><div class="tv-xtream-tabs"><button data-kind="live">Live</button><button data-kind="movie">Filme</button><button data-kind="series">Serien</button><button class="tv-xtream-switch" data-act="xtream-back" title="Normale Live-TV-Sender" aria-label="Normale Live-TV-Sender">TV</button></div><button data-act="list" aria-label="Senderliste umschalten">☷ Sender</button><button data-act="network" class="tv-network-toggle" aria-label="Netzwerkdiagnose anzeigen" aria-expanded="false">Netz</button><button data-act="proxy-status" aria-label="Proxy-Version und Updates">Proxy</button><button class="tv-settings" data-act="xtream" title="IPTV-Einstellungen" aria-label="IPTV-Einstellungen">⚙</button></header><div class="tv-actions"><button data-act="play" aria-label="Wiedergabe starten oder neu laden">▶ Start</button><button data-act="stop">■ Stopp</button><button data-act="fullscreen" aria-label="Video im Vollbild">⛶ <span>Vollbild</span></button><button class="tv-public-action" data-act="sources" aria-label="Quellen verwalten">Quellen</button><button class="tv-public-action" data-act="add" aria-label="Sender hinzufügen">＋</button><a class="tv-web" target="_blank" rel="noopener noreferrer">Senderseite ↗</a></div><div class="tv-stage"><video controls playsinline preload="none" aria-label="TV-Livestream"></video><div class="tv-empty">Sender auswählen und Wiedergabe starten</div></div><div class="tv-program"><strong class="tv-title"></strong><div class="tv-epg-now" aria-live="polite"></div><button data-act="epg" aria-label="TV-Programm öffnen" hidden>EPG</button></div><div class="tv-status" role="status" aria-live="polite">Bereit</div><details class="tv-movi-diagnostics" hidden><summary>MKV-Diagnose · Lock Up / Codec / Netzwerk</summary><pre class="tv-movi-log" aria-live="polite"></pre><button data-act="movi-copy-log">Protokoll kopieren</button></details><div class="tv-network" hidden role="status" aria-live="off">Netzwerkdiagnose: IPTV auswählen</div></section><dialog class="tv-dialog tv-proxy-dialog" aria-label="Synology Proxy Update"><div class="tv-proxy-head"><h3>Synology Proxy</h3><span class="tv-proxy-status" role="status">Verbinde …</span></div><div class="tv-proxy-versions"><div class="tv-proxy-version"><span class="tv-proxy-label">Installierte Version</span><strong class="tv-proxy-installed">–</strong></div><div class="tv-proxy-version"><span class="tv-proxy-label">GitHub-Version</span><strong class="tv-proxy-latest">–</strong></div></div><p class="tv-proxy-details" role="status">Versionsinformationen werden geladen …</p><p class="tv-proxy-note">Updateprüfung beim Öffnen. Installation nur nach Bestätigung.</p><div class="tv-proxy-actions"><button data-act="proxy-refresh">Status prüfen</button><button data-act="proxy-update" disabled>Proxy aktualisieren</button><button data-act="proxy-rollback" disabled>Vorherige Version</button><button data-act="proxy-close">Schließen</button></div></dialog><dialog class="tv-dialog tv-epg-dialog" aria-label="TV-Programm"><h3>TV-Programm</h3><p class="tv-epg-channel"></p><div class="tv-epg-content"></div><details class="tv-epg-diagnostics"><summary>EPG-Diagnose</summary><p class="tv-epg-diagnostic-text"></p></details><div class="tv-epg-actions"><button data-act="epg-refresh">Aktualisieren</button><button data-act="epg-close">Schließen</button></div></dialog><dialog class="tv-dialog tv-custom-dialog"><form class="tv-form"><h3>Eigene TV-Sender</h3><label>Name<input name="name" maxlength="80" required placeholder="Sendername"></label><label>HTTPS-Stream<input name="url" type="url" required placeholder="https://…/master.m3u8"></label><button type="submit">Sender speichern</button></form><label class="tv-import">M3U-Senderliste importieren<input class="tv-file" type="file" accept=".m3u,.m3u8,text/plain"></label><p class="tv-import-status" role="status"></p><p>Eigene Sender bleiben auf diesem Gerät. Maximal 100 Sender.</p><div class="tv-custom"></div><button data-act="close">Schließen</button></dialog><dialog class="tv-dialog tv-sources-dialog"><h3>M3U-Quellen</h3><form class="tv-source-form"><label>Name<input name="name" maxlength="80" required placeholder="Meine TV-Liste"></label><label>M3U-URL (HTTPS)<input name="url" type="url" required placeholder="https://…/playlist.m3u"></label><button type="submit">Quelle hinzufügen und laden</button></form><p class="tv-source-status" role="status">M3U-URLs müssen den Browserzugriff (CORS) erlauben. URLs können Zugangsdaten enthalten und werden nur lokal in diesem Browser gespeichert.</p><div class="tv-source-list"></div><button data-act="sources-close">Schließen</button></dialog><dialog class="tv-dialog tv-xtream-dialog"><h3>MeviTV verbinden</h3><form class="tv-xtream-form"><p>Proxy: mevitv.mtankurt.synology.me</p><label>Bezeichnung<input name="name" maxlength="80" required value="MeviTV"></label><label>Zugangscode<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" required placeholder="Vierstelliger Code"></label><button type="submit">Katalog verbinden</button></form><p class="tv-xtream-status" role="status">Der Code wird auf der Synology geprüft. Die Anmeldesitzung bleibt im Arbeitsspeicher.</p><div class="tv-xtream-accounts"></div><button data-act="xtream-close">Schließen</button></dialog></section>';}
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
function paintTitle(){const c=current();root.querySelector('.tv-title').textContent=c.name;const a=root.querySelector('.tv-web');a.hidden=!c.web;if(c.web)a.href=c.web;else a.removeAttribute('href');}
function cleanup(){if(moviElement){try{moviElement.pause?.();moviElement.destroy?.();moviElement.remove();}catch{}moviElement=null;}if(video)video.hidden=false;networkWaits=0;networkStarted=Date.now();generation++;clearTimeout(deadline);deadline=null;clearInterval(mpegtsHealthTimer);mpegtsHealthTimer=null;mpegtsFail=null;if(xtProbe){xtProbe.abort();xtProbe=null;}playerTransition=true;mpegtsFallback=null;if(mpegtsPlayer){const previous=mpegtsPlayer;mpegtsPlayer=null;for(const operation of ['pause','unload','detachMediaElement','destroy']){try{previous[operation]?.();}catch{}}}if(hls){hls.destroy();hls=null;}if(video){video.pause();video.removeAttribute('src');video.load();}}
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
function stop(){xtRequestSeq++;xtPlayback=null;activePlaybackName='';playbackFormat='';cleanup();status('Gestoppt');}
function paintSources(){if(!root)return;const list=root.querySelector('.tv-source-list');if(!list)return;list.innerHTML=sources.map(x=>'<div class="tv-source-row"><span>'+esc(x.name)+' <small>'+custom.filter(c=>c.sourceId===x.id).length+' Sender</small></span><button data-source-refresh="'+esc(x.id)+'">Aktualisieren</button><button data-source-delete="'+esc(x.id)+'">Löschen</button></div>').join('')||'<p>Noch keine M3U-URL hinzugefügt.</p>';}
function sourceStatus(message){const e=root?.querySelector('.tv-source-status');if(e)e.textContent=message;}
async function fetchPlaylist(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);try{const response=await fetch(url,{signal:controller.signal,credentials:'omit',redirect:'follow'});if(!response.ok)throw Error('HTTP '+response.status);const length=Number(response.headers.get('content-length')||0);if(length>1000000)throw Error('Liste zu groß (max. 1 MB).');const reader=response.body?.getReader();if(!reader)return parseM3U(await response.text());let total=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>1000000){await reader.cancel();throw Error('Liste zu groß (max. 1 MB).');}chunks.push(value);}const bytes=new Uint8Array(total);let off=0;for(const chunk of chunks){bytes.set(chunk,off);off+=chunk.length;}return parseM3U(new TextDecoder().decode(bytes));}finally{clearTimeout(timer);}}
async function syncSource(source){const owner=root;sourceStatus('Lade '+source.name+' …');try{const items=await fetchPlaylist(source.url);if(root!==owner)return false;if(!items.length)throw Error('Keine gültigen HTTPS-Sender gefunden.');const old=custom.filter(c=>c.sourceId===source.id);const oldByURL=new Map(old.map(c=>[c.url,c]));const free=100-custom.filter(c=>c.sourceId!==source.id).length;if(free<1)throw Error('Limit von 100 eigenen Sendern erreicht.');const fresh=items.slice(0,free).map((c,i)=>({...c,id:oldByURL.get(c.url)?.id||'src-'+source.id+'-'+Math.random().toString(36).slice(2,10),sourceId:source.id}));const used=new Set(channels().filter(c=>c.sourceId!==source.id).map(c=>c.url));const unique=fresh.filter(c=>!used.has(c.url));if(!sources.some(x=>x.id===source.id))sources.push(source);else sources=sources.map(x=>x.id===source.id?{...x,name:source.name,url:source.url}:x);custom=[...custom.filter(c=>c.sourceId!==source.id),...unique];const changed=sources.find(x=>x.id===source.id);changed.updated=new Date().toISOString();if(!channels().some(c=>c.id===selected)){stop();selected='zdf';paintTitle();}save();paintSources();paintList();sourceStatus(source.name+': '+unique.length+' Sender eingelesen.');return true;}catch(e){if(root===owner)sourceStatus('Import fehlgeschlagen: '+(e.name==='AbortError'?'Zeitüberschreitung':e.message)+'. Die bisherigen Sender bleiben erhalten.');return false;}}
let xtreamView=false,xtreamSelected=null;
function xtStatus(v){const e=root?.querySelector('.tv-xtream-status');if(e)e.textContent=v;}
function paintXtAccounts(){const api=global.meviXtream,e=root?.querySelector('.tv-xtream-accounts');if(!api||!e)return;e.innerHTML=api.state.accounts.map(a=>'<div class="tv-source-row"><span>'+esc(a.name)+' <small>'+a.items.live.length+' Live · '+a.items.movie.length+' Filme · '+a.items.series.length+' Serien</small></span><button data-xt-account="'+esc(a.id)+'">Öffnen</button><button data-xt-delete="'+esc(a.id)+'">Löschen</button></div>').join('')||'<p>Noch kein Xtream-Katalog verbunden.</p>';}
function paintXtream(){const api=global.meviXtream,area=root?.querySelector('.tv-xtream-catalog');if(!api||!area)return;const a=api.active();xtreamView=!!a;root.classList.toggle('tv-xtream-mode',xtreamView);root.querySelector('.tv-list').hidden=xtreamView;root.querySelector('.tv-search').hidden=xtreamView;root.querySelector('.tv-filters').hidden=xtreamView;area.hidden=!xtreamView;if(!a)return;root.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(api.state.kind===b.dataset.kind)));const opts=[{id:'ALL',name:'Alle Kategorien'},...(a.categories[api.state.kind]||[])];area.querySelector('.tv-xtream-group').innerHTML=opts.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');area.querySelector('.tv-xtream-group').value=api.state.group;area.querySelector('.tv-xtream-search').value=api.state.query;area.querySelector('.tv-xtream-list').innerHTML=api.view().map(x=>'<button class="tv-xtream-item" data-xt-item="'+esc(x.id)+'"><strong>'+esc(x.name)+'</strong><small>'+esc(x.rating?('Bewertung '+x.rating):'')+'</small></button>').join('')||'<p>Keine Einträge gefunden.</p>';}
async function selectXtItem(id){const api=global.meviXtream,a=api?.active(),item=a?.items[api.state.kind]?.find(x=>x.id===id);if(!item)return;if(api.state.kind==='series'){const box=root.querySelector('.tv-xtream-list');box.textContent='Lade Staffeln und Folgen …';try{const episodes=await api.episodes(a,item);box.innerHTML='<button data-act="xtream-series-back">← Serien</button>'+episodes.map(x=>'<button class="tv-xtream-item" data-xt-episode="'+esc(x.id)+'"><strong>Staffel '+esc(x.season)+' · Folge '+esc(x.number)+'</strong> '+esc(x.name)+'</button>').join('');xtreamSelected={item,episodes};}catch(e){box.textContent='Folgen konnten nicht geladen werden: '+e.message;}return;}startXtMedia(api,a,api.state.kind==='movie'?'movie':'live',item.id,item.extension,item.name);}
async function startXtMedia(api,a,type,id,extension,name){
 if(!root)return;
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
   const convert=type!=='live'&&a.credentials.bridge&&String(extension||'').toLowerCase()==='mkv';
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
   enableWorker:false,enableStashBuffer:true,stashInitialSize:384*1024,autoCleanupSourceBuffer:true,
   liveBufferLatencyChasing:true
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
function moviReport(message,level='info'){
 // Never log signed URLs, provider paths or credentials.
 const safe=String(message).replace(/https?:\/\/\S+/gi,'[URL entfernt]').slice(0,260);
 const line=new Date().toLocaleTimeString('de-DE')+' · '+safe;
 moviLog.push(line);if(moviLog.length>70)moviLog.shift();
 const box=root?.querySelector('.tv-movi-log');if(box)box.textContent=moviLog.join('\n');
 if(level==='error')console.error('[MeviTV MKV]',safe);else console.info('[MeviTV MKV]',safe);
}
function loadMoviPlayer(){
 if(customElements.get('movi-player'))return Promise.resolve();
 if(!moviPromise)moviPromise=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='./vendor/movi-player-0.4.1.slim.global.js';script.async=true;
  script.onload=()=>customElements.whenDefined('movi-player').then(resolve,reject);
  script.onerror=()=>reject(Error('Movi-Player-Datei konnte nicht geladen werden'));
  document.head.appendChild(script);
 }).catch(e=>{moviPromise=null;throw e;});
 return moviPromise;
}
function moviTrackReport(tracks){
 const list=Array.isArray(tracks)?tracks:[];
 const group=type=>list.filter(t=>String(t.type||t.kind||t.codec_type||'').toLowerCase()===type).map(t=>[t.codec||t.codecName||t.codec_id||'Codec unbekannt',t.language||t.lang||'',t.width&&t.height?t.width+'x'+t.height:''].filter(Boolean).join(' '));
 moviReport('Video-Tracks: '+(group('video').join(' | ')||'nicht gemeldet')+' · insgesamt '+list.length+' Tracks');
 moviReport('Audio-Tracks: '+(group('audio').join(' | ')||'nicht gemeldet'));
}
async function moviNetworkCheck(url,valid){
 try{
  const ctrl=new AbortController(),timeout=setTimeout(()=>ctrl.abort(),8000);
  try{
   const response=await fetch(url,{method:'GET',headers:{Range:'bytes=0-1'},cache:'no-store',credentials:'omit',signal:ctrl.signal});
   if(!valid()){await response.body?.cancel?.();return;}
   const range=response.headers.get('content-range');
   moviReport('Range-Test: HTTP '+response.status+(range?' · Content-Range '+range.slice(0,80):' · Content-Range nicht sichtbar')+(response.status===206?' · Partial Content':response.status===200?' · Range ignoriert':' · HTTP-Fehler'),response.ok?'info':'error');
   await response.body?.cancel?.();
  }finally{clearTimeout(timeout);}
 }catch(e){if(valid())moviReport('Range/CORS-Test: '+(e.name==='AbortError'?'Timeout':'Netzwerk oder CORS blockiert'),'error');}
}
async function playMoviVod(url,name,stillCurrent){
 if(!root||!video)return;
 cleanup();
 const token=generation,valid=()=>root&&generation===token&&stillCurrent();
 root.classList.add('tv-watching');root.querySelector('.tv-empty').hidden=true;
 root.querySelector('.tv-title').textContent=name;
 activePlaybackName=name;playbackFormat='movi';
 moviLog=[];
 const diagnostic=root.querySelector('.tv-movi-diagnostics');
 if(diagnostic){diagnostic.hidden=false;diagnostic.open=true;}
 moviReport('MKV-Test gestartet: '+name);
 status('MKV wird clientseitig geladen (Movi Player, 50 MB Puffer) …');
 global.meviMediaStopForSource?.('tv');global.meviSpotifyPauseForSource?.('tv');
 try{
  await loadMoviPlayer();
  if(!valid())return;
  const element=document.createElement('movi-player');
  element.setAttribute('controls','');
  element.setAttribute('playsinline','');
  element.setAttribute('aria-label',name);
  element.setAttribute('buffersize','50');
  element.setAttribute('wasmurl',new URL('./vendor/movi.wasm',document.baseURI).href);
  element.addEventListener('playing',()=>{if(valid()){status('▶ '+name+' · Movi Player');moviReport('Wiedergabe läuft');}});
  element.addEventListener('loadedmetadata',()=>{if(valid())moviReport('Metadaten empfangen · Dauer '+(Number(element.duration)||0).toFixed(0)+' s');});
  element.addEventListener('trackschange',e=>{if(valid())moviTrackReport(e.detail);});
  element.addEventListener('loadeddata',()=>{if(valid())moviReport('Erstes Videobild decodiert');});
  element.addEventListener('statechange',e=>{if(valid())moviReport('Player-Zustand: '+String(e.detail?.state||e.detail||'unbekannt').slice(0,80));});
  element.addEventListener('linearmode',()=>{if(valid())moviReport('Range nicht unterstützt: nur lineares Streaming möglich','error');});
  element.addEventListener('stalled',()=>{if(valid())moviReport('Pufferung: Daten werden nachgeladen (noch kein nachgewiesener Fehler)');});
  element.addEventListener('waiting',()=>{if(valid())moviReport('Warten auf Videodaten / Decoder');});
  element.addEventListener('canplay',()=>{if(valid())moviReport('Wiedergabepuffer bereit');});
  element.addEventListener('smoothwarning',e=>{if(valid()){const d=e.detail||{};moviReport('Leistungswarnung: '+String(d.message||'Decoder oder Datenrate').slice(0,100)+(d.software?' · Softwaredecoder':'')+(d.link?' · Netzwerkdatenrate':'')+(d.neededBps?' · benötigt '+Math.round(d.neededBps/1000)+' kbit/s':'')+(d.measuredBps?' · gemessen '+Math.round(d.measuredBps/1000)+' kbit/s':''),'error');}});
  element.addEventListener('error',e=>{if(valid()){const message=String(e.detail?.message||e.detail?.error||e.detail||'unbekannter Fehler');moviReport('Player-Fehler: '+message,'error');status('MKV-Fehler: '+message.slice(0,100)+'');}});
  element.addEventListener('errordisplay',e=>{if(valid()){const d=e.detail||{};moviReport('Decoder/Codec: '+String(d.title||'Fehler')+' · '+String(d.message||''),'error');}});
  const stage=root.querySelector('.tv-stage');
  stage.appendChild(element);moviElement=element;video.hidden=true;
  moviReport('Engine: '+String(element.build||'slim')+' · WASM separat geladen');
  void moviNetworkCheck(url,valid);
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
function toggleNetwork(){
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
function click(e){const b=e.target.closest('button');if(!b)return;if(b.dataset.xtAccount){const api=global.meviXtream;if(api){api.state.active=b.dataset.xtAccount;api.state.kind='live';api.state.group='ALL';api.state.query='';paintXtream();root.querySelector('.tv-xtream-dialog').close();}return;}if(b.dataset.xtDelete){global.meviXtream?.remove(b.dataset.xtDelete);paintXtAccounts();paintXtream();return;}if(b.dataset.kind){const api=global.meviXtream;if(api){api.state.kind=b.dataset.kind;api.state.group='ALL';api.state.query='';paintXtream();}return;}if(b.dataset.xtItem){selectXtItem(b.dataset.xtItem);return;}if(b.dataset.xtEpisode){const api=global.meviXtream,a=api?.active(),ep=xtreamSelected?.episodes.find(x=>x.id===b.dataset.xtEpisode);if(ep&&a)startXtMedia(api,a,'series',ep.id,ep.extension,ep.name);return;}if(b.dataset.channel){selected=b.dataset.channel;paintList();play();return;}if(b.dataset.fav){const id=b.dataset.fav;favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];save();paintList();return;}if(b.dataset.sourceRefresh){const x=sources.find(s=>s.id===b.dataset.sourceRefresh);if(x)syncSource(x);return;}if(b.dataset.sourceDelete){const id=b.dataset.sourceDelete;const x=sources.find(s=>s.id===id);if(!x)return;if(!confirm('Quelle „'+x.name+'“ und ihre Sender löschen?'))return;sources=sources.filter(s=>s.id!==id);custom=custom.filter(c=>c.sourceId!==id);favorites=favorites.filter(id=>channels().some(c=>c.id===id));if(!channels().some(c=>c.id===selected)){stop();selected='zdf';paintTitle();}save();paintList();paintSources();sourceStatus('Quelle gelöscht.');return;}if(b.dataset.delete){const id=b.dataset.delete;if(selected===id){stop();selected='zdf';paintTitle();}custom=custom.filter(c=>c.id!==id);favorites=favorites.filter(x=>x!==id);save();paintCustom();paintList();return;}switch(b.dataset.act){case'movi-copy-log':navigator.clipboard?.writeText(moviLog.join('\n'));break;case'proxy-status':openProxyDialog();break;case'proxy-close':closeProxyDialog();break;case'proxy-refresh':refreshProxyUpdate(true);break;case'proxy-update':applyProxyUpdate();break;case'proxy-rollback':applyProxyRollback();break;case'network':toggleNetwork();break;case'epg':paintEPG();root.querySelector('.tv-epg-dialog').showModal();break;case'epg-close':root.querySelector('.tv-epg-dialog').close();break;case'epg-refresh':refreshEPG(true);break;case'play':if(xtPlayback){const p=xtPlayback;startXtMedia(p.api,p.a,p.type,p.id,p.extension,p.name);}else play();break;case'stop':stop();break;case'favorites':only=!only;paintList();break;case'list':root.classList.toggle('tv-watching');break;case'xtream':paintXtAccounts();root.querySelector('.tv-xtream-dialog').showModal();break;case'xtream-close':root.querySelector('.tv-xtream-dialog').close();break;case'xtream-back':global.meviXtream.state.active=null;paintXtream();paintList();break;case'xtream-series-back':paintXtream();break;case'sources':paintSources();root.querySelector('.tv-sources-dialog').showModal();break;case'sources-close':root.querySelector('.tv-sources-dialog').close();break;case'add':paintCustom();root.querySelector('.tv-custom-dialog').showModal();break;case'close':root.querySelector('.tv-custom-dialog').close();break;case'fullscreen':if(moviElement){if(moviElement.requestFullscreen)moviElement.requestFullscreen().catch(()=>status('Vollbild nicht verfügbar.'));break;}if(video.webkitEnterFullscreen)video.webkitEnterFullscreen();else if(video.requestFullscreen)video.requestFullscreen().catch(()=>status('Vollbild nicht verfügbar.'));else status('Vollbild nicht verfügbar.');break;}}
function input(e){if(e.target.matches('.tv-xtream-mode')){const form=e.target.closest('form'),bridge=e.target.value==='bridge';form.querySelector('[name=username]').required=!bridge;form.querySelector('[name=password]').required=!bridge;form.querySelector('[name=token]').required=bridge;form.querySelector('[name=username]').closest('label').hidden=bridge;form.querySelector('[name=password]').closest('label').hidden=bridge;form.querySelector('[name=token]').closest('label').hidden=!bridge;return;}if(e.target.matches('.tv-xtream-search')){global.meviXtream.state.query=e.target.value;paintXtream();return;}if(e.target.matches('.tv-search')){query=e.target.value;paintList();}}
async function change(e){if(e.target.matches('.tv-xtream-mode')){const form=e.target.closest('form'),bridge=e.target.value==='bridge';for(const name of ['username','password','token']){const field=form.querySelector('[name='+name+']');if(field){field.required=name==='token'?bridge:!bridge;field.closest('label').hidden=name==='token'?!bridge:bridge;}}form.querySelector('[name=server]').placeholder=bridge?'https://meine-bridge.example':'https://anbieter.example:443';return;}if(e.target.matches('.tv-xtream-group')){global.meviXtream.state.group=e.target.value;paintXtream();return;}if(e.target.matches('.tv-country')){country=e.target.value;paintList();}if(e.target.matches('.tv-file')){const file=e.target.files?.[0],owner=root;if(!file)return;const out=root.querySelector('.tv-import-status');try{if(file.size>1000000)throw Error('Datei zu groß (max. 1 MB).');const items=parseM3U(await file.text());if(root!==owner)return;out.textContent=add(items)+' Sender importiert. Ungültige URLs und Duplikate wurden übersprungen.';}catch(err){if(root===owner)out.textContent=err.message;}e.target.value='';}}
function submit(e){if(e.target.matches('.tv-xtream-form')){e.preventDefault();const api=global.meviXtream;if(!api)return xtStatus('Xtream-Modul nicht geladen.');const form=e.target,data=new FormData(form),pin=String(data.get('pin')||'');if(!/^[0-9]{4}$/.test(pin)){xtStatus('Vierstelligen Code eingeben.');return;}const button=form.querySelector('button[type=submit]');if(button)button.disabled=true;api.pinCredentials(pin).then(c=>api.connect(data.get('name'),c,xtStatus)).then(a=>{if(!root)return;form.querySelector('[name=pin]').value='';paintXtAccounts();paintXtream();xtStatus(a.name+' verbunden. Kataloge geladen.');}).catch(err=>xtStatus('Verbindung fehlgeschlagen: '+(err.name==='TypeError'?'Netzwerk/CORS prüfen':err.message))).finally(()=>{if(button)button.disabled=false;});return;}if(e.target.matches('.tv-source-form')){e.preventDefault();const data=new FormData(e.target),name=String(data.get('name')||'').trim().slice(0,80),url=safeURL(data.get('url'));if(!name||!url){sourceStatus('Bitte Name und gültige HTTPS-M3U-Adresse eingeben.');return;}if(sources.length>=30){sourceStatus('Maximal 30 Quellen.');return;}if(sources.some(x=>x.url===url)){sourceStatus('Quelle existiert bereits.');return;}const source={id:Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),name,url};syncSource(source);return;}if(!e.target.matches('.tv-form'))return;e.preventDefault();const data=new FormData(e.target),url=safeURL(data.get('url')),name=String(data.get('name')||'').trim();const out=root.querySelector('.tv-import-status');if(!url||!name){out.textContent='Name und gültige HTTPS-Adresse ohne Benutzername/Passwort eingeben.';return;}out.textContent=add([{name:name.slice(0,80),url}])?'Sender gespeichert.':'Sender bereits vorhanden oder Liste voll.';}
function visibility(){if(document.hidden&&root)stop();}
function unmount(){clearInterval(networkTimer);networkTimer=null;networkBusy=false;clearEPG();xtRequestSeq++;cleanup();xtPlayback=null;activePlaybackName='';playbackFormat='';if(root){root.removeEventListener('click',click);root.removeEventListener('input',input);root.removeEventListener('change',change);root.removeEventListener('submit',submit);}if(video){video.removeEventListener('playing',onPlaying);video.removeEventListener('error',onError);video.removeEventListener('waiting',onWaiting);}document.removeEventListener('visibilitychange',visibility);root=null;video=null;}
function mount(){unmount();root=document.querySelector('.tv-root');if(!root)return;video=root.querySelector('video');root.addEventListener('click',click);root.addEventListener('input',input);root.addEventListener('change',change);root.addEventListener('submit',submit);video.addEventListener('playing',onPlaying);video.addEventListener('error',onError);video.addEventListener('waiting',onWaiting);document.addEventListener('visibilitychange',visibility);root.querySelector('.tv-search').value=query;root.querySelector('.tv-country').value=country;paintTitle();paintList();paintXtream();}
global.meviTVHTML=html;global.meviTVMount=mount;global.meviTVUnmount=unmount;global.meviTVStopForSource=source=>{if(source!=='tv'&&root)stop();};
})(typeof window==='undefined'?globalThis:window);
