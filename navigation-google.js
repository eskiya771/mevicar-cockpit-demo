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
let map=null,mapElement=null,mapLoading=null,geoWatch=null,current=null,marker=null,routeLines=[],routeData=null,selected=null,suggestions=[],query='',timer=null,requestSerial=0,token=null,error='',state='browse',mounted=false,stage='setup';
function persist(){try{localStorage.setItem(DATA,JSON.stringify(cache))}catch{}}
function key(){try{return localStorage.getItem(KEY)||''}catch{return ''}}
function setKey(){const input=document.getElementById('mg-key');const k=(input?.value||'').trim();if(!/^[A-Za-z0-9_-]{20,}$/.test(k)){status('Ungültiger Google Maps API-Key.');return}try{localStorage.setItem(KEY,k)}catch{status('Browser-Speicher nicht verfügbar.');return}location.reload()}
function removeKey(){try{localStorage.removeItem(KEY)}catch{}location.reload()}
function status(message){
 error=message;
 const e=document.getElementById('mg-status');
 if(e){e.textContent=message;e.hidden=false;e.classList.add('mg-diagnostic')}
 const change=document.getElementById('mg-change-key');
 if(change)change.hidden=false;
}
function setupHTML(){return '<div class="mg-setup"><strong>Google Maps aktivieren</strong><p>Für die Web-App benötigst du einen Browser-API-Key. Als zugelassene Website füge <code>https://eskiya771.github.io/*</code> hinzu (manche Browser übertragen nur die Domain als Referrer).</p><input id="mg-key" type="text" spellcheck="false" autocomplete="off" placeholder="Browser-API-Key" aria-label="Google Maps Browser-API-Key"><button type="button" onclick="MeviGoogleNav.setKey()">Google Maps verbinden</button><small>Google Maps JavaScript API, Places API (New) und Routes API aktivieren. Der Key wird ausschließlich in diesem Browser gespeichert.</small><span id="mg-status" role="status">'+text(error)+'</span></div>'}
function mapBackdrop(){return '<div id="mg-map" class="mg-map" aria-label="Google Maps Karte"></div>'+(!key()?setupHTML():'<div class="mg-map-state" id="mg-map-notice" role="status"><span id="mg-status">'+text(error||'Google Maps wird geladen …')+'</span><button type="button" id="mg-change-key" class="mg-change-key" onclick="MeviGoogleNav.removeKey()"'+(error?'':' hidden')+'>API-Schlüssel erneut einrichten</button></div>')}
function load(){
 if(!key())return Promise.reject(new Error('Google Maps Browser-Key fehlt.'));
 if(window.google?.maps?.importLibrary)return Promise.resolve(window.google.maps);
 if(mapLoading)return mapLoading;
 mapLoading=new Promise((resolve,reject)=>{
   const cb='__meviMapsReady';
   const script=document.createElement('script');
   // Google's callback also fires when the script loads but authorization fails.
   window.gm_authFailure=()=>status('Google Maps verweigert die Berechtigung. Prüfe Abrechnung, Maps JavaScript API und die Website-Freigabe https://eskiya771.github.io/* in Google Cloud.');
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
     marker=null;routeLines=[];
     if(selected)mark(selected);
     if(routeData)drawRoute();
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
 selected=d;routeData=null;clearLines();mark(d);
 window.meviGoogleDestination?.(d.name,d.address);
}
function favoritesHTML(){return '<div class="favs mg-favorites">'+cache.favorites.map((d,i)=>'<button type="button" class="fav" onclick="MeviGoogleNav.pick(\'favorites\','+i+')" aria-label="'+text(d.name)+' auswählen"><span class="bubble">⌖</span><span>'+text(d.name)+'</span></button>').join('')+'</div>'}
function saveFavorite(){if(!selected)return;cache.favorites=unique([selected,...cache.favorites.filter(x=>keyOf(x)!==keyOf(selected))],100);persist();window.meviGoogleRerender?.()}
function removeFavorite(){if(!selected)return;cache.favorites=cache.favorites.filter(x=>keyOf(x)!==keyOf(selected));persist();window.meviGoogleRerender?.()}
function isFavorite(){return !!selected&&cache.favorites.some(x=>keyOf(x)===keyOf(selected))}
function selectedAddress(){return selected?.address||'Bitte gültige Adresse auswählen'}
function position(){return new Promise((resolve,reject)=>{if(!navigator.geolocation){reject(new Error('Standortfunktion nicht verfügbar'));return}navigator.geolocation.getCurrentPosition(p=>{current={lat:p.coords.latitude,lng:p.coords.longitude};resolve(current)},e=>reject(new Error('Standort nicht verfügbar: '+e.message)),{enableHighAccuracy:true,timeout:12000,maximumAge:5000})})}
async function myLocation(){try{const p=await position();if(map){map.panTo(p);map.setZoom(16)}status('Aktueller Standort gefunden.')}catch(e){status(e.message)}}
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
async function calculateRoute(){
 if(!selected){status('Bitte zuerst ein Ziel auswählen.');return false}
 try{
   await load();
   const from=await position();
   const {Route}=await google.maps.importLibrary('routes');
   const {routes}=await Route.computeRoutes({
     origin:from,destination:{lat:selected.lat,lng:selected.lng},
     travelMode:'DRIVING',
     fields:['path','distanceMeters','durationMillis']
   });
   if(!routes?.length)throw new Error('Keine Fahrroute gefunden.');
   routeData=routes[0];drawRoute();
   const km=(routeData.distanceMeters||0)/1000;
   const minutes=Math.round((routeData.durationMillis||0)/60000);
   routeSummary=new Intl.NumberFormat('de-DE',{maximumFractionDigits:1}).format(km)+' km · '+minutes+' Min.';
   window.meviGoogleRouteReady?.(routeSummary);
   return true;
 }catch(e){status('Routenberechnung fehlgeschlagen: '+(e.message||e));return false}
}
function startGuidance(){
 if(!routeData){status('Bitte zunächst eine Route berechnen.');return}
 if(geoWatch!==null)return;
 if(!navigator.geolocation){status('GPS nicht verfügbar');return}
 geoWatch=navigator.geolocation.watchPosition(p=>{
  current={lat:p.coords.latitude,lng:p.coords.longitude};
  if(map){map.panTo(current);map.setZoom(17)}
  const el=document.getElementById('mg-live-gps');
  if(el)el.textContent='GPS '+Math.round(p.coords.accuracy)+' m · '+(p.coords.speed===null?'–':Math.round(p.coords.speed*3.6))+' km/h';
 },e=>status('GPS-Signal: '+e.message),{enableHighAccuracy:true,maximumAge:1500,timeout:12000});
}
function stopGuidance(){if(geoWatch!==null){navigator.geolocation.clearWatch(geoWatch);geoWatch=null}routeData=null;routeSummary='';clearLines();selected=null}
function locationButton(){return '<button type="button" class="mg-my-location" onclick="MeviGoogleNav.myLocation()" aria-label="Meinen Standort anzeigen" title="Meinen Standort anzeigen">◎</button>'}
function routeInfo(){return routeSummary}
window.MeviGoogleNav={mount,mapBackdrop,resultsHTML,changeQuery,pick,buttons,favoritesHTML,saveFavorite,removeFavorite,isFavorite,selectedAddress,setKey,removeKey,hasKey:()=>!!key(),calculateRoute,startGuidance,stopGuidance,locationButton,routeInfo,myLocation,setupHTML,selectName:async(name)=>{changeQuery(name);await search(name,requestSerial);if(suggestions[0])await pick('suggest',0)}};
// Repaint after this defer-like script loads; the inline cockpit rendered before it.
if (typeof window.render === 'function') window.render();
})();
