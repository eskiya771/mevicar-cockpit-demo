/* One dashboard renderer shared by the browser and the Android WebView split.
   It is the only place for clock, build, update, search, address book and the
   full-map button; the navigation main page has no title bar of its own.
   Platform adapters only provide numbers; no route calculation or second UI. */
(function(root){
'use strict';
const placeholder='–';
const rounded=value=>Number.isFinite(value)&&value>=0?String(Math.round(value)):placeholder;
let detailsExpanded=false,camerasExpanded=false,lastTripInfo=null,cameraRescanBusy=false;

 // A shared large numeric size keeps the eight dashboard fields balanced.
 // Only the camera status/extra hint may require a smaller local exception.
 let metricContext=null;
 const metricObservers=new WeakMap();
 function fitMetricText(grid){
  if(!grid?.querySelectorAll||!root.getComputedStyle||!root.document?.createElement)return;
  if(!metricContext)metricContext=root.document.createElement('canvas').getContext?.('2d');
  if(!metricContext)return;
  const fits=[];
  for(const element of grid.querySelectorAll('[data-dash]')){
   const cell=element.closest?.('.mg-dash-cell');
   if(!cell||cell.clientWidth<=0||cell.clientHeight<=0)continue;
   const camera=cell.classList.contains('mg-dash-camera');
   const speed=cell.classList.contains('mg-dash-speed');
   const host=camera?cell.querySelector('.mg-dash-camera-open')||cell:cell;
   const hostCss=root.getComputedStyle(host);
   const innerWidth=host.clientWidth-parseFloat(hostCss.paddingLeft||0)-parseFloat(hostCss.paddingRight||0)-4;
   const innerHeight=host.clientHeight-parseFloat(hostCss.paddingTop||0)-parseFloat(hostCss.paddingBottom||0)-2;
   const label=cell.querySelector('.mg-dash-label');
   const unit=element.parentElement?.querySelector('small:not([hidden])');
   const hint=cell.querySelector('.mg-dash-camera-hint, .mg-dash-speed-alert:not([hidden]), .mg-dash-traffic:not([hidden])');
   const speedInline=speed&&root.getComputedStyle(cell).flexDirection==='row';
   const width=innerWidth-(speedInline?(label?.offsetWidth||0)+10:0)-(unit?unit.offsetWidth+6:0);
   const height=speedInline?innerHeight:innerHeight-(label?.offsetHeight||0)-(hint?.offsetHeight||0)-6;
   if(width<10||height<10)continue;
   const kind=cell.dataset?.cameraValueKind||'distance';
   const status=camera&&kind!=='distance';
   const statusLimit=kind==='empty'?27:kind==='scanning'?32:25;
   const ceiling=Math.max(10,Math.min(status?statusLimit:65,height*.94));
   const style=root.getComputedStyle(element);
   metricContext.font=`${style.fontWeight||'800'} ${ceiling}px ${style.fontFamily||'sans-serif'}`;
   const measured=metricContext.measureText(element.textContent||'–').width;
   const size=Math.max(10,Math.floor(Math.min(ceiling,
    ceiling*width/Math.max(measured*(camera?1.1:1.04),1))*10)/10);
   fits.push({element,size,camera,status});
  }
  const regular=fits.filter(f=>!f.camera);
  const base=regular.length?Math.min(...regular.map(f=>f.size)):65;
  const numericCamera=fits.find(f=>f.camera&&!f.status);
  // A slightly tighter camera tile can set the common size; its extra status
  // line must never make all other metrics unnecessarily small.
  const common=numericCamera&&numericCamera.size>=base*.85?Math.min(base,numericCamera.size):base;
  for(const f of fits){
   const target=`${Math.min(common,f.size)}px`;
   if(f.element.style.fontSize!==target)f.element.style.setProperty('font-size',target,'important');
  }
 }
 function queueMetricFit(container){
  const selector='.mg-nav-dashboard.mg-dashboard-compact';
  const grid=container?.matches?.(selector)?container:container?.querySelector?.(selector);
  if(!grid)return;
  if(!metricObservers.has(grid)){
   const observer=typeof root.ResizeObserver==='function'?
    new root.ResizeObserver(()=>queueMetricFit(grid)):null;
   observer?.observe(grid);
   metricObservers.set(grid,observer||true);
  }
  if(grid.dataset.metricFitQueued==='1')return;
  grid.dataset.metricFitQueued='1';
  const fit=()=>{delete grid.dataset.metricFitQueued;fitMetricText(grid);};
  if(typeof root.requestAnimationFrame==='function')root.requestAnimationFrame(fit);
  else fit();
 }

/* Formatting and average speed come exclusively from nav-route-details.js. */
function html(compact=false){
 return `<section class="mg-nav-dashboard${compact?' mg-dashboard-compact':''}" role="group" aria-label="Fahrtdashboard">
  <!-- Same reading order as the fullscreen trip summary: ETA, remaining time, distance. -->
  <${compact?'button type="button" data-dash-traffic-open disabled aria-controls="mg-dash-route-detail-scroll" aria-label="Ankunft und Verkehrsdetails anzeigen" onclick="MeviNavDashboard.toggleDetails(true)"':'div'} class="mg-dash-cell mg-dash-arrival"><span class="mg-dash-label">Ankunft</span><strong data-dash="arrival">${placeholder}</strong></${compact?'button':'div'}>
  <${compact?'button type="button" data-dash-traffic-open disabled aria-controls="mg-dash-route-detail-scroll" aria-label="Restzeit und Verkehrsdetails anzeigen" onclick="MeviNavDashboard.toggleDetails(true)"':'div'} class="mg-dash-cell mg-dash-time"><span class="mg-dash-label">Restzeit</span><div class="mg-dash-value"><strong data-dash="time">${placeholder}</strong><small data-dash-time-unit hidden></small></div><span class="mg-dash-traffic" data-dash-traffic hidden></span></${compact?'button':'div'}>
  <div class="mg-dash-cell mg-dash-distance"><span class="mg-dash-label">Reststrecke</span><strong data-dash="distance">${placeholder}</strong></div>
  <div class="mg-dash-cell mg-dash-driven"><span class="mg-dash-label">Zurückgelegt</span><strong data-dash="driven">${placeholder}</strong></div>
  <div class="mg-dash-cell mg-dash-progress"><span class="mg-dash-label">Fortschritt</span><strong data-dash="progress">${placeholder}</strong></div>
  <div class="mg-dash-cell mg-dash-speed"><span class="mg-dash-label">Geschwindigkeit</span>
   <div class="mg-dash-value"><strong data-dash="speed">${placeholder}</strong><small>km/h</small></div>
   <span class="mg-dash-speed-alert" data-dash-speed-alert hidden></span></div>
  ${compact?'<div class="mg-dash-camera-altitude-row">':''}
  <div class="mg-dash-cell mg-dash-camera" role="group" aria-label="Blitzer der aktuellen Route">
    <button type="button" class="mg-dash-camera-open" onclick="MeviNavDashboard.toggleCameras()" aria-label="Blitzer auf dieser Route anzeigen" aria-controls="mg-dash-camera-list" aria-expanded="false"><span class="mg-dash-label"><span class="mg-dash-camera-label-full">Nächster Blitzer</span><span class="mg-dash-camera-label-compact">Blitzer</span></span><strong data-dash="camera">${placeholder}</strong><span class="mg-dash-camera-hint" data-dash-camera-detail>Trefferliste ansehen</span></button>
    <button type="button" class="mg-dash-camera-refresh" onclick="MeviNavDashboard.rescanCameras()" aria-label="Blitzerscan erneut starten" title="Blitzer auf dieser Route neu scannen" disabled><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 7v5h-5M4 17v-5h5M5.7 9a7 7 0 0 1 11.7-2L20 12M4 12l2.6 5a7 7 0 0 0 11.7-2"/></svg></button>
   </div>
   <div class="mg-dash-cell mg-dash-altitude" title="GPS-Höhe laut Gerät (kann von der Meereshöhe abweichen)" aria-label="Aktuelle GPS-Höhe">
    <span class="mg-dash-label">Höhe</span>
    <div class="mg-dash-value"><strong data-dash="altitude">${placeholder}</strong><small>m</small></div>
   </div>
   ${compact?'</div>':''}
  <div class="mg-dash-cell mg-dash-spotify" aria-label="Spotify Mini-Player">
   ${root.MeviNavTrip?.spotifyHTML?.('dashboard')||''}</div>

 </section>`;
}
const icon=path=>'<svg class="mg-dash-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="'+path+'"/></svg>';
const icons={
 close:'M5.5 5.5l13 13m0-13l-13 13',
 eye:'M2 12s3.8-6.5 10-6.5 10 6.5 10 6.5-3.8 6.5-10 6.5S2 12 2 12zm10-3.3a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6z',
 search:'M10.5 4a6.5 6.5 0 0 1 5.2 10.4l4.2 4.2-1.4 1.4-4.2-4.2A6.5 6.5 0 1 1 10.5 4zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z',
 full:'M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z',
 pin:'M12 22s7-6.1 7-12a7 7 0 0 0-14 0c0 5.9 7 12 7 12zm0-8.7a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6z'
};
/* The controls call the existing handlers of the shared page (index.html):
   checkForUpdate, openDashboardSearch, showGuidanceMap.
   Clock, build and update texts are filled by their existing owners via the ids. */
function panel(){
 return `<div class="mg-dash-panel" data-route-active="false" data-details-open="false">
  <header class="mg-dash-head">
   <time id="statusClock" class="mg-dash-clock" aria-label="Aktuelle Uhrzeit">--:--</time>
   <button type="button" class="mg-dash-action mg-dash-search" data-dash-action="search" onclick="openDashboardSearch()" aria-label="Ziel suchen">${icon(icons.search)}<span>Ziel suchen</span></button>
   <button type="button" class="mg-dash-action mg-dash-gemini" data-dash-action="gemini" onclick="MeviGeminiVoice.start()" aria-label="Gemini-Spracheingabe starten" title="Mit Gemini sprechen"><span aria-hidden="true">✦</span></button>
   <div class="mg-dash-head-tools" role="group" aria-label="Dashboard-Aktionen">
    <button type="button" class="mg-dash-action mg-dash-details-toggle" data-dash-action="details" onclick="MeviNavDashboard.toggleDetails()" aria-controls="mg-dash-route-detail-scroll" aria-expanded="false" aria-label="Routendetails anzeigen" title="Dashboard / Routendetails">${icon(icons.eye)}<span class="mg-dash-visually-hidden">Details</span></button>
    <button type="button" class="mg-dash-action mg-dash-end-route" data-dash-action="end" onclick="endNavigationFromDashboard()" aria-label="Navigation beenden" title="Navigation beenden">${icon(icons.close)}<span class="mg-dash-visually-hidden">Navigation beenden</span></button>
   </div>
  </header>
  <section class="mg-dash-quick" aria-label="Gespeicherte Orte" data-dash-quick>
   <div class="mg-dash-quick-heading">
    <strong>${icon(icons.pin)}<span>Orte</span></strong>
    <span class="mg-dash-quick-hint" aria-hidden="true">Wischen ›</span>
   </div>
   <div class="mg-dash-quick-rail" data-dash-quick-rail role="group" aria-label="Gespeicherte Ziele"></div>
   <section class="mg-dash-idle-speed" data-idle-speed-card aria-label="Digitaler GPS-Tachometer">
    <span class="mg-dash-visually-hidden" data-idle-gps-status role="status">GPS wird gesucht</span>
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
    <div class="mg-dash-idle-speed-scale"><span>0</span><span>220</span></div>
   </section>
   <section class="mg-dash-idle-spotify" aria-label="Spotify Mini-Player im Split">
    ${root.MeviNavTrip?.spotifyHTML?.('dashboard')||''}
   </section>
  </section>
  ${html(true)}
  <section class="mg-dash-route-details" aria-label="Routendetails">
   <div class="mg-dash-route-details-heading mg-dash-traffic-heading"><button type="button" onclick="MeviNavDashboard.toggleDetails(false)" aria-label="Zurück zum Dashboard">‹</button><span>Verkehr &amp; Route</span></div>

   <div class="mg-dash-detail-body">
    <aside class="mg-dash-route-rail" data-dash-route-rail hidden aria-label="Reststrecke als Routenleiste"></aside>
    <div id="mg-dash-route-detail-scroll" class="mg-dash-route-detail-scroll" role="region" aria-label="Routendetails, scrollbar" tabindex="0">
     <section class="mg-dash-traffic-summary" data-dash-traffic-summary aria-label="Verkehrssituation"></section>
     <section class="mg-dash-traffic-check" data-traffic-check hidden aria-label="Verkehrsprüfung">
    <button type="button" data-traffic-check-start onclick="MeviGoogleNav.checkTraffic()">Verkehr prüfen</button>
    <small data-traffic-check-message></small>
    <button type="button" data-traffic-check-standard hidden onclick="MeviGoogleNav.acceptTrafficRoute(false,this.dataset.offerId||'')"></button>
    <button type="button" data-traffic-check-alt hidden onclick="MeviGoogleNav.acceptTrafficRoute(true,this.dataset.offerId||'')"></button>
   </section>
     <details class="mg-dash-traffic-diagnostics" data-traffic-diagnostics hidden><summary>Verkehrsdiagnose</summary><dl data-traffic-diagnostics-content></dl></details>
     <div data-dash-route-detail-content><p class="mg-dash-detail-pending">Routendetails werden geladen …</p></div>
    </div>
   </div>
  </section>
  <section id="mg-dash-camera-list" class="mg-dash-camera-list" aria-label="Blitzer auf dieser Route" role="region">
   <div class="mg-dash-camera-list-head"><strong>Blitzer auf der Route</strong>
    <button type="button" onclick="MeviNavDashboard.toggleCameras(false)" aria-label="Zurück zum Dashboard">Zurück</button>
   </div>
   <p class="mg-dash-camera-status" data-camera-status role="status">Scan wird vorbereitet …</p>
   <div class="mg-dash-camera-scroll" data-camera-hits tabindex="0" aria-label="Gefundene Blitzer, scrollbar"></div>
  </section>
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
  const iconName=safe(p.icon||'star');
  const glyph=parity?.quickIcon?.(p.icon)||'★';
  return '<button type="button" class="mg-dash-quick-place"'+
   ' data-kind="'+kind+'" data-index="'+index+'"'+
   ' onclick="MeviWebNavParity.quickSelect(this.dataset.kind,Number(this.dataset.index))"'+
   ' aria-label="'+name+' als Ziel auswählen" title="'+name+'">'+
   '<span class="mg-dash-quick-circle mg-dash-quick-'+kind+'" data-icon="'+iconName+'">'+glyph+'</span>'+
   '<strong>'+name+'</strong></button>';
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
 root.MeviTripBookCore?.feed?.(position,'dashboard-gps');
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

/* Keep the normal dashboard and a long, scrollable details list in the same
   right-hand split. Reuse MeviGoogleNav's existing detail HTML formatter. */
function detailsOpen(){return detailsExpanded}
function paintDetails(container){
 if(!detailsExpanded||!container?.querySelector)return;
 const panel=container.querySelector('.mg-dash-panel');
 if(panel?.dataset?.routeActive!=='true')return;
 const content=container.querySelector('.mg-dash-route-detail-scroll');
 if(!content)return;
 const nav=root.MeviGoogleNav;
 if(nav?.isNativeMode?.())nav.refreshNativeGuidanceMenu?.();
 const html=nav?.isNativeMode?.()?nav.nativeGuidanceDetailsHTML?.(true):nav?.guidanceDetailsHTML?.(true);
 const rows=content.querySelector('[data-dash-route-detail-content]');
 if(rows&&typeof html==='string'&&html&&rows.innerHTML!==html){
  const top=content.scrollTop;
  rows.innerHTML=html;
  content.scrollTop=top;
 }
}
function toggleDetails(force){
 const panel=typeof document==='undefined'?null:document.getElementById?.('mg-nav-dashboard-split');
 if(!panel?.querySelector('.mg-dash-panel')||panel.querySelector('.mg-dash-panel').dataset.routeActive!=='true')return false;
 detailsExpanded=typeof force==='boolean'?force:!detailsExpanded;
 if(detailsExpanded)camerasExpanded=false;
 const shell=panel.querySelector('.mg-dash-panel');
 shell.dataset.camerasOpen=String(camerasExpanded);
 shell.dataset.detailsOpen=String(detailsExpanded);
 const button=panel.querySelector('[data-dash-action="details"]');
 if(button){
  button.setAttribute('aria-expanded',String(detailsExpanded));
  button.setAttribute('aria-pressed',String(detailsExpanded));
  button.setAttribute('aria-label',detailsExpanded?'Dashboard anzeigen':'Routendetails anzeigen');
  const caption=button.querySelector('span');
  if(caption)caption.textContent=detailsExpanded?'Dashboard':'Details';
 }
 if(detailsExpanded){paintDetails(panel);if(lastTripInfo){paintRouteRail(panel,lastTripInfo);paintTrafficSummary(panel,lastTripInfo);paintTrafficDiagnostic(panel,lastTripInfo);paintTrafficCheck(panel,lastTripInfo);}}else queueMetricFit(panel);
 return detailsExpanded;
}
/* Current-route camera details use the existing Road Assist matcher and
   Android bridge. This renderer never rescans or holds a second camera list. */
const cameraEscape=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function paintRoadAssist(container,metrics){
 const host=container||root.document?.getElementById?.('mg-nav-dashboard-split');
 if(!host?.querySelector)return;
 const panel=host.querySelector('.mg-dash-panel');
 const active=(metrics?.routeActive===true)||
  (metrics?.routeActive==null&&panel?.dataset?.routeActive==='true');
 const status=root.MeviRoadAssist?.navCameraView?.();
 if(!status)return;
 const tile=host.querySelector('.mg-dash-camera');
 const open=host.querySelector('.mg-dash-camera-open');
 const refresh=host.querySelector('.mg-dash-camera-refresh');
 const value=host.querySelector('[data-dash="camera"]');
 const detail=host.querySelector('[data-dash-camera-detail]');
 const format=root.MeviNavRouteDetails;
 const driven=Number.isFinite(metrics?.drivenMeters)?metrics.drivenMeters:
  Number.isFinite(lastTripInfo?.drivenMeters)?lastTripInfo.drivenMeters:null;
 let label=placeholder,detailText='',kind='status';
 if(active){
  if(cameraRescanBusy||status.state==='scanning'||status.state==='idle'){
   label='Scan läuft';detailText='Gemeldete Blitzer werden geprüft';kind='scanning';
  }else if(status.state==='error'){
   label='Scanfehler';detailText='Blitzerprüfung fehlgeschlagen';
  }else if(status.state==='unavailable'){
   label='Scan nicht bereit';detailText='Keine verlässlichen Blitzerdaten';
  }else if(status.state==='completed'){
   const next=status.hits.find(hit=>!hit.passed);
   if(!next){
    label=status.found?'Keine weiteren':'0 Treffer';kind='empty';
    detailText=status.found?'Kein weiterer gemeldeter Blitzer':'Keine Kameras gemeldet';
   }else{
    const fromSdk=Number.isFinite(metrics?.nextCameraMeters)?metrics.nextCameraMeters:
     Number.isFinite(lastTripInfo?.nextCameraMeters)?lastTripInfo.nextCameraMeters:null;
    const distance=fromSdk===null?Math.max(0,next.meters-(driven??0)):fromSdk;
    label=format?.distance(distance,'dashboard')||Math.round(distance)+' m';kind='distance';
    const type=String(next.label||'Blitzerkontrolle').slice(0,60);
    const speed=Number.isFinite(next.limit)&&next.limit>0?
     next.limit+' km/h':'Limit nicht gemeldet';
    detailText=type+' · '+speed;
   }
  }
 }
 const compact=!!host.querySelector('.mg-nav-dashboard.mg-dashboard-compact');
 const visibleLabel=compact?(label==='Scan läuft'?'Scan':
  label==='Scan nicht bereit'?'Kein Scan':
  label==='Keine weiteren'?'Keine mehr':label):label;
 if(value&&value.textContent!==visibleLabel)value.textContent=visibleLabel;
 // Full camera name/limit stay in the accessible button label. The compact
 // hint fits alongside the new altitude tile.
 const brief=compact?detailText
  .replace(/^Fester Blitzer\b/,'Fest').replace(/^Mobiler Blitzer\b/,'Mobil')
  .replace(/^Ampelblitzer\b/,'Ampel').replace(/^Blitzerkontrolle\b/,'Kontrolle')
  .replace('Gemeldete Blitzer werden geprüft','Prüfung läuft')
  .replace('Blitzerprüfung fehlgeschlagen','Prüfung fehlgeschlagen')
  .replace('Keine verlässlichen Blitzerdaten','Keine Blitzerdaten')
  .replace('Kein weiterer gemeldeter Blitzer','Kein weiterer')
  .replace('Keine Kameras gemeldet','Keine Treffer'):detailText;
 if(detail){
  if(detail.textContent!==brief)detail.textContent=brief;
  detail.title=detailText;
 }
 if(tile?.dataset){
  tile.dataset.cameraState=active?(cameraRescanBusy?'scanning':status.state):'idle';
  tile.dataset.cameraValueKind=kind;
 }
 if(open){
  open.disabled=!active;
  open.setAttribute?.('aria-expanded',String(camerasExpanded&&active));
  open.setAttribute?.('aria-label','Blitzer dieser Route anzeigen: '+label+
   (detailText?' · '+detailText:''));
 }
 if(refresh){
  refresh.disabled=!active||cameraRescanBusy||status.state==='scanning'||
   !status.connected||!status.enabled||!status.hasConfig;
  refresh.setAttribute?.('aria-busy',String(cameraRescanBusy));
  refresh.title=refresh.disabled?'Blitzerscan derzeit nicht verfügbar':'Blitzer auf dieser Route neu scannen';
 }
 if(!camerasExpanded||!active)return;
 const progress=status.total?status.progress+'/'+status.total+' Suchpunkte':'Scan wird vorbereitet';
 const stateText=status.state==='scanning'?'Scan läuft · '+progress+' · '+status.found+' Treffer bisher':
  status.state==='completed'?'Scan abgeschlossen · '+status.found+' Treffer':
  status.state==='unavailable'?'Blitzerprüfung nicht verfügbar':
  status.state==='error'?'Scan fehlgeschlagen':'Scan wird vorbereitet';
 const scanNote=host.querySelector('[data-camera-status]');
 if(scanNote)scanNote.textContent=stateText;
 const results=host.querySelector('[data-camera-hits]');
 if(!results)return;
 const items=status.hits.map(hit=>{
  const meters=driven===null?hit.meters:Math.max(0,hit.meters-driven);
  const distance=format?.distance(meters,'dashboard')||Math.round(meters)+' m';
  const where=hit.passed?'passiert':driven===null?'ab Start':'voraus';
  const title=hit.title||hit.label||'Blitzer';
  const subtitle=[hit.label!==title?hit.label:'',hit.city].filter(Boolean).join(' · ');
  const clickable=hit.mapId!=null&&!root.MeviGoogleNav?.isNativeMode?.();
  const action=clickable?' role="button" tabindex="0" style="cursor:pointer" title="Auf Karte anzeigen" data-camera-id="'+cameraEscape(hit.mapId)+'" onclick="MeviRoadAssist.focusCamera(this.dataset.cameraId)" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();this.click()}"':'';
  return '<li class="mg-dash-camera-hit'+(hit.passed?' is-passed':'')+'"'+action+'>'+
   '<span class="mg-dash-camera-limit">'+cameraEscape(hit.limit||'!')+'</span>'+
   '<span class="mg-dash-camera-location"><strong>'+cameraEscape(title)+'</strong><small>'+
   cameraEscape(subtitle)+'</small></span><span class="mg-dash-camera-range">'+
   cameraEscape(distance)+'<small>'+where+'</small></span></li>';
 }).join('');
 const markup=status.hits.length?'<ol class="mg-dash-camera-hits">'+items+'</ol>':
  '<p class="mg-dash-camera-empty">'+(status.state==='completed'?
   'Keine gemeldeten Blitzer auf dieser Route. Abdeckung nicht garantiert.':
   'Noch keine Blitzer für diese Route ermittelt.')+'</p>';
 if(results.innerHTML!==markup){
  const position=results.scrollTop;
  results.innerHTML=markup;
  results.scrollTop=position;
 }
}
/* Manual refresh calls the one existing route-scanner, with a lock to
   prevent overlapping native scan-point requests and Home Assistant scans. */
async function rescanCameras(){
 const host=root.document?.getElementById?.('mg-nav-dashboard-split');
 const panel=host?.querySelector?.('.mg-dash-panel');
 const status=root.MeviRoadAssist?.navCameraView?.();
 const scan=root.MeviRoadAssist?.scan;
 if(cameraRescanBusy||panel?.dataset?.routeActive!=='true'||
    !status?.connected||!status.enabled||!status.hasConfig||
    status.state==='scanning'||typeof scan!=='function')return false;
 cameraRescanBusy=true;
 paintRoadAssist(host,lastTripInfo);
 try{
  return await scan();
 }catch{
  return false;
 }finally{
  cameraRescanBusy=false;
  paintRoadAssist(host,lastTripInfo);
 }
}
function toggleCameras(force){
 const host=root.document?.getElementById?.('mg-nav-dashboard-split');
 const panel=host?.querySelector?.('.mg-dash-panel');
 if(!panel||panel.dataset?.routeActive!=='true')return false;
 camerasExpanded=typeof force==='boolean'?force:!camerasExpanded;
 if(camerasExpanded)detailsExpanded=false;
 panel.dataset.camerasOpen=String(camerasExpanded);
 panel.dataset.detailsOpen=String(detailsExpanded);
 const toggle=host.querySelector('[data-dash-action="details"]');
 if(toggle&&camerasExpanded){
  toggle.setAttribute('aria-expanded','false');
  toggle.setAttribute('aria-pressed','false');
  toggle.setAttribute('aria-label','Routendetails anzeigen');
  const label=toggle.querySelector('span');
  if(label)label.textContent='Details';
 }
 paintRoadAssist(host,lastTripInfo);
 return camerasExpanded;
}
/* Visual-only speeding warning. Android provides a fresh percentage above
   the current Navigation SDK speed limit; Web can use a chosen manual limit.
   No known limit = no red warning. */
function speedWarning(info,options){
 const speed=Number(info?.speedKmh),margin=Number(options?.tolerance);
 if(!Number.isFinite(speed)||speed<0||!Number.isFinite(margin))return null;
 const tolerance=Math.max(0,Math.min(20,margin));
 let excess=null,source=null;
 if(options?.manualLimit!==null&&options?.manualLimit!==undefined){
  const manual=Number(options.manualLimit);
  if(Number.isFinite(manual)&&manual>=10&&manual<=160){
   excess=speed-manual;source='manual';
  }
 }else{
  const percent=Number(info?.speedingPercent);
  if(Number.isFinite(percent)&&percent>0&&percent<=200){
   excess=speed*percent/(100+percent);source='native';
  }
 }
 if(excess===null||excess<=tolerance)return null;
 return {excessKmh:Math.max(1,Math.ceil(excess)),source};
}
function paintSpeedWarning(container,info){
 const tile=container.querySelector('.mg-dash-speed');
 if(!tile)return;
 const opts=root.MeviSpeedAlert?.get?.()||{tolerance:5,manualLimit:null};
 const warning=info?.routeActive===true?speedWarning(info,opts):null;
 if(tile.dataset)tile.dataset.overspeed=warning?'true':'false';
 const label=container.querySelector('[data-dash-speed-alert]');
 if(label){
  label.hidden=!warning;
  label.textContent=warning?'+'+warning.excessKmh+' km/h · zu schnell':'';
 }
 tile.setAttribute?.('aria-label',warning?
  'Geschwindigkeit: '+Math.round(info.speedKmh)+' km/h, '+Math.round(warning.excessKmh)+' km/h über dem Limit':
  'Geschwindigkeit');
}
// Clustering is purely a screen-space display operation; never alter the route
// positions or the underlying Road Assist results.
function railMarkerGroups(markers,height){
 const spacing=24/Math.max(24,height||160),groups=[];
 for(const m of [...markers].sort((a,b)=>a.position-b.position)){
  const last=groups[groups.length-1];
  if(last&&m.position-last.lastPosition<spacing){
   last.items.push(m);last.lastPosition=m.position;
  }else groups.push({items:[m],lastPosition:m.position});
 }
 return groups.map(g=>({
  position:g.items.reduce((sum,m)=>sum+m.position,0)/g.items.length,
  kind:g.items.every(m=>m.kind===g.items[0].kind)?g.items[0].kind:'mixed',
  label:g.items.map(m=>m.label|| (m.kind==='stop'?'Zwischenstopp':'Blitzer')).join(' · '),
  count:g.items.length
 }));
}
const railObservers=new WeakMap();
function routeRailHTML(rail,height,remainingMeters,compact=false){
 if(!rail||!Array.isArray(rail.sections)||!Array.isArray(rail.markers))return '';
 const esc=root.MeviNavigationShared?.escapeHtml;
 if(!esc)return '';
 const planned=rail.scope==='calculated-route';
 const meters=planned?rail.distanceMeters:remainingMeters;
 const pos=v=>Number.isFinite(v)&&v>=0&&v<=1;
 const pct=v=>(100*v).toFixed(2)+'%';
 const sections=rail.sections.filter(s=>pos(s.start)&&pos(s.end)&&s.end>s.start&&['NORMAL','SLOW','TRAFFIC_JAM'].includes(s.speed));
 const markers=rail.markers.filter(m=>pos(m.position)&&['stop','camera'].includes(m.kind));
 const {valid,disruptions}=trafficCoverage(rail);
 // Label the first three known impediments only if the rail can accommodate
 // them. The full ordered list remains available in the scrollable details.
 const labels=[];const separation=24/Math.max(24,height);
 if(valid&&Number.isFinite(meters)&&meters>0)for(const item of disruptions.slice(0,compact?2:3)){
  const position=Math.max(.015,Math.min(.985,item.start));
  if(labels.some(x=>Math.abs(x.position-position)<separation))continue;
  labels.push({...item,position,label:trafficDistance(item.start*meters)});
 }
 return '<span class="mg-rail-end" title="'+esc(rail.destination)+'" aria-label="'+esc(rail.destination)+'">⚑</span>'+
  (Number.isFinite(meters)&&meters>=0?'<span class="mg-rail-caption">'+esc(root.MeviNavRouteDetails?.distance?.(meters,'compact')||Math.round(meters)+' m')+'</span>':'')+
  '<div class="mg-rail-track'+(labels.length?' mg-rail-has-traffic-labels':'')+'" aria-label="Verkehrsabschnitte">'+sections.map(s=>
   '<span class="mg-rail-section" data-speed="'+s.speed+'" style="bottom:'+pct(s.start)+';height:'+pct(s.end-s.start)+'" title="'+({NORMAL:'Freie Fahrt',SLOW:'Zähfließend',TRAFFIC_JAM:'Stau'})[s.speed]+'"></span>').join('')+
   railMarkerGroups(markers,height).map(m=>{
    const label=(m.count>1?m.count+' Markierungen: ':'')+m.label;
    return '<span class="mg-rail-marker" data-kind="'+m.kind+'" data-count="'+m.count+'" style="bottom:'+pct(m.position)+'" title="'+esc(label)+'" aria-label="'+esc(label)+'">'+(m.count>1?(m.count>99?'99+':m.count):m.kind==='stop'?'◆':'!')+'</span>';
   }).join('')+
   labels.map(item=>'<span class="mg-rail-traffic-label" data-speed="'+item.speed+'" style="bottom:'+pct(item.position)+'" title="'+esc((planned?'Ab Routenstart ca. ':'Ab aktueller Position ca. ')+item.label)+'">'+esc(item.label)+'</span>').join('')+
   '</div><span class="mg-rail-start" title="'+(planned?'Start der berechneten Route':'Position auf der Route')+'">'+(planned?'○':'●')+'</span>'+
   '<span class="mg-rail-caption">'+(planned?'Planung':sections.length?'Verkehr':'Verkehr –')+'</span>';
}
function paintRouteRail(container,info){
 const node=container.querySelector('[data-dash-route-rail]');
 if(!node)return;
 const update=()=>{
  const height=node.querySelector?.('.mg-rail-track')?.clientHeight||
   Math.max(24,(node.clientHeight||205)-45);
  const rail=info.routeRail||(Number.isFinite(info.remainingMeters)&&info.remainingMeters>0?{destination:'Ziel',sections:[],markers:[]}:null);
  const compact=Number.isFinite(container.clientWidth)&&container.clientWidth>0&&container.clientWidth<=420||root.innerHeight>0&&root.innerHeight<=480;
  const markup=info.routeActive===true?routeRailHTML(rail,height,info.remainingMeters,compact):'';
  node.hidden=!markup;
  if(node.innerHTML!==markup)node.innerHTML=markup;
 };
 if(!railObservers.has(node)&&typeof root.ResizeObserver==='function'){
  const observer=new root.ResizeObserver(()=>{
   if(lastTripInfo)paintRouteRail(container,lastTripInfo);
  });
  observer.observe(node);railObservers.set(node,observer);
 }
 update();
}
// Reuse the one normalized traffic snapshot and remaining-route rail. Distances
// derived from normalized fractions are explicitly approximate; uncovered
// intervals remain unknown, never green. No new requests from the renderer.
function trafficCoverage(rail){
 const items=Array.isArray(rail?.sections)?rail.sections:[];
 const totals={NORMAL:0,SLOW:0,TRAFFIC_JAM:0},disruptions=[];let cursor=0,valid=true,jams=0;
 for(const s of [...items].sort((a,b)=>a.start-b.start)){
  if(!Object.hasOwn(totals,s.speed)||!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.start<cursor||s.end<=s.start||s.end>1){valid=false;break}
  totals[s.speed]+=s.end-s.start;cursor=s.end;if(s.speed==='TRAFFIC_JAM')jams++;
  if(s.speed!=='NORMAL'){
   const previous=disruptions.at(-1);
   if(previous?.speed===s.speed&&Math.abs(previous.end-s.start)<1e-9)previous.end=s.end;
   else disruptions.push({speed:s.speed,start:s.start,end:s.end});
  }
 }
 const coverage=valid?Math.min(1,totals.NORMAL+totals.SLOW+totals.TRAFFIC_JAM):0;
 return {totals,coverage,valid,jams,disruptions:valid?disruptions:[]};
}
function trafficDistance(m){
 return Number.isFinite(m)&&m>=0?(root.MeviNavRouteDetails?.distance?.(m,'compact')||Math.round(m)+' m'):'–';
}
function trafficSummaryHTML(info){
 const shared=root.MeviNavigationShared,format=root.MeviNavRouteDetails;
 const esc=shared?.escapeHtml||cameraEscape;
 const snapshot=shared?.trafficSnapshot?.(info.traffic);
 const dist=trafficDistance;
 const time=Number.isFinite(info.arrivalEpochMs)&&info.arrivalEpochMs>0?format?.clock?.(info.arrivalEpochMs,false)||'–':'–';
 const duration=Number.isFinite(info.remainingSeconds)&&info.remainingSeconds>=0?(format?.duration?.(info.remainingSeconds,'ceil')||Math.ceil(info.remainingSeconds/60)+' min'):'–';
 let status=({heavy:'Stau',slow:'Zähfließend',normal:info.trafficDiagnostic?.provider==='android-sdk'?'SDK-Verkehrsstufe gering':'Verkehr frei'})[snapshot?.status]||'Keine aktuellen Verkehrsdaten';
 let tone=snapshot?.status||'unknown';
 const delay=Number.isFinite(snapshot?.delaySeconds)?'+'+Math.ceil(snapshot.delaySeconds/60)+' min':'–';
 const next=snapshot?.inJam?'Im Stau':dist(snapshot?.nextJamMeters);
 const length=dist(snapshot?.jamLengthMeters);
 const tile=(label,value,kind='')=>'<div class="mg-traffic-summary-tile" data-metric="'+kind+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>';
 const {totals,coverage,valid,jams,disruptions}=trafficCoverage(info.routeRail);

 const planned=info.routeRail?.scope==='calculated-route';
 const meters=planned?info.routeRail.distanceMeters:info.remainingMeters;
 let moreContent='';
 let jamContent='<div class="mg-traffic-summary-grid">'+tile('Nächster Stau',next)+tile('Staulänge',length)+'</div>';
 if(planned){
  // Plan geometry is fresh provider evidence, not live vehicle progress.
  tone=jams>0&&valid?'heavy':valid&&totals.SLOW>0?'slow':valid&&coverage>=1-1e-9?'normal':'unknown';
  status=({heavy:'Planungsdaten: Stau',slow:'Planungsdaten: zähfließender Verkehr',normal:'Planungsdaten: freie Fahrt'})[tone]||'Planungsdaten: Verkehr unbekannt';
  jamContent='<small>'+esc(valid&&coverage>=1-1e-9?'Keine Verkehrsbehinderung auf der berechneten Route gemeldet.':'Keine bestätigten Verkehrsbehinderungen; Teile der Strecke sind unbekannt.')+'</small>';
 }
 if(disruptions.length&&Number.isFinite(meters)&&meters>0){
  const name=s=>s==='TRAFFIC_JAM'?'Stau':'Zähfließender Verkehr';
  const distance=item=>!planned&&item.start===0?'Aktuell':(planned?'Ab Start ca. ':'In ca. ')+dist(item.start*meters);
  const distancePrefix=item=>!planned&&item.start===0?'':planned?'Ab Start ca.':'In ca.';
  const distanceValue=item=>!planned&&item.start===0?'Aktuell':dist(item.start*meters);
  const first=disruptions[0];
  tone=first.speed==='TRAFFIC_JAM'?'heavy':'slow';
  // The section list is ordered by route position, not by severity.
  status=(planned?'Erste gemeldete Verkehrsbehinderung':'Nächste gemeldete Verkehrsbehinderung');
  jamContent='<div class="mg-traffic-next" data-speed="'+first.speed+'" aria-label="'+esc(distance(first))+'">'+
   '<div class="mg-traffic-next-distance"><small>'+esc(distancePrefix(first))+'</small><strong>'+esc(distanceValue(first))+'</strong></div>'+
   '<div class="mg-traffic-next-meta"><span>'+esc(name(first.speed))+'</span><small>Länge ca. '+esc(dist((first.end-first.start)*meters))+'</small></div></div>';
  moreContent=(disruptions.length>1?'<div class="mg-traffic-more"><span>Weitere Verkehrsbehinderungen ('+(disruptions.length-1)+')</span><div>'+
    disruptions.slice(1,31).map(item=>'<div class="mg-traffic-more-row" data-speed="'+item.speed+'" aria-label="'+esc(name(item.speed)+' · '+distance(item)+' · Länge ca. '+dist((item.end-item.start)*meters))+'"><span>'+esc(item.speed==='TRAFFIC_JAM'?'Stau':'Zähfließend')+'</span><strong>'+esc(distanceValue(item))+'</strong><small>'+esc(dist((item.end-item.start)*meters))+'</small></div>').join('')+
    (disruptions.length>31?'<small>'+ (disruptions.length-31)+' weitere Abschnitte auf der Routenleiste</small>':'')+'</div></div>':'');
  jamContent+=(coverage<1-1e-9?'<small>Nicht erfasste Bereiche können weitere Behinderungen enthalten.</small>':'')+
   (planned&&jams===0&&coverage>=1-1e-9?'<small>Kein Stau auf der berechneten Route gemeldet.</small>':'');
 }
 const breakdown=valid&&Number.isFinite(meters)&&meters>0&&coverage>0?
  '<details class="mg-traffic-breakdown-details" data-traffic-breakdown><summary>Streckenübersicht</summary><div class="mg-traffic-breakdown"><span>'+(planned?'Berechnete Gesamtstrecke':'Reststrecke')+' · ca.</span>'+
  [['NORMAL','Freie Fahrt',totals.NORMAL],['SLOW','Zähfließend',totals.SLOW],['TRAFFIC_JAM','Stau',totals.TRAFFIC_JAM],['UNKNOWN','Unbekannt',Math.max(0,1-coverage)]].map(([speed,label,f])=>
   '<div><i data-speed="'+speed+'"></i><span>'+label+'</span><strong>'+esc(dist(meters*f))+'</strong></div>').join('')+'</div>'+
   '<small class="mg-traffic-breakdown-count">'+jams+(jams===1?' erkannter Stauabschnitt':' erkannte Stauabschnitte')+'</small></details>':'';
 const stamp=info.trafficDiagnostic?info.trafficDiagnostic.observedAt:snapshot?.status!=='unknown'?snapshot?.observedAt:null;
 const age=Number.isFinite(stamp)&&stamp<=Date.now()?Math.floor((Date.now()-stamp)/1000):null;
 const heading=disruptions.length&&Number.isFinite(meters)&&meters>0?(planned?'Erste Behinderung':'Nächste Behinderung'):status;
 return '<div class="mg-traffic-summary-grid mg-traffic-kpis">'+tile('Restzeit',duration,'time')+tile('Ankunft',time,'arrival')+
  tile('Mehrzeit bei Berechnung',delay,'delay')+tile('Reststrecke',dist(info.remainingMeters),'distance')+'</div>'+
  '<div class="mg-traffic-jam-summary" data-status="'+esc(tone)+'"><strong aria-label="'+esc(status)+'">'+esc(heading)+'</strong>'+
  jamContent+'</div>'+
  moreContent+breakdown+
  '<small>'+ (age===null?'Verkehrsalter unbekannt':'Datenstand vor '+(age<60?age+' s':Math.floor(age/60)+' min'))+'</small>'+
  (planned?'<small>Routenplanung: Balken zeigt die berechnete Gesamtstrecke, nicht den Live-Fortschritt.</small>':'')+
  (coverage===0?'<small>'+(info.routeRail?'Keine farbigen Streckenabschnitte verfügbar.':'Streckenpositionen noch nicht verfügbar.')+' Graue Routenleiste: Verkehr unbekannt.</small>':'');
}
function paintTrafficSummary(container,info){
 const node=container.querySelector('[data-dash-traffic-summary]');if(!node)return;
 const markup=info.routeActive===true?trafficSummaryHTML(info):'';
 if(node.innerHTML!==markup){
  // Keep the secondary disclosure open during GPS/clock refreshes.
  const open=node.querySelector?.('[data-traffic-breakdown]')?.open===true;
  node.innerHTML=markup;
  const breakdown=node.querySelector?.('[data-traffic-breakdown]');
  if(breakdown&&open)breakdown.open=true;
 }
}
function trafficDiagnosticHTML(info,now=Date.now()){
 const diag=info.trafficDiagnostic,check=info.trafficCheck;
 if(!diag)return '';
 const esc=root.MeviNavigationShared?.escapeHtml||cameraEscape;
 const row=(label,value)=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>';
 const age=Number.isFinite(diag.observedAt)&&diag.observedAt<=now?Math.floor((now-diag.observedAt)/1000):null;
 const {coverage,valid}=trafficCoverage(info.routeRail);
 const pct=valid?Math.round(coverage*100):0;
 const geometry=diag.geometry==='full'?'Gesamte Reststrecke':diag.geometry==='calculated'?'Berechnete Gesamtstrecke':diag.geometry==='current-leg'?'Nur aktuelle Etappe':'Nicht verfügbar';
 const source=diag.provider==='android-sdk'?'Google Navigation SDK (Android)':'Google Routes API (Web)';
 let html=row('Datenquelle',source)+row('Geometrie',geometry)+
  row('Verkehrsdatenstand',age===null?'Unbekannt':age+' s'+(age>300?' · veraltet':''))+
  row('Farbige Abdeckung',pct+' % · '+(100-pct)+' % unbekannt')+
  row('Hinweis',diag.reason||'–');
 if(diag.provider==='web-routes'&&Number.isSafeInteger(diag.providerSections)){
  const states={missing:'Google liefert keine SpeedPaths',invalid:'SpeedPaths passen nicht zur Routen-Geometrie',stale:'Abschnitte vorhanden, aber veraltet',valid:'Abschnitte gültig'};
  const gps={demo:'Demo',planning:'Planungsmodus',matched:'Position zugeordnet',missing:'Keine zuverlässige Zuordnung'};
  html+=row('GPS-Zuordnung',gps[diag.gpsPosition]||'Unbekannt')+
   row('Google SpeedPaths',String(diag.providerSections))+
   row('Validierte Abschnitte',String(diag.validatedSections))+
   row('Abschnittsprüfung',states[diag.sectionState]||'Unbekannt');
 }
 if(diag.revision!=null)html+=row('Routenrevision',String(diag.revision));
 if(Array.isArray(diag.legStates)&&diag.legStates.length){
  const label={known:'Gemeldete Abschnitte',unknown:'Keine farbigen Abschnitte',stale:'Veraltet / kein Ereignis',unavailable:'Nicht verfügbar',invalid:'Ungültige Abschnittsdaten'};
  diag.legStates.forEach((state,i)=>{html+=row('Etappe '+(i+1),label[state]||'Unbekannt')});
 }
 if(diag.provider==='android-sdk')return html+row('Routenprüfung','Google SDK steuert Verkehr und Umleitungen. Keine zusätzlichen MeviCar-Routes-Anfragen.');
 html+=row('Automatik',diag.auto===true?(diag.autoEligible?'Ein · bereit':'Ein · wartet'):'Aus');
 if(check){
  html+=row('Prüfversuche dieser Fahrt',check.attempts+' / '+check.limit)+
   row('Prüfung',check.blocked||'Bereit')+
   row('Nächster Versuch',check.waitSeconds>0?check.waitSeconds+' s Mindestwartezeit':'Kein Zeitlimit aktiv')+
   row('Letzter Versuch',Number.isFinite(check.lastAttemptAt)&&check.lastAttemptAt<=now?Math.floor((now-check.lastAttemptAt)/1000)+' s zuvor':'Noch keiner')+
   row('Letztes Ergebnis',check.message||'–');
  if(Number.isFinite(check.offerExpiresAt))html+=row('Angebot gültig',Math.max(0,Math.ceil((check.offerExpiresAt-now)/1000))+' s');
 }else html+=row('Routenprüfung','Nur während aktiver Live-Führung.');
 return html;
}
function paintTrafficDiagnostic(container,info){
 const host=container.querySelector('[data-traffic-diagnostics]');if(!host)return;
 host.hidden=info.routeActive!==true||!info.trafficDiagnostic;
 const node=host.querySelector('[data-traffic-diagnostics-content]');
 if(!node||host.hidden)return;
 const markup=trafficDiagnosticHTML(info);
 if(node.innerHTML!==markup)node.innerHTML=markup;
}
function paintTrafficCheck(container,info){
 const host=container.querySelector('[data-traffic-check]');if(!host)return;
 const view=info.routeActive===true?info.trafficCheck:null;
 host.hidden=!view;if(!view)return;
 const start=host.querySelector('[data-traffic-check-start]'),message=host.querySelector('[data-traffic-check-message]'),
  standard=host.querySelector('[data-traffic-check-standard]'),alt=host.querySelector('[data-traffic-check-alt]');
 if(start)start.disabled=!view.enabled;
 if(message){
  const text=!view.enabled&&view.blocked&&!view.offer?view.blocked:(view.message==='Route und Alternativen prüfen'&&view.enabled?'':view.message||'');
  message.textContent=text;message.hidden=!text;
 }
 if(standard){standard.hidden=!view.offer;standard.textContent=view.offer?'Neue Google-Route · '+Math.ceil(view.offer.seconds/60)+' min':'';if(standard.dataset)standard.dataset.offerId=view.offer?.id||''}
 if(alt){alt.hidden=!view.offer?.alternativeSeconds;alt.textContent=view.offer?.alternativeSeconds?'Alternative · '+Math.ceil(view.offer.alternativeSeconds/60)+' min · −'+Math.floor(view.offer.savingSeconds/60)+' min':'';if(alt.dataset)alt.dataset.offerId=view.offer?.id||''}
}
function paintTraffic(container,info){
 const node=container.querySelector('[data-dash-traffic]');
 if(!node)return;
 const snapshot=info.routeActive===true?root.MeviNavigationShared?.trafficSnapshot?.(info.traffic):null;
 const delay=snapshot?.delaySeconds,status=snapshot?.status;
 const label=status==='heavy'?'Stau':status==='slow'?'Zähfließend':status==='normal'?'Verkehr frei':'';
 const extra=Number.isFinite(delay)&&delay>=60?'+'+Math.ceil(delay/60)+' min':'';
 // Delays from the Web response refer to the whole calculated route, not the remaining journey.
 const distance=root.MeviNavRouteDetails?.distance;
 const jam=Number.isFinite(snapshot?.nextJamMeters)&&distance?
  (snapshot.inJam?'Im Stau':'Stau in '+distance(snapshot.nextJamMeters,'compact')):'';
 const text=jam||(extra?[extra,'bei Berechnung'].join(' '):label&&status!=='normal'?label:'');
 node.hidden=!text;node.textContent=text;
 node.dataset.trafficStatus=status||'unknown';
 node.title=[jam, jam&&Number.isFinite(snapshot?.jamLengthMeters)&&distance?'Stauabschnitt: ca. '+distance(snapshot.jamLengthMeters,'compact'):'',
 extra?'Mehrzeit bei letzter Routenberechnung (Schätzung): '+extra:''].filter(Boolean).join(' · ')||label;
 node.setAttribute?.('aria-label',node.title||text);
}
function paint(container,data){
 if(!container?.querySelector)return;
 const info=data||{},format=root.MeviNavRouteDetails;
 lastTripInfo=info;
 const panel=container.querySelector('.mg-dash-panel');
 if(panel?.dataset){
  panel.dataset.routeActive=info.routeActive===true?'true':'false';
  if(info.routeActive!==true){detailsExpanded=false;camerasExpanded=false}
  panel.dataset.detailsOpen=String(detailsExpanded&&info.routeActive===true);
  panel.dataset.camerasOpen=String(camerasExpanded&&info.routeActive===true);
 }
 const toggle=container.querySelector('[data-dash-action="details"]');
 if(toggle){
  const expanded=detailsExpanded&&info.routeActive===true;
  toggle.setAttribute('aria-expanded',String(expanded));
  toggle.setAttribute('aria-pressed',String(expanded));
  toggle.setAttribute('aria-label',expanded?'Dashboard anzeigen':'Routendetails anzeigen');
  const caption=toggle.querySelector('span');
  if(caption&&caption.textContent!==(expanded?'Dashboard':'Details'))caption.textContent=expanded?'Dashboard':'Details';
 }
 if(info.routeActive!==true){
  refreshQuick(container);
  startIdleGps();
  paintIdleSpeed(container);
 }else stopIdleGps();
 // One Spotify source, two mutually exclusive slots in the shared split:
 // idle player below GPS, guided player in the route grid.
 root.MeviSpotify?.navPoll?.();
 const spotifyHost=container.querySelector(
  info.routeActive===true?'.mg-dash-spotify':'.mg-dash-idle-spotify');
 root.MeviNavTrip?.paintSpotify?.(spotifyHost||container,root.MeviSpotify?.navState?.());
 const valid=value=>Number.isFinite(value)&&value>=0;
 const time=format?.dashboardDuration?.(info.remainingSeconds)||{value:placeholder,unit:''};
 const timeUnit=container.querySelector('[data-dash-time-unit]');
 if(timeUnit){timeUnit.textContent=time.unit;timeUnit.hidden=!time.unit;}
 const values={
  speed:rounded(info.speedKmh),
  arrival:Number.isFinite(info.arrivalEpochMs)&&info.arrivalEpochMs>0?
   format?.clock(info.arrivalEpochMs,false)||placeholder:placeholder,
  time:time.value,
  distance:valid(info.remainingMeters)?format?.distance(info.remainingMeters,'dashboard')||placeholder:placeholder,
  driven:valid(info.drivenMeters)?
   new Intl.NumberFormat('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}).format(info.drivenMeters/1000)+' km':placeholder,
  progress:valid(info.drivenMeters)&&valid(info.remainingMeters)&&info.drivenMeters+info.remainingMeters>0?
   Math.min(100,Math.max(0,Math.round(100*info.drivenMeters/
    (info.drivenMeters+info.remainingMeters))))+' %':placeholder,
  camera:valid(info.nextCameraMeters)?format?.distance(info.nextCameraMeters,'dashboard')||placeholder:placeholder,
  altitude:Number.isFinite(info.altitudeMeters)&&info.altitudeMeters>-500&&info.altitudeMeters<9000?
   new Intl.NumberFormat('de-DE',{maximumFractionDigits:0}).format(info.altitudeMeters):placeholder
 };
 for(const [key,value] of Object.entries(values)){
  const element=container.querySelector('[data-dash="'+key+'"]');
  if(element&&element.textContent!==value)element.textContent=value;
 }
 paintRoadAssist(container,info);
 paintSpeedWarning(container,info);
 paintTraffic(container,info);
 for(const button of container.querySelectorAll?.('[data-dash-traffic-open]')||[])button.disabled=info.routeActive!==true;
 if(detailsExpanded){paintTrafficSummary(container,info);paintTrafficDiagnostic(container,info);}
 paintRouteRail(container,info);
 paintTrafficCheck(container,info);
 queueMetricFit(container);
 if(info.routeActive===true&&detailsExpanded)paintDetails(container);
}
root.MeviNavDashboard={html,panel,paint,paintSpeedWarning,speedWarning,paintRoadAssist,rescanCameras,toggleCameras,refreshQuick,stopIdleGps,toggleDetails,detailsOpen,paintDetails};
})(window);
