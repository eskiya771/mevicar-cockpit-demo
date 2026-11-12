/* MeviCar Next navigation adapter – Classic destination rules, Google Maps web APIs.
   A browser-restricted Google Maps JavaScript key is required. Never copy Android keys. */
(function(){
'use strict';
const KEY='mevicar-next-google-maps-key-v1', DATA='mevicar-next-destinations-v1';
const FALLBACK_CENTER={lat:49.59,lng:11.005}; // Erlangen: initial map view only, not a navigation origin.
const text=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const valid=d=>d&&typeof d.name==='string'&&Number.isFinite(d.lat)&&Number.isFinite(d.lng)&&Math.abs(d.lat)<=90&&Math.abs(d.lng)<=180;
const keyOf=d=>d.lat.toFixed(5)+','+d.lng.toFixed(5);
const unique=(items,max)=>{const keys=new Set();return items.filter(x=>{if(!valid(x))return false;let k=keyOf(x);if(keys.has(k))return false;keys.add(k);return true}).slice(0,max)};
let cache={favorites:[],recent:[]};try{let d=JSON.parse(localStorage.getItem(DATA)||'{}');cache={favorites:unique(d.favorites||[],100),recent:unique(d.recent||[],20)}}catch{}
let map=null,mapElement=null,mapLoading=null,geoWatch=null,current=null,marker=null,routeLines=[],routeData=null,selected=null,suggestions=[],query='',timer=null,requestSerial=0,token=null,error='',errorKind='',manualOrigin=null,originMarker=null,positionMarker=null,choosingOrigin=false,state='browse',mounted=false,stage='setup',guidanceActive=false,simulation=false,guidanceSteps=[],stepIndex=0,spokenThresholds=new Set(),lastSpokenStep=-1,offRouteCount=0,lastRerouteAt=0,reRouting=false,simulationTimer=null,voiceMuted=false,currentSpeed=null,lastGpsAccuracy=null,followCamera=true;
function persist(){try{localStorage.setItem(DATA,JSON.stringify(cache))}catch{}}
function key(){try{return localStorage.getItem(KEY)||''}catch{return ''}}
function setKey(){const input=document.getElementById('mg-key');const k=(input?.value||'').trim();if(!/^[A-Za-z0-9_-]{20,}$/.test(k)){status('Ungültiger Google Maps API-Key.');return}try{localStorage.setItem(KEY,k)}catch{status('Browser-Speicher nicht verfügbar.');return}location.reload()}
function removeKey(){try{localStorage.removeItem(KEY)}catch{}location.reload()}
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
function setupHTML(){return '<div class="mg-setup"><strong>Google Maps aktivieren</strong><p>Für die Web-App benötigst du einen Browser-API-Key. Als zugelassene Website füge <code>https://eskiya771.github.io/*</code> hinzu (manche Browser übertragen nur die Domain als Referrer).</p><input id="mg-key" type="text" spellcheck="false" autocomplete="off" placeholder="Browser-API-Key" aria-label="Google Maps Browser-API-Key"><button type="button" onclick="MeviGoogleNav.setKey()">Google Maps verbinden</button><small>Google Maps JavaScript API, Places API (New) und Routes API aktivieren. Der Key wird ausschließlich in diesem Browser gespeichert.</small><span id="mg-status" role="status">'+text(error)+'</span></div>'}
function mapBackdrop(){
 const message='<div class="mg-map-state" id="mg-map-notice" role="status"><span id="mg-status">'+text(error||'Google Maps wird geladen …')+'</span>'+
  '<button type="button" id="mg-change-key" class="mg-change-key" onclick="MeviGoogleNav.removeKey()"'+(errorKind==='maps-auth'?'':' hidden')+'>API-Schlüssel erneut einrichten</button>'+
  '<button type="button" id="mg-manual-origin" class="mg-manual-action" onclick="MeviGoogleNav.selectOriginOnMap()"'+(errorKind==='gps'?'':' hidden')+'>Startpunkt auf Karte wählen</button></div>';
 const picking=choosingOrigin?'<div class="mg-origin-instruction" role="status">Startpunkt wählen: Auf eine Stelle der Karte tippen oder klicken. <button type="button" onclick="MeviGoogleNav.cancelOriginSelection()">Abbrechen</button></div>':'';
 return '<div id="mg-map" class="mg-map" aria-label="Google Maps Karte"></div>'+(!key()?setupHTML():message+picking);
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
 if(!el)return;
 if(!key())return;
 try{
   await load();
   if(!document.contains(el))return;
   if(mapElement!==el){
     mapElement=el;
     map=new google.maps.Map(el,{center:current||FALLBACK_CENTER,zoom:12,disableDefaultUI:true,zoomControl:true,clickableIcons:false,gestureHandling:'greedy',backgroundColor:'#152536'});
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
 suggestions=[];if(query.length<3||!key()){refreshResults();return}
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
function refreshResults(){const e=document.getElementById('suggestions');if(e)e.innerHTML=resultsHTML()}
function item(d,i,kind){return '<button type="button" class="suggestion mg-result" onclick="MeviGoogleNav.pick(\''+kind+'\','+i+')" aria-label="'+text(d.name)+' auswählen"><span class="circle">⌖</span><span><strong>'+text(d.name)+'</strong><small>'+text(d.address||'Google Maps')+'</small></span><span class="suggestion-chevron">›</span></button>'}
function resultsHTML(){
 if(!key())return setupHTML();
 if(query.length>=3){if(suggestions.length)return suggestions.map((s,i)=>item({name:s.placePrediction.text.toString(),address:'Google Places'},i,'suggest')).join('');return '<div class="mg-search-message">'+text(error||'Google Places sucht Adressen …')+'</div>'}
 const all=unique([...cache.favorites,...cache.recent],12);
 return all.length?all.map((d,i)=>item(d,i,'stored')).join(''):'<div class="mg-search-message">Gib mindestens drei Zeichen ein, um eine Adresse zu suchen.</div>';
}
function list(kind){return kind==='favorites'?cache.favorites:cache.recent}
function buttons(kind,limit=6){return list(kind).slice(0,limit).map((d,i)=>item(d,i,kind)).join('')||'<span class="mg-search-message">Noch keine Ziele gespeichert.</span>'}
async function pick(kind,index){
 let d;
 if(kind==='suggest'){
  const prediction=suggestions[index]?.placePrediction;if(!prediction)return;
  try{
    const place=prediction.toPlace();
    await place.fetchFields({fields:['displayName','formattedAddress','location']});
    const p=place.location?.toJSON?.()||place.location;
    d={name:place.displayName||place.formattedAddress||prediction.text.toString(),address:place.formattedAddress||'',lat:p?.lat,lng:p?.lng};
    token=null;
  }catch(e){status('Ziel konnte nicht geladen werden: '+(e.message||e));return}
 }else d=kind==='stored'?unique([...cache.favorites,...cache.recent],12)[index]:list(kind)[index];
 if(!valid(d))return;
 stopGuidance();selected=d;routeData=null;clearLines();mark(d);
 window.meviGoogleDestination?.(d.name,d.address);
}
function favoritesHTML(){return '<div class="favs mg-favorites">'+cache.favorites.map((d,i)=>'<button type="button" class="fav" onclick="MeviGoogleNav.pick(\'favorites\','+i+')" aria-label="'+text(d.name)+' auswählen"><span class="bubble">⌖</span><span>'+text(d.name)+'</span></button>').join('')+'</div>'}
function saveFavorite(){if(!selected)return;cache.favorites=unique([selected,...cache.favorites.filter(x=>keyOf(x)!==keyOf(selected))],100);persist();window.meviGoogleRerender?.()}
function removeFavorite(){if(!selected)return;cache.favorites=cache.favorites.filter(x=>keyOf(x)!==keyOf(selected));persist();window.meviGoogleRerender?.()}
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
 stopGuidance({keepRoute:true});routeData=null;routeSummary='';guidanceSteps=[];clearLines();markOrigin();
 window.meviGoogleRerender?.();
}
function originDescription(){return manualOrigin?'Manueller Startpunkt auf Karte gesetzt':'Startpunkt ist dein aktueller GPS-Standort'}
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
function drawRoute(){
 clearLines();if(!map||!routeData)return;
 routeLines=routeData.createPolylines();
 for(const line of routeLines){line.setOptions({strokeColor:'#26dcff',strokeWeight:7});line.setMap(map)}
 const path=routeData.path||[];
 if(path.length>1){
  const bounds=new google.maps.LatLngBounds();
  for(const point of path)bounds.extend({lat:point.lat,lng:point.lng});
  map.fitBounds(bounds,55);
 }
}
let routeSummary='';
function geoPoint(input){
 if(!input)return null;
 const p=typeof input.toJSON==='function'?input.toJSON():input;
 const lat=typeof p.lat==='function'?p.lat():p.lat;
 const lng=typeof p.lng==='function'?p.lng():p.lng;
 return Number.isFinite(lat)&&Number.isFinite(lng)?{lat,lng}:null;
}
function distanceBetween(a,b){
 if(!a||!b)return Infinity;
 const rad=Math.PI/180,dlat=(b.lat-a.lat)*rad,dlng=(b.lng-a.lng)*rad;
 const t=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlng/2)**2;
 return 12742000*Math.atan2(Math.sqrt(t),Math.sqrt(Math.max(0,1-t)));
}
function metersLabel(m){
 if(!Number.isFinite(m))return '–';
 return m>=1000?new Intl.NumberFormat('de-DE',{maximumFractionDigits:1}).format(m/1000)+' km':Math.round(m/10)*10+' m';
}
function guidanceInstruction(step){
 return (step?.instructions||'Der Route folgen').replace(/<[^>]*>/g,' ').replace(/\\s+/g,' ').trim();
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
function stepsFromRoute(route){
 return (route?.legs||[]).flatMap(leg=>leg.steps||[]).map(step=>({
  instructions:guidanceInstruction(step),maneuver:step.maneuver||'',
  distanceMeters:step.distanceMeters||0,
  end:geoPoint(step.endLocation)||geoPoint(step.path?.[step.path.length-1]),
  start:geoPoint(step.startLocation)||geoPoint(step.path?.[0]),
  path:(step.path||[]).map(geoPoint).filter(Boolean)
 }));
}
function stepsHTML(limit=5){
 if(!guidanceSteps.length)return '<span class="mg-empty-steps">Google hat keine einzelnen Fahranweisungen geliefert.</span>';
 return guidanceSteps.slice(0,limit).map((step,i)=>'<div class="mg-step-item"><span class="mg-step-icon">'+guidanceSymbol(step)+'</span><span>'+text(step.instructions)+'</span><small>'+metersLabel(step.distanceMeters)+'</small></div>').join('');
}
async function computeRouteFrom(from){
 await load();
 const {Route}=await google.maps.importLibrary('routes');
 const {routes}=await Route.computeRoutes({
  origin:from,destination:{lat:selected.lat,lng:selected.lng},
  travelMode:'DRIVING',
  fields:['path','distanceMeters','durationMillis','legs']
 });
 if(!routes?.length)throw new Error('Keine Fahrroute gefunden.');
 routeData=routes[0];guidanceSteps=stepsFromRoute(routeData);stepIndex=0;spokenThresholds.clear();lastSpokenStep=-1;
 const km=(routeData.distanceMeters||0)/1000;
 const minutes=Math.round((routeData.durationMillis||0)/60000);
 routeSummary=new Intl.NumberFormat('de-DE',{maximumFractionDigits:1}).format(km)+' km · '+minutes+' Min.';
 clearStatus();drawRoute();
 window.meviGoogleRouteReady?.(routeSummary);
 return true;
}
async function calculateRoute(){
 if(!selected){status('Bitte zuerst ein Ziel auswählen.');return false}
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
 const remaining=document.getElementById('mg-remaining');
 const speed=document.getElementById('mg-live-gps');
 const voice=document.getElementById('mg-voice-toggle');
 const state=document.getElementById('mg-guidance-state');
 if(next)next.textContent=step?.instructions||'Der Route folgen';
 if(arrow)arrow.textContent=guidanceSymbol(step);
 if(distance)distance.textContent=metersLabel(step?.end&&current?distanceBetween(current,step.end):step?.distanceMeters);
 if(remaining)remaining.textContent=routeSummary;
 if(speed)speed.textContent=simulation?'DEMO – simulierte Fahrt':currentSpeed===null?'GPS aktiv · Tempo –':Math.round(currentSpeed)+' km/h · GPS ±'+Math.round(lastGpsAccuracy||0)+' m';
 if(voice){voice.textContent=voiceMuted?'Ton einschalten':'Ton ausschalten';voice.setAttribute('aria-pressed',String(!voiceMuted))}
 if(state)state.textContent=simulation?'SIMULATION':guidanceActive?'NAVIGATION AKTIV':'ROUTENVORSCHAU';
}
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
  await computeRouteFrom(point);
  if(generation!==guidanceGeneration)return;
  offRouteCount=0;clearStatus();
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
 markCurrent(point,p.coords.heading);followPosition(point,p.coords.heading);
 if(lastGpsAccuracy===null||lastGpsAccuracy<75)maybeAdvanceStep(point,lastGpsAccuracy);
 const nearest=nearestDistanceToPath(point,routeData?.path);
 if(lastGpsAccuracy!==null&&lastGpsAccuracy<50&&nearest>110)offRouteCount++;
 else offRouteCount=0;
 if(offRouteCount>=3)reroute(point);
 paintGuidance();
}
async function startGuidance(){
 if(!routeData||!selected){status('Bitte zuerst eine Route berechnen.','route');return false}
 if(guidanceActive)return true;
 try{
  const actual=await position();
  if(manualOrigin&&distanceBetween(manualOrigin,actual)>150){
   await computeRouteFrom(actual);
  }
  manualOrigin=null;guidanceActive=true;simulation=false;guidanceGeneration++;
  stepIndex=0;spokenThresholds.clear();offRouteCount=0;
  clearStatus();
  const geo=navigator.geolocation;
  geoWatch=geo.watchPosition(updatePosition,e=>status('GPS-Signal: '+(e.code===3?'Zeitüberschreitung':e.message),'gps'),
   {enableHighAccuracy:true,maximumAge:2000,timeout:12000});
  followPosition(actual);markCurrent(actual);
  paintGuidance();speech('Navigation gestartet. '+(guidanceSteps[0]?.instructions||'Der Route folgen'));
  return true;
 }catch(e){status('Navigation nicht gestartet: '+(e.message||e),'gps');return false}
}
function startDemo(){
 if(!routeData||!guidanceSteps.length){status('Keine Abbiegeschritte für Demo vorhanden.','route');return false}
 stopGuidance({keepRoute:true});
 guidanceActive=true;simulation=true;stepIndex=0;spokenThresholds.clear();guidanceGeneration++;
 clearStatus();
 if(simulationTimer!==null)clearInterval(simulationTimer);
 simulationTimer=setInterval(()=>{
  if(!simulation)return;
  const step=guidanceSteps[stepIndex];
  if(step?.end){markCurrent(step.end);followPosition(step.end)}
  if(stepIndex<guidanceSteps.length-1)stepIndex++;
  else{stopGuidance({keepRoute:true});window.meviGoogleNavigationFinished?.();return}
  paintGuidance();
 },4500);
 paintGuidance();return true;
}
function stopGuidance(options={}){
 guidanceGeneration++;
 if(geoWatch!==null){navigator.geolocation?.clearWatch(geoWatch);geoWatch=null}
 if(simulationTimer!==null){clearInterval(simulationTimer);simulationTimer=null}
 try{window.speechSynthesis?.cancel()}catch{}
 guidanceActive=false;simulation=false;currentSpeed=null;offRouteCount=0;
 if(positionMarker){positionMarker.setMap(null);positionMarker=null}
 if(!options.keepRoute){routeData=null;routeSummary='';guidanceSteps=[];stepIndex=0;clearLines();selected=null}
}
function routeInfo(){return routeSummary}
function hasPlannedRoute(){return !!routeData}
function guidanceRunning(){return guidanceActive}
function routeReadyHTML(){return '<div class="mg-ready-summary"><strong>'+text(routeSummary)+'</strong><div class="mg-ready-steps">'+stepsHTML(4)+'</div></div>'}
function locationButton(){return '<button type="button" class="mg-my-location" onclick="MeviGoogleNav.myLocation()" aria-label="Meinen Standort anzeigen" title="Meinen Standort anzeigen">◎</button>'}
function routeInfo(){return routeSummary}
window.MeviGoogleNav={mount,mapBackdrop,resultsHTML,changeQuery,pick,buttons,favoritesHTML,saveFavorite,removeFavorite,isFavorite,selectedAddress,originDescription,selectOriginOnMap,cancelOriginSelection,chooseOriginPoint,isManualOrigin:()=>!!manualOrigin,setKey,removeKey,hasKey:()=>!!key(),calculateRoute,startGuidance,startDemo,stopGuidance,toggleVoice,paintGuidance,routeReadyHTML,hasPlannedRoute,guidanceRunning,locationButton,routeInfo,myLocation,setupHTML,selectName:async(name)=>{changeQuery(name);await search(name,requestSerial);if(suggestions[0])await pick('suggest',0)}};
// Repaint after this defer-like script loads; the inline cockpit rendered before it.
if (typeof window.render === 'function') window.render();
})();
