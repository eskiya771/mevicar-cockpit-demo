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
 full:'M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z'
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
  </div>
  ${html(true)}
  <section class="mg-dash-quick" aria-label="Gespeicherte Orte" data-dash-quick>
   <div class="mg-dash-quick-heading">
    <strong>Orte</strong>
    <span class="mg-dash-quick-hint" aria-hidden="true">Wischen ›</span>
   </div>
   <div class="mg-dash-quick-rail" data-dash-quick-rail role="group" aria-label="Schnellziele"></div>
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
function paint(container,data){
 if(!container?.querySelector)return;
 const info=data||{},format=root.MeviNavRouteDetails;
 const panel=container.querySelector('.mg-dash-panel');
 if(panel?.dataset)panel.dataset.routeActive=info.routeActive===true?'true':'false';
 if(info.routeActive!==true)refreshQuick(container);
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
root.MeviNavDashboard={html,panel,paint,refreshQuick};
})(window);
