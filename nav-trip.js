/* One lightweight trip-strip renderer for the Web cockpit and Android SDK host.
 * Platform engines provide raw trip values (seconds, metres); the texts come
 * from MeviNavRouteDetails. No second native layout, no second formatter. */
(function(root){
 'use strict';
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const label=(value,max=140)=>String(value??'').trim().slice(0,max);
 function normalize(input){
  const trip=input&&typeof input==='object'?input:{};
  const d=root.MeviNavRouteDetails,num=v=>typeof v==='number'&&Number.isFinite(v);
  if(d&&num(trip.seconds)&&num(trip.meters)){
   const stop=trip.nextStop,leg=stop&&typeof stop==='object'&&num(stop.seconds)&&num(stop.meters);
   return {arrival:d.arrival(Date.now(),trip.seconds),summary:d.tripSummary(trip.seconds,trip.meters),
    nextStop:leg?'Nächster Stopp in '+d.tripSummary(stop.seconds,stop.meters):typeof stop==='string'?label(stop,120):'',
    muted:trip.muted===true};
  }
  return {arrival:label(trip.arrival,80)||'Ankunft –',
   summary:label(trip.summary,130)||'Reststrecke wird ermittelt',
   nextStop:typeof trip.nextStop==='string'?label(trip.nextStop,120):'',muted:trip.muted===true};
 }
 function html(input,action='toggleGuidanceMenu()'){
  const t=normalize(input);
  const onclick=action==='window.MeviNavTripAndroid.openMenu()'?
   'window.MeviNavTripAndroid.openMenu()':'toggleGuidanceMenu()';
  return '<div class="mevi-trip" role="group" aria-label="Aktive Navigation">'+
   '<button type="button" class="mg-guidance-trip-main" onclick="'+onclick+'" aria-label="Fahrtwerte, Navigationsmenü öffnen">'+
   '<strong id="mg-trip-arrival">'+escape(t.arrival)+'</strong>'+
   '<span id="mg-trip-summary">'+escape(t.summary)+'</span>'+
   '<span id="mg-trip-next-stop"'+(t.nextStop?'':' hidden')+'>'+escape(t.nextStop)+'</span>'+
   '<span id="mg-trip-muted"'+(t.muted?'':' hidden')+'>Ton aus</span>'+
   '</button></div>';
 }
 function paint(host,input,action){
  if(!host)return false;
  const t=normalize(input);
  if(!host.querySelector?.('.mevi-trip'))host.innerHTML=html(t,action);
  const find=id=>host.querySelector?.('#'+id);
  const arrival=find('mg-trip-arrival'),summary=find('mg-trip-summary'),
   stop=find('mg-trip-next-stop'),muted=find('mg-trip-muted');
  if(arrival)arrival.textContent=t.arrival;
  if(summary)summary.textContent=t.summary;
  if(stop){stop.textContent=t.nextStop;stop.hidden=!t.nextStop}
  if(muted)muted.hidden=!t.muted;
  return true;
 }
 function setTheme(theme){
  if(!root.document?.documentElement?.style)return;
  const el=root.document.documentElement.style;
  for(const [key,name] of [['panel','--trip-panel'],['ink','--trip-ink'],
   ['inkDim','--trip-muted'],['accent','--trip-accent'],['border','--trip-border']]){
   const value=theme?.[key];
   if(typeof value==='string'&&/^#[0-9a-fA-F]{6}$/.test(value))
    el.setProperty(name,value);
  }
 }
 root.MeviNavTrip=Object.freeze({html,paint,normalize,setTheme});
})(window);
