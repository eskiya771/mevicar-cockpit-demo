/* MeviCar Next navigation adapter – Classic destination rules, Google Maps web APIs.
   A browser-restricted Google Maps JavaScript key is required. Never copy Android keys. */
(function(){
'use strict';
const KEY='mevicar-next-google-maps-key-v1', DATA='mevicar-next-destinations-v1';
const MAX_SAVED=200,MAX_RECENT=30;
const PREVIEW_OPTIONS='mevicar-next-route-options-v1', previewOptionKeys=['avoidTolls','avoidHighways','avoidFerries'];
let routeOptions={};
try {const saved=JSON.parse(localStorage.getItem(PREVIEW_OPTIONS)||'{}');routeOptions=Object.fromEntries(previewOptionKeys.map(key=>[key,saved?.[key]===true]));} catch {}
const FALLBACK_CENTER={lat:49.59,lng:11.005}; // Erlangen: initial map view only, not a navigation origin.
const text=window.MeviNavigationShared.escapeHtml;
const valid=d=>!!d&&typeof d.name==='string'&&window.MeviNavigationShared.validCoordinates(d);
const hasPlaceId=d=>!!d&&typeof d.name==='string'&&window.MeviNavigationShared.validPlaceId(d.placeId);
const savedValid=d=>valid(d)||hasPlaceId(d);
const keyOf=d=>window.MeviNavigationShared.destinationKey(d);
const unique=(items,max)=>window.MeviNavigationShared.distinct(items,max);
let cache={favorites:[],recent:[],slots:{}};try{let d=JSON.parse(localStorage.getItem(DATA)||'{}');cache={favorites:unique(d.favorites||[],MAX_SAVED),recent:unique(d.recent||[],MAX_RECENT).filter(valid),slots:{home:savedValid(d.slots?.home)?d.slots.home:null,work:savedValid(d.slots?.work)?d.slots.work:null}}}catch{}
function capBook(){const occupied=Number(!!cache.slots.home)+Number(!!cache.slots.work);cache.favorites=cache.favorites.slice(0,MAX_SAVED-occupied)}
capBook();
let map=null,mapElement=null,mapLoading=null,geoWatch=null,current=null,marker=null,routeLines=[],routeData=null,routeStops=[],routeOrigin=null,routeRequestSerial=0,selected=null,pendingSave=null,suggestions=[],poiResults=null,poiLoading=false,poiError='',poiActive=false,poiRequest=null,query='',timer=null,requestSerial=0,token=null,error='',errorKind='',manualOrigin=null,originMarker=null,positionMarker=null,choosingOrigin=false,state='browse',mounted=false,stage='setup',guidanceActive=false,simulation=false,guidanceSteps=[],stepIndex=0,spokenThresholds=new Set(),lastSpokenStep=-1,offRouteCount=0,lastRerouteAt=0,reRouting=false,simulationTimer=null,voiceMuted=false,currentSpeed=null,lastGpsAccuracy=null,followCamera=true;
// Native Navigation SDK is available only in the hybrid Android APK.
// The Web/PWA keeps its own GPS guidance and never needs an Android API key.
const nativeRequests=new Map();
let nativeRequestSerial=0;
// The APK uses its own Android-restricted key and native Google SDKs, never a web key.
let lastNativeLayout='';
let lastNativeTheme='';
const nativeThemes=['default','cyberpunk','liquidglass'];
function nativeMode(){return !!window.MeviNativeBridge?.postMessage}
if(window.MeviNativeBridge?.postMessage){
 const previousNativeMessage=window.MeviNativeBridge.onmessage;
 window.MeviNativeBridge.onmessage=event=>{
  if(typeof previousNativeMessage==='function'){
   try{previousNativeMessage(event)}catch{}
  }
  let data;try{data=JSON.parse(event.data)}catch{return}
  const pending=nativeRequests.get(data.id);if(!pending)return;
  clearTimeout(pending.timeout);nativeRequests.delete(data.id);
  if(data.ok)pending.resolve(data);
  else pending.reject(new Error(String(data.error||'Native Navigation nicht verfügbar')));
 };
}
function nativeRequest(action,fields={}){
 return new Promise((resolve,reject)=>{
  if(!window.MeviNativeBridge?.postMessage){reject(new Error('Nur in der Android-APK verfügbar'));return}
  const id='navigation-'+(++nativeRequestSerial);
  const timeout=setTimeout(()=>{nativeRequests.delete(id);reject(new Error('Keine Antwort der Android-Navigation'))},18000);
  nativeRequests.set(id,{resolve,reject,timeout});
  try{window.MeviNativeBridge.postMessage(JSON.stringify({id,action,...fields}))}
  catch(error){clearTimeout(timeout);nativeRequests.delete(id);reject(new Error('Android-Bridge nicht erreichbar'))}
 });
}
/** Tell the APK which cockpit theme is active so the native controls match.
 * Sent once per change; an older APK rejects the action, which is ignored.
 */
function syncNativeTheme(){
 const theme=document.documentElement?.dataset?.theme;
 if(!nativeThemes.includes(theme)||theme===lastNativeTheme)return;
 lastNativeTheme=theme;
 // CSS variables come from nav-trip.css, which is shared by Web and APK.
 const style=typeof window.getComputedStyle==='function'?
  window.getComputedStyle(document.documentElement):null;
 const keys={panel:'--trip-panel',ink:'--trip-ink',inkDim:'--trip-muted',
  accent:'--trip-accent',panelStroke:'--trip-border'};
 const colors={};
 if(style)for(const [key,css] of Object.entries(keys)){
  const value=String(style.getPropertyValue(css)||'').trim();
  if(/^#[0-9a-fA-F]{6}$/.test(value))colors[key]=value;
 }
 nativeRequest('navigation.theme',Object.keys(colors).length?{theme,colors}:{theme}).catch(()=>{});
}
/** One address book: an APK with `navigationFavoritesImport` owns all destinations.
 * The Web favourites are handed over once; the APK checks every entry again.
 * An older APK lacks the capability and keeps receiving them with the layout.
 */
const HANDOVER='mevicar-next-destinations-native-import-v1';
let nativeAddressBook=false,favoritesHandover=null;
const plain=(value,max)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
function handOverFavorites(){
 if(favoritesHandover)return;
 favoritesHandover=nativeRequest('capabilities').then(async result=>{
  if(!result.capabilities?.navigationFavoritesImport)return;
  nativeAddressBook=true;window.meviGoogleRerender?.(); // drop the Web favourite buttons
  let done=false;try{done=localStorage.getItem(HANDOVER)==='1'}catch{}
  if(done)return;
  const entries=cache.favorites.filter(valid).slice(0,100)
   .map(d=>({lat:d.lat,lng:d.lng,title:plain(d.name,120),address:plain(d.address,200)}));
  if(entries.length)await nativeRequest('navigation.favorites.import',{entries});
  try{localStorage.setItem(HANDOVER,'1')}catch{}
 }).catch(()=>{favoritesHandover=null});
}
/** The first measurement can run before the cockpit layout has settled (header
 * capability, fonts, transitions); without a later look the native toolbar
 * stays where the unsettled rectangle put it. Unchanged values send nothing. */
let settleTimers=[];
function settleNativeLayout(){
 settleTimers.forEach(clearTimeout);
 settleTimers=[160,600,1500].map(ms=>setTimeout(()=>syncNativeLayout(false,true),ms));
}
/** Keep the SDK map exactly inside the Web cockpit's #mg-map rectangle.
 * Never cover the dock or the right-hand split app (dashboard included): the
 * map is only resized, never re-initialised. No web key is involved.
 */
function syncNativeLayout(force=false,settling=false){
 if(!nativeMode())return;
 if(!settling)settleNativeLayout();
 syncNativeTheme();
 handOverFavorites();
 const el=document.getElementById('mg-map');
 const rect=el?.getBoundingClientRect?.();
 const vw=Number(window.innerWidth),vh=Number(window.innerHeight);
 const usable=!window.MeviAndroidSharedNav?.isOpen?.()&&rect&&rect.width>=1&&rect.height>=1&&vw>0&&vh>0;
 nativeMapShown=!!usable;
 watchTrip(!usable);
 const fields=usable?{
  visible:true,
  x:Math.max(0,Math.round(rect.left)),
  y:Math.max(0,Math.round(rect.top)),
  width:Math.min(Math.round(rect.width),Math.max(1,Math.round(vw-rect.left))),
  height:Math.min(Math.round(rect.height),Math.max(1,Math.round(vh-rect.top))),
  viewportWidth:Math.round(vw),viewportHeight:Math.round(vh)
 }:{visible:false};
 if(usable&&!nativeAddressBook)
  fields.favorites=cache.favorites.slice(0,8).filter(valid).map(d=>({lat:d.lat,lng:d.lng,title:d.name.slice(0,120)}));
 const signature=JSON.stringify(fields);
 if(!force&&signature===lastNativeLayout)return;
 lastNativeLayout=signature;
 nativeRequest('navigation.layout',fields).catch(()=>{lastNativeLayout=''});
}
window.addEventListener?.('resize',()=>syncNativeLayout(true));
/** Trip line in the cockpit header while another app covers the native map.
 * Values come from `navigation.status`, asked only while the map is covered.
 * An older APK sends no trip fields: nothing is shown. SDK text is plain text only.
 */
const TRIP_POLL_MS=5000;
const maneuverWords={depart:'Losfahren',destination:'Ziel','destination-left':'Ziel links','destination-right':'Ziel rechts',
 straight:'Geradeaus',left:'Links abbiegen',right:'Rechts abbiegen','keep-left':'Links halten','keep-right':'Rechts halten',
 'slight-left':'Leicht links','slight-right':'Leicht rechts','sharp-left':'Scharf links','sharp-right':'Scharf rechts',
 uturn:'Wenden',merge:'Einfädeln','merge-left':'Links einfädeln','merge-right':'Rechts einfädeln',
 'fork-left':'Links halten','fork-right':'Rechts halten',ramp:'Auffahrt','ramp-left':'Auffahrt links','ramp-right':'Auffahrt rechts',
 exit:'Ausfahrt','exit-left':'Ausfahrt links','exit-right':'Ausfahrt rechts',roundabout:'Kreisverkehr',ferry:'Fähre'};
let tripCovered=false,tripTimer=null,tripGpsLost=false,tripShown=false,nativeMapShown=false;
/** True while the native map is on screen or native guidance runs behind another app.
 * Touches on native views never reach the WebView, so the screensaver asks here.
 */
const nativeBusy=()=>nativeMode()&&(nativeMapShown||tripShown);
function tripLine(data){
 const eta=Number(data?.etaEpochMs);
 if(!Number.isFinite(eta)||eta<=0)return '';
 const parts=[];
 if(tripGpsLost)parts.push('GPS-Signal fehlt');
 const step=data.maneuver,meters=Number(step?.distanceMeters);
 const what=plain(step?.text,200)||maneuverWords[step?.type]||'';
 if(what&&Number.isFinite(meters)&&meters>=0)parts.push('in '+window.MeviNavRouteDetails.distance(meters,'maneuver')+' · '+what);
 parts.push('Ankunft '+window.MeviNavRouteDetails.clock(eta,false));
 return parts.join(' · ');
}
function renderTrip(line){
 tripShown=!!line;
 // The cockpit header is hidden under other apps: this class shows it as a bare trip row.
 document.getElementById('cockpit')?.classList?.toggle('mg-trip-active',tripShown);
 let el=document.getElementById('mg-native-trip');
 if(!el){
  const slot=document.getElementById('mg-native-header-slot');
  if(!line||!slot?.parentElement||!document.createElement)return;
  el=document.createElement('span');el.id='mg-native-trip';el.setAttribute('role','status');
  slot.parentElement.insertBefore(el,slot.nextSibling);
 }
 el.textContent=line;el.hidden=!line;
}
function pollTrip(){
 nativeRequest('navigation.status').then(data=>{
  if(!tripCovered)return;
  const line=tripLine(data);
  if(!line)tripGpsLost=false; // no guidance: a later trip starts with a fresh GPS state
  renderTrip(line);
 }).catch(()=>renderTrip(''));
}
function watchTrip(covered){
 if(covered===tripCovered)return;
 tripCovered=covered;
 if(tripTimer!==null){clearInterval(tripTimer);tripTimer=null}
 if(covered){pollTrip();tripTimer=setInterval(pollTrip,TRIP_POLL_MS)}
 else renderTrip('');
}
/** `navigation.event` of the APK: arrived, rerouted, gpsLost, gpsRestored, stopped.
 * Called by the APK only; unknown events are ignored. Exists only inside the APK.
 */
if(nativeMode())window.meviNavigationNativeEvent=message=>{
 if(message?.type!=='navigation.event')return;
 const event=message.event;
 if(event==='arrived'||event==='stopped'){tripGpsLost=false;renderTrip('');return}
 if(event==='gpsLost')tripGpsLost=true;
 else if(event==='gpsRestored')tripGpsLost=false;
 else if(event!=='rerouted')return;
 if(tripCovered)pollTrip();
};
async function startNativeNavigation(){
 if(!nativeMode())return false;
 const caps=await nativeRequest('capabilities');
 if(!caps.capabilities?.googleNavigation)throw new Error('Bitte die APK auf eine Version mit Navigation SDK aktualisieren.');
 if(!valid(selected))throw new Error('Bitte zuerst ein gültiges Ziel wählen.');
 await nativeRequest('navigation.open',{lat:selected.lat,lng:selected.lng,title:selected.name});
 return true;
}
async function openNativeMap(){
 try{
  const caps=await nativeRequest('capabilities');
  if(!caps.capabilities?.nativeMap)throw new Error('Die installierte APK unterstützt die native Karte noch nicht.');
  await nativeRequest('navigation.show');
  return true;
 }catch(e){status('Android-Karte: '+(e.message||e));return false}
}

/* Native Google SDK arrival state; only the shared cockpit renders controls. */
let nativeArrival=null,arrivalActionBusy=false;
function currentNativeArrival(){return nativeMode()?nativeArrival:null}
function showNativeArrival(payload){
 if(!nativeMode()||!payload||typeof payload.title!=='string')return false;
 closeNativeGuidanceMenu();
 nativeArrival={title:plain(payload.title,200),hasMoreStops:payload.hasMoreStops===true};
 window.meviNativeArrivalFocusMap?.();
 return true;
}
function closeNativeArrival(){
 if(!nativeArrival)return false;
 nativeArrival=null;
 window.meviGoogleRerender?.();
 return true;
}
async function nativeArrivalAction(action){
 if(arrivalActionBusy||!nativeMode()||!nativeArrival||!['finish','continue'].includes(action))return false;
 if(action==='continue'&&!nativeArrival.hasMoreStops)return false;
 arrivalActionBusy=true;
 try{
  await nativeRequest('navigation.arrival.'+action);
  closeNativeArrival();
  return true;
 }catch(e){status('Ankunft: '+(e.message||e));return false}
 finally{arrivalActionBusy=false}
}
/* One detail data adapter: native SDK supplies only values and commands.
   The scrollable detail view lives solely in the right dashboard. */
let nativeGuidanceState={muted:false,roadEnabled:false,roadVoice:false,detailData:null,details:[]};
let nativeGuidanceFetch=null,nativeGuidanceReadAt=0;
function nativeGuidanceMode(){return ''}
function nativeGuidanceMuted(){return nativeGuidanceState.muted===true}
function nativeGuidanceRoadEnabled(){return nativeGuidanceState.roadEnabled===true}
function nativeGuidanceRoadVoice(){return nativeGuidanceState.roadVoice===true}
function nativeGuidanceDetailsHTML(){
 const model=window.MeviNavRouteDetails;
 const raw=nativeGuidanceState.detailData;
 if(raw&&model)return guidanceRowsHTML(model.rows(raw));
 const rows=Array.isArray(nativeGuidanceState.details)?nativeGuidanceState.details:[];
 return rows.length?guidanceRowsHTML(rows.filter(r=>r&&typeof r.label==='string'&&typeof r.value==='string').map(r=>[r.label,r.value])):
  '<p class="mg-search-message">Routendetails werden geladen …</p>';
}
function refreshNativeGuidanceMenu(){
 if(!nativeMode()||!window.MeviNavDashboard?.detailsOpen?.())return Promise.resolve(false);
 if(nativeGuidanceFetch)return nativeGuidanceFetch;
 const now=Date.now();
 if(now-nativeGuidanceReadAt<850)return Promise.resolve(true);
 nativeGuidanceReadAt=now;
 nativeGuidanceFetch=nativeRequest('navigation.guidance.read').then(reply=>{
  if(reply.guiding===false)return false;
  nativeGuidanceState={muted:reply.muted===true,roadEnabled:reply.roadEnabled===true,
   roadVoice:reply.roadVoice===true,detailData:reply.detailData&&typeof reply.detailData==='object'?reply.detailData:null,
   details:Array.isArray(reply.details)?reply.details:[]};
  const dashboard=document.getElementById('mg-nav-dashboard-split');
  if(dashboard&&window.MeviNavDashboard?.detailsOpen?.())window.MeviNavDashboard.paintDetails(dashboard);
  return true;
 }).catch(e=>{status('Routendetails: '+(e.message||e));return false})
 .finally(()=>{nativeGuidanceFetch=null});
 return nativeGuidanceFetch;
}
/* Old APKs still invoke this callback from their trip strip. Redirect instead
   of reintroducing the left-hand menu after a Web-only update. */
function toggleNativeGuidanceMenu(){window.showGuidanceDashboard?.();return true}
function closeNativeGuidanceMenu(){return false}
function nativeGuidanceShowDetails(){
 window.showGuidanceDashboard?.();window.MeviNavDashboard?.toggleDetails?.(true);
}
function nativeGuidanceBack(){window.MeviNavDashboard?.toggleDetails?.(false)}
async function nativeGuidanceAction(action){
 if(!nativeMode())return false;
 try{
  if(action==='stopSearch'){
   if(!window.MeviAndroidSharedNav?.openSharedStopSearch)throw new Error('Gemeinsame Stopp-Suche fehlt.');
   await window.MeviAndroidSharedNav.openSharedStopSearch();return true;
  }
  if(action==='end'){await nativeRequest('navigation.stop');return true}
  if(action==='overview'){await nativeRequest('navigation.guidance.overview');return true}
  const wire={voice:'navigation.guidance.voice',roadVoice:'navigation.guidance.roadVoice'}[action];
  if(!wire)return false;
  const reply=await nativeRequest(wire);
  nativeGuidanceState={muted:reply.muted===true,roadEnabled:reply.roadEnabled===true,
   roadVoice:reply.roadVoice===true,detailData:reply.detailData&&typeof reply.detailData==='object'?reply.detailData:null,
   details:Array.isArray(reply.details)?reply.details:[]};
  const dash=document.getElementById('mg-nav-dashboard-split');
  if(dash&&window.MeviNavDashboard?.detailsOpen?.())window.MeviNavDashboard.paintDetails(dash);
  return true;
 }catch(e){status('Navigation: '+(e.message||e));return false}
}
async function openNativeSearch(){
 try{
  if(!window.MeviAndroidSharedNav?.connect||!window.MeviWebNavParity?.open)
   throw new Error('Gemeinsame Navi-Oberfläche fehlt. Bitte die APK/Web-Dateien aktualisieren.');
  await window.MeviAndroidSharedNav.connect();
  window.MeviWebNavParity.open();
  return true;
 }catch(e){status('Android-Zielsuche: '+(e.message||e));return false}
}
function persist(){try{localStorage.setItem(DATA,JSON.stringify(cache))}catch{}}
function key(){try{return localStorage.getItem(KEY)||''}catch{return ''}}
function setKey(){window.meviOpenCredentialSettings?.()}
function removeKey(){window.meviOpenCredentialSettings?.()}
function status(message,kind='info'){
 error=message;errorKind=kind;
 const e=document.getElementById('mg-status');
 if(e){e.textContent=message;e.hidden=false;e.classList.add('mg-diagnostic')}
 const notice=document.getElementById('mg-map-notice');if(notice)notice.hidden=false;
 const change=document.getElementById('mg-change-key');if(change)change.hidden=kind!=='maps-auth';
 const manual=document.getElementById('mg-manual-origin');if(manual)manual.hidden=kind!=='gps';
}
function clearStatus(){
 error='';errorKind='';
 const notice=document.getElementById('mg-map-notice');if(notice)notice.hidden=true;
}
function setupHTML(){return '<section class="mg-setup" role="region" aria-label="Google Maps Ersteinrichtung"><strong>Google Maps einrichten</strong><p>Für Karte und Adresssuche fehlt noch der Google Maps Web-API-Key.</p><p>Hinterlege ihn einmalig unter <b>Settings → Zugänge</b>. Anschließend kannst du nach Adressen suchen und Favoriten verwenden.</p><button type="button" onclick="meviOpenCredentialSettings()">Google Maps einrichten</button></section>'}
function nativePanelHTML(){
 const saved=nativeAddressBook?'':cache.favorites.slice(0,4).map((d,i)=>
  '<button type="button" onclick="MeviGoogleNav.pick(\'favorites\','+i+')">'+text(d.name)+'</button>').join('');
 return '<div id="mg-map" class="mg-map mg-native-map" aria-hidden="true"></div>'+
  '<section class="mg-setup mg-native-setup" role="region" aria-label="Google Navigation für Android">'+
  '<strong>Google Navigation SDK · Android</strong>'+
  '<p>Karte, Google-Places-Zielsuche und Routenführung laufen direkt über Android. Kein Web-API-Key erforderlich.</p>'+
  '<button type="button" onclick="MeviGoogleNav.openNativeMap()">Google-Karte öffnen</button>'+
  '<button type="button" onclick="MeviGoogleNav.openNativeSearch()">Ziel suchen</button>'+
  (saved?'<p>Favoriten</p>'+saved:'')+
  '<button type="button" onclick="meviOpenCredentialSettings()">Android-API-Key verwalten</button>'+
  '<p id="mg-status" role="status" aria-live="polite">'+text(error)+'</p></section>';
}
function mapBackdrop(){
 if(nativeMode())return nativePanelHTML();
 const message='<div class="mg-map-state" id="mg-map-notice" role="status"><span id="mg-status">'+text(error||'Google Maps wird geladen …')+'</span>'+
  '<button type="button" id="mg-change-key" class="mg-change-key" onclick="meviOpenCredentialSettings()"'+(errorKind==='maps-auth'?'':' hidden')+'>API-Schlüssel erneut einrichten</button>'+
  '<button type="button" id="mg-manual-origin" class="mg-manual-action" onclick="MeviGoogleNav.selectOriginOnMap()"'+(errorKind==='gps'?'':' hidden')+'>Startpunkt auf Karte wählen</button></div>';
 const picking=choosingOrigin?'<div class="mg-origin-instruction" role="status">Startpunkt wählen: Auf eine Stelle der Karte tippen oder klicken. <button type="button" onclick="MeviGoogleNav.cancelOriginSelection()">Abbrechen</button></div>':'';
 if(!key())return '<div id="mg-map" class="mg-map" aria-hidden="true"></div>'+setupHTML();
 return '<div id="mg-map" class="mg-map" aria-label="Google Maps Karte"></div>'+message+picking;
}
function load(){
 if(!key())return Promise.reject(new Error('Google Maps Browser-Key fehlt.'));
 if(window.google?.maps?.importLibrary)return Promise.resolve(window.google.maps);
 if(mapLoading)return mapLoading;
 mapLoading=new Promise((resolve,reject)=>{
   const cb='__meviMapsReady';
   const script=document.createElement('script');
   // Google's callback also fires when the script loads but authorization fails.
   window.gm_authFailure=()=>status('Google Maps verweigert die Berechtigung. Prüfe Abrechnung, Maps JavaScript API und die Website-Freigabe https://eskiya771.github.io/* in Google Cloud.','maps-auth');
   const timeout=setTimeout(()=>{cleanup();reject(new Error('Google Maps konnte nicht geladen werden. API-Key und Cloud-Freigaben prüfen.'))},15000);
   function cleanup(){clearTimeout(timeout);delete window[cb]}
   window[cb]=()=>{cleanup();resolve(window.google.maps)};
   script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key())+'&v=weekly&loading=async&callback='+cb+'&language=de&region=DE';
   script.async=true;script.onerror=()=>{cleanup();reject(new Error('Google Maps JavaScript konnte nicht geladen werden.'))};
   document.head.appendChild(script);
 }).catch(e=>{mapLoading=null;throw e});
 return mapLoading;
}
async function mount(nextState){
 state=nextState||state;mounted=true;const el=document.getElementById('mg-map');
 if(nativeMode()){syncNativeLayout();watchNativePreview(el);return}
 if(!el||!key())return;
 /* render() rebuilds the page markup (dashboard split, other apps). The one
    live map moves into the new slot instead of being created again, so the
    route, markers and camera survive every switch. */
 const kept=map&&mapElement&&mapElement!==el&&el.replaceWith?mapElement:null;
 if(kept){el.replaceWith(kept);window.google?.maps?.event?.trigger?.(map,'resize')}
 try{
   await load();
   if(!document.contains(kept||el))return;
   if(!kept&&mapElement!==el){
     mapElement=el;
     map=new google.maps.Map(el,{center:current||FALLBACK_CENTER,zoom:12,disableDefaultUI:true,zoomControl:true,keyboardShortcuts:false,clickableIcons:false,gestureHandling:'greedy',backgroundColor:'#152536'});
     map.addListener('click',event=>{
       if(!choosingOrigin||!event.latLng)return;
       chooseOriginPoint(event.latLng.toJSON());
     });
     marker=null;originMarker=null;positionMarker=null;routeLines=[];
     if(current&&guidanceActive)markCurrent(current);
     if(selected)mark(selected);
     if(manualOrigin)markOrigin();
     if(routeData)drawRoute();
     if(guidanceActive)paintGuidance();
   }
   const hint=document.querySelector('.mg-map-state');if(hint)hint.hidden=!error;
 }catch(e){status(e.message)}
}
function mark(place){if(!map||!place)return;if(marker)marker.setMap(null);marker=new google.maps.Marker({map,position:{lat:place.lat,lng:place.lng},title:place.name});map.panTo({lat:place.lat,lng:place.lng});map.setZoom(15)}
function changeQuery(value){
 query=String(value||'').trim();clearTimeout(timer);requestSerial++;
 suggestions=[];poiResults=null;poiActive=false;poiLoading=false;poiError='';if(query.length<2||!key()){refreshResults();return}
 const serial=requestSerial;timer=setTimeout(()=>search(query,serial),320);
 refreshResults();
}
async function search(q,serial){
 try{
   await load();
   const {AutocompleteSessionToken,AutocompleteSuggestion}=await google.maps.importLibrary('places');
   if(!token)token=new AutocompleteSessionToken();
   const bias=map?.getCenter()?.toJSON?.()||current||FALLBACK_CENTER;
   const r=await AutocompleteSuggestion.fetchAutocompleteSuggestions({input:q,language:'de',region:'de',locationBias:{center:bias,radius:50000},sessionToken:token});
   if(serial!==requestSerial)return;
   suggestions=(r.suggestions||[]).filter(x=>x.placePrediction).slice(0,8);
   error='';refreshResults();
 }catch(e){if(serial!==requestSerial)return;suggestions=[];status('Adressvorschläge nicht verfügbar: '+(e.message||e));refreshResults()}
}
/** Android-style POI list: one cheap list request and a distinct detail request
    only when a result is opened. Do not fetch ratings for every list entry. */
async function webPoi(type,searchText,origin,options={}){
 if(nativeMode())return false;
 const types={fuel:'gas_station',charge:'electric_vehicle_charging_station',parking:'parking',
  food:'restaurant',cafe:'cafe',cart:'supermarket',rest:'rest_stop',wrench:'car_repair'};
 const openNow=!!options.openNow,sort=options.sort==='relevance'?'relevance':'distance',alongRoute=!!options.alongRoute;
 changeQuery(searchText);
 clearTimeout(timer);
 const serial=++requestSerial;
 poiActive=true;poiResults=[];poiLoading=true;poiError='';error='';
 poiRequest={type,searchText,openNow,sort,alongRoute};
 suggestions=[];refreshResults();
 const center=origin||current||manualOrigin||map?.getCenter()?.toJSON?.()||FALLBACK_CENTER;
 try{
  await load();
  const {Place,SearchNearbyRankPreference,SearchByTextRankPreference}=await google.maps.importLibrary('places');
  if(serial!==requestSerial)return false;
  let response;
  if(alongRoute){
   // Maps JavaScript Place.searchByText does not accept searchAlongRouteParameters.
   // Search a bounded set of circles, then keep only results near the drawn route.
   const path=(routeData?.path||[]).map(geoPoint).filter(Boolean);
   if(path.length<2)throw new Error('Bitte zuerst eine Route berechnen.');
   if(!Place?.searchByText)throw new Error('Google Places Textsuche nicht verfügbar');
   const sampleCenters=corridorCenters(path,current||routeOrigin||center);
   const found=[],seen=new Set();
   for(const location of sampleCenters){
    const res=await Place.searchByText({
     textQuery:searchText,
     fields:['id','displayName','formattedAddress','location','types'],
     locationBias:{center:location,radius:14000},maxResultCount:12,isOpenNow:openNow,
     rankPreference:sort==='distance'?(SearchByTextRankPreference?.DISTANCE||'DISTANCE'):
      (SearchByTextRankPreference?.RELEVANCE||'RELEVANCE'),
     ...(types[type]?{includedType:types[type]}:{})
    });
    if(serial!==requestSerial)return false;
    for(const place of res.places||[]){
     const loc=geoPoint(place.location);
     if(!loc||nearestDistanceToPath(loc,path)>8000)continue;
     const k=place.id||loc.lat.toFixed(5)+','+loc.lng.toFixed(5);
     if(seen.has(k))continue;seen.add(k);
     found.push(place);
    }
   }
   if(sort==='distance')found.sort((a,b)=>nearestDistanceToPath(geoPoint(a.location),path)-
      nearestDistanceToPath(geoPoint(b.location),path));
   response={places:found.slice(0,20)};
  }else if(type==='text'||openNow){
   if(!Place?.searchByText)throw Error('Google Places Textsuche nicht verfügbar');
   response=await Place.searchByText({
    textQuery:searchText,
    fields:['id','displayName','formattedAddress','location','types'],
    locationBias:center,maxResultCount:20,isOpenNow:openNow,
    rankPreference:sort==='distance'?(SearchByTextRankPreference?.DISTANCE||'DISTANCE'):(SearchByTextRankPreference?.RELEVANCE||'RELEVANCE'),
    ...(openNow&&types[type]?{includedType:types[type]}:{})
   });
  }else{
   if(!Place?.searchNearby)throw Error('Google Places Umgebungssuche nicht verfügbar');
   // Android expands nearby searches from 5 to 15 to 50 km when empty.
   for(const radius of [5000,15000,50000]){
    response=await Place.searchNearby({
     fields:['id','displayName','formattedAddress','location','types'],
     locationRestriction:{center,radius},
     includedPrimaryTypes:[types[type]||'restaurant'],
     maxResultCount:20,
     rankPreference:sort==='distance'?(SearchNearbyRankPreference?.DISTANCE||'DISTANCE'):(SearchNearbyRankPreference?.POPULARITY||'POPULARITY')
    });
    if(serial!==requestSerial)return false;
    if(response.places?.length)break;
   }
  }
  if(serial!==requestSerial)return false;
  poiResults=(response?.places||[]).map(p=>{
   const point=p.location?.toJSON?.()||p.location;
   return {name:p.displayName||p.formattedAddress||'Ort',address:p.formattedAddress||'',lat:point?.lat,lng:point?.lng,
    placeId:p.id||'',types:Array.isArray(p.types)?p.types:[]};
  }).filter(valid);
  poiLoading=false;poiError=poiResults.length?'':'Keine passenden Orte gefunden.';
  refreshResults();return true;
 }catch(e){
  if(serial!==requestSerial)return false;
  poiLoading=false;poiError='Google Places: '+String(e.message||e);
  poiResults=[];refreshResults();return false;
 }
}
/** Points spread along the remaining path, with at most four Places requests.
 * This approximates a corridor, NOT Google's native detour-based search.
 */
function corridorCenters(path,from){
 if(path.length<2)return [];
 let start=0;
 if(from){
  let best=Infinity;
  path.forEach((p,i)=>{const dist=distanceBetween(from,p);if(dist<best){best=dist;start=i}});
 }
 const remaining=path.slice(start),total=remaining.slice(1).reduce((sum,p,i)=>sum+distanceBetween(remaining[i],p),0);
 if(!total)return [remaining[0]];
 const count=total<12000?1:total<40000?2:total<90000?3:4;
 const cumulative=[0];for(let i=1;i<remaining.length;i++)cumulative.push(cumulative[i-1]+distanceBetween(remaining[i-1],remaining[i]));
 const out=[];
 for(let i=0;i<count;i++){
  const target=total*((i+.5)/count);
  let idx=1;while(idx<cumulative.length-1&&cumulative[idx]<target)idx++;
  const prev=cumulative[idx-1],len=cumulative[idx]-prev;
  const t=len>0?Math.max(0,Math.min(1,(target-prev)/len)):0;
  out.push({lat:remaining[idx-1].lat+(remaining[idx].lat-remaining[idx-1].lat)*t,
   lng:remaining[idx-1].lng+(remaining[idx].lng-remaining[idx-1].lng)*t});
 }
 return out;
}
/** Resolve imported Place-ID-only favorites as waypoints, without changing
 * selected destination, route or active GPS guidance. */
async function webResolveStop(entry){
 if(nativeMode()||!entry||!hasPlaceId(entry))return null;
 if(valid(entry))return entry;
 try{
  await load();
  const {Place}=await google.maps.importLibrary('places');
  const place=new Place({id:entry.placeId});
  await place.fetchFields({fields:['location','formattedAddress']});
  const point=geoPoint(place.location);
  if(!point)return null;
  return {...entry,...point,address:entry.address||place.formattedAddress||'',fetchedAt:Date.now()};
 }catch{return null}
}
/** Place Details (Enterprise fields) fetched ONLY when the place sheet opens. */
async function webPlaceDetails(kind,index){
 if(nativeMode())return null;
 const base=kind==='suggest'?(poiActive?poiResults?.[index]:null):null;
 const prediction=kind==='suggest'&&!poiActive?suggestions[index]?.placePrediction:null;
 if(!base&&!prediction)return null;
 const result={name:base?.name||prediction?.text?.toString?.()||'Ort',
  address:base?.address||'',lat:base?.lat,lng:base?.lng,placeId:base?.placeId||'',types:base?.types||[]};
 try{
  await load();
  const {Place}=await google.maps.importLibrary('places');
  const place=prediction?.toPlace?.()||(result.placeId?new Place({id:result.placeId}):null);
  if(!place)return result;
  await place.fetchFields({fields:['id','displayName','formattedAddress','location','types',
   'rating','userRatingCount','internationalPhoneNumber','currentOpeningHours']});
  const point=place.location?.toJSON?.()||place.location;
  const hours=place.currentOpeningHours;
  let openNow=null;
  // isOpen() is available only in some Google Maps JS channels.
  if(typeof place.isOpen==='function'){
   try{const opened=await place.isOpen();if(typeof opened==='boolean')openNow=opened}catch{}
  }
  return {...result,name:place.displayName||result.name,address:place.formattedAddress||result.address,
   lat:Number.isFinite(point?.lat)?point.lat:result.lat,lng:Number.isFinite(point?.lng)?point.lng:result.lng,
   placeId:place.id||result.placeId,types:Array.isArray(place.types)?place.types:result.types,
   rating:Number.isFinite(place.rating)?place.rating:null,
   ratingCount:Number.isInteger(place.userRatingCount)?place.userRatingCount:null,
   phone:typeof place.internationalPhoneNumber==='string'?place.internationalPhoneNumber:'',
   openNow,hours:Array.isArray(hours?.weekdayDescriptions)?hours.weekdayDescriptions.slice(0,7):[]};
 }catch(e){
  // Keep basic fields usable even if expensive details cannot be loaded.
  return {...result,detailError:'Zusatzdaten nicht verfügbar: '+String(e.message||e)};
 }
}
function refreshResults(){
 const el=document.getElementById('suggestions');
 const markup=window.MeviWebNavParity?.resultsHTML?.();
 if(el&&typeof markup==='string')el.innerHTML=markup;
}
function list(kind){return kind==='favorites'?cache.favorites:cache.recent}
async function pick(kind,index,options={}){
 let d;
 if(kind==='suggest'){
  if(poiResults?.length){d=poiResults[index];if(!valid(d))return;poiResults=null}
  else {
  const prediction=suggestions[index]?.placePrediction;if(!prediction)return;
  try{
    const place=prediction.toPlace();
    await place.fetchFields({fields:['displayName','formattedAddress','location']});
    const p=place.location?.toJSON?.()||place.location;
    d={name:place.displayName||place.formattedAddress||prediction.text.toString(),address:place.formattedAddress||'',lat:p?.lat,lng:p?.lng,placeId:place.id||'',fetchedAt:Date.now()};
    token=null;
  }catch(e){status('Ziel konnte nicht geladen werden: '+(e.message||e));return}
  }
 }else d=kind==='home'||kind==='work'?cache.slots?.[kind]:kind==='stored'?unique([...cache.favorites,...cache.recent],12)[index]:list(kind)[index];
 if(d&&!valid(d)&&hasPlaceId(d)){
  // Android exports can contain only a Place ID. Resolve the coordinate on use,
  // retaining the original name, role, note, icon and place ID in the Web book.
  try{
   await load();
   const {Place}=await google.maps.importLibrary('places');
   const place=new Place({id:d.placeId});
   await place.fetchFields({fields:['location','formattedAddress']});
   const p=place.location?.toJSON?.()||place.location;
   const updated={...d,lat:p?.lat,lng:p?.lng,fetchedAt:Date.now(),address:d.address||place.formattedAddress||''};
   if(!valid(updated))throw new Error('Google hat keine gültige Position zurückgegeben.');
   d=updated;
   cache.favorites=cache.favorites.map(item=>hasPlaceId(item)&&item.placeId===d.placeId?d:item);
   for(const slot of ['home','work'])if(cache.slots[slot]?.placeId===d.placeId)cache.slots[slot]={...cache.slots[slot],lat:d.lat,lng:d.lng,fetchedAt:d.fetchedAt};
   persist();
  }catch(e){status('Gespeichertes Ziel konnte nicht geladen werden: '+(e.message||e),'places');return}
 }
 if(!valid(d))return false;
 if(options?.saveOnly&&!nativeMode()){
  // Android save mode does not cancel an active route. Keep the candidate separate
  // so Road Assist rerouting still targets the running guidance destination.
  pendingSave=d;return true;
 }
 if(nativeMode()){
  selected=d;cache.recent=unique([d,...cache.recent],MAX_RECENT);persist();
  try{await startNativeNavigation()}
  catch(e){status('Android-Navigation: '+(e.message||e))}
  return;
 }
 stopGuidance();selected=d;routeData=null;routeStops=[];routeOrigin=null;clearLines();mark(d);
 window.meviGoogleDestination?.(d.name,d.address,{skipPreview:options?.skipPreview===true});
 return true;
}

/** Browser-only destination book adapter. The native APK never calls these. */
function webData(){
 return {favorites:cache.favorites.slice(),recent:cache.recent.slice(),slots:{...cache.slots},
  suggestions:poiActive?poiResults.map(p=>({...p})):suggestions.map(s=>({name:s.placePrediction?.text?.toString?.()||'',address:'Google Places'})),
  poiResults:poiActive?poiResults.map(p=>({...p})):[],poiLoading,poiError,poiActive,poiAlongRoute:!!poiRequest?.alongRoute,
  origin:current||manualOrigin||null,query,error};
}
function webWrite(changes={}){
 if(nativeMode())return false;
 if(Object.prototype.hasOwnProperty.call(changes,'favorites'))cache.favorites=unique(changes.favorites||[],MAX_SAVED);
 if(Object.prototype.hasOwnProperty.call(changes,'recent'))cache.recent=unique(changes.recent||[],MAX_RECENT).filter(valid);
 if(Object.prototype.hasOwnProperty.call(changes,'slots')){
  const input=changes.slots||{};
  cache.slots={home:savedValid(input.home)?input.home:null,work:savedValid(input.work)?input.work:null};
 }
 capBook();persist();window.meviGoogleRerender?.();return true;
}
function webSaveSelectedSlot(slot){
 const candidate=pendingSave||selected;
 if(nativeMode()||!['home','work'].includes(slot)||!valid(candidate))return false;
 cache.slots[slot]={...candidate};pendingSave=null;capBook();persist();return true;
}
function saveFavorite(){const candidate=pendingSave||selected;if(!valid(candidate))return;cache.favorites=unique([candidate,...cache.favorites.filter(x=>keyOf(x)!==keyOf(candidate))],MAX_SAVED);pendingSave=null;capBook();persist();syncNativeLayout(true);window.meviGoogleRerender?.()}
function removeFavorite(){if(!selected)return;cache.favorites=cache.favorites.filter(x=>keyOf(x)!==keyOf(selected));persist();syncNativeLayout(true);window.meviGoogleRerender?.()}
function isFavorite(){return !!selected&&cache.favorites.some(x=>keyOf(x)===keyOf(selected))}
function selectedAddress(){return selected?.address||'Bitte gültige Adresse auswählen'}
function markOrigin(){
 if(!map||!manualOrigin)return;
 if(originMarker)originMarker.setMap(null);
 originMarker=new google.maps.Marker({
  map,position:manualOrigin,title:'Manueller Startpunkt',
  icon:{path:google.maps.SymbolPath.CIRCLE,scale:9,fillColor:'#13c5ea',fillOpacity:1,strokeColor:'#fff',strokeWeight:3}
 });
}
function selectOriginOnMap(){
 if(!key()){status('Bitte zuerst Google Maps einrichten.','maps-auth');return}
 choosingOrigin=true;clearStatus();
 const e=document.querySelector('.mg-navigation');if(e)e.classList.add('mg-selecting-origin');
 const parent=document.querySelector('.mg-navigation');
 if(parent&&!document.querySelector('.mg-origin-instruction')){
  const tip=document.createElement('div');
  tip.className='mg-origin-instruction';
  tip.setAttribute('role','status');
  tip.innerHTML='Startpunkt wählen: Auf eine Stelle der Karte tippen oder klicken. <button type="button" onclick="MeviGoogleNav.cancelOriginSelection()">Abbrechen</button>';
  parent.appendChild(tip);
 }
}
function cancelOriginSelection(){
 choosingOrigin=false;
 document.querySelector('.mg-navigation')?.classList.remove('mg-selecting-origin');
 document.querySelector('.mg-origin-instruction')?.remove();
}
function chooseOriginPoint(point){
 if(!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lng))return;
 manualOrigin={lat:point.lat,lng:point.lng};
 cancelOriginSelection();
 clearStatus();
 stopGuidance({keepRoute:true});routeData=null;routeStops=[];routeOrigin=null;routeSummary='';guidanceSteps=[];clearLines();markOrigin();
 window.meviGoogleRerender?.();
}
async function position(){
 if(!navigator.geolocation)throw new Error('Standortfunktion in diesem Browser nicht verfügbar.');
 const locate=options=>new Promise((resolve,reject)=>{
  navigator.geolocation.getCurrentPosition(p=>{
   const coords={lat:p.coords.latitude,lng:p.coords.longitude};
   if(!Number.isFinite(coords.lat)||!Number.isFinite(coords.lng))reject(new Error('Ungültige GPS-Koordinaten.'));
   else{current=coords;resolve(coords)}
  },reject,options);
 });
 try{
  return await locate({enableHighAccuracy:true,timeout:9500,maximumAge:20000});
 }catch(first){
  if(first.code===1)throw new Error('Standortzugriff verweigert. Bitte Standortberechtigung für MeviCar im Browser erlauben.');
  try{
   return await locate({enableHighAccuracy:false,timeout:6500,maximumAge:60000});
  }catch(second){
   if(second.code===1)throw new Error('Standortzugriff verweigert. Bitte Standortberechtigung im Browser erlauben.');
   if(second.code===3||first.code===3)throw new Error('Standort-Zeitüberschreitung: Auf diesem Gerät konnte kein GPS-Standort ermittelt werden.');
   throw new Error('Standort nicht verfügbar. Prüfe die Windows- oder Browser-Standortfreigabe.');
  }
 }
}
async function myLocation(){try{const p=await position();clearStatus();if(map){map.panTo(p);map.setZoom(16)}}catch(e){status(e.message,'gps')}}
function clearLines(){for(const l of routeLines)l.setMap(null);routeLines=[]}
let routeChoices=[];
function drawRoute(){
 clearLines();if(!map||!routeData)return;
 const alternatives=guidanceActive||state!=='ready'?[]:routeChoices.filter(route=>route!==routeData);
 for(const route of [...alternatives,routeData])for(const line of route.createPolylines()){
  const active=route===routeData;
  line.setOptions({strokeColor:active?'#26dcff':'#517ecb',strokeWeight:active?7:5,zIndex:active?2:1,clickable:!active});
  if(!active)line.addListener('click',()=>{
   if(previewBusy||guidanceActive||!routeChoices.includes(route))return;
   useRoute(route,{});window.meviGoogleRerender?.();
  });
  line.setMap(map);routeLines.push(line);
 }
 const path=routeData.path||[];
 if(path.length>1){
  const bounds=new google.maps.LatLngBounds();
  for(const route of [routeData,...alternatives])for(const point of route.path||[])bounds.extend({lat:point.lat,lng:point.lng});
  map.fitBounds(bounds,55);
 }
}
let routeSummary='';
let liveTripMeters=null,liveTripMinutes=null;
let guidanceStartedAt=null,guidanceDrivenMeters=0,guidancePreviousRemaining=null;
let guidanceMaxSpeed=null,guidanceSpeedTimestamp=null,guidanceCurrentSpeed=null;
function recordGuidanceSpeed(position){
 if(!guidanceActive||simulation||guidanceStartedAt===null)return;
 const {speed,accuracy}=position.coords||{},stamp=position.timestamp;
 // Missing speed is not standstill. Ignore inaccurate, stale or repeated fixes.
 if(!Number.isFinite(speed)||speed<0||!Number.isFinite(accuracy)||accuracy<0||accuracy>50||
    !Number.isFinite(stamp)||stamp<guidanceStartedAt||stamp>Date.now()+1000||Date.now()-stamp>15000||
    (guidanceSpeedTimestamp!==null&&stamp<=guidanceSpeedTimestamp))return;
 guidanceSpeedTimestamp=stamp;
 guidanceCurrentSpeed=speed*3.6;
 guidanceMaxSpeed=Math.max(guidanceMaxSpeed??0,guidanceCurrentSpeed);
}
function recordGuidanceProgress(meters){
 const remaining=Math.max(0,Math.round(Number(meters)));
 if(!Number.isFinite(remaining))return;
 const before=guidancePreviousRemaining;guidancePreviousRemaining=remaining;
 if(before===null)return;
 const difference=before-remaining;
 if(difference>=1&&difference<=3000)guidanceDrivenMeters+=difference;
}
function resetGuidanceProgress(){
 guidanceStartedAt=null;guidanceDrivenMeters=0;guidancePreviousRemaining=null;
 guidanceMaxSpeed=null;guidanceSpeedTimestamp=null;guidanceCurrentSpeed=null;
}
/* The compact Web trip strip is fed by the same route and GPS progress as
   spoken turn guidance, not by a second route calculation. */
function guidanceTrip(){
 const distance=Number.isFinite(liveTripMeters)?liveTripMeters:Math.max(0,Number(routeData?.distanceMeters)||0);
 const minutes=Number.isFinite(liveTripMinutes)?liveTripMinutes:Math.max(0,Math.round((Number(routeData?.durationMillis)||0)/60000));
 if(!routeData)return {arrival:'Ankunft –',summary:'',nextStop:'',muted:voiceMuted};
 return {seconds:minutes*60,meters:distance,
  nextStop:routeStops[0]?.name||routeStops[0]?.address||'',muted:voiceMuted};
}
/* Android NavRouteDetails.rows semantics over the existing browser route/GPS
   state: no duplicate Web view, no new directions calculation. */
/* Android: raw drive metrics of the SDK for the same dashboard renderer. Asked
   at most once a second and only while the dashboard paints; an APK without
   the action leaves the placeholders. */
let nativeMetrics=null,nativeMetricsAt=0,nativeMetricsBusy=false;
function nativeDashboardViewData(metrics){
 const data=metrics||{};
 // Older APK bridges have no routeActive field: retain guidance/route preview.
 const active=typeof data.routeActive==='boolean'?data.routeActive:
  !!nativePreview||data.remainingMeters!=null||data.remainingSeconds!=null;
 return {...data,routeActive:active};
}
function nativeDashboardData(){
 const now=Date.now();
 if(!nativeMetricsBusy&&now-nativeMetricsAt>=900){
  nativeMetricsBusy=true;nativeMetricsAt=now;
  nativeRequest('navigation.metrics').then(reply=>{
   nativeMetrics=reply?.metrics||null;
   const dashboard=document.getElementById('mg-nav-dashboard-split');
   if(dashboard)window.MeviNavDashboard?.paint?.(dashboard,nativeDashboardViewData(nativeMetrics));
  }).catch(()=>{nativeMetrics=null}).finally(()=>{nativeMetricsBusy=false});
 }
 return nativeDashboardViewData(now-nativeMetricsAt<=5000?nativeMetrics:null);
}
function guidanceDashboardData(){
 if(nativeMode())return nativeDashboardData();
 const now=Date.now();
 const seconds=Number.isFinite(liveTripMinutes)?Math.max(0,Math.round(liveTripMinutes*60)):
  routeData?Math.max(0,Math.round((Number(routeData.durationMillis)||0)/1000)):null;
 const remaining=Number.isFinite(liveTripMeters)?Math.max(0,Math.round(liveTripMeters)):
  routeData?Math.max(0,Math.round(Number(routeData.distanceMeters)||0)):null;
 const elapsed=guidanceStartedAt===null?null:now-guidanceStartedAt;
 return {
  routeActive:!!routeData||guidanceActive,
  nextCameraMeters:window.MeviRoadAssist?.nextCameraDistanceMeters?.()??null,
  speedKmh:!simulation&&guidanceSpeedTimestamp!==null&&now-guidanceSpeedTimestamp<=8000?guidanceCurrentSpeed:null,
  arrivalEpochMs:seconds===null?null:now+seconds*1000,
  remainingSeconds:seconds,remainingMeters:remaining,
  drivenMeters:!simulation?guidanceDrivenMeters:null,
  elapsedMs:!simulation?elapsed:null,
  maxKmh:!simulation?guidanceMaxSpeed:null
 };
}
function guidanceRowsHTML(rows){
 return '<dl class="mg-guidance-detail-list">'+rows.map(([label,value])=>
  '<div class="mg-guidance-detail-row"><dt>'+text(label)+'</dt><dd>'+text(value)+'</dd></div>').join('')+'</dl>';
}
function guidanceDetailsData(){
 const now=Date.now();
 const remaining=Math.max(0,Math.round(Number.isFinite(liveTripMeters)?liveTripMeters:(routeData?.distanceMeters||0)));
 const seconds=Math.max(0,Math.round(Number.isFinite(liveTripMinutes)?liveTripMinutes*60:(routeData?.durationMillis||0)/1000));
 const next=guidanceSteps[Math.min(stepIndex,guidanceSteps.length-1)];
 return {
  nowMs:now,startedAtMs:guidanceStartedAt,
  remainingSeconds:seconds,remainingMeters:remaining,drivenMeters:guidanceDrivenMeters,
  destination:selected?{title:selected.name||selected.address||'',address:selected.address||''}:null,
  stops:routeStops.map(stop=>stop.name||stop.address||'Stopp'),
  maneuver:next?{text:guidanceInstruction(next),
   distanceMeters:next.end&&current?distanceBetween(current,next.end):next.distanceMeters}:null,
  options:routeOptions,muted:voiceMuted,simulation,
  maxSpeedKmh:guidanceMaxSpeed,roadNote:window.MeviRoadAssist?.routeNote?.()||''
 };
}
function guidanceDetailsHTML(){
 return guidanceRowsHTML(window.MeviNavRouteDetails?.rows(guidanceDetailsData())||[]);
}
function geoPoint(input){
 if(!input)return null;
 const p=typeof input.toJSON==='function'?input.toJSON():input;
 const lat=typeof p.lat==='function'?p.lat():p.lat;
 const lng=typeof p.lng==='function'?p.lng():p.lng;
 return Number.isFinite(lat)&&Number.isFinite(lng)?{lat,lng}:null;
}
const distanceBetween=(a,b)=>window.MeviNavigationShared.distanceMeters(a,b);
const metersLabel=m=>Number.isFinite(m)?window.MeviNavRouteDetails.distance(m,'compact'):'–';
function guidanceInstruction(step){
 return (step?.instructions||'Der Route folgen').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}
function guidanceSymbol(step){
 const v=String(step?.maneuver||'').toUpperCase().replace(/-/g,'_');
 if(v.includes('LEFT'))return '↰';
 if(v.includes('RIGHT'))return '↱';
 if(v.includes('ROUNDABOUT'))return '⟳';
 if(v.includes('UTURN'))return '↶';
 if(v.includes('MERGE'))return '⇢';
 return '↑';
}
// Progress along the returned route polyline is estimated from each GPS fix.
// This avoids showing the original full-route ETA after the vehicle has moved.
function remainingAlongRoute(point,path){
 const polyline=(path||[]).map(geoPoint).filter(Boolean);
 if(!point||polyline.length<2)return null;
 let bestDistance=Infinity,bestAlong=0,acc=0;
 const totals=[];
 for(let i=0;i<polyline.length-1;i++){
  const a=polyline[i],b=polyline[i+1];
  const len=distanceBetween(a,b);
  totals.push(len);
  const k=Math.cos(point.lat*Math.PI/180),dx=(b.lng-a.lng)*k,dy=b.lat-a.lat;
  const x=(point.lng-a.lng)*k,y=point.lat-a.lat;
  const t=dx*dx+dy*dy>0?Math.max(0,Math.min(1,(x*dx+y*dy)/(dx*dx+dy*dy))):0;
  const foot={lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t};
  const off=distanceBetween(point,foot);
  if(off<bestDistance){bestDistance=off;bestAlong=acc+len*t}
  acc+=len;
 }
 if(!acc)return null;
 return{remaining:Math.max(0,(routeData?.distanceMeters||acc)*(1-bestAlong/acc)),offRouteMeters:bestDistance};
}
function stepsFromRoute(route){
 return (route?.legs||[]).flatMap(leg=>leg.steps||[]).map(step=>({
  instructions:guidanceInstruction(step),maneuver:step.maneuver||'',
  distanceMeters:step.distanceMeters||0,
  end:geoPoint(step.endLocation)||geoPoint(step.path?.[step.path.length-1]),
  start:geoPoint(step.startLocation)||geoPoint(step.path?.[0]),
  path:(step.path||[]).map(geoPoint).filter(Boolean)
 }));
}
async function computeRouteFrom(from,options={}){
 const serial=++routeRequestSerial;
 const stops=Array.isArray(options.stops)?options.stops.slice():routeStops.slice();
 if(!valid(selected)||!geoPoint(from))throw new Error('Startpunkt oder Ziel fehlt.');
 await load();
 const {Route}=await google.maps.importLibrary('routes');
 const {routes}=await Route.computeRoutes({
  origin:from,destination:{lat:selected.lat,lng:selected.lng},
  ...(stops.length?{intermediates:stops.map(p=>({location:{lat:p.lat,lng:p.lng}}))}:{}),
  travelMode:'DRIVING',
  routeModifiers:options.modifiers||routeOptions,
  ...(stops.length||guidanceActive?{}:{computeAlternativeRoutes:true}),
  fields:['path','distanceMeters','durationMillis','legs']
 });
 if(serial!==routeRequestSerial)throw new Error('Routenberechnung wurde überholt.');
 if(!routes?.length)throw new Error('Keine Fahrroute gefunden.');
 // Commit atomically AFTER a successful request. Failed stop additions leave
 // route, Road Assist, GPS watch and existing destination unchanged.
 routeChoices=routes;routeStops=stops;routeOrigin={lat:from.lat,lng:from.lng};
 useRoute(routes[0],options);
 return true;
}
function useRoute(route,options){
 routeData=route;
 window.MeviRoadAssist?.onRoute?.(routeData,options);
 guidanceSteps=stepsFromRoute(routeData);stepIndex=0;spokenThresholds.clear();lastSpokenStep=-1;liveTripMeters=null;liveTripMinutes=null;
 routeSummary=window.MeviNavRouteDetails.tripSummary((routeData.durationMillis||0)/1000,routeData.distanceMeters||0);
 clearStatus();drawRoute();
 if(guidanceActive&&!simulation&&current)followPosition(current);
}
const MAX_STOPS=8;
function routeStopKey(p){return p.placeId?'p:'+p.placeId:'c:'+p.lat.toFixed(4)+','+p.lng.toFixed(4)}
let previewBusy=false,nativePreview=null,nativePreviewTimer=null,nativePreviewRequest=false;
function watchNativePreview(el){
 const watch=!!el&&!window.MeviAndroidSharedNav?.isOpen?.()&&window.MeviAndroidSharedNav?.isOptedIn?.();
 if(!watch){
  if(nativePreviewTimer!==null)clearInterval(nativePreviewTimer);
  nativePreviewTimer=null;
  return;
 }
 if(nativePreviewTimer===null){
  nativePreviewTimer=setInterval(readNativePreview,1200);
  void readNativePreview();
 }
}
async function readNativePreview(){
 if(nativePreviewRequest||window.MeviAndroidSharedNav?.isOpen?.())return;
 nativePreviewRequest=true;
 try{
  const {route}=await nativeRequest('navigation.route.read');
  const next=route?.preview?{...route,...route.preview,native:true}:null;
  if(JSON.stringify(next)!==JSON.stringify(nativePreview)){
   nativePreview=next;
   if(!window.MeviAndroidSharedNav?.isOpen?.())window.meviGoogleRerender?.();
  }
 }catch{}finally{nativePreviewRequest=false}
}
function browserRoutePreview(){
 if(!routeData)return null;
 const seconds=Math.round((routeData.durationMillis||0)/1000);
 return {...routeContext(),seconds,meters:routeData.distanceMeters||0,options:routeOptions,
  alternatives:routeChoices.length>1};
}
async function previewAction(action,method,fields){
 if(previewBusy)return;
 previewBusy=true;
 try{
  if(nativeMode()){
   await nativeRequest(action,fields);
   await readNativePreview();
  }else await method();
 }catch(e){if(nativeMode())window.alert?.(String(e.message||e));else status(String(e.message||e),'route')}
 finally{previewBusy=false}
}
function previewStart(){return previewAction('navigation.route.start',()=>window.beginNavigation?.())}
function previewEnd(){return previewAction('navigation.stop',()=>window.stopRoute?.())}
function previewRemoveStop(index){return previewAction('navigation.route.removeStop',()=>removeRouteStop(index),{index})}
function previewToggleOption(key){
 if(!previewOptionKeys.includes(key))return;
 const value=!(nativeMode()?nativePreview?.options:routeOptions)?.[key];
 return previewAction('navigation.route.option',async()=>{
  if(!routeData||!routeOrigin)return;
  const modifiers={...routeOptions,[key]:value};
  await computeRouteFrom(routeOrigin,{modifiers});
  routeOptions=modifiers;
  try{localStorage.setItem(PREVIEW_OPTIONS,JSON.stringify(routeOptions))}catch{}
  window.meviGoogleRerender?.();
 },{key,value});
}
function routeContext(){return {
 hasRoute:!!routeData,active:guidanceActive,stops:routeStops.map(s=>({...s})),
 maxStops:MAX_STOPS,destination:selected?{...selected}:null
}}
async function withRouteStops(nextStops){
 if(nativeMode()||!routeData||!valid(selected)||reRouting)return false;
 if(nextStops.length>MAX_STOPS){status('Maximal acht Zwischenstopps möglich.','route');return false}
 const from=guidanceActive?(current||routeOrigin):routeOrigin;
 if(!geoPoint(from)){status('Kein gültiger Routenstart für die Neuberechnung.','route');return false}
 try{
  const ok=await computeRouteFrom(from,{stops:nextStops,reroute:true});
  if(!ok)return false;
  if(guidanceActive&&!simulation){
   offRouteCount=0;window.MeviRoadAssist?.onGuidanceStart?.(false);
   if(current)window.MeviRoadAssist?.onPosition?.(current,{accuracy:lastGpsAccuracy||30,timestamp:Date.now()});
  }
  if(guidanceActive&&simulation){
   // The demo follows its previous step sequence; stop simulation rather
   // than claiming that the old timer simulates the new waypoint journey.
   simulation=false;
   if(simulationTimer!==null){clearInterval(simulationTimer);simulationTimer=null}
   guidanceActive=false;
   window.MeviRoadAssist?.onGuidanceStop?.();
  }
  window.meviGoogleRerender?.();
  return true;
 }catch(e){status('Zwischenziel konnte nicht übernommen werden: '+(e.message||e),'route');return false}
}
async function addRouteStop(place){
 if(!valid(place)||!routeData)return false;
 const stop={lat:place.lat,lng:place.lng,name:place.name,address:place.address||'',placeId:place.placeId||''};
 if(routeStops.length>=MAX_STOPS){status('Maximal acht Zwischenstopps möglich.','route');return false}
 const key=routeStopKey(stop);
 if(routeStops.some(s=>routeStopKey(s)===key)||routeStopKey(selected)===key){
  status('Dieses Ziel ist bereits Teil der Route.','route');return false;
 }
 return withRouteStops([...routeStops,stop]);
}
async function removeRouteStop(index){
 if(!Number.isInteger(index)||index<0||index>=routeStops.length)return false;
 return withRouteStops(routeStops.filter((_,i)=>i!==index));
}

async function calculateRoute(){
 if(!selected){status('Bitte zuerst ein Ziel auswählen.');return false}
 if(nativeMode()){
  try{await startNativeNavigation();return 'native'}
  catch(e){status('Android-Routenberechnung: '+(e.message||e));return false}
 }
 try{
  let from;
  if(manualOrigin)from=manualOrigin;
  else{
   try{from=await position()}
   catch(e){status(e.message+' Wähle alternativ den Startpunkt auf der Karte.','gps');return false}
  }
  return await computeRouteFrom(from);
 }catch(e){status('Routenberechnung fehlgeschlagen: '+(e.message||e),'route');return false}
}
function markCurrent(point,heading){
 if(!map||!point)return;
 if(!positionMarker){
  positionMarker=new google.maps.Marker({map,position:point,title:'Dein Standort',zIndex:9,
   icon:{path:google.maps.SymbolPath.FORWARD_CLOSED_ARROW,scale:6,rotation:heading||0,
    fillColor:'#21d9fa',fillOpacity:1,strokeColor:'#fff',strokeWeight:2}});
 }else{
  positionMarker.setPosition(point);
  if(Number.isFinite(heading))positionMarker.setIcon({...positionMarker.getIcon(),rotation:heading});
 }
}
function announceRoadAssist(message){if(guidanceActive&&!simulation)speech(message)}
function speech(message){
 if(voiceMuted||simulation||!window.speechSynthesis||typeof window.SpeechSynthesisUtterance==='undefined')return;
 try{
  const utterance=new window.SpeechSynthesisUtterance(message);
  utterance.lang='de-DE';utterance.rate=1;utterance.volume=1;
  window.speechSynthesis.cancel();window.speechSynthesis.speak(utterance);
 }catch{/* No browser audio permission; visual guidance remains usable. */}
}
function toggleVoice(){
 voiceMuted=!voiceMuted;
 if(voiceMuted)try{window.speechSynthesis?.cancel()}catch{}
 paintGuidance();
}
function paintGuidance(){
 const step=guidanceSteps[Math.min(stepIndex,guidanceSteps.length-1)];
 const next=document.getElementById('mg-next-turn');
 const distance=document.getElementById('mg-next-distance');
 const arrow=document.getElementById('mg-next-arrow');
 if(next)next.textContent=step?.instructions||'Der Route folgen';
 if(arrow)arrow.textContent=guidanceSymbol(step);
 if(distance)distance.textContent=metersLabel(step?.end&&current?distanceBetween(current,step.end):step?.distanceMeters);
 const trip=guidanceTrip();
 const dash=document.getElementById('mg-nav-dashboard-split');
 if(dash)window.MeviNavDashboard?.paint?.(dash,guidanceDashboardData());
 // Shared HTML renderer also runs in the native SDK's offline trip WebView.
 window.MeviNavTrip?.paint(document.querySelector('.mg-guidance-trip'),trip,'showGuidanceDashboard()');
 window.MeviNavTrip?.paintControls(document.querySelector('.mg-web-guidance > .mevi-nav-controls'),{muted:voiceMuted});
 const dashboard=document.getElementById('mg-nav-dashboard-split');
 if(dashboard&&window.MeviNavDashboard?.detailsOpen?.())window.MeviNavDashboard.paintDetails(dashboard);
}
function showOverview(){
 if(!map||!routeData?.path?.length)return;
 followCamera=false;
 const locate=document.querySelector('.mg-web-driving .mg-my-location');
 if(locate)locate.hidden=false;
 const bounds=new google.maps.LatLngBounds();
 for(const p of routeData.path){const point=geoPoint(p);if(point)bounds.extend(point)}
 map.fitBounds(bounds,60);
}
function followMyLocation(){
 followCamera=true;
 const locate=document.querySelector('.mg-web-driving .mg-my-location');
 if(locate)locate.hidden=true;
 if(current){followPosition(current);markCurrent(current)}
}
async function recenter(){if(!current)await myLocation();followMyLocation()}
function followPosition(point,heading){
 if(!map||!followCamera)return;
 map.panTo(point);map.setZoom(17);
 if(Number.isFinite(heading)&&heading>=0)try{map.setHeading(heading)}catch{}
 try{map.setTilt(45)}catch{}
}
function nearestDistanceToPath(point,path){
 if(!point||!path?.length)return Infinity;
 let best=Infinity;
 for(let i=0;i<path.length-1;i++){
  const a=path[i],b=path[i+1];
  const x=(point.lng-a.lng)*Math.cos(point.lat*Math.PI/180),y=point.lat-a.lat;
  const dx=(b.lng-a.lng)*Math.cos(point.lat*Math.PI/180),dy=b.lat-a.lat;
  const len=dx*dx+dy*dy;
  const t=len>0?Math.max(0,Math.min(1,(x*dx+y*dy)/len)):0;
  best=Math.min(best,distanceBetween(point,{lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t}));
 }
 return Math.min(best,distanceBetween(point,path[0]));
}
function maybeAdvanceStep(point,accuracy){
 const step=guidanceSteps[stepIndex];if(!step)return;
 const remaining=distanceBetween(point,step.end);
 const threshold=Math.min(40,Math.max(20,Number(accuracy)||20));
 if(stepIndex<guidanceSteps.length-1&&remaining<=threshold){
  stepIndex++;spokenThresholds.clear();lastSpokenStep=-1;
  speech('Weiter: '+guidanceInstruction(guidanceSteps[stepIndex]));
 }else if(stepIndex===guidanceSteps.length-1&&selected&&distanceBetween(point,selected)<35){
  stopGuidance({keepRoute:true});window.meviGoogleNavigationFinished?.();return;
 }
 if(stepIndex!==lastSpokenStep){
  spokenThresholds.clear();lastSpokenStep=stepIndex;
 }
 const distance=distanceBetween(point,guidanceSteps[stepIndex].end);
 for(const limit of [600,180,60]){
  if(distance<=limit&&!spokenThresholds.has(limit)){
   spokenThresholds.add(limit);
   if(limit===600&&distance<220)continue;
   if(limit===180&&distance<85)continue;
   speech('In '+metersLabel(distance)+' '+guidanceSteps[stepIndex].instructions);
   break;
  }
 }
}
let guidanceGeneration=0;
async function reroute(point){
 const now=Date.now();
 if(reRouting||!guidanceActive||simulation||now-lastRerouteAt<30000)return;
 reRouting=true;lastRerouteAt=now;const generation=guidanceGeneration;
 status('Route wird ab dem aktuellen Standort neu berechnet …','route');
 try{
  await computeRouteFrom(point,{reroute:true});
  if(generation!==guidanceGeneration)return;
  offRouteCount=0;clearStatus();
  window.MeviRoadAssist?.onGuidanceStart?.(false);
  if(lastGpsAccuracy!==null)window.MeviRoadAssist?.onPosition?.(point,{accuracy:lastGpsAccuracy,timestamp:Date.now()});
  speech('Route wurde neu berechnet.');
 }catch(e){if(generation===guidanceGeneration)status('Neue Route nicht verfügbar: '+(e.message||e),'route')}
 finally{reRouting=false;paintGuidance()}
}
function updatePosition(p){
 if(!guidanceActive||simulation)return;
 const point={lat:p.coords.latitude,lng:p.coords.longitude};
 if(!Number.isFinite(point.lat)||!Number.isFinite(point.lng))return;
 current=point;lastGpsAccuracy=p.coords.accuracy||null;
 currentSpeed=Number.isFinite(p.coords.speed)&&p.coords.speed>=0?p.coords.speed*3.6:null;
 recordGuidanceSpeed(p);
 window.MeviRoadAssist?.onPosition?.(point,{accuracy:p.coords.accuracy,timestamp:p.timestamp||Date.now()});
 markCurrent(point,p.coords.heading);followPosition(point,p.coords.heading);
 if(lastGpsAccuracy===null||lastGpsAccuracy<75)maybeAdvanceStep(point,lastGpsAccuracy);
 const progress=remainingAlongRoute(point,routeData?.path);
 if(progress){
  const mins=Math.max(0,Math.round((routeData.durationMillis||0)/60000*(progress.remaining/Math.max(1,routeData.distanceMeters||1))));
  recordGuidanceProgress(progress.remaining);
  liveTripMeters=progress.remaining;liveTripMinutes=mins;
 }
 const nearest=progress?.offRouteMeters??nearestDistanceToPath(point,routeData?.path);
 if(lastGpsAccuracy!==null&&lastGpsAccuracy<50&&nearest>110)offRouteCount++;
 else offRouteCount=0;
 if(offRouteCount>=3)reroute(point);
 paintGuidance();
}
async function startGuidance(){
 if(nativeMode()){
  try{await startNativeNavigation();return 'native'}
  catch(e){status('Android-Navigation: '+(e.message||e));return false}
 }
 if(!routeData||!selected){status('Bitte zuerst eine Route berechnen.','route');return false}
 if(guidanceActive)return true;
 if(window.MeviNativeBridge?.postMessage){
  try{
   if(await startNativeNavigation()){
    status('Google Navigation SDK gestartet · die Android-Karte ist geöffnet.');
    return 'native';
   }
  }catch(e){
   status('Android-Navigation nicht gestartet: '+(e.message||e),'route');
   return false;
  }
 }
 try{
  const actual=await position();
  if(manualOrigin&&distanceBetween(manualOrigin,actual)>150){
   await computeRouteFrom(actual);
  }
  manualOrigin=null;guidanceActive=true;simulation=false;followCamera=true;guidanceGeneration++;
  resetGuidanceProgress();guidanceStartedAt=Date.now();
  window.MeviRoadAssist?.onGuidanceStart?.(false);
  stepIndex=0;spokenThresholds.clear();offRouteCount=0;
  clearStatus();
  const geo=navigator.geolocation;
  geoWatch=geo.watchPosition(updatePosition,e=>status('GPS-Signal: '+(e.code===3?'Zeitüberschreitung':e.message),'gps'),
   {enableHighAccuracy:true,maximumAge:2000,timeout:12000});
  followPosition(actual);markCurrent(actual);
  cache.recent=unique([selected,...cache.recent],MAX_RECENT);persist();
  paintGuidance();speech('Navigation gestartet. '+(guidanceSteps[0]?.instructions||'Der Route folgen'));
  return true;
 }catch(e){status('Navigation nicht gestartet: '+(e.message||e),'gps');return false}
}
function startDemo(){
 if(!routeData||!guidanceSteps.length){status('Keine Abbiegeschritte für Demo vorhanden.','route');return false}
 stopGuidance({keepRoute:true});
 guidanceActive=true;simulation=true;stepIndex=0;spokenThresholds.clear();guidanceGeneration++;liveTripMeters=null;liveTripMinutes=null;
 resetGuidanceProgress();guidanceStartedAt=Date.now();current=manualOrigin||geoPoint(routeData.path?.[0])||current;
 window.MeviRoadAssist?.onGuidanceStart?.(true);
 clearStatus();
 if(simulationTimer!==null)clearInterval(simulationTimer);
 simulationTimer=setInterval(()=>{
  if(!simulation)return;
  const step=guidanceSteps[stepIndex];
  if(step?.end){current=step.end;markCurrent(step.end);followPosition(step.end);const p=remainingAlongRoute(current,routeData?.path);if(p){
   recordGuidanceProgress(p.remaining);
   liveTripMeters=p.remaining;
   liveTripMinutes=Math.max(0,Math.round((routeData.durationMillis||0)/60000*(p.remaining/Math.max(1,routeData.distanceMeters||1))));
  }}
  if(stepIndex<guidanceSteps.length-1)stepIndex++;
  else{stopGuidance({keepRoute:true});window.meviGoogleNavigationFinished?.();return}
  paintGuidance();
 },4500);
 paintGuidance();return true;
}
function stopGuidance(options={}){
 guidanceGeneration++;routeRequestSerial++;
 if(geoWatch!==null){navigator.geolocation?.clearWatch(geoWatch);geoWatch=null}
 if(simulationTimer!==null){clearInterval(simulationTimer);simulationTimer=null}
 try{window.speechSynthesis?.cancel()}catch{}
 guidanceActive=false;simulation=false;currentSpeed=null;offRouteCount=0;liveTripMeters=null;liveTripMinutes=null;
 resetGuidanceProgress();
 window.MeviRoadAssist?.onGuidanceStop?.();
 if(positionMarker){positionMarker.setMap(null);positionMarker=null}
 if(!options.keepRoute){routeRequestSerial++;routeChoices=[];routeData=null;routeStops=[];routeOrigin=null;routeSummary='';guidanceSteps=[];stepIndex=0;clearLines();selected=null;window.MeviRoadAssist?.onRoute?.([])}
}
function hasPlannedRoute(){return !!routeData}
function guidanceRunning(){return guidanceActive}
function locationButton(){return '<button type="button" class="mg-my-location"'+(guidanceActive?' hidden':'')+' onclick="MeviGoogleNav.recenter()" aria-label="Auf eigenen Standort zentrieren" title="Auf eigenen Standort zentrieren">◎</button>'}
function routeInfo(){return routeSummary}
window.MeviGoogleNav={refreshNativeRoutePreview:readNativePreview,
 currentNativeArrival,showNativeArrival,closeNativeArrival,nativeArrivalAction,
 toggleNativeGuidanceMenu,closeNativeGuidanceMenu,refreshNativeGuidanceMenu,nativeGuidanceMode,
 nativeGuidanceMuted,nativeGuidanceRoadEnabled,nativeGuidanceRoadVoice,nativeGuidanceDetailsHTML,
 nativeGuidanceShowDetails,nativeGuidanceBack,nativeGuidanceAction,guidanceTrip,guidanceDashboardData,guidanceDetailsHTML,browserRoutePreview,nativeRoutePreview:()=>nativePreview,previewStart,previewEnd,previewRemoveStop,previewToggleOption,webData,webWrite,webSaveSelectedSlot,webPoi,webPlaceDetails,webResolveStop,routeContext,addRouteStop,removeRouteStop,mount,mapBackdrop,syncNativeLayout,isNativeMode:nativeMode,nativeRequest,destinationName:()=>selected?.name||'',nativeBusy,openNativeMap,openNativeSearch,changeQuery,pick,saveFavorite,removeFavorite,isFavorite,selectedDestination:()=>selected?{...selected}:null,selectedAddress,selectOriginOnMap,cancelOriginSelection,chooseOriginPoint,isManualOrigin:()=>!!manualOrigin,setKey,removeKey,hasKey:()=>nativeMode()||!!key(),calculateRoute,startGuidance,startDemo,stopGuidance,toggleVoice,announceRoadAssist,showOverview,followMyLocation,recenter,paintGuidance,hasPlannedRoute,guidanceRunning,locationButton,routeInfo,myLocation,setupHTML};
// Repaint after this defer-like script loads; the inline cockpit rendered before it.
if (typeof window.render === 'function') window.render();
})();

