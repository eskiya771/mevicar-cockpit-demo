/* One dashboard renderer shared by the browser and the Android WebView split.
   It is the only place for clock, build, update, search, address book and the
   full-map button; the navigation main page has no title bar of its own.
   Platform adapters only provide numbers; no route calculation or second UI. */
(function(root){
'use strict';
const placeholder='–';
const rounded=value=>Number.isFinite(value)&&value>=0?String(Math.round(value)):placeholder;
/* Formatting and average speed come exclusively from nav-route-details.js. */
function html(compact=false){
 return `<section class="mg-nav-dashboard${compact?' mg-dashboard-compact':''}" role="group" aria-label="Fahrtdashboard">
  <div class="mg-dash-cell mg-dash-speed"><span class="mg-dash-label">Geschwindigkeit</span>
   <div class="mg-dash-value"><strong data-dash="speed">${placeholder}</strong><small>km/h</small></div></div>
  <div class="mg-dash-cell mg-dash-arrival"><span class="mg-dash-label">Ankunft</span><strong data-dash="arrival">${placeholder}</strong></div>
  <div class="mg-dash-cell mg-dash-time"><span class="mg-dash-label">Restzeit</span><strong data-dash="time">${placeholder}</strong></div>
  <div class="mg-dash-cell mg-dash-distance"><span class="mg-dash-label">Reststrecke</span><strong data-dash="distance">${placeholder}</strong></div>
  <div class="mg-dash-cell mg-dash-average"><span class="mg-dash-label">Ø Geschwindigkeit</span>
   <div class="mg-dash-value"><strong data-dash="average">${placeholder}</strong><small>km/h</small></div></div>
  <div class="mg-dash-cell mg-dash-camera"><span class="mg-dash-label">Nächster Blitzer</span><strong data-dash="camera">${placeholder}</strong></div>
  <div class="mg-dash-cell mg-dash-maximum"><span class="mg-dash-label">Höchstgeschwindigkeit</span>
   <div class="mg-dash-value"><strong data-dash="maximum">${placeholder}</strong><small>km/h</small></div></div>
 </section>`;
}
const icon=path=>'<svg class="mg-dash-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="'+path+'"/></svg>';
const icons={
 search:'M10.5 4a6.5 6.5 0 0 1 5.2 10.4l4.2 4.2-1.4 1.4-4.2-4.2A6.5 6.5 0 1 1 10.5 4zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z',
 full:'M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z',
 pin:'M12 22s7-6.1 7-12a7 7 0 0 0-14 0c0 5.9 7 12 7 12zm0-8.7a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6z'
};
/* The controls call the existing handlers of the shared page (index.html):
   checkForUpdate, openDashboardSearch, showGuidanceMap.
   Clock, build and update texts are filled by their existing owners via the ids. */
function panel(){
 return `<div class="mg-dash-panel" data-route-active="false">
  <header class="mg-dash-head">
   <time id="statusClock" class="mg-dash-clock" aria-label="Aktuelle Uhrzeit">--:--</time>
   <div class="mg-dash-build"><span id="buildVersion" aria-label="Geladene Version">Build ${placeholder}</span><span id="updateMessage" aria-live="polite"></span></div>
   <div class="mg-dash-head-tools" role="group" aria-label="Dashboard-Aktionen">
    <button type="button" id="updateBtn" class="mg-dash-update" title="Auf Updates prüfen" aria-label="Auf Updates prüfen" onclick="checkForUpdate()"></button>
    <button type="button" class="mg-dash-action mg-dash-fullmap" data-dash-action="full" title="Dashboard schließen, Karte im Vollbild" aria-label="Vollbild: Dashboard schließen" onclick="showGuidanceMap()">${icon(icons.full)}<span>Vollbild</span></button>
   </div>
  </header>
  <div class="mg-dash-actions" role="group" aria-label="Navigation bedienen">
   <button type="button" class="mg-dash-action" data-dash-action="search" onclick="openDashboardSearch()">${icon(icons.search)}<span>Ziel suchen</span></button>
   <button type="button" class="mg-dash-action mg-dash-end-route" data-dash-action="end" onclick="endNavigationFromDashboard()" aria-label="Navigation beenden">Navigation beenden</button>
  </div>
  <section class="mg-dash-quick" aria-label="Gespeicherte Orte" data-dash-quick>
   <div class="mg-dash-quick-heading">
    <strong>${icon(icons.pin)}<span>Orte</span></strong>
    <span class="mg-dash-quick-hint" aria-hidden="true">Wischen ›</span>
   </div>
   <div class="mg-dash-quick-rail" data-dash-quick-rail role="group" aria-label="Gespeicherte Ziele"></div>
   <section class="mg-dash-idle-speed" data-idle-speed-card aria-label="Digitaler GPS-Tachometer">
    <div class="mg-dash-idle-speed-head">
     <span>DIGITALTACHO</span>
     <span class="mg-dash-idle-gps-state" data-idle-gps-status>GPS wird gesucht</span>
    </div>
    <div class="mg-dash-idle-speed-stage">
     <svg class="mg-dash-idle-speed-arc" viewBox="0 0 360 155" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs><linearGradient id="mg-idle-speed-gradient" x1="0" y1="0" x2="1" y2="0">
       <stop offset="0%" stop-color="#4de4fc"/><stop offset="55%" stop-color="#8fbaff"/>
       <stop offset="100%" stop-color="#ff64e8"/>
      </linearGradient></defs>
      <path class="mg-dash-idle-speed-track" d="M 36 142 A 144 144 0 0 1 324 142" pathLength="100"/>
      <path class="mg-dash-idle-speed-fill" d="M 36 142 A 144 144 0 0 1 324 142" pathLength="100"
       stroke-dasharray="100" stroke-dashoffset="100" data-idle-speed-arc/>
     </svg>
     <div class="mg-dash-idle-speed-readout">
      <strong data-idle-speed-value aria-live="off">–</strong>
      <span>km/h</span>
     </div>
    </div>
    <div class="mg-dash-idle-speed-scale"><span>0</span><span>GPS-Geschwindigkeit</span><span>220</span></div>
   </section>
  </section>
  ${html(true)}
 </div>`;
}
// Read from the single search provider; do not re-render the full cockpit or
// reset the horizontal scroll position every time fresh GPS metrics arrive.
function refreshQuick(container){
 if(!container?.querySelector)return;
 const panel=container.querySelector('.mg-dash-panel');
 if(!panel||panel.dataset?.routeActive==='true')return;
 const rail=container.querySelector('[data-dash-quick-rail]');
 if(!rail)return;
 const parity=root.MeviWebNavParity;
 const places=parity?.quickDestinations?.()||[];
 const signature=JSON.stringify(places);
 if(rail.dataset?.signature===signature)return;
 const previousScroll=rail.scrollLeft||0;
 const safe=root.MeviNavigationShared?.escapeHtml||
  (value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
 rail.innerHTML=places.length?places.map(p=>{
  const kind=['home','work','favorites'].includes(p.kind)?p.kind:'favorites';
  const index=Number.isInteger(p.index)&&p.index>=0?p.index:0;
  const name=safe(p.name);
  const subtitle=safe(p.distance||p.address||'Gespeichert');
  const iconName=safe(p.icon||'star');
  const glyph=parity?.quickIcon?.(p.icon)||'★';
  return '<button type="button" class="mg-dash-quick-place"'+
   ' data-kind="'+kind+'" data-index="'+index+'"'+
   ' onclick="MeviWebNavParity.quickSelect(this.dataset.kind,Number(this.dataset.index))"'+
   ' aria-label="'+name+' als Ziel auswählen" title="'+name+'">'+
   '<span class="mg-dash-quick-circle mg-dash-quick-'+kind+'" data-icon="'+iconName+'">'+glyph+'</span>'+
   '<strong>'+name+'</strong><small>'+subtitle+'</small></button>';
 }).join(''):'<p class="mg-dash-quick-empty">Noch keine Orte gespeichert. Ziele kannst du über die Suche hinzufügen.</p>';
 if(rail.dataset)rail.dataset.signature=signature;
 rail.scrollLeft=previousScroll;
}
// The idle speedometer uses one short-lived GPS watch only while the Navi
// dashboard is visible without a route. The guided trip continues to use
// the existing navigation provider's raw speed; no parallel trip model.
let idleWatch=null, idleSpeed=null, idleFixAt=0, idlePrevious=null;
let idleStatus='GPS wird gesucht', idleBlocked=false;
const idleSpeedLimit=220, idleStaleMs=8000;
function stopIdleGps(){
 if(idleWatch!==null&&typeof navigator!=='undefined'){
  try{navigator.geolocation?.clearWatch?.(idleWatch)}catch{}
 }
 idleWatch=null;idleSpeed=null;idleFixAt=0;idlePrevious=null;
 idleStatus='GPS wird gesucht';idleBlocked=false;
}
function idleFix(position){
 const now=Date.now(),c=position?.coords||{},stamp=position?.timestamp;
 if(!Number.isFinite(stamp)||stamp>now+1000||now-stamp>10000||
    !Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||
    !Number.isFinite(c.accuracy)||c.accuracy<0||c.accuracy>50){
  idleSpeed=null;idleFixAt=0;idlePrevious=null;idleStatus='GPS ungenau';
  const node=typeof document==='undefined'?null:document.getElementById?.('mg-nav-dashboard-split');
  if(node)paintIdleSpeed(node);
  return;
 }
 let kmh=null;
 if(Number.isFinite(c.speed)&&c.speed>=0&&c.speed<=112){
  kmh=c.speed*3.6;
 }else if(idlePrevious&&stamp>idlePrevious.timestamp){
  // Fallback for GPS providers that do not return coords.speed.
  // Do not turn short-term location jitter into a false vehicle speed.
  const seconds=(stamp-idlePrevious.timestamp)/1000;
  const meters=root.MeviNavigationShared.distanceMeters(idlePrevious,{lat:c.latitude,lng:c.longitude});
  const threshold=Math.max(8,Math.min(45,2*Math.max(c.accuracy,idlePrevious.accuracy)));
  if(seconds>=1.5&&seconds<=20){
   if(meters>threshold)kmh=Math.min(400,meters/seconds*3.6);
   else if(seconds>=3&&c.accuracy<=15&&idlePrevious.accuracy<=15)kmh=0;
  }
 }
 idlePrevious={lat:c.latitude,lng:c.longitude,accuracy:c.accuracy,timestamp:stamp};
 idleSpeed=kmh;idleFixAt=now;
 idleStatus=Number.isFinite(kmh)?'GPS aktiv':'GPS · warte auf Tempo';
 const node=typeof document==='undefined'?null:document.getElementById?.('mg-nav-dashboard-split');
 if(node)paintIdleSpeed(node);
}
function startIdleGps(){
 if(idleWatch!==null||idleBlocked||typeof navigator==='undefined')return;
 if(typeof document!=='undefined'&&document.hidden)return;
 const geo=navigator.geolocation;
 if(!geo?.watchPosition){idleStatus='GPS nicht verfügbar';idleBlocked=true;return}
 idleStatus='GPS wird gesucht';
 try{
  idleWatch=geo.watchPosition(idleFix,e=>{
   if(idleWatch!==null){try{geo.clearWatch(idleWatch)}catch{}}
   idleWatch=null;idleSpeed=null;idleFixAt=0;idlePrevious=null;idleBlocked=true;
   idleStatus=e?.code===1?'Standortfreigabe fehlt':e?.code===2?'GPS nicht verfügbar':'GPS-Signal fehlt';
   const node=typeof document==='undefined'?null:document.getElementById?.('mg-nav-dashboard-split');
   if(node)paintIdleSpeed(node);
  },{enableHighAccuracy:true,maximumAge:1000,timeout:15000});
 }catch{
  idleWatch=null;idleBlocked=true;idleStatus='GPS nicht verfügbar';
 }
}
function paintIdleSpeed(container){
 const numeral=container.querySelector('[data-idle-speed-value]');
 const bar=container.querySelector('[data-idle-speed-arc]');
 const status=container.querySelector('[data-idle-gps-status]');
 const fresh=idleFixAt>0&&Date.now()-idleFixAt<=idleStaleMs;
 const speed=fresh&&Number.isFinite(idleSpeed)?Math.max(0,idleSpeed):null;
 const value=rounded(speed);
 if(numeral&&numeral.textContent!==value)numeral.textContent=value;
 if(bar?.style)bar.style.strokeDashoffset=String(100-Math.min(100,(speed??0)/idleSpeedLimit*100));
 const label=!fresh&&idleFixAt>0?'GPS-Signal veraltet':idleStatus;
 if(status&&status.textContent!==label)status.textContent=label;
}
if(typeof document!=='undefined'&&document.addEventListener){
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stopIdleGps()});
}

function paint(container,data){
 if(!container?.querySelector)return;
 const info=data||{},format=root.MeviNavRouteDetails;
 const panel=container.querySelector('.mg-dash-panel');
 if(panel?.dataset)panel.dataset.routeActive=info.routeActive===true?'true':'false';
 if(info.routeActive!==true){
  refreshQuick(container);
  startIdleGps();
  paintIdleSpeed(container);
 }else stopIdleGps();
 // Web guidance and the Android SDK both supply raw metrics.
 // avgKmh remains an input for compatibility with older callers only.
 const rawAverage=Number.isFinite(info.drivenMeters)&&Number.isFinite(info.elapsedMs)?
  format?.averageKmh(info.drivenMeters,info.elapsedMs):info.avgKmh;
 const valid=value=>Number.isFinite(value)&&value>=0;
 const values={
  speed:rounded(info.speedKmh),
  arrival:Number.isFinite(info.arrivalEpochMs)&&info.arrivalEpochMs>0?
   format?.clock(info.arrivalEpochMs,false)||placeholder:placeholder,
  time:valid(info.remainingSeconds)?format?.duration(info.remainingSeconds,'ceil')||placeholder:placeholder,
  distance:valid(info.remainingMeters)?format?.distance(info.remainingMeters,'dashboard')||placeholder:placeholder,
  average:rounded(rawAverage),
  maximum:rounded(info.maxKmh),
  camera:valid(info.nextCameraMeters)?format?.distance(info.nextCameraMeters,'dashboard')||placeholder:placeholder
 };
 for(const [key,value] of Object.entries(values)){
  const element=container.querySelector('[data-dash="'+key+'"]');
  if(element&&element.textContent!==value)element.textContent=value;
 }
}
root.MeviNavDashboard={html,panel,paint,refreshQuick,stopIdleGps};
})(window);
