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
 function html(input,action='showGuidanceDashboard()'){
  const t=normalize(input);
  const onclick=action==='window.MeviNavTripAndroid.openMenu()'?
   'window.MeviNavTripAndroid.openMenu()':'showGuidanceDashboard()';
  return '<div class="mevi-trip" role="group" aria-label="Aktive Navigation">'+
   '<button type="button" class="mg-guidance-trip-main" onclick="'+onclick+'" aria-label="Fahrtwerte, Navi-Dashboard öffnen">'+
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

 const controlIcons={
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  volume:'<path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"/><path d="M15 9a5 5 0 0 1 0 6M18 6a9 9 0 0 1 0 12"/>',
  muted:'<path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"/><path d="m15 9 6 6m0-6-6 6"/>',
  overview:'<path d="M4 20V4h6l4 6h6"/><path d="m16 6 4 4-4 4"/><path d="M4 16h6l4-4"/>'
 };
 const ctrlSvg=path=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>';
 /** One button renderer for Maps JavaScript and Android NavigationView. */
 function controlsHTML(input={}){
  const muted=input?.muted===true;
  return '<div class="mevi-nav-controls" role="group" aria-label="Navigationssteuerung">'+
   '<button type="button" data-nav-control="search" onclick="MeviNavTrip.controlAction(\'search\')" aria-label="Stopp suchen" title="Stopp suchen">'+ctrlSvg(controlIcons.search)+'</button>'+
   '<button type="button" data-nav-control="voice" onclick="MeviNavTrip.controlAction(\'voice\')" aria-label="'+(muted?'Ton einschalten':'Ton ausschalten')+'" title="'+(muted?'Ton einschalten':'Ton ausschalten')+'" aria-pressed="'+muted+'"><span class="mevi-nav-volume-on">'+ctrlSvg(controlIcons.volume)+'</span><span class="mevi-nav-volume-off">'+ctrlSvg(controlIcons.muted)+'</span></button>'+
   '<button type="button" data-nav-control="overview" onclick="MeviNavTrip.controlAction(\'overview\')" aria-label="Routenübersicht" title="Routenübersicht">'+ctrlSvg(controlIcons.overview)+'</button>'+
   '</div>';
 }
 function paintControls(host,input={}){
  if(!host)return false;
  const group=host.classList?.contains('mevi-nav-controls')?host:host.querySelector?.('.mevi-nav-controls');
  if(!group){host.innerHTML=controlsHTML(input);return true}
  const voice=group.querySelector?.('[data-nav-control="voice"]');
  if(voice){
   const muted=input?.muted===true,label=muted?'Ton einschalten':'Ton ausschalten';
   voice.setAttribute('aria-pressed',String(muted));
   voice.setAttribute('aria-label',label);
   voice.setAttribute('title',label);
  }
  return true;
 }
 function controlAction(action){
  if(!['search','voice','overview'].includes(action))return false;
  if(root.MeviNavControlsAndroid?.trigger){root.MeviNavControlsAndroid.trigger(action);return true}
  if(action==='search')root.MeviWebNavParity?.openStopSearch?.();
  if(action==='voice')root.MeviGoogleNav?.toggleVoice?.();
  if(action==='overview')root.MeviGoogleNav?.showOverview?.();
  return true;
 }
 root.MeviNavTrip=Object.freeze({html,paint,normalize,setTheme,controlsHTML,paintControls,controlAction});
})(window);
