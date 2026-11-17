/* One dashboard renderer shared by browser navigation and the Android SDK panel.
   Platform adapters only provide numbers; no route calculation or second UI. */
(function(root){
'use strict';
const placeholder='–';
const rounded=value=>Number.isFinite(value)&&value>=0?String(Math.round(value)):placeholder;
const clock=value=>Number.isFinite(value)&&value>0?
 new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit'}).format(new Date(value)):placeholder;
function distance(value){
 if(!Number.isFinite(value)||value<0)return placeholder;
 if(value<1000)return Math.round(value)+' m';
 return (value/1000).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})+' km';
}
function duration(value){
 if(!Number.isFinite(value)||value<0)return placeholder;
 const minutes=Math.ceil(value/60);
 if(minutes<60)return minutes+' Min.';
 const hours=Math.floor(minutes/60),rest=minutes%60;
 return hours+' Std.'+(rest?' '+rest+' Min.':'');
}
function html(compact=false){
 return `<section class="mg-nav-dashboard${compact?' mg-dashboard-compact':''}" role="group" aria-label="Fahrtdashboard">
  <div class="mg-dash-cell mg-dash-speed"><span class="mg-dash-label">Geschwindigkeit</span>
   <div class="mg-dash-value"><strong data-dash="speed">${placeholder}</strong><small>km/h</small></div></div>
  <div class="mg-dash-cell mg-dash-arrival"><span class="mg-dash-label">Ankunft</span><strong data-dash="arrival">${placeholder}</strong></div>
  <div class="mg-dash-cell mg-dash-time"><span class="mg-dash-label">Restzeit</span><strong data-dash="time">${placeholder}</strong></div>
  <div class="mg-dash-cell mg-dash-distance"><span class="mg-dash-label">Reststrecke</span><strong data-dash="distance">${placeholder}</strong></div>
  <div class="mg-dash-cell mg-dash-average"><span class="mg-dash-label">Ø Geschwindigkeit</span>
   <div class="mg-dash-value"><strong data-dash="average">${placeholder}</strong><small>km/h</small></div></div>
  <div class="mg-dash-cell mg-dash-maneuver"><span class="mg-dash-label">Nächste Fahranweisung</span><strong data-dash="maneuver">${placeholder}</strong></div>
  <div class="mg-dash-cell mg-dash-maximum"><span class="mg-dash-label">Höchstgeschwindigkeit</span>
   <div class="mg-dash-value"><strong data-dash="maximum">${placeholder}</strong><small>km/h</small></div></div>
 </section>`;
}
function paint(container,data){
 if(!container?.querySelector)return;
 const info=data||{};
 const values={
  speed:rounded(info.speedKmh),
  arrival:clock(info.arrivalEpochMs),
  time:duration(info.remainingSeconds),
  distance:distance(info.remainingMeters),
  average:rounded(info.avgKmh),
  maximum:rounded(info.maxKmh),
  maneuver:typeof info.maneuverText==='string'&&info.maneuverText.trim()?
   info.maneuverText.trim()+
    (Number.isFinite(info.maneuverMeters)&&info.maneuverMeters>=0?' · in '+distance(info.maneuverMeters):'')
   :placeholder
 };
 for(const [key,value] of Object.entries(values)){
  const element=container.querySelector('[data-dash="'+key+'"]');
  if(element&&element.textContent!==value)element.textContent=value;
 }
}
root.MeviNavDashboard={html,paint};
})(window);
