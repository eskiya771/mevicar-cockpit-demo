/* MeviCar Next navigation adapter – Classic destination rules, Google Maps web APIs.
   A browser-restricted Google Maps JavaScript key is required. Never copy Android keys. */
(function(){
'use strict';
const KEY='mevicar-next-google-maps-key-v1', DATA='mevicar-next-destinations-v1';
const MAX_SAVED=200,MAX_RECENT=30;
const PREVIEW_OPTIONS='mevicar-next-route-options-v1', previewOptionKeys=['avoidTolls','avoidHighways','avoidFerries'];
const MAP_ORIENTATION_KEY='mevicar-next-web-map-orientation-v1';
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
let trafficLayer=null;
const TRAFFIC_SETTINGS='mevicar-next-web-traffic-settings-v1';
let trafficSettings={layer:true,voice:false,auto:false};
let trafficAutoRevision=0;
try{const saved=JSON.parse(localStorage.getItem(TRAFFIC_SETTINGS)||'{}');
 trafficSettings={layer:saved?.layer!==false,voice:saved?.voice===true,auto:saved?.auto===true}}catch{}
let trafficWarnings={keys:new Set(),at:null};
function setTrafficSetting(key,value){
 if(nativeMode()||!['layer','voice','auto'].includes(key)||typeof value!=='boolean')return false;
 if(key==='auto'&&trafficSettings.auto!==value){
  trafficAutoRevision++;
  if(!value&&trafficOffer?.automatic){trafficOffer=null;trafficCheckMessage='Automatische Verkehrsprüfung deaktiviert.';}
 }
 trafficSettings={...trafficSettings,[key]:value};
 try{localStorage.setItem(TRAFFIC_SETTINGS,JSON.stringify(trafficSettings))}catch{}
 if(key==='layer')trafficLayer?.setMap(value?map:null);
 return true;
}
let nativeTrafficConfig=null,nativeTrafficLoading=false,nativeTrafficError=false;
function nativeTrafficFields(){
 if(!nativeTrafficConfig)return '<p class="mg-speed-settings-note">'+(nativeTrafficError?'Verkehrseinstellungen benötigen eine kompatible APK.':'Verkehrseinstellungen werden geladen …')+'</p>';
 const field=(key,label)=>'<label class="mg-speed-settings-field">'+label+
  '<select aria-label="'+label+'" onchange="MeviGoogleNav.setNativeTrafficSetting(\''+key+'\',this.value===\'on\')">'+
  '<option value="on"'+(nativeTrafficConfig[key]?' selected':'')+'>Ein</option>'+
  '<option value="off"'+(!nativeTrafficConfig[key]?' selected':'')+'>Aus</option></select></label>';
 return field('layer','Verkehr auf Straßenkarte')+field('prompts','Google-Verkehrsmeldungen auf Karte')+
  '<p class="mg-speed-settings-note">Zusätzliche Google-Ereigniskarten sind optional. Routenberechnung und native Sprachführung bleiben unabhängig. Meldungen sind regional unterschiedlich verfügbar.</p>';
}
function paintNativeTrafficSettings(){
 const host=document.querySelector?.('[data-native-traffic-settings]');
 if(host)host.innerHTML=nativeTrafficFields();
}
async function readNativeTrafficSettings(fields={}){
 if(nativeTrafficLoading)return false;
 nativeTrafficLoading=true;
 try{
  const r=await nativeRequest('navigation.traffic.settings',fields);
  if(typeof r.layer!=='boolean'||typeof r.prompts!=='boolean')throw Error('Verkehrseinstellungen fehlen');
  nativeTrafficConfig={layer:r.layer,prompts:r.prompts};nativeTrafficError=false;return true;
 }catch{nativeTrafficError=true;return false}
 finally{nativeTrafficLoading=false;paintNativeTrafficSettings()}
}
function setNativeTrafficSetting(key,value){
 if(!nativeMode()||!nativeTrafficConfig||!['layer','prompts'].includes(key)||typeof value!=='boolean')return false;
 return readNativeTrafficSettings({key,value});
}
function trafficSettingsHTML(){
 if(nativeMode()){
  if(!nativeTrafficConfig&&!nativeTrafficLoading&&!nativeTrafficError)void readNativeTrafficSettings();
  return '<section class="mg-speed-settings" aria-label="Verkehr"><h3>Verkehr</h3><div data-native-traffic-settings>'+nativeTrafficFields()+'</div></section>';
 }
 const field=(key,label)=>'<label class="mg-speed-settings-field">'+label+
  '<select aria-label="'+label+'" onchange="MeviGoogleNav.setTrafficSetting(\''+key+'\',this.value===\'on\')">'+
  '<option value="on"'+(trafficSettings[key]?' selected':'')+'>Ein</option>'+
  '<option value="off"'+(!trafficSettings[key]?' selected':'')+'>Aus</option></select></label>';
 return '<section class="mg-speed-settings" aria-label="Verkehr (Web)"><h3>Verkehr (Web)</h3>'+
  field('layer','Verkehr auf Straßenkarte')+field('voice','Stauwarnungen vorlesen')+field('auto','Automatisch Verkehr prüfen')+
  '<p class="mg-speed-settings-note">Automatik: frühestens alle 5 Minuten, insgesamt höchstens 6 manuelle und automatische Prüfungen pro Fahrt. Zusätzliche Google-Routenabfragen können Kosten verursachen. Nur aktive Fahrt mit sicheren Wegpunktdaten; Vorschläge in Routendetails, Wechsel nur nach Bestätigung. Android nutzt die native Google-Führung.</p></section>';
}
let map=null,mapElement=null,mapLoading=null,geoWatch=null,current=null,marker=null,stopFocusMarker=null,routeLines=[],routeData=null,routeStops=[],routeOrigin=null,routeRequestSerial=0,selected=null,pendingSave=null,suggestions=[],poiResults=null,poiLoading=false,poiError='',poiActive=false,poiRequest=null,query='',timer=null,requestSerial=0,token=null,error='',errorKind='',manualOrigin=null,originMarker=null,positionMarker=null,choosingOrigin=false,state='browse',mounted=false,stage='setup',guidanceActive=false,simulation=false,guidanceSteps=[],stepIndex=0,spokenThresholds=new Set(),lastSpokenStep=-1,offRouteCount=0,lastRerouteAt=0,reRouting=false,simulationTimer=null,voiceMuted=false,currentSpeed=null,lastGpsAccuracy=null,followCamera=true,overviewActive=false;
let cameraMode='travel',driveHeading=null,driveGpsFix=null;
try{if(localStorage.getItem(MAP_ORIENTATION_KEY)==='north')cameraMode='north'}catch{}
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
 // Native Android views sit above the entire WebView, even its highest CSS z-index.
 // A full-screen Gemini dialog therefore owns the surface until it is removed.
 const geminiOpen=!!document.getElementById('mg-gemini-voice');
 const usable=!geminiOpen&&!window.MeviAndroidSharedNav?.isOpen?.()&&rect&&rect.width>=1&&rect.height>=1&&vw>0&&vh>0;
 nativeMapShown=!!usable;
 watchTrip(!usable);
 const fields=usable?{
  visible:true,
  // Avoid a second ETA bar when the right-side split is already present.
  split:!!document.querySelector?.('#screen > aside.side'),
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
function nativeGuidanceDetailsHTML(trafficView=false){
 const model=window.MeviNavRouteDetails;
 const raw=nativeGuidanceState.detailData;
 if(raw&&model)return guidanceRowsHTML(trafficDetailRows(model.rows(raw),trafficView),raw.stops,false);
 const rows=Array.isArray(nativeGuidanceState.details)?nativeGuidanceState.details:[];
 return rows.length?guidanceRowsHTML(trafficDetailRows(rows.filter(r=>r&&typeof r.label==='string'&&typeof r.value==='string').map(r=>[r.label,r.value]),trafficView)):
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
  if(action==='overview'||action==='overviewShow'){await nativeRequest(action==='overviewShow'?'navigation.guidance.overview.show':'navigation.guidance.overview');return true}
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
   window.gm_authFailure=()=>status('Google Maps verweigert die Berechtigung. Prüfe in Google Cloud Abrechnung, Maps JavaScript API und die erlaubten Websites '+location.origin+' sowie '+location.origin+'/*.','maps-auth');
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
     clearRouteMapMarkers();
     mapElement=el;
     // Raster maps silently ignore setHeading. Vector rendering needs no extra Map ID.
     map=new google.maps.Map(el,{center:current||FALLBACK_CENTER,zoom:12,
      renderingType:google.maps.RenderingType?.VECTOR||'VECTOR',heading:0,tilt:0,
      headingInteractionEnabled:false,tiltInteractionEnabled:false,
      disableDefaultUI:true,zoomControl:true,keyboardShortcuts:false,
      clickableIcons:false,gestureHandling:'greedy',backgroundColor:'#152536'});
     if(trafficLayer)trafficLayer.setMap(null);
     trafficLayer=typeof google.maps.TrafficLayer==='function'?new google.maps.TrafficLayer():null;
     trafficLayer?.setMap(trafficSettings.layer?map:null);
     map.addListener('click',event=>{
       if(!choosingOrigin||!event.latLng)return;
       chooseOriginPoint(event.latLng.toJSON());
     });
     map.addListener('dragstart',()=>{
      if(!guidanceActive)return;
      followCamera=false;overviewActive=false;paintCameraControls();
     });
     if(stopFocusMarker){stopFocusMarker.setMap(null);stopFocusMarker=null}
     marker=null;originMarker=null;positionMarker=null;routeLines=[];
     if(current&&guidanceActive)markCurrent(current,driveHeading);
     if(selected)mark(selected);
     if(manualOrigin)markOrigin();
     if(routeData)drawRoute();
     if(guidanceActive){if(current)followPosition(current,driveHeading);paintGuidance()}
   }
   const hint=document.querySelector('.mg-map-state');if(hint)hint.hidden=!error;
    paintCameraControls();
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
  food:'restaurant',cafe:'cafe',cart:'supermarket',rest:'rest_stop',wrench:'car_repair',
  bar:'bar'};
 const openNow=!!options.openNow,sort=options.sort==='relevance'?'relevance':'distance',alongRoute=!!options.alongRoute;
 const atDestination=!!options.atDestination;
 const near=String(options.near||'').trim().slice(0,60);
 const namedPlace=!!options.namedPlace;
 changeQuery(searchText);
 clearTimeout(timer);
 const serial=++requestSerial;
 poiActive=true;poiResults=[];poiLoading=true;poiError='';error='';
 poiRequest={type,searchText,openNow,sort,alongRoute,near,atDestination,namedPlace};
 suggestions=[];refreshResults();
 // "Dort parken" must search by the resolved destination, never the live
 // GPS position (which could be hundreds of kilometres away).
 const center=atDestination?geoPoint(selected):
  origin||current||manualOrigin||map?.getCenter()?.toJSON?.()||FALLBACK_CENTER;
 try{
  if(atDestination&&!center)throw Error('Für die Parkplatzsuche fehlt das ausgewählte Ziel.');
  await load();
  const {Place,SearchNearbyRankPreference,SearchByTextRankPreference}=await google.maps.importLibrary('places');
  if(serial!==requestSerial)return false;
  let response;
  if(alongRoute){
   // Maps JavaScript Place.searchByText does not accept searchAlongRouteParameters.
   // Search a bounded set of circles, then keep only results near the drawn route.
   const path=(routeData?.path||[]).map(geoPoint).filter(Boolean);
   const routeIdentity=routeData,routeRevision=routeRequestSerial;
   const progress=guidanceActive?trafficFractionNow(Date.now()):0;
   if(guidanceActive&&!Number.isFinite(progress))throw Error('Für die Suche auf der verbleibenden Route fehlt eine sichere GPS-Position.');
   if(path.length<2)throw new Error('Bitte zuerst eine Route berechnen.');
   if(!Place?.searchByText)throw new Error('Google Places Textsuche nicht verfügbar');
   // A named town must constrain the actual Google Places query, not just
   // appear in the assistant's spoken reply. One explicit city text search
   // replaces up to four generic corridor-sampling requests.
   const sampleCenters=near?[null]:corridorCenters(path,current||routeOrigin||center);
   const found=[],seen=new Set();
   for(const location of sampleCenters){
    const res=await Place.searchByText({
     textQuery:near?searchText+' in '+near:searchText,
     fields:['id','displayName','formattedAddress','location','types'],
     ...(location?{locationBias:{center:location,radius:14000}}:{}),
     maxResultCount:near?20:12,isOpenNow:openNow,
     rankPreference:near?'RELEVANCE':sort==='distance'?(SearchByTextRankPreference?.DISTANCE||'DISTANCE'):
      (SearchByTextRankPreference?.RELEVANCE||'RELEVANCE'),
     ...(!namedPlace&&types[type]?{includedType:types[type]}:{})
    });
    if(serial!==requestSerial)return false;
    if(routeIdentity!==routeData||routeRevision!==routeRequestSerial)throw Error('Die Route hat sich während der Suche geändert.');
    for(const place of res.places||[]){
     const loc=geoPoint(place.location),projection=loc&&remainingAlongRoute(loc,path);
     if(!projection||projection.offRouteMeters>8000||!Number.isFinite(projection.trafficFraction)||
        projection.trafficFraction+1e-6<progress)continue;
     const k=place.id||loc.lat.toFixed(5)+','+loc.lng.toFixed(5);
     if(seen.has(k))continue;seen.add(k);
     found.push(place);
    }
   }
   if(sort==='distance')found.sort((a,b)=>remainingAlongRoute(geoPoint(a.location),path).alongMeters-
      remainingAlongRoute(geoPoint(b.location),path).alongMeters);
   response={places:found.slice(0,20)};
  }else if(near){
   // Local area search has no route. Never bias the named district to the
   // phone's current GPS position (which might be in a different town).
   if(!Place?.searchByText)throw Error('Google Places Textsuche nicht verfügbar');
   const area=near;
   const queries=type==='bar'&&!namedPlace?['Biergarten in '+area,'Kneipe in '+area]:
    [searchText+' in '+area];
   const found=[],seen=new Set();
   for(const textQuery of queries){
    const res=await Place.searchByText({
     textQuery,fields:['id','displayName','formattedAddress','location','types'],
     maxResultCount:type==='bar'?10:20,isOpenNow:openNow,
     rankPreference:SearchByTextRankPreference?.RELEVANCE||'RELEVANCE'
    });
    if(serial!==requestSerial)return false;
    for(const place of res.places||[]){
     const point=geoPoint(place.location);
     if(!point)continue;
     const k=place.id||point.lat.toFixed(5)+','+point.lng.toFixed(5);
     if(seen.has(k))continue;
     seen.add(k);found.push(place);
    }
   }
   response={places:found.slice(0,20)};
  }else if(type==='text'||openNow){
   if(!Place?.searchByText)throw Error('Google Places Textsuche nicht verfügbar');
   response=await Place.searchByText({
    textQuery:atDestination?searchText+' '+(selected?.name||''):searchText,
    fields:['id','displayName','formattedAddress','location','types'],
    locationBias:center,maxResultCount:20,isOpenNow:openNow,
    rankPreference:sort==='distance'?(SearchByTextRankPreference?.DISTANCE||'DISTANCE'):(SearchByTextRankPreference?.RELEVANCE||'RELEVANCE'),
    ...(openNow&&!namedPlace&&types[type]?{includedType:types[type]}:{})
   });
  }else{
   if(!Place?.searchNearby)throw Error('Google Places Umgebungssuche nicht verfügbar');
   // Android expands nearby searches from 5 to 15 to 50 km when empty.
   for(const radius of atDestination?[3000,8000]:[5000,15000,50000]){
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
  // Even a city-name text result must be inside the target-area radius.
  // This is a local filter, not a claim of real road detour time.
  if(atDestination)response={places:(response?.places||[]).filter(place=>{
   const point=geoPoint(place.location);
   return point&&distanceBetween(point,center)<=8000;
  })};
  poiResults=(response?.places||[]).map(p=>{
   const point=p.location?.toJSON?.()||p.location;
   return {name:p.displayName||p.formattedAddress||'Ort',address:p.formattedAddress||'',lat:point?.lat,lng:point?.lng,
    placeId:p.id||'',types:Array.isArray(p.types)?p.types:[]};
  }).filter(valid);
  poiLoading=false;poiError=poiResults.length?'':atDestination?
   'Keine passenden Parkmöglichkeiten im Umkreis von 8 km um das Ziel gefunden.':
   near&&alongRoute?'Keine passenden Orte bei '+near+' entlang dieser Route gefunden. Wähle einen anderen Ort oder ändere die Suche.':
   near?'Keine passenden Orte im Gebiet '+near+' gefunden. Du kannst einen anderen Ort nennen.':
   'Keine passenden Orte gefunden.';
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
 // A destination explicitly selected in Places can have a corrected name
 // (e.g. voice transcript "Lauteken" → actual "Lauterecken").
 // Bind Voice 2.0's optional stop to this selected Place, not the typo.
 window.MeviGeminiVoice?.onDestinationSelected?.({destination:{...selected}});
 window.meviGoogleDestination?.(d.name,d.address,{skipPreview:options?.skipPreview===true});
 return true;
}

/* Direct spoken-address routing uses the same Google navigation source as
   manual Places selection. Only a fully resolved house-number address may
   skip the visible list; otherwise the shared search screen stays available. */
function normAddress(value){
 return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('de-DE').replace(/ß/g,'ss').replace(/str\.?$/,'strasse')
  .replace(/[^a-z0-9]/g,'');
}
function exactAddressParts(input){
 const phrase=String(input||'').trim().slice(0,200);
 // Do not route automatically on an unqualified city, postcode or street.
 const match=phrase.match(/([\p{L}\p{M}][\p{L}\p{M}.'-]{1,50}(?:straße|strasse|str\.?|weg|gasse|platz|allee|ring|damm|chaussee))\s+(\d{1,5}[a-z]?)\b/iu);
 if(!match)return null;
 const remainder=phrase.replace(match[0],' ').replace(/[,.]+/g,' ')
  .replace(/\b(?:bitte|fahre|fahr|navigiere|nach|zu|zum|zur|in|ich|mochte|möchte|will|fahren|deutschland)\b/gi,' ')
  .replace(/\s+/g,' ').trim();
 // The city is optional; if absent, Google must return exactly one verified
 // match across the country. Longer free-form fragments are not reliable.
 if(remainder.length>55)return null;
 return {street:match[1],number:match[2],city:remainder};
}
/* Reuse the exact same Google Places Autocomplete API that already supplies
   the working manual search list. Geocoding was a separate API dependency and
   failed on iPhone despite Google Places returning the right house number. */
function plausibleCity(actual,spoken){
 const a=normAddress(actual),b=normAddress(spoken);
 if(!a||!b)return false;
 if(a===b)return true;
 // Conservative STT correction: Lautecken -> Lauterecken (two missing letters).
 // Never fuzzy-match streets or house numbers, and never guess short city names.
 if(a.length<7||b.length<7||a.slice(0,4)!==b.slice(0,4)||
    Math.abs(a.length-b.length)>2)return false;
 let prev=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  const row=[i];
  for(let j=1;j<=b.length;j++)
   row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
  prev=row;
  if(Math.min(...row)>2)return false;
 }
 return prev[b.length]<=2;
}
function placeAddressParts(label){
 // Google formats a place as "Schillerstraße 10, 67742 Lauterecken,
 // Deutschland". Street, number, city must all be present.
 const compact=String(label||'').replace(/,\s*(?:Deutschland|Germany)\s*$/i,'')
  .replace(/\b\d{5}\b/g,'').replace(/\s*,\s*/g,', ').trim();
 return exactAddressParts(compact);
}
function matchesSpokenHouse(label,requested){
 const actual=placeAddressParts(label);
 return !!(actual&&requested&&requested.city&&actual.city&&
  normAddress(actual.street)===normAddress(requested.street)&&
  normAddress(actual.number)===normAddress(requested.number)&&
  plausibleCity(actual.city,requested.city));
}
async function resolveExactAddress(phrase){
 const requested=exactAddressParts(phrase);
 // Without a spoken town, even a unique search result could be the wrong
 // Schillerstraße 10 in another city: keep manual selection.
 if(nativeMode()||!requested?.city||!key())return null;
 await load();
 const {AutocompleteSessionToken,AutocompleteSuggestion}=
  await google.maps.importLibrary('places');
 if(!AutocompleteSuggestion?.fetchAutocompleteSuggestions)return null;
 const token=new AutocompleteSessionToken();
 const response=await AutocompleteSuggestion.fetchAutocompleteSuggestions({
  input:String(phrase).slice(0,200),language:'de',region:'de',sessionToken:token
 });
 const candidates=(response?.suggestions||[]).filter(s=>
  s.placePrediction&&matchesSpokenHouse(s.placePrediction.text?.toString?.(),requested));
 // Select only one matching house-number prediction. Multiple candidates,
 // including different entrances, need a human to choose.
 if(candidates.length!==1)return null;
 const place=candidates[0].placePrediction.toPlace();
 await place.fetchFields({fields:['displayName','formattedAddress','location']});
 const point=geoPoint(place.location);
 if(!point||!matchesSpokenHouse(place.formattedAddress,requested))return null;
 return {name:place.displayName||place.formattedAddress,
  address:place.formattedAddress,lat:point.lat,lng:point.lng,
  placeId:place.id||''};
}
function selectVerifiedAddress(place){
 if(nativeMode()||!valid(place))return false;
 stopGuidance();selected={...place};routeData=null;routeStops=[];routeOrigin=null;
 clearLines();mark(selected);
 window.MeviGeminiVoice?.onDestinationSelected?.({destination:{...selected}});
 window.meviGoogleDestination?.(selected.name,selected.address,{skipPreview:true});
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
async function myLocation(){try{const p=await position();current=p;clearStatus();if(map){map.panTo(p);map.setZoom(16)}}catch(e){status(e.message,'gps')}}
/* One set of map overlays for the EXISTING route preview. Blue numbers are
   Google Places intermediate stops; amber '!' pins are already-matched Road
   Assist cameras. This creates no second routing or camera-matching engine. */
let routeStopPins=[],routeCameraPins=[],routePinsKey='',routePinsInfo=null;
function clearRouteMapMarkers(){
 for(const pin of [...routeStopPins,...routeCameraPins])pin.setMap?.(null);
 routeStopPins=[];routeCameraPins=[];routePinsKey='';
 routePinsInfo?.close?.();
}
function pinIcon(color){
 const circle=google.maps.SymbolPath?.CIRCLE;
 return circle?{path:circle,scale:16,fillColor:color,fillOpacity:1,
  strokeColor:'#f2fbff',strokeWeight:2}:undefined;
}
function pinInfo(pin,title,detail,limit=null){
 if(!google.maps.InfoWindow||!pin?.addListener)return;
 if(!routePinsInfo)routePinsInfo=new google.maps.InfoWindow();
 pin.addListener('click',()=>{
  const safe=value=>String(value||'').replace(/[&<>"']/g,c=>
   ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  routePinsInfo.setContent('<div style="color:#172536;background:#fff;font-family:system-ui,sans-serif;line-height:1.35;padding:4px 8px 6px 2px;min-width:140px">'+
   (limit?'<div style="color:#172536;font-size:22px;font-weight:800;margin-bottom:4px">'+safe(limit)+' km/h</div>':'')+
   '<strong style="color:#172536;font-size:14px;font-weight:700">'+safe(title)+'</strong>'+
   (detail?'<div style="color:#425466;font-size:13px;margin-top:4px">'+safe(detail)+'</div>':'')+'</div>');
  routePinsInfo.open({map,anchor:pin});
 });
}
function syncRouteMapMarkers(){
 if(nativeMode()||!map||!routeData){clearRouteMapMarkers();return false}
 if(!google?.maps?.Marker)return false;
 const stops=routeStops.map((stop,i)=>({index:i,point:geoPoint(stop),
  name:String(stop.name||stop.address||'Zwischenstopp'),
  address:String(stop.address||'')})).filter(x=>x.point);
 const cameras=(window.MeviRoadAssist?.routeCameraMarkers?.()||[])
  .filter(x=>geoPoint(x)).slice(0,80);
 const key=JSON.stringify({
  stops:stops.map(s=>[s.index,s.point.lat,s.point.lng,s.name,s.address]),
  cameras:cameras.map(c=>[c.id,c.lat,c.lng,c.label,c.limit,c.location])
 });
 if(key===routePinsKey)return true;
 clearRouteMapMarkers();
 for(const stop of stops){
  const label=String(stop.index+1);
  const pin=new google.maps.Marker({map,position:stop.point,
   title:'Zwischenstopp '+label+': '+stop.name+
    (stop.address?' · '+stop.address:''),
   label:{text:label,color:'#ffffff',fontWeight:'800',fontSize:'15px'},
   ...(pinIcon('#177ce8')?{icon:pinIcon('#177ce8')}:{}),zIndex:18});
  pinInfo(pin,stop.name,stop.address);
  routeStopPins.push(pin);
 }
 for(const camera of cameras){
  const limit=Number.isFinite(camera.limit)?camera.limit:null;
  const desc=(camera.label||'Blitzer')+
   ' · '+(limit?limit+' km/h':'Limit nicht gemeldet');
  const pin=new google.maps.Marker({map,
   position:{lat:camera.lat,lng:camera.lng},
   title:desc+(camera.location?' · '+camera.location:''),
   label:{text:'!',color:'#101820',fontWeight:'900',fontSize:'17px'},
   ...(pinIcon('#f6ad24')?{icon:pinIcon('#f6ad24')}:{}),zIndex:16});
  pinInfo(pin,limit?(camera.label||'Blitzer'):desc,camera.location,limit);
  routeCameraPins.push(pin);
 }
 routePinsKey=key;
 return true;
}
function clearLines(){
 for(const l of routeLines)l.setMap(null);
 routeLines=[];
 clearRouteMapMarkers();
}
let routeChoices=[],routeTraffic=null,trafficGeometry=null,trafficProgress=null,trafficRenderRoute=null,railStops=[];
function drawRoute(preserveViewport=false){
 clearLines();if(!map||!routeData)return;
 const alternatives=guidanceActive||state!=='ready'?[]:routeChoices.filter(route=>route!==routeData);
 // Use the already returned route path for a blue casing, not another request
 // or a second navigation engine. Keep Google's speed colors above it.
 if(routeData.path?.length>1&&typeof google.maps.Polyline==='function'){
  const casing=new google.maps.Polyline({path:routeData.path,strokeColor:'#1556a5',
   strokeOpacity:1,strokeWeight:13,zIndex:2,clickable:false,geodesic:false});
  casing.setMap(map);routeLines.push(casing);
 }
 for(const route of [...alternatives,routeData]){
  const active=route===routeData,render=active&&trafficRenderRoute?trafficRenderRoute:route;
  for(const line of render.createPolylines()){
  // Keep Google's own traffic segment colors; only style the plain fallback and alternatives.
  const trafficColored=active&&Array.isArray(render.speedPaths)&&render.speedPaths.length>0;
  line.setOptions({...(trafficColored?{}:{strokeColor:active?'#26dcff':'#517ecb'}),strokeWeight:active?7:5,zIndex:active?3:1,clickable:!active});
  if(!active)line.addListener('click',()=>{
   if(previewBusy||guidanceActive||!routeChoices.includes(route))return;
   useRoute(route,{});window.meviGoogleRerender?.();
  });
  line.setMap(map);routeLines.push(line);
  }
 }
 const path=routeData.path||[];
 if(!preserveViewport&&path.length>1){
  const bounds=new google.maps.LatLngBounds();
  for(const route of [routeData,...alternatives])for(const point of route.path||[])bounds.extend({lat:point.lat,lng:point.lng});
  map.fitBounds(bounds,55);
 }
 syncRouteMapMarkers();
 if(!preserveViewport&&guidanceActive&&overviewActive)showOverview();
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
  destination:selected?.name||selected?.address||'',muted:voiceMuted,overview:overviewActive};
}
/* Android NavRouteDetails.rows semantics over the existing browser route/GPS
   state: no duplicate Web view, no new directions calculation. */
/* Android: raw drive metrics of the SDK for the same dashboard renderer. Asked
   at most once a second and only while the dashboard paints; an APK without
   the action leaves the placeholders. */
let nativeMetrics=null,nativeMetricsAt=0,nativeMetricsBusy=false;
// Use only recent, directly reported browser GPS altitude, never map terrain.
let gpsAltitudeMeters=null,gpsAltitudeAt=0;
function rememberAltitude(fix){
 const coords=fix?.coords||{},stamp=fix?.timestamp,now=Date.now();
 const fresh=Number.isFinite(stamp)&&stamp<=now+1000&&now-stamp<=12000;
 const acceptable=Number.isFinite(coords.altitude)&&coords.altitude>-500&&coords.altitude<9000&&
  (!Number.isFinite(coords.altitudeAccuracy)||coords.altitudeAccuracy>=0&&coords.altitudeAccuracy<=70)&&
  (!Number.isFinite(coords.accuracy)||coords.accuracy>=0&&coords.accuracy<=75);
 gpsAltitudeMeters=fresh&&acceptable?coords.altitude:null;
 gpsAltitudeAt=gpsAltitudeMeters===null?0:now;
}
function nativeDashboardViewData(metrics){
 const data=metrics||{};
 // Older APK bridges have no routeActive field: retain guidance/route preview.
 const active=typeof data.routeActive==='boolean'?data.routeActive:
  !!nativePreview||data.remainingMeters!=null||data.remainingSeconds!=null;
 const shared=window.MeviNavigationShared,leg=data.trafficLeg,now=Date.now();
 // Only use confirmed metre offsets of the SDK's current leg. Preserve
 // route-wide severity from TimeAndDistance; never infer delay minutes.
 const geometry=active&&leg?.scope==='current-leg'&&shared.trafficObservationFresh(leg.observedAt,now)?shared.trafficSectionsFromNativeLeg?.(leg):null;
 const full=active?shared.trafficGeometryFromNativeRoute?.(data.trafficRoute,now):null;
 const ahead=shared.trafficAhead?.(full||geometry,0);
 const source=full?data.trafficRoute:leg;
 const traffic=ahead?.nextDisruptionMeters!=null?shared.trafficSnapshot({
  ...ahead,observedAt:source.observedAt,routeRevision:source.routeRevision,
  status:ahead.status==='heavy'?'heavy':data.traffic?.status==='heavy'?'heavy':ahead.status
 },now):data.traffic;
 const observedAt=Number.isFinite(source?.observedAt)&&source.observedAt<=now?source.observedAt:null;
 const trafficDiagnostic=active?{
  provider:'android-sdk',observedAt,
  geometry:full?'full':geometry?'current-leg':'unavailable',
  reason:!full&&!geometry?'SDK-Abschnitte fehlen oder konnten nicht validiert werden.':observedAt===null?'Kein bestätigtes SDK-Verkehrsereignis.':!shared.trafficObservationFresh(observedAt,now)?'SDK-Verkehrsdaten älter als fünf Minuten.':'Nur vom SDK gemeldete Stauabschnitte sind farbig; übrige Strecken können unbekannt sein.',
  legStates:full?.legStates||[],revision:source?.routeRevision??null,
  auto:null
 }:null;
 return {...data,routeActive:active,traffic,routeRail:full?.rail||null,trafficDiagnostic};
}
// A voice query reads the same normalized native data as the dashboard,
 // not raw SDK severity alone and not a second Google route calculation.
async function readNativeTrafficMetrics(){
 if(!nativeMode())return null;
 const reply=await nativeRequest('navigation.metrics');
 return nativeDashboardViewData(reply?.metrics);
}
function nativeDashboardData(){
 const now=Date.now();
 if(!nativeMetricsBusy&&now-nativeMetricsAt>=900){
  nativeMetricsBusy=true;nativeMetricsAt=now;
  nativeRequest('navigation.metrics').then(reply=>{
   const age=Date.now()-now;
   nativeMetrics=age>=0&&age<=5000?reply?.metrics||null:null;
   const dashboard=document.getElementById('mg-nav-dashboard-split');
   if(dashboard)window.MeviNavDashboard?.paint?.(dashboard,nativeDashboardViewData(nativeMetrics));
  }).catch(()=>{nativeMetrics=null}).finally(()=>{nativeMetricsBusy=false});
 }
 return nativeDashboardViewData(now-nativeMetricsAt<=5000?nativeMetrics:null);
}
function trafficFractionNow(now){
 return guidanceActive?(trafficProgress&&now>=trafficProgress.at&&now-trafficProgress.at<=8000?trafficProgress.fraction:null):0;
}
function currentTraffic(now=Date.now()){
 if(!routeData)return null;
 const shared=window.MeviNavigationShared;
 const fraction=trafficFractionNow(now);
 const ahead=shared.trafficAhead?.(trafficGeometry,fraction);
 // The original route severity cannot describe remaining traffic after moving
 // unless its provider intervals can be matched to a fresh position.
 const status=guidanceActive&&!ahead?'unknown':ahead?.status||routeTraffic?.status||'unknown';
 // In a demo the displayed progress is synthetic; do not claim live traffic.
 if(simulation)return null;
 return shared.trafficSnapshot?.({...routeTraffic,...ahead,status},now)||null;
}
function currentRouteRail(now){
 if(!routeData||simulation)return null;
 const shared=window.MeviNavigationShared;
 const fraction=trafficFractionNow(now),planned=!guidanceActive||!Number.isFinite(fraction);
 const fresh=shared.trafficObservationFresh(routeTraffic?.observedAt,now);
 const sections=fresh&&trafficGeometry?trafficGeometry.sections.map(s=>({speed:s.speed,start:s.start/trafficGeometry.total,end:s.end/trafficGeometry.total})):[];
 const cameras=window.MeviRoadAssist?.routeRailMarkers?.()||[];
 const rail=shared.routeRail?.({progress:planned?0:fraction,sections,markers:[...railStops,...cameras],destination:selected?.name||selected?.address||'Ziel'});
 return rail?{...rail,scope:planned?'calculated-route':'remaining-route',distanceMeters:planned?routeData.distanceMeters:null}:null;
}
function webTrafficDiagnostic(now,check){
 if(!routeData&&!guidanceActive)return null;
 const observedAt=Number.isFinite(routeTraffic?.observedAt)&&routeTraffic.observedAt<=now?routeTraffic.observedAt:null;
 const fresh=window.MeviNavigationShared.trafficObservationFresh(observedAt,now);
 const positioned=Number.isFinite(trafficFractionNow(now));
 const reportRoute=trafficRenderRoute||routeData;
 const reason=simulation?'Demo – keine Live-Verkehrsposition.':!routeData?'Keine berechnete Route.':
  !positioned?'Keine verlässliche GPS-Position auf der Route. Balken zeigt die berechnete Gesamtroute, keine Live-Reststrecke.':
  observedAt===null?'Keine bestätigte Verkehrsberechnung.':!fresh?'Verkehrsdaten älter als fünf Minuten.':
  !trafficGeometry?'Google-SpeedPaths fehlen oder passen nicht zur Route.':'Google-Abschnitte entlang der berechneten Route.';
 return {provider:'web-routes',observedAt,geometry:!simulation&&fresh&&trafficGeometry?(!guidanceActive||!positioned?'calculated':'full'):'unavailable',
  reason,revision:routeTraffic?.routeRevision??null,auto:trafficSettings.auto,
  gpsPosition:simulation?'demo':!guidanceActive?'planning':positioned?'matched':'missing',
  providerSections:Array.isArray(reportRoute?.speedPaths)?reportRoute.speedPaths.length:0,
  validatedSections:trafficGeometry?.sections.length??0,
  sectionState:!Array.isArray(reportRoute?.speedPaths)||!reportRoute.speedPaths.length?'missing':!trafficGeometry?'invalid':!fresh?'stale':'valid',
  autoEligible:!simulation&&guidanceActive&&autoTrafficAllowed(now)&&check?.enabled===true&&!check.offer};
}
function guidanceDashboardData(){
 if(nativeMode())return nativeDashboardData();
 const now=Date.now();
 const seconds=Number.isFinite(liveTripMinutes)?Math.max(0,Math.round(liveTripMinutes*60)):
  routeData?Math.max(0,Math.round((Number(routeData.durationMillis)||0)/1000)):null;
 const remaining=Number.isFinite(liveTripMeters)?Math.max(0,Math.round(liveTripMeters)):
  routeData?Math.max(0,Math.round(Number(routeData.distanceMeters)||0)):null;
 const elapsed=guidanceStartedAt===null?null:now-guidanceStartedAt;
 const check=trafficCheckView();
 return {
  routeActive:!!routeData||guidanceActive,
  traffic:currentTraffic(now),routeRail:currentRouteRail(now),trafficCheck:check,trafficDiagnostic:webTrafficDiagnostic(now,check),
  nextCameraMeters:window.MeviRoadAssist?.nextCameraDistanceMeters?.()??null,
  speedKmh:!simulation&&guidanceSpeedTimestamp!==null&&now-guidanceSpeedTimestamp<=8000?guidanceCurrentSpeed:null,
  arrivalEpochMs:seconds===null?null:now+seconds*1000,
  remainingSeconds:seconds,remainingMeters:remaining,
  drivenMeters:!simulation?guidanceDrivenMeters:null,
  elapsedMs:!simulation?elapsed:null,
  maxKmh:!simulation?guidanceMaxSpeed:null,
  altitudeMeters:!simulation&&gpsAltitudeAt>0&&now-gpsAltitudeAt<=8000?gpsAltitudeMeters:null
 };
}
function guidanceRowsHTML(rows,stopItems=[],allowMapFocus=false){
 // The single shared row model decides the human-readable name/address.
 // The UI decorates waypoints with an optional map-focus action on Web.
 const model=window.MeviNavRouteDetails;
 const stops=Array.isArray(stopItems)?stopItems.map(model?.stopDetail||(()=>null)).filter(Boolean):[];
 return '<dl class="mg-guidance-detail-list">'+rows.map(([label,value])=>{
  if(label==='Nächster Stopp'&&stops[0]?.address){
   const first=stops[0],head=first.name+'\n'+first.address;
   const extra=String(value).startsWith(head)?String(value).slice(head.length).trim():'';
   return '<div class="mg-guidance-detail-row mg-guidance-detail-next-stop"><dt>'+
    text(label)+'</dt><dd><strong>'+text(first.name)+'</strong>'+
    '<span class="mg-guidance-stop-address">'+text(first.address)+'</span>'+
    (extra?'<small class="mg-guidance-stop-eta">'+text(extra)+'</small>':'')+
    '</dd></div>';
  }
  if(label==='Zwischenstopps'&&stops.length){
   const cards=stops.map((stop,i)=>'<div class="mg-guidance-stop-entry">'+
    '<strong>'+(i+1)+'. '+text(stop.name)+'</strong>'+
    (stop.address?'<span class="mg-guidance-stop-address">'+text(stop.address)+'</span>':'')+
    (allowMapFocus?'<button type="button" class="mg-guidance-stop-map" onclick="MeviGoogleNav.focusRouteStop('+i+')" aria-label="Zwischenstopp '+(i+1)+' auf Karte zeigen">⌖ Karte</button>':'')+
    '</div>').join('');
   return '<div class="mg-guidance-detail-row mg-guidance-detail-stops"><dt>'+text(label)+
    '</dt><dd>'+cards+'</dd></div>';
  }
  const location=label==='Ziel'||label==='Adresse';
  return '<div class="mg-guidance-detail-row'+(location?' mg-guidance-detail-location':'')+'"><dt>'+text(label)+'</dt><dd>'+text(value)+'</dd></div>';
 }).join('')+'</dl>';
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
  stops:routeStops.map(stop=>({name:stop.name||stop.address||'Zwischenstopp',
   address:stop.address||''})),
  maneuver:next?{text:guidanceInstruction(next),
   distanceMeters:next.end&&current?distanceBetween(current,next.end):next.distanceMeters}:null,
  options:routeOptions,muted:voiceMuted,simulation,
  maxSpeedKmh:guidanceMaxSpeed,roadNote:window.MeviRoadAssist?.routeNote?.()||''
 };
}
function trafficDetailRows(rows,trafficView){
 return trafficView?rows.filter(([label])=>!['Ankunft','Restzeit','Reststrecke'].includes(label)):rows;
}
function guidanceDetailsHTML(trafficView=false){
 const data=guidanceDetailsData();
 return guidanceRowsHTML(trafficDetailRows(window.MeviNavRouteDetails?.rows(data)||[],trafficView),data.stops,true);
}
/* Preview the selected real Google Places waypoint on the current route.
   The calculated route and its final destination remain unchanged. */
function focusRouteStop(index){
 if(nativeMode()||!routeData||!map||!Number.isInteger(index)||index<0||index>=routeStops.length)return false;
 const stop=routeStops[index];
 return focusRoutePoint(stop,[stop.name,stop.address].filter(Boolean).join(' · '));
}
function focusRoutePoint(place,title){
 if(nativeMode()||!routeData||!map)return false;
 const point=geoPoint(place);
 if(!point)return false;
 followCamera=false;overviewActive=false;paintCameraControls();
 if(stopFocusMarker){stopFocusMarker.setMap(null);stopFocusMarker=null}
 stopFocusMarker=new google.maps.Marker({
  map,position:point,title
 });
 map.panTo(point);map.setZoom(16);
 window.MeviNavDiagnostics?.record?.('selection','info','Routenpunkt auf Karte angezeigt');
 return true;
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
 const candidates=[];
 for(let i=0;i<polyline.length-1;i++){
  const a=polyline[i],b=polyline[i+1];
  const len=distanceBetween(a,b);
  if(!(len>0))continue;
  const k=Math.cos(point.lat*Math.PI/180),dx=(b.lng-a.lng)*k,dy=b.lat-a.lat;
  const x=(point.lng-a.lng)*k,y=point.lat-a.lat;
  const t=dx*dx+dy*dy>0?Math.max(0,Math.min(1,(x*dx+y*dy)/(dx*dx+dy*dy))):0;
  const foot={lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t};
  const off=distanceBetween(point,foot);
  const along=acc+len*t;candidates.push({off,along});
  if(off<bestDistance){bestDistance=off;bestAlong=along}
  acc+=len;
 }
 if(!acc)return null;
 const ambiguous=candidates.some(c=>c.off<=bestDistance+15&&Math.abs(c.along-bestAlong)>100);
 return{remaining:Math.max(0,(routeData?.distanceMeters||acc)*(1-bestAlong/acc)),offRouteMeters:bestDistance,
  trafficFraction:ambiguous?null:bestAlong/acc,alongMeters:bestAlong,totalMeters:acc};
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
 const optimize=options.optimizeStops===true&&stops.length>1;
 const {routes}=await Route.computeRoutes({
  origin:from,destination:{lat:selected.lat,lng:selected.lng},
  ...(optimize?{optimizeWaypointOrder:true}:{}),
  ...(stops.length?{intermediates:stops.map(p=>({location:{lat:p.lat,lng:p.lng}}))}:{}),
  travelMode:'DRIVING',
  routingPreference:'TRAFFIC_AWARE',
  extraComputations:['TRAFFIC_ON_POLYLINE'],
  routeModifiers:options.modifiers||routeOptions,
  ...(stops.length||guidanceActive?{}:{computeAlternativeRoutes:true}),
  fields:['path','distanceMeters','durationMillis','staticDurationMillis','legs','speedPaths','routeLabels',...(optimize?['optimizedIntermediateWaypointIndices']:[])]
 });
 if(serial!==routeRequestSerial||options.commitGuard&&!options.commitGuard(routes?.[0],stops))throw new Error('Routenberechnung wurde überholt.');
 if(!routes?.length)throw new Error('Keine Fahrroute gefunden.');
 // Commit atomically AFTER a successful request. Failed stop additions leave
 // route, Road Assist, GPS watch and existing destination unchanged.
 const order=routes[0].optimizedIntermediateWaypointIndices;
 if(optimize&&(!Array.isArray(order)||order.length!==stops.length||new Set(order).size!==stops.length||order.some(i=>!Number.isInteger(i)||i<0||i>=stops.length)))throw new Error('Google hat keine gültige Zwischenstopp-Reihenfolge geliefert.');
 routeChoices=routes;routeStops=optimize?order.map(i=>stops[i]):stops;routeOrigin={lat:from.lat,lng:from.lng};
 useRoute(routes[0],options);
 return true;
}
function useRoute(route,options){
 if(stopFocusMarker){stopFocusMarker.setMap(null);stopFocusMarker=null}
 routeData=route;trafficRenderRoute=null;
 routeTraffic=window.MeviNavigationShared.trafficFromRoute?.(route,routeRequestSerial,options?.trafficObservedAt??Date.now())||null;
 trafficGeometry=window.MeviNavigationShared.trafficSections?.(route)||null;trafficProgress=null;
 resetWaypointProgress();
 railStops=routeStops.map((stop,index)=>{
  const p=remainingAlongRoute(geoPoint(stop),route.path);
  return p?.offRouteMeters<=50&&Number.isFinite(p.trafficFraction)?
   {kind:'stop',position:p.trafficFraction,label:(index+1)+'. '+(stop.name||stop.address||'Zwischenstopp')}:null;
 }).filter(Boolean);
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
 if(previewBusy)return false;
 previewBusy=true;
 try{
  if(nativeMode()){
   await nativeRequest(action,fields);
   await readNativePreview();
  }else if(await method()===false)return false;
  return true;
 }catch(e){if(nativeMode())window.alert?.(String(e.message||e));else status(String(e.message||e),'route');return false}
 finally{previewBusy=false}
}
/* Native preview starts the SDK directly; only a successful start opens the
   same dashboard split used by the Web guidance button. */
async function previewStart(){
 const started=await previewAction('navigation.route.start',()=>window.beginNavigation?.());
 if(started&&nativeMode())window.meviNavigationStarted?.();
 return started;
}
function previewEnd(){return previewAction('navigation.stop',()=>window.stopRoute?.())}
function previewRemoveStop(index){return previewAction('navigation.route.removeStop',()=>removeRouteStop(index),{index})}
function previewToggleOption(key){
 if(!previewOptionKeys.includes(key))return;
 const value=!(nativeMode()?nativePreview?.options:routeOptions)?.[key];
 return previewAction('navigation.route.option',()=>setRouteOption(key,value),{key,value});
}
function setRouteOption(key,value){
 if(!previewOptionKeys.includes(key)||typeof value!=='boolean'||!routeData||!routeOrigin)return false;
 if(!!routeOptions[key]===value)return true;
 return withRouteStops(routeStops.slice(),false,{...routeOptions,[key]:value});
}
// Speech uses the same preview/waypoint operations, with an explicit route
// identity lease. Never reroute a moving multi-stop trip without a reliable
// passed-waypoint lifecycle.
function voiceRouteProposal(edit,revision){
 const reject=message=>({ok:false,message});
 if(nativeMode()||!routeData||revision!==routeRequestSerial||previewBusy||reRouting||trafficCheckBusy)
  return reject('Die Route ist nicht verfügbar oder hat sich geändert.');
 const action=edit?.action,idx=v=>Number.isInteger(v)&&v>=1&&v<=routeStops.length;
 const remaining=guidanceActive?remainingTrafficStops():routeStops;
 const first=remaining===null?routeStops.length:routeStops.length-remaining.length;
 const pendingIndex=v=>idx(v)&&v>first;
 const stopKey=remaining===null?null:JSON.stringify(remaining.map(routeStopKey));
 let message='';
 if(action==='start'){
  if(guidanceActive)return reject('Die Navigation läuft bereits.');
  message='Navigation nach '+(selected?.name||'deinem Ziel')+' starten?';
 }else if(action==='end')message='Die aktuelle Route wirklich beenden?';
 else if(action==='remove'||action==='move'||action==='option'){
  if(guidanceActive&&(simulation||remaining===null||!trafficCheckEligible()))
   return reject('Bei laufender Fahrt fehlen sichere aktuelle Wegpunkt- oder GPS-Daten.');
  if(action==='remove'&&pendingIndex(edit.index))
   message='Zwischenstopp '+edit.index+' ('+(routeStops[edit.index-1].name||'Zwischenziel')+') entfernen?';
  else if(action==='move'&&pendingIndex(edit.index)&&pendingIndex(edit.to)&&edit.index!==edit.to)
   message='Zwischenstopp '+edit.index+' auf Position '+edit.to+' verschieben?';
  else if(action==='option'&&previewOptionKeys.includes(edit.option)&&typeof edit.value==='boolean'){
   const name={avoidTolls:'Maut',avoidHighways:'Autobahnen',avoidFerries:'Fähren'}[edit.option];
   if(!!routeOptions[edit.option]===edit.value)return reject(name+' werden bereits '+(edit.value?'vermieden.':'erlaubt.'));
   message=name+' '+(edit.value?'vermeiden':'erlauben')+' und die Route neu berechnen?';
  }else return reject('Diese Stoppnummer oder Routenoption ist nicht gültig.');
 }else return reject('Unbekannte Routenaktion.');
 return {ok:true,message,revision:routeRequestSerial,active:guidanceActive,stopKey};
}
async function voiceRouteAction(edit,revision,active,expectedStops){
 const proposal=voiceRouteProposal(edit,revision);
 if(active!==guidanceActive||!proposal.ok||expectedStops!==undefined&&expectedStops!==proposal.stopKey)return false;
 if(edit.action==='start')return previewStart();
 if(edit.action==='end')return previewEnd();
 const next=routeStops.slice(),previous=routeData,started=guidanceGeneration;
 const origin=geoPoint(current);
 const guard=(candidate,stops)=>!active||guidanceActive&&guidanceGeneration===started&&routeData===previous&&
  (!stops.length||!!waypointBoundaries(candidate,stops))&&
  remainingTrafficStops()!==null&&JSON.stringify(remainingTrafficStops().map(routeStopKey))===proposal.stopKey&&
  Number.isFinite(trafficFractionNow(Date.now()))&&origin&&distanceBetween(origin,current)<=250;
 if(edit.action==='remove')next.splice(edit.index-1,1);
 else if(edit.action==='move'){const item=next.splice(edit.index-1,1)[0];next.splice(edit.to-1,0,item)}
 else if(edit.action!=='option')return false;
 previewBusy=true;
 try{return await withRouteStops(next,false,edit.action==='option'?{...routeOptions,[edit.option]:edit.value}:null,guard)}
 finally{previewBusy=false}
}
function announcePoiComparison(message){
 if(!guidanceActive||simulation||voiceMuted||!trafficSettings.voice)return false;
 return speech(message,{nonInterrupting:true});
}
async function readCurrentStreet(){
 if(nativeMode()||simulation||!guidanceActive||!Number.isFinite(trafficFractionNow(Date.now())))return null;
 const fix=geoPoint(current),generation=guidanceGeneration;
 if(!fix)return null;
 try{
  const {Geocoder}=await google.maps.importLibrary('geocoding');
  const reply=await new Geocoder().geocode({location:fix});
  if(!guidanceActive||guidanceGeneration!==generation||!Number.isFinite(trafficFractionNow(Date.now()))||distanceBetween(fix,current)>100)return null;
  const street=reply.results?.find(x=>x.types?.includes('route')||x.types?.includes('street_address'))?.address_components?.find(x=>x.types?.includes('route'))?.long_name;
  return typeof street==='string'&&street.trim()?street.slice(0,120):null;
 }catch{return null}
}
function routeContext(){return {
 hasRoute:!!routeData,active:guidanceActive,stops:routeStops.map(s=>({...s})),
 maxStops:MAX_STOPS,revision:routeRequestSerial,destination:selected?{...selected}:null
}}
// Read-only detour comparison; never replaces the active route or guidance.
// A batch shares a baseline only at the exact same origin and route state.
 // Weak ownership keeps Google responses in the current comparison only.
 const detourBaselines=new WeakMap();
async function previewStopDetour(place,options={}){
 if(nativeMode()||!routeData||!valid(place)||!valid(selected)||reRouting||guidanceActive&&(!trafficCheckEligible()||remainingTrafficStops()===null))return null;
 const from=geoPoint(guidanceActive?(current||routeOrigin):routeOrigin);
 if(!from)return null;
 // A read-only comparison must never overwrite an active route or its stops.
 const routeSerial=routeRequestSerial;
 const remainingKeys=()=>JSON.stringify((guidanceActive?confirmedRemainingStops():routeStops).map(routeStopKey));
 const stopRevision=remainingKeys();
 const destination={lat:selected.lat,lng:selected.lng};
 const modifiers={...routeOptions};
 const existing=(guidanceActive?confirmedRemainingStops():routeStops).map(p=>({location:{lat:p.lat,lng:p.lng}}));
 await load();
 const {Route}=await google.maps.importLibrary('routes');
 const base={origin:from,destination,travelMode:'DRIVING',routingPreference:'TRAFFIC_AWARE',
  routeModifiers:modifiers,fields:['distanceMeters','durationMillis']};
 const originTime=Date.now();
 if(routeSerial!==routeRequestSerial||stopRevision!==remainingKeys()||guidanceActive&&!trafficCheckEligible())return null;
 const key=JSON.stringify([routeSerial,from,destination,modifiers,existing]);
 const batch=options.batch&&typeof options.batch==='object'?options.batch:null;
 let entry=batch?detourBaselines.get(batch):null;
 if(!entry||entry.key!==key||originTime<entry.at||originTime-entry.at>30000){
  entry={key,at:originTime,promise:Route.computeRoutes({...base,...(existing.length?{intermediates:existing}:{})})};
  if(batch)detourBaselines.set(batch,entry);
  // Failed baseline is not reused as a cached error.
  entry.promise.catch(()=>{if(batch&&detourBaselines.get(batch)===entry)detourBaselines.delete(batch)});
 }
 const [original,withStop]=await Promise.all([
  entry.promise,
  Route.computeRoutes({...base,fields:[...base.fields,...(options.arrivalOpen?['legs']:[]),...(existing.length?['optimizedIntermediateWaypointIndices']:[])],intermediates:[...existing,{location:{lat:place.lat,lng:place.lng}}],...(existing.length?{optimizeWaypointOrder:true}: {})})
 ]);
 if(routeSerial!==routeRequestSerial||!routeData||stopRevision!==remainingKeys())return null;
 const before=original.routes?.[0],after=withStop.routes?.[0];
 if(!before||!after)return null;
 const beforeMeters=Number(before.distanceMeters),afterMeters=Number(after.distanceMeters);
 const beforeMillis=Number(before.durationMillis),afterMillis=Number(after.durationMillis);
 if(![beforeMeters,afterMeters,beforeMillis,afterMillis].every(x=>Number.isFinite(x)&&x>0))return null;
 const result={meters:Math.max(0,afterMeters-beforeMeters),
  seconds:Math.max(0,Math.ceil((afterMillis-beforeMillis)/1000)),
  minutes:Math.max(0,Math.ceil((afterMillis-beforeMillis)/60000))};
 window.MeviNavDiagnostics?.record?.('detour','ok','Routes-Vergleich '+(Date.now()-originTime)+' ms');
 if(options.arrivalOpen){
  result.openAtArrival=null;
  const order=existing.length?after.optimizedIntermediateWaypointIndices:[0];
  const index=Array.isArray(order)&&order.length===existing.length+1&&new Set(order).size===order.length&&order.every(i=>Number.isInteger(i)&&i>=0&&i<order.length)?order.indexOf(existing.length):-1;
  const legs=index>=0&&Array.isArray(after.legs)?after.legs.slice(0,index+1):[];
  const durations=legs.map(l=>l.durationMillis);
  if(legs.length===index+1&&index>=0&&durations.every(x=>Number.isFinite(x)&&x>0)&&place.placeId){
   const eta=originTime+durations.reduce((a,b)=>a+b,0);
   // Regular opening hours are a forecast, not a guarantee for holidays.
   if(eta-originTime<=86400000)try{
    const {Place}=await google.maps.importLibrary('places');
    const details=new Place({id:place.placeId});
    await details.fetchFields({fields:['regularOpeningHours','utcOffsetMinutes']});
    if(details.regularOpeningHours&&Number.isFinite(details.utcOffsetMinutes)&&typeof details.isOpen==='function'){
     const opened=await details.isOpen(new Date(eta));
     if(typeof opened==='boolean'){result.openAtArrival=opened;result.arrivalEpochMs=eta}
    }
   }catch{}
  }
 }
 if(routeSerial!==routeRequestSerial||!routeData||stopRevision!==remainingKeys()||guidanceActive&&(!trafficCheckEligible()||distanceBetween(from,current)>250))return null;
 return result;
}
async function withRouteStops(nextStops,optimizeStops=false,modifiers=null,commitGuard=null){
 if(nativeMode()||!routeData||!valid(selected)||reRouting)return false;
 // Every active route edit uses the same confirmed-visit state as traffic refresh.
 // Keep unconfirmed stops, and never re-add a visited stop merely because it
 // was present in the original itinerary passed by an existing UI action.
 if(guidanceActive&&!simulation){
  const visited=new Set(routeStops.slice(0,routeStops.length-confirmedRemainingStops().length).map(routeStopKey));
  nextStops=nextStops.filter(stop=>!visited.has(routeStopKey(stop)));
 }
 if(nextStops.length>MAX_STOPS){status('Maximal acht Zwischenstopps möglich.','route');return false}
 const from=guidanceActive?(current||routeOrigin):routeOrigin;
 if(!geoPoint(from)){status('Kein gültiger Routenstart für die Neuberechnung.','route');return false}
 try{
  const ok=await computeRouteFrom(from,{stops:nextStops,reroute:true,optimizeStops,commitGuard,...(modifiers?{modifiers}:{})});
  if(!ok)return false;
  if(modifiers){routeOptions=modifiers;try{localStorage.setItem(PREVIEW_OPTIONS,JSON.stringify(routeOptions))}catch{}}
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
async function addRouteStop(place,options={}){
 if(!valid(place)||!routeData)return false;
 const stop={lat:place.lat,lng:place.lng,name:place.name,address:place.address||'',placeId:place.placeId||''};
 if((guidanceActive&&!simulation?confirmedRemainingStops():routeStops).length>=MAX_STOPS){status('Maximal acht Zwischenstopps möglich.','route');return false}
 const key=routeStopKey(stop);
 if(routeStops.some(s=>routeStopKey(s)===key)||routeStopKey(selected)===key){
  status('Dieses Ziel ist bereits Teil der Route.','route');return false;
 }
 return withRouteStops([...routeStops,stop],options.preserveOrder!==true);
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
// Bearings are clockwise from north. The car arrow must be relative to
 // the rotated vector map, not simply use its absolute GPS heading.
 function validHeading(value){return Number.isFinite(value)&&value>=0&&value<360?value:null}
 function normalizeHeading(value){return (value%360+360)%360}
 function bearingBetween(a,b){return window.MeviNavigationShared.bearingBetween(a,b)}
 function forwardPoint(point,heading,meters){return window.MeviNavigationShared.forwardPoint(point,heading,meters)}
 function routeHeading(point){
  const path=routeData?.path||[];
  let best=Infinity,heading=null;
  const cos=Math.cos(point.lat*Math.PI/180);
  for(let i=1;i<path.length;i++){
   const a=geoPoint(path[i-1]),b=geoPoint(path[i]);
   if(!a||!b)continue;
   const dx=(b.lng-a.lng)*cos,dy=b.lat-a.lat,len2=dx*dx+dy*dy;
   if(len2<1e-14)continue;
   const t=Math.max(0,Math.min(1,((point.lng-a.lng)*cos*dx+(point.lat-a.lat)*dy)/len2));
   const projection={lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t};
   const off=distanceBetween(point,projection);
   if(off<best){best=off;heading=bearingBetween(a,b)}
  }
  return best<=80?heading:null; // Off-route: don't follow a distant road.
 }
 function headingForFix(point,coords={},timestamp=Date.now()){
  const raw=validHeading(coords.heading),speed=coords.speed,accuracy=coords.accuracy;
  const moving=!Number.isFinite(speed)||speed>=1.5;
  const accurate=!Number.isFinite(accuracy)||accuracy<=70;
  let next=null;
  if(raw!==null&&moving&&accurate)next=raw;
  else if(moving&&accurate&&driveGpsFix&&timestamp>driveGpsFix.timestamp&&timestamp-driveGpsFix.timestamp<15000&&
          distanceBetween(driveGpsFix.point,point)>=8){
   next=bearingBetween(driveGpsFix.point,point);
  }
  if(next===null)next=driveHeading??routeHeading(point);
  if(next!==null){
   if(driveHeading===null)driveHeading=next;
   else{
    const delta=(next-driveHeading+540)%360-180;
    driveHeading=normalizeHeading(driveHeading+delta*0.5);
   }
  }
  if(accurate)driveGpsFix={point,timestamp};
  return driveHeading;
 }
 function markCurrent(point,heading){
  if(!map||!point)return;
  const bearing=validHeading(heading)??driveHeading;
  const viewHeading=validHeading(map.getHeading?.())??
   ((cameraMode==='travel'&&followCamera)?(driveHeading??0):0);
  const rotation=bearing===null?0:normalizeHeading(bearing-viewHeading);
  if(!positionMarker){
   positionMarker=new google.maps.Marker({map,position:point,title:'Dein Standort',zIndex:9,
    icon:{path:google.maps.SymbolPath.FORWARD_CLOSED_ARROW,scale:6,rotation,
     fillColor:'#21d9fa',fillOpacity:1,strokeColor:'#fff',strokeWeight:2}});
  }else{
   positionMarker.setPosition(point);
   positionMarker.setIcon({...positionMarker.getIcon(),rotation});
  }
 }
 function announceRoadAssist(message){if(guidanceActive&&!simulation)speech(message)}
function speech(message,options={}){
 if(voiceMuted||simulation||!window.speechSynthesis||typeof window.SpeechSynthesisUtterance==='undefined')return false;
 // Traffic must not interrupt a turn instruction or Road Assist.
 if(options.nonInterrupting&&(window.speechSynthesis.speaking||window.speechSynthesis.pending))return false;
 try{
  const utterance=new window.SpeechSynthesisUtterance(message);
  utterance.lang='de-DE';utterance.rate=1;utterance.volume=1;
  if(!options.nonInterrupting)window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);return true;
 }catch{return false}
}
function maybeWarnTraffic(now){
 if(!trafficSettings.voice||!guidanceActive||simulation||nativeMode()||voiceMuted||reRouting||!trafficProgress)return;
 const warning=window.MeviNavigationShared.trafficWarning?.(currentTraffic(now),trafficWarnings,now);
 if(warning&&speech('Stau in ungefähr '+metersLabel(warning.meters)+'.',{nonInterrupting:true})){
  trafficWarnings.keys.add(warning.key);trafficWarnings.at=now;
 }
}
function setVoiceMuted(value){
 voiceMuted=value===true;
 if(voiceMuted)try{window.speechSynthesis?.cancel()}catch{}
 paintGuidance();
 return true;
}
function toggleVoice(){return setVoiceMuted(!voiceMuted)}
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
 window.MeviNavTrip?.paint(document.querySelector('.mg-guidance-trip'),trip);
 window.MeviNavTrip?.paintControls(document.querySelector('.mg-web-guidance > .mevi-nav-controls'),{muted:voiceMuted,overview:overviewActive});
 const dashboard=document.getElementById('mg-nav-dashboard-split');
 if(dashboard&&window.MeviNavDashboard?.detailsOpen?.())window.MeviNavDashboard.paintDetails(dashboard);
}
function showOverview(){
 if(!map||!routeData?.path?.length)return false;
 followCamera=false;overviewActive=true;
 if(stopFocusMarker){stopFocusMarker.setMap(null);stopFocusMarker=null}
 const bounds=new google.maps.LatLngBounds();
 for(const p of [...routeData.path,...routeStops,selected,current]){const point=geoPoint(p);if(point)bounds.extend(point)}
 map.setHeading?.(0);map.setTilt?.(0);
 map.fitBounds(bounds,60);markCurrent(current,driveHeading);paintCameraControls();
 return true;
}
function toggleOverview(){
 if(nativeMode())return nativeGuidanceAction('overview');
 if(overviewActive){followMyLocation();return true}
 return showOverview();
}
function paintCameraControls(){
  const locate=document.querySelector('.mg-web-driving .mg-my-location');
  if(locate)locate.hidden=!!(guidanceActive&&followCamera);
  window.MeviNavTrip?.paintControls(document.querySelector('.mg-web-guidance > .mevi-nav-controls'),{muted:voiceMuted,overview:overviewActive});
  const orientation=document.querySelector('.mg-map-orientation');
  if(!orientation)return;
  const north=cameraMode==='north';
  orientation.textContent=north?'N':'↑';
  const label=north?'Fahrtrichtung nach oben einschalten':'Norden nach oben einschalten';
  orientation.title=label;orientation.setAttribute('aria-label',label);
  orientation.setAttribute('aria-pressed',String(!north));
 }
 function followMyLocation(){
  if(stopFocusMarker){stopFocusMarker.setMap(null);stopFocusMarker=null}
  followCamera=true;overviewActive=false;paintCameraControls();
  if(current){
   if(guidanceActive)followPosition(current,driveHeading);
   else if(map){map.panTo(current);map.setZoom(16)}
   markCurrent(current,driveHeading);
  }
 }
 async function recenter(){if(!current)await myLocation();followMyLocation()}
 function followPosition(point,heading){
  if(!map||!point||!followCamera)return;
  const bearing=validHeading(heading)??driveHeading??routeHeading(point);
  if(map.getZoom?.()!==17)map.setZoom(17);
  if(cameraMode==='travel'&&bearing!==null){
   try{map.setHeading(bearing);map.setTilt(45)}catch{}
   // The vehicle stays below center, showing more of the upcoming road.
   const height=mapElement?.clientHeight||mapElement?.getBoundingClientRect?.().height||550;
   const metersPerPixel=156543.03392*Math.cos(point.lat*Math.PI/180)/Math.pow(2,17);
   const lookAhead=Math.min(160,Math.max(25,height*0.18*metersPerPixel));
   map.panTo(forwardPoint(point,bearing,lookAhead));
  }else{
   try{map.setHeading(0);map.setTilt(0)}catch{}
   map.panTo(point);
  }
 }
 function setOrientation(mode){
  if(nativeMode()||!['north','travel'].includes(mode))return false;
  cameraMode=mode;
  try{localStorage.setItem(MAP_ORIENTATION_KEY,cameraMode)}catch{}
  if(guidanceActive&&current){followPosition(current,driveHeading);markCurrent(current,driveHeading)}
  paintCameraControls();
  return true;
 }
 function toggleOrientation(){return setOrientation(cameraMode==='travel'?'north':'travel')}
 // Web-only explicit state setters, shared with the existing touch actions.
 // No route store, new API request, or toggle that could reverse a repeated command.
 function voiceControl(action){
  if(nativeMode()||!guidanceActive)return false;
  if(action==='mute'||action==='unmute')return setVoiceMuted(action==='mute');
  if(action==='overview')return showOverview();
  if(action==='follow'){
   if(!map||!current)return false;
   followMyLocation();return true;
  }
  if(action==='north'||action==='travel')return !!map&&setOrientation(action);
  return false;
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
// Manual and opt-in GPS-driven traffic checks share one budget; no extra timer
// or silent route replacement.
// Only confirmed visits to ordered Google leg endpoints may remove stops.
// Uncertain geometry or a missed waypoint blocks traffic refresh rather than guessing.
let waypointProgress=null;
function waypointBoundaries(route,stops){
 if(!stops.length)return [];
 if(!Array.isArray(route?.legs)||route.legs.length!==stops.length+1)return null;
 const result=[];
 for(let i=0;i<stops.length;i++){
  const point=geoPoint(route.legs[i]?.endLocation);
  if(!point||distanceBetween(point,stops[i])>75)return null;
  const p=remainingAlongRoute(point,route.path);
  if(!p||p.offRouteMeters>25||!Number.isFinite(p.trafficFraction)||
   p.alongMeters-(result.at(-1)?.along||0)<=100||p.totalMeters-p.alongMeters<=100)return null;
  result.push({point,along:p.alongMeters});
 }
 return result;
}
function resetWaypointProgress(){
 waypointProgress={route:routeData,boundaries:waypointBoundaries(routeData,routeStops),visited:0,sampleAt:null};
}
function observeWaypoint(fix,point,progress){
 const state=waypointProgress,next=state?.boundaries?.[state.visited];
 if(!guidanceActive||simulation||reRouting||previewBusy||state?.route!==routeData||!next)return;
 const stamp=fix.timestamp,accuracy=fix.coords.accuracy,speed=fix.coords.speed;
 // Two separate, recent, slow/stationary fixes at the SDK's snapped leg end.
 // Merely driving past the waypoint or seeing a later route fraction is insufficient.
 if(!trafficProgress||!Number.isFinite(accuracy)||accuracy<0||accuracy>20||
  !Number.isFinite(speed)||speed<0||speed>3||distanceBetween(point,next.point)>30||
  Math.abs(progress.alongMeters-next.along)>35){state.sampleAt=null;return}
 if(state.sampleAt===null||stamp<state.sampleAt||stamp-state.sampleAt>15000){state.sampleAt=stamp;return}
 if(stamp-state.sampleAt<1000)return;
 state.visited++;state.sampleAt=null;
}
function remainingTrafficStops(){
 if(!routeStops.length)return [];
 const state=waypointProgress;
 if(state?.route!==routeData||!state.boundaries||state.boundaries.length!==routeStops.length||!trafficProgress)return null;
 const next=state.boundaries[state.visited];
 if(next&&trafficProgress.alongMeters>next.along+50)return null;
 return routeStops.slice(state.visited);
}
function confirmedRemainingStops(){
 const state=waypointProgress;
 return routeStops.slice(state?.route===routeData&&state.boundaries?state.visited:0);
}
const TRAFFIC_CHECK_INTERVAL=300000,TRAFFIC_CHECK_LIMIT=6,TRAFFIC_OFFER_AGE=60000;
let trafficCheckAt=0,trafficCheckCount=0,trafficCheckBusy=false,trafficOffer=null,trafficCheckMessage='';
let trafficCheckCancel=null;
const TRAFFIC_REQUEST_TIMEOUT=30000;
// Invalidate the UI lease without claiming that Google's underlying request
// can be aborted. Late provider results have no route-changing side effects.
function cancelTrafficCheck(){
 const cancel=trafficCheckCancel;
 trafficCheckCancel=null;trafficCheckBusy=false;
 cancel?.();
}
function trafficCheckEligible(now=Date.now()){
 return !nativeMode()&&guidanceActive&&!simulation&&!reRouting&&!previewBusy&&
  routeData&&valid(selected)&&remainingTrafficStops()!==null&&geoPoint(current)&&
  trafficProgress&&now-trafficProgress.at<=8000&&now>=trafficProgress.at;
}
function trafficLeaseValid(lease,now=Date.now()){
 return !!lease&&!!trafficCheckEligible(now)&&lease.generation===guidanceGeneration&&
  lease.serial===routeRequestSerial&&lease.previous===routeData&&
  remainingTrafficStops()?.length===lease.stops.length&&
  now>=lease.at&&now-lease.at<=TRAFFIC_OFFER_AGE&&
  distanceBetween(current,lease.origin)<=250;
}
function validTrafficOffer(now=Date.now()){return trafficLeaseValid(trafficOffer,now)}
function trafficCheckView(){
 if(nativeMode()||!guidanceActive||simulation)return null;
 const now=Date.now(),validOffer=validTrafficOffer(now);
 const waitMs=trafficCheckAt?Math.max(0,TRAFFIC_CHECK_INTERVAL-(now-trafficCheckAt)):0;
 const blocked=trafficCheckBusy?'Prüfung läuft.':trafficCheckCount>=TRAFFIC_CHECK_LIMIT?'Prüflimit erreicht.':
  reRouting||previewBusy?'Routenberechnung oder Vorschau aktiv.':
  remainingTrafficStops()===null?'Zwischenstopps nicht sicher zugeordnet.':
  !trafficCheckEligible(now)?'Aktive Route oder frische GPS-Zuordnung fehlt.':
  waitMs>0?'Mindestabstand zwischen Prüfungen.':'';
 return {busy:trafficCheckBusy,enabled:!blocked,blocked,attempts:trafficCheckCount,limit:TRAFFIC_CHECK_LIMIT,
  waitSeconds:Math.ceil(waitMs/1000),lastAttemptAt:trafficCheckAt||null,
  offerExpiresAt:validOffer?trafficOffer.at+TRAFFIC_OFFER_AGE:null,
  message:trafficCheckBusy?'Verkehr wird geprüft …':routeStops.length&&remainingTrafficStops()===null?'Verkehrsprüfung wartet auf sichere Zwischenstopp- und GPS-Daten.':
   trafficCheckCount>=TRAFFIC_CHECK_LIMIT&&!validOffer?'Prüflimit dieser Fahrt erreicht.':
   trafficOffer&&!validOffer?'Routenvorschlag abgelaufen.':trafficCheckMessage||
   (trafficCheckAt&&now-trafficCheckAt<TRAFFIC_CHECK_INTERVAL?'Nächste Prüfung nach fünf Minuten.':blocked||'Route und Alternativen prüfen'),
  offer:validOffer?{id:trafficOffer.id,seconds:Math.ceil(trafficOffer.choices.standard.durationMillis/1000),
   alternativeSeconds:trafficOffer.choices.alternative?Math.ceil(trafficOffer.choices.alternative.durationMillis/1000):null,
   savingSeconds:trafficOffer.choices.savingSeconds}:null};
}
function autoTrafficAllowed(now=Date.now()){
 return trafficSettings.auto&&document.visibilityState!=='hidden'&&navigator.onLine!==false&&
  Number.isFinite(guidanceStartedAt)&&now-guidanceStartedAt>=TRAFFIC_CHECK_INTERVAL&&
  (!routeTraffic||now-routeTraffic.observedAt>=TRAFFIC_CHECK_INTERVAL)&&
  Number.isFinite(liveTripMeters)&&liveTripMeters>2000&&offRouteCount===0;
}
function maybeCheckTraffic(now){
 if(autoTrafficAllowed(now)&&trafficCheckView()?.enabled&&!validTrafficOffer(now))void checkTraffic(true);
}
async function checkTraffic(automatic=false){
 automatic=automatic===true;
 const now=Date.now(),autoRevision=trafficAutoRevision;
 if(!trafficCheckView()?.enabled||(automatic&&(!autoTrafficAllowed(now)||validTrafficOffer(now))))return false;
 trafficCheckBusy=true;trafficCheckAt=now;trafficCheckCount++;trafficOffer=null;trafficCheckMessage='';
 const generation=guidanceGeneration,serial=routeRequestSerial,previous=routeData,stops=remainingTrafficStops();
 const origin={lat:current.lat,lng:current.lng},destination={lat:selected.lat,lng:selected.lng},modifiers={...routeOptions};
 // A candidate's lifetime starts at the captured origin, not at response time.
 const lease={generation,serial,previous,origin,at:now,stops,originAlong:trafficProgress.alongMeters};
 let timer,cancelled=false;
 const interruption=new Promise(resolve=>{
  trafficCheckCancel=()=>{cancelled=true;resolve('cancelled')};
  timer=setTimeout(()=>{cancelled=true;resolve('timeout')},TRAFFIC_REQUEST_TIMEOUT);
 });
 const ownCancel=trafficCheckCancel;
 const sameRoute=()=>generation===guidanceGeneration&&serial===routeRequestSerial&&previous===routeData;
 const freshRequest=()=>{const at=Date.now();return !cancelled&&trafficLeaseValid(lease,at)&&
  (!automatic||(autoRevision===trafficAutoRevision&&autoTrafficAllowed(at)))};
 const rejectStale=()=>{if(sameRoute())trafficCheckMessage='Verkehrsprüfung veraltet. Route bleibt unverändert.';return false};
 paintGuidance();
 const request=async()=>{
  await load();const {Route}=await google.maps.importLibrary('routes');
  if(!freshRequest())return cancelled?false:rejectStale();
  const {routes}=await Route.computeRoutes({origin,destination,travelMode:'DRIVING',
   routingPreference:'TRAFFIC_AWARE',extraComputations:['TRAFFIC_ON_POLYLINE'],
   ...(stops.length?{intermediates:stops.map(p=>({location:{lat:p.lat,lng:p.lng}}))}:{computeAlternativeRoutes:true}),
   routeModifiers:modifiers,fields:['path','distanceMeters','durationMillis','staticDurationMillis','legs','speedPaths','routeLabels']});
  if(!freshRequest())return cancelled?false:rejectStale();
  const choices=window.MeviNavigationShared.trafficRouteChoices(stops.length?routes?.slice(0,1):routes);
  if(!choices||(stops.length&&!waypointBoundaries(choices.standard,stops)))throw new Error('Keine vergleichbare Route mit gültigen Zwischenstopps');
  // Only update colors/traffic on the active route if the provider returned
  // exactly its remaining path. Leave guidance, manoeuvres and stops intact.
  const shared=window.MeviNavigationShared;
  const refreshed=shared.trafficRefreshGeometry(previous,choices.standard,lease.originAlong);
  if(refreshed){
   trafficGeometry=refreshed;trafficRenderRoute=choices.standard;
   routeTraffic=shared.trafficFromRoute(choices.standard,serial,lease.at);
   drawRoute(true);
  }
  trafficOffer=refreshed&&!choices.alternative?null:{...lease,id:generation+':'+serial+':'+now,choices,automatic};
  trafficCheckMessage=refreshed&&!choices.alternative?'Verkehr auf bestehender Route aktualisiert. Route bleibt unverändert.':stops.length?'Aktualisierte Route über '+stops.length+' verbleibende Zwischenstopps.':choices.alternative?'Alternative ist gegenüber Googles neuer Standardroute schneller.':'Google hat keine mindestens zwei Minuten schnellere Alternative geliefert.';
  if(automatic&&choices.alternative&&trafficSettings.voice&&!voiceMuted)speech('Eine schnellere Routenalternative ist verfügbar.',{nonInterrupting:true});
  return true;
 };
 try{
  const result=await Promise.race([request(),interruption]);
  if(result==='timeout'){
   if(sameRoute())trafficCheckMessage='Zeitüberschreitung bei Verkehrsprüfung. Route bleibt unverändert.';
   return false;
  }
  return result===true;
 }catch(e){
  if(!cancelled&&sameRoute())trafficCheckMessage='Verkehrsprüfung nicht verfügbar. Route bleibt unverändert.';
  return false;
 }finally{
  clearTimeout(timer);
  if(trafficCheckCancel===ownCancel){trafficCheckCancel=null;trafficCheckBusy=false;paintGuidance()}
 }
}
function acceptTrafficRoute(alternative=false,expectedOfferId=null){
 if(!validTrafficOffer()||(expectedOfferId!==null&&trafficOffer.id!==expectedOfferId))return false;
 const offer=trafficOffer,route=alternative?offer.choices.alternative:offer.choices.standard;
 if(!route)return false;
 trafficOffer=null;trafficCheckMessage='Route aktualisiert.';routeRequestSerial++;
 routeChoices=[route];routeOrigin=offer.origin;routeStops=offer.stops.slice();
 useRoute(route,{reroute:true,trafficObservedAt:offer.at});offRouteCount=0;
 window.MeviRoadAssist?.onGuidanceStart?.(false);
 paintGuidance();return true;
}
async function reroute(point){
 const now=Date.now();
 if(reRouting||!guidanceActive||simulation||now-lastRerouteAt<30000)return;
 reRouting=true;lastRerouteAt=now;const generation=guidanceGeneration;
 status('Route wird ab dem aktuellen Standort neu berechnet …','route');
 try{
  await computeRouteFrom(point,{reroute:true,stops:confirmedRemainingStops()});
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
 rememberAltitude(p);
 currentSpeed=Number.isFinite(p.coords.speed)&&p.coords.speed>=0?p.coords.speed*3.6:null;
 recordGuidanceSpeed(p);
 window.MeviTripBookCore?.feed?.(p,'navigation');
 window.MeviRoadAssist?.onPosition?.(point,{accuracy:p.coords.accuracy,timestamp:p.timestamp||Date.now()});
 const heading=headingForFix(point,p.coords,p.timestamp||Date.now());
  followPosition(point,heading);markCurrent(point,heading);
 if(lastGpsAccuracy===null||lastGpsAccuracy<75)maybeAdvanceStep(point,lastGpsAccuracy);
 const progress=remainingAlongRoute(point,routeData?.path);
 const stamp=p.timestamp,now=Date.now();
 trafficProgress=Number.isFinite(stamp)&&stamp<=now&&now-stamp<=8000&&
  Number.isFinite(p.coords.accuracy)&&p.coords.accuracy>=0&&p.coords.accuracy<=50&&
  progress?.offRouteMeters<=50&&Number.isFinite(progress.trafficFraction)?{at:stamp,fraction:progress.trafficFraction,alongMeters:progress.alongMeters}:null;
 observeWaypoint(p,point,progress);
 if(progress){
  const mins=Math.max(0,Math.round((routeData.durationMillis||0)/60000*(progress.remaining/Math.max(1,routeData.distanceMeters||1))));
  recordGuidanceProgress(progress.remaining);
  liveTripMeters=progress.remaining;liveTripMinutes=mins;
 }
 const nearest=progress?.offRouteMeters??nearestDistanceToPath(point,routeData?.path);
 if(lastGpsAccuracy!==null&&lastGpsAccuracy<50&&nearest>110)offRouteCount++;
 else offRouteCount=0;
 if(offRouteCount>=3)reroute(point);
 else{maybeWarnTraffic(now);maybeCheckTraffic(now)}
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
  manualOrigin=null;guidanceActive=true;simulation=false;followCamera=true;overviewActive=false;driveGpsFix=null;driveHeading=routeHeading(actual);guidanceGeneration++;
  gpsAltitudeMeters=null;gpsAltitudeAt=0;
  resetGuidanceProgress();guidanceStartedAt=Date.now();
  trafficCheckAt=0;trafficCheckCount=0;trafficOffer=null;trafficCheckMessage='';trafficWarnings={keys:new Set(),at:null};
  resetWaypointProgress();
  window.MeviRoadAssist?.onGuidanceStart?.(false);
  stepIndex=0;spokenThresholds.clear();offRouteCount=0;
  clearStatus();
  const geo=navigator.geolocation;
  geoWatch=geo.watchPosition(updatePosition,e=>status('GPS-Signal: '+(e.code===3?'Zeitüberschreitung':e.message),'gps'),
   {enableHighAccuracy:true,maximumAge:2000,timeout:12000});
  followPosition(actual,driveHeading);markCurrent(actual,driveHeading);paintCameraControls();
  cache.recent=unique([selected,...cache.recent],MAX_RECENT);persist();
  paintGuidance();speech('Navigation gestartet. '+(guidanceSteps[0]?.instructions||'Der Route folgen'));
  return true;
 }catch(e){status('Navigation nicht gestartet: '+(e.message||e),'gps');return false}
}
function startDemo(){
 if(!routeData||!guidanceSteps.length){status('Keine Abbiegeschritte für Demo vorhanden.','route');return false}
 stopGuidance({keepRoute:true});
 guidanceActive=true;simulation=true;followCamera=true;overviewActive=false;gpsAltitudeMeters=null;gpsAltitudeAt=0;stepIndex=0;spokenThresholds.clear();guidanceGeneration++;liveTripMeters=null;liveTripMinutes=null;
 resetGuidanceProgress();guidanceStartedAt=Date.now();current=manualOrigin||geoPoint(routeData.path?.[0])||current;
  driveGpsFix=null;driveHeading=current?routeHeading(current):null;followPosition(current,driveHeading);markCurrent(current,driveHeading);
 window.MeviRoadAssist?.onGuidanceStart?.(true);
 clearStatus();
 if(simulationTimer!==null)clearInterval(simulationTimer);
 simulationTimer=setInterval(()=>{
  if(!simulation)return;
  const step=guidanceSteps[stepIndex];
  if(step?.end){current=step.end;driveHeading=routeHeading(current)??driveHeading;followPosition(current,driveHeading);markCurrent(current,driveHeading);const p=remainingAlongRoute(current,routeData?.path);if(p){
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
 guidanceGeneration++;routeRequestSerial++;cancelTrafficCheck();
 if(geoWatch!==null){navigator.geolocation?.clearWatch(geoWatch);geoWatch=null}
 if(simulationTimer!==null){clearInterval(simulationTimer);simulationTimer=null}
 try{window.speechSynthesis?.cancel()}catch{}
 trafficProgress=null;trafficOffer=null;trafficCheckMessage='';
 guidanceActive=false;simulation=false;currentSpeed=null;offRouteCount=0;liveTripMeters=null;liveTripMinutes=null;
  driveHeading=null;driveGpsFix=null;followCamera=true;overviewActive=false;
 gpsAltitudeMeters=null;gpsAltitudeAt=0;
  if(map){try{map.setHeading(0);map.setTilt(0)}catch{}}
 resetGuidanceProgress();
 window.MeviRoadAssist?.onGuidanceStop?.();
 if(positionMarker){positionMarker.setMap(null);positionMarker=null}
 if(!options.keepRoute){routeRequestSerial++;routeChoices=[];routeData=null;routeStops=[];routeOrigin=null;routeSummary='';guidanceSteps=[];stepIndex=0;clearLines();selected=null;window.MeviRoadAssist?.onRoute?.([]);
  if(stopFocusMarker){stopFocusMarker.setMap(null);stopFocusMarker=null}
 }
}
function hasPlannedRoute(){return !!routeData}
function guidanceRunning(){return guidanceActive}
function locationButton(){
  const recenter='<button type="button" class="mg-my-location"'+(guidanceActive?' hidden':'')+' onclick="MeviGoogleNav.recenter()" aria-label="Auf eigenen Standort zentrieren" title="Auf eigenen Standort zentrieren">◎</button>';
  if(!guidanceActive)return recenter;
  const north=cameraMode==='north';
  const label=north?'Fahrtrichtung nach oben einschalten':'Norden nach oben einschalten';
  return recenter+'<button type="button" class="mg-map-orientation" onclick="MeviGoogleNav.toggleOrientation()" aria-pressed="'+(!north)+'" aria-label="'+label+'" title="'+label+'">'+(north?'N':'↑')+'</button>';
 }
 function routeInfo(){return routeSummary}
window.MeviGoogleNav={refreshNativeRoutePreview:readNativePreview,
 currentNativeArrival,showNativeArrival,closeNativeArrival,nativeArrivalAction,
 toggleNativeGuidanceMenu,closeNativeGuidanceMenu,refreshNativeGuidanceMenu,nativeGuidanceMode,
 nativeGuidanceMuted,nativeGuidanceRoadEnabled,nativeGuidanceRoadVoice,nativeGuidanceDetailsHTML,
 nativeGuidanceShowDetails,nativeGuidanceBack,nativeGuidanceAction,readNativeTrafficMetrics,checkTraffic,acceptTrafficRoute,trafficCheckView,trafficSettingsHTML,setTrafficSetting,setNativeTrafficSetting,guidanceTrip,guidanceDashboardData,guidanceDetailsHTML,focusRouteStop,focusRoutePoint,browserRoutePreview,nativeRoutePreview:()=>nativePreview,previewStart,previewEnd,previewRemoveStop,previewToggleOption,voiceRouteProposal,voiceRouteAction,readCurrentStreet,announcePoiComparison,webData,webWrite,webSaveSelectedSlot,webPoi,webPlaceDetails,webResolveStop,routeContext,previewStopDetour,addRouteStop,removeRouteStop,mount,mapBackdrop,syncRouteMapMarkers,syncNativeLayout,isNativeMode:nativeMode,nativeRequest,destinationName:()=>selected?.name||'',nativeBusy,openNativeMap,openNativeSearch,changeQuery,pick,exactAddressParts,resolveExactAddress,selectVerifiedAddress,saveFavorite,removeFavorite,isFavorite,selectedDestination:()=>selected?{...selected}:null,selectedAddress,selectOriginOnMap,cancelOriginSelection,chooseOriginPoint,isManualOrigin:()=>!!manualOrigin,setKey,removeKey,hasKey:()=>nativeMode()||!!key(),calculateRoute,startGuidance,startDemo,stopGuidance,toggleVoice,voiceControl,announceRoadAssist,showOverview,toggleOverview,followMyLocation,recenter,toggleOrientation,paintGuidance,hasPlannedRoute,guidanceRunning,locationButton,routeInfo,myLocation,setupHTML};
// Repaint after this defer-like script loads; the inline cockpit rendered before it.
if (typeof window.render === 'function') window.render();
})();

