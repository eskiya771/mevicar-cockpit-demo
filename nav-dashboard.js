/* One dashboard renderer shared by browser navigation and the Android SDK panel.
   Platform adapters only provide numbers; no route calculation or second UI. */
(function(root){
'use strict';
const placeholder='–';
const rounded=value=>Number.isFinite(value)&&value>=0?String(Math.round(value)):placeholder;
/* Formatting and average speed come exclusively from nav-route-details.js.
   The standalone Android dashboard loads that same module before this renderer. */
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
function paint(container,data){
 if(!container?.querySelector)return;
 const info=data||{},format=root.MeviNavRouteDetails;
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
root.MeviNavDashboard={html,paint};
})(window);
