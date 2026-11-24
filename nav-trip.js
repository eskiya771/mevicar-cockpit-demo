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
 // The canonical ETA remains unchanged; the trip renders only time with a flag.
 const arrivalDisplay=text=>String(text||'').replace(/^Ankunft(?=\s|$)\s*/,'');
 const arrivalFlag='<svg class="mg-trip-arrival-flag" viewBox="0 0 24 24" fill="none" '+
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '+
  'aria-hidden="true" focusable="false"><path d="M4 22V4l12 5-12 5"/></svg>';
 /* Read-only route summary. Opening the dashboard is an explicit Navi
    action, never a side effect of tapping this map overlay. */
 function html(input){
  const t=normalize(input);
  return '<div class="mevi-trip" role="group" aria-label="Aktive Navigation">'+
   '<div class="mg-guidance-trip-main">'+
   '<div class="mevi-trip-primary">'+
   '<strong id="mg-trip-arrival" aria-label="'+escape(t.arrival)+'">'+arrivalFlag+
    '<span id="mg-trip-arrival-value">'+escape(arrivalDisplay(t.arrival))+'</span></strong>'+
   '<span id="mg-trip-summary">'+escape(t.summary)+'</span></div>'+
   '<div class="mevi-trip-secondary"'+(t.nextStop||t.muted?'':' hidden')+'>'+
   '<span id="mg-trip-next-stop"'+(t.nextStop?'':' hidden')+'>'+escape(t.nextStop)+'</span>'+
   '<span id="mg-trip-muted"'+(t.muted?'':' hidden')+'>Ton aus</span>'+
   '</div></div></div>';
 }
 /* Align the fullscreen Web trip's lower edge with the visible Apps dock
    button. Both boxes have different containing blocks on iPhone/DeX; measure
    real geometry instead of changing the footer height or guessing an offset. */
 function alignTripWithAppsButton(host){
  if(!host?.closest?.('.mg-navigation.mg-web-driving'))return false;
  const screen=host.closest('.screen');
  if(!screen||screen.querySelector?.(':scope > .mg-nav-dashboard-side'))return false;
  const button=root.document?.querySelector?.('.cockpit .dock.left button[data-app="apps"]');
  const containing=host.offsetParent;
  if(!button?.getBoundingClientRect||!containing?.getBoundingClientRect||!host.style)return false;
  const dockBottom=button.getBoundingClientRect().bottom;
  const containerBottom=containing.getBoundingClientRect().bottom;
  if(!Number.isFinite(dockBottom)||!Number.isFinite(containerBottom))return false;
  const bottom=Math.round(containerBottom-dockBottom)+'px';
  if(host.style.bottom!==bottom)host.style.bottom=bottom;
  return true;
 }
 function alignVisibleTrip(){
  const host=root.document?.querySelector?.('.mg-navigation.mg-web-driving .mg-guidance-trip');
  if(host)alignTripWithAppsButton(host);
 }
 root.addEventListener?.('resize',alignVisibleTrip);
 root.visualViewport?.addEventListener?.('resize',alignVisibleTrip);

 function paint(host,input){
  if(!host)return false;
  const t=normalize(input);
  if(!host.querySelector?.('.mevi-trip'))host.innerHTML=html(t);
  const find=id=>host.querySelector?.('#'+id);
  const arrival=find('mg-trip-arrival'),arrivalValue=find('mg-trip-arrival-value'),
   summary=find('mg-trip-summary'),stop=find('mg-trip-next-stop'),muted=find('mg-trip-muted');
  // Preserve the SVG icon across live ETA updates.
  if(arrivalValue)arrivalValue.textContent=arrivalDisplay(t.arrival);
  if(arrival)arrival.setAttribute?.('aria-label',t.arrival);
  if(summary)summary.textContent=t.summary;
  if(stop){stop.textContent=t.nextStop;stop.hidden=!t.nextStop}
  if(muted)muted.hidden=!t.muted;
  const secondary=host.querySelector?.('.mevi-trip-secondary');
  if(secondary)secondary.hidden=!t.nextStop&&!t.muted;
  alignTripWithAppsButton(host);
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


 /* Spotify authentication and playback state remain exclusively in spotify.js.
    This renderer is shared by the Web dashboard, trip bar and Android's offline trip WebView. */
 const miniIcons={
  prev:'<path d="M6 5v14h2V5zm13 0L8 12l11 7V5z"/>',
  next:'<path d="M16 5v14h2V5zM5 5v14l11-7z"/>',
  play:'<path d="M7 4v16l13-8z"/>',
  pause:'<path d="M6 4h5v16H6zM14 4h5v16h-5z"/>'
 };
 const miniSvg=name=>'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'+miniIcons[name]+'</svg>';
 function spotifyHTML(mode='trip'){
  const dash=mode==='dashboard';
  return '<div class="mevi-trip-spotify '+(dash?'mg-sp-dashboard':'mg-sp-trip')+'" data-spotify-mini="'+(dash?'dashboard':'trip')+'"'+(dash?'':' hidden')+'>'+
   (dash?'<button type="button" class="mg-sp-cover-button" onclick="MeviNavTrip.spotifyAction(\'open\')" aria-label="Spotify öffnen">'+
   '<img data-sp-cover alt="" hidden><span data-sp-fallback>♫</span></button>':'')+
   '<button type="button" class="mg-sp-meta" onclick="MeviNavTrip.spotifyAction(\'open\')" aria-label="Spotify öffnen">'+
   '<span class="mg-sp-title-viewport"><strong data-sp-title>Spotify aus</strong></span><small data-sp-artist>Spotify öffnen</small></button>'+
   '<div class="mg-sp-transport" role="group" aria-label="Spotify steuern">'+
   '<button type="button" data-sp-action="prev" onclick="MeviNavTrip.spotifyAction(\'prev\')" aria-label="Vorheriger Titel" disabled>'+miniSvg('prev')+'</button>'+
   '<button type="button" data-sp-action="toggle" onclick="MeviNavTrip.spotifyAction(\'toggle\')" aria-label="Abspielen" disabled>'+miniSvg('play')+'</button>'+
   '<button type="button" data-sp-action="next" onclick="MeviNavTrip.spotifyAction(\'next\')" aria-label="Nächster Titel" disabled>'+miniSvg('next')+'</button></div>'+
   '<span class="mg-sp-progress" aria-hidden="true"><span data-sp-progress></span></span></div>';
 }
 function paintSpotify(host,state){
  const mini=host?.matches?.('[data-spotify-mini]')?host:host?.querySelector?.('[data-spotify-mini]');
  if(!mini)return false;
  const valid=state?.available===true&&typeof state.title==='string'&&!!state.title.trim();
  const dashboard=mini.getAttribute?.('data-spotify-mini')==='dashboard';
  mini.hidden=!valid&&!dashboard;
  mini.closest?.('.mevi-trip')?.classList?.toggle?.('has-spotify',valid);
  const idleHost=mini.closest?.('.mg-spotify-idle-trip');
  if(idleHost){
   // Show before measuring: a hidden host has no offsetParent. Both changes
   // happen in the same frame, so the user sees only its final dock alignment.
   idleHost.hidden=!valid;
   if(valid)alignTripWithAppsButton(idleHost);
  }
  const find=query=>mini.querySelector?.(query);
  const title=find('[data-sp-title]'),artist=find('[data-sp-artist]');
  const nextTitle=valid?state.title.slice(0,200):'Spotify aus';
  // Progress ticks must never restart an existing title animation.
  if(title&&title.textContent!==nextTitle)title.textContent=nextTitle;
  if(artist)artist.textContent=valid?String(state.artist||'Spotify').slice(0,160):'Spotify öffnen';
  // Scroll only when the title is wider than its own clipping viewport.
  const viewport=title?.parentElement;
  if(viewport?.clientWidth>0&&Number.isFinite(title?.scrollWidth)&&title?.dataset&&title?.style?.setProperty){
   const overflow=Math.max(0,Math.ceil(title.scrollWidth-viewport.clientWidth));
   title.dataset.scroll=valid&&overflow>5?'true':'false';
   title.style.setProperty('--mg-sp-overflow',overflow+'px');
   title.style.setProperty('--mg-sp-scroll-time',Math.max(10,Math.min(36,Math.round(overflow/18+8)))+'s');
  }
  const cover=find('[data-sp-cover]'),fallback=find('[data-sp-fallback]');
  const url=valid&&typeof state.cover==='string'&&state.cover.startsWith('https://')?state.cover:'';
  if(cover){
   if(url&&cover.getAttribute?.('src')!==url)cover.setAttribute?.('src',url);
   if(!url)cover.removeAttribute?.('src');
   cover.hidden=!url;
  }
  if(fallback)fallback.hidden=!!url;
  for(const [action,enabled] of Object.entries({
   prev:valid&&state.canPrev===true,toggle:valid&&state.canToggle===true,next:valid&&state.canNext===true
  })){
   const button=find('[data-sp-action="'+action+'"]');if(!button)continue;
   button.disabled=!enabled;
   if(action==='toggle'){
    button.innerHTML=miniSvg(valid&&state.playing?'pause':'play');
    button.setAttribute?.('aria-label',valid&&state.playing?'Pause':'Abspielen');
   }
  }
  const progress=find('[data-sp-progress]');
  if(progress?.style){
   const duration=Number(state?.durationMs)||0,elapsed=Number(state?.progressMs)||0;
   progress.style.width=(valid&&duration>0?Math.max(0,Math.min(100,elapsed/duration*100)):0).toFixed(1)+'%';
  }
  return valid;
 }
 function spotifyAction(action){
  if(!['open','prev','toggle','next'].includes(action))return false;
  if(root.MeviNavTripAndroid?.trigger){root.MeviNavTripAndroid.trigger(action);return true}
  if(action==='open')return root.meviOpenSpotifyFromNavigation?.()??false;
  return root.MeviSpotify?.navAction?.(action)??false;
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
 root.MeviNavTrip=Object.freeze({html,paint,normalize,setTheme,controlsHTML,paintControls,controlAction,spotifyHTML,paintSpotify,spotifyAction});
})(window);
