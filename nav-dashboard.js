/* One dashboard renderer shared by the browser and the Android WebView split.
   It is the only place for clock, build, update, search, address book and the
   full-map button; the navigation main page has no title bar of its own.
   Platform adapters only provide numbers; no route calculation or second UI. */
(function(root){
'use strict';
const placeholder='–';
const rounded=value=>Number.isFinite(value)&&value>=0?String(Math.round(value)):placeholder;
let detailsExpanded=false,camerasExpanded=false,lastTripInfo=null,cameraRescanBusy=false;

 // Fit metrics in the shared Web/APK renderer, preserving long duration labels.
 let metricContext=null;
 const metricObservers=new WeakMap();
 function fitMetricText(grid){
  if(!grid?.querySelectorAll||!root.getComputedStyle||!root.document?.createElement)return;
  if(!metricContext)metricContext=root.document.createElement('canvas').getContext?.('2d');
  if(!metricContext)return;
  for(const element of grid.querySelectorAll('[data-dash]')){
   const cell=element.closest?.('.mg-dash-cell');
   if(!cell||cell.clientWidth<=0||cell.clientHeight<=0)continue;
   const cellCss=root.getComputedStyle(cell);
   const innerWidth=cell.clientWidth-parseFloat(cellCss.paddingLeft||0)-parseFloat(cellCss.paddingRight||0)-4;
   const innerHeight=cell.clientHeight-parseFloat(cellCss.paddingTop||0)-parseFloat(cellCss.paddingBottom||0)-2;
   const speed=cell.classList.contains('mg-dash-speed');
   const label=cell.querySelector('.mg-dash-label');
   const unit=element.parentElement?.querySelector('small');
   const hint=cell.querySelector('.mg-dash-camera-hint, .mg-dash-speed-alert:not([hidden])');
   // Compact speed moved into its own normal-sized tile, with the label above
   // the number. Deduct label width only for the noncompact horizontal layout.
   const speedInline=speed&&root.getComputedStyle(cell).flexDirection==='row';
   const width=innerWidth-(speedInline?(label?.offsetWidth||0)+10:0)-(unit?unit.offsetWidth+6:0);
   const height=speedInline?innerHeight:innerHeight-(label?.offsetHeight||0)-(hint?.offsetHeight||0)-6;
   if(width<10||height<10)continue;
   // The two camera/altitude tiles use their own widths. Fit camera values
   // to the real inner button rather than letting generic metric auto-fit
   // expand into a clipped number.
   const camera=cell.classList.contains('mg-dash-camera');
   const cameraButton=camera?cell.querySelector('.mg-dash-camera-open'):null;
   const buttonStyle=cameraButton?root.getComputedStyle(cameraButton):null;
   const buttonWidth=cameraButton?cameraButton.clientWidth-
    parseFloat(buttonStyle?.paddingLeft||0)-parseFloat(buttonStyle?.paddingRight||0)-4:width;
   const kind=cell.dataset?.cameraValueKind||'distance';
   const cameraLimit=kind==='empty'?27:kind==='scanning'?32:kind==='status'?25:31;
   const ceiling=camera?Math.max(12,Math.min(cameraLimit,height*.94)):
    Math.max(12,Math.min(speed?120:65,height*(speed?.86:.94)));
   const fittingWidth=camera&&buttonWidth>10?buttonWidth:width;
   const style=root.getComputedStyle(element);
   metricContext.font=`${style.fontWeight||'800'} ${ceiling}px ${style.fontFamily||'sans-serif'}`;
   const measured=metricContext.measureText(element.textContent||'–').width;
   const size=Math.max(camera?12:10,Math.floor(Math.min(
    ceiling,ceiling*fittingWidth/Math.max(measured*(camera?1.1:1.04),1))*10)/10);
   const target=`${size}px`;
   if(element.style.fontSize!==target)element.style.setProperty('font-size',target,'important');
  }
 }
 function queueMetricFit(container){
  const grid=container?.querySelector?.('.mg-nav-dashboard.mg-dashboard-compact');
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
  <div class="mg-dash-cell mg-dash-arrival"><span class="mg-dash-label">Ankunft</span><strong data-dash="arrival">${placeholder}</strong></div>
  <div class="mg-dash-cell mg-dash-time"><span class="mg-dash-label">Restzeit</span><strong data-dash="time">${placeholder}</strong></div>
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
   <div class="mg-dash-route-details-heading">Routendetails</div>
   <div id="mg-dash-route-detail-scroll" class="mg-dash-route-detail-scroll" role="region" aria-label="Routendetails, scrollbar" tabindex="0">
    <p class="mg-dash-detail-pending">Routendetails werden geladen …</p>
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
 const html=nav?.isNativeMode?.()?nav.nativeGuidanceDetailsHTML?.():nav?.guidanceDetailsHTML?.();
 if(typeof html==='string'&&html&&content.innerHTML!==html){
  const top=content.scrollTop;
  content.innerHTML=html;
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
 if(detailsExpanded)paintDetails(panel);
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
  return '<li class="mg-dash-camera-hit'+(hit.passed?' is-passed':'')+'">'+
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
 const values={
  speed:rounded(info.speedKmh),
  arrival:Number.isFinite(info.arrivalEpochMs)&&info.arrivalEpochMs>0?
   format?.clock(info.arrivalEpochMs,false)||placeholder:placeholder,
  time:valid(info.remainingSeconds)?format?.duration(info.remainingSeconds,'ceil')||placeholder:placeholder,
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
 queueMetricFit(container);
 if(info.routeActive===true&&detailsExpanded)paintDetails(container);
}
root.MeviNavDashboard={html,panel,paint,paintSpeedWarning,speedWarning,paintRoadAssist,rescanCameras,toggleCameras,refreshQuick,stopIdleGps,toggleDetails,detailsOpen,paintDetails};
})(window);
