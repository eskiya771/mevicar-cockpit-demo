/* Isolated MeviCar navigation preview. Loads the EXACT search UI and shared
   core from the feature branch; never touches stable Web or Android data. */
(function(){
'use strict';
const DATA_KEY='mevicar-nav-preview-book-v1';
const demo={
 slots:{
  home:{id:'demo-home',name:'Zuhause',address:'Beispieladresse, Erlangen',lat:49.5897,lng:11.0050},
  work:{id:'demo-work',name:'Arbeit',address:'Erlangen',lat:49.5951,lng:11.0038}
 },
 favorites:[
  {id:'demo-cafe',name:'Café am Markt',address:'Marktplatz, Erlangen',lat:49.596,lng:11.004,icon:'food',note:'Beispiel-Favorit'},
  {id:'demo-park',name:'Parkhaus Zentrum',address:'Erlangen',lat:49.597,lng:11.006,icon:'parking'}
 ],
 recent:[
  {name:'Arbeit',address:'Erlangen',lat:49.5951,lng:11.0038},
  {name:'Rathaus',address:'Erlangen',lat:49.5938,lng:11.0048},
  {name:'Berlin',address:'Berlin',lat:52.52,lng:13.405}
 ]
};
const demoSuggestions=[
 {name:'Erlangen Arcaden',address:'Nürnberger Straße, Erlangen',lat:49.591,lng:11.001},
 {name:'Rathaus Erlangen',address:'Rathausplatz 1, Erlangen',lat:49.591,lng:11.004},
 {name:'Café am Markt',address:'Marktplatz, Erlangen',lat:49.596,lng:11.004},
 {name:'Tankstelle Zentrum',address:'Erlangen',lat:49.603,lng:11.012},
 {name:'Rastplatz A3',address:'A3, Bayern',lat:49.65,lng:10.95},
 {name:'Werkstatt Erlangen',address:'Erlangen',lat:49.604,lng:11.017}
];
const clone=value=>JSON.parse(JSON.stringify(value));
const safe=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function fromDisk(){
 try{
  const raw=JSON.parse(window.localStorage.getItem(DATA_KEY)||'null');
  return raw&&typeof raw==='object'&&raw.slots&&Array.isArray(raw.favorites)&&Array.isArray(raw.recent)
   ?raw:clone(demo);
 }catch{return clone(demo)}
}
let book=fromDisk(),suggestions=[],query='',error='',selected=null,pending=null,gmapsReady=false;
let searchId=0,session=null,searchTimer=null,connected=false,lastError='';
const limits={favorites:200,recent:30};
function persist(){
 try{window.localStorage.setItem(DATA_KEY,JSON.stringify(book))}
 catch{lastError='Der Browser konnte die Testdaten nicht speichern.'}
}
function normalizeBook(){
 if(!book.slots||typeof book.slots!=='object')book.slots={home:null,work:null};
 book.favorites=(Array.isArray(book.favorites)?book.favorites:[]).slice(0,limits.favorites);
 book.recent=(Array.isArray(book.recent)?book.recent:[]).slice(0,limits.recent);
}
normalizeBook();
const coordsValid=d=>d&&Number.isFinite(d.lat)&&Number.isFinite(d.lng)&&Math.abs(d.lat)<=90&&Math.abs(d.lng)<=180;
function placeKey(d){
 if(d?.placeId)return 'p:'+d.placeId;
 return coordsValid(d)?'c:'+d.lat.toFixed(5)+','+d.lng.toFixed(5):String(d?.name||'');
}
function listUpdate(){
 if(s.nav!=='search')return;
 const el=document.getElementById('suggestions');
 if(el&&window.MeviWebNavParity?.resultsHTML)el.innerHTML=window.MeviWebNavParity.resultsHTML();
}
function searchSamples(q){
 const needle=q.trim().toLocaleLowerCase('de-DE');
 if(needle.length<2)return [];
 const filtered=demoSuggestions.filter(item=>
  (item.name+' '+item.address).toLocaleLowerCase('de-DE').includes(needle));
 return (filtered.length?filtered:demoSuggestions.slice(0,4)).map(clone);
}
async function liveSuggestions(q,id){
 try{
  const {AutocompleteSuggestion,AutocompleteSessionToken}=await google.maps.importLibrary('places');
  if(!session)session=new AutocompleteSessionToken();
  const response=await AutocompleteSuggestion.fetchAutocompleteSuggestions({
   input:q,language:'de',region:'de',sessionToken:session,
   locationBias:{center:{lat:49.590,lng:11.005},radius:50000}
  });
  if(id!==searchId)return;
  suggestions=(response.suggestions||[]).filter(x=>x.placePrediction).slice(0,10).map(x=>({
   name:x.placePrediction.text.toString(),address:'Google Places',
   prediction:x.placePrediction
  }));
  error=suggestions.length?'':'Keine Treffer gefunden.';
  listUpdate();
 }catch(e){
  if(id!==searchId)return;
  suggestions=[];error='Google Places: '+String(e.message||e);listUpdate();
 }
}
function search(q){
 query=String(q||'').trim();searchId++;clearTimeout(searchTimer);
 suggestions=[];error='';
 if(query.length<2){listUpdate();return}
 if(!gmapsReady){
  suggestions=searchSamples(query);
  if(!suggestions.length)error='Keine passenden Beispielorte.';
  listUpdate();return;
 }
 const id=searchId;
 searchTimer=setTimeout(()=>{void liveSuggestions(query,id)},300);
 listUpdate();
}
async function resolvePrediction(source){
 if(!source?.prediction)return source;
 const place=source.prediction.toPlace();
 await place.fetchFields({fields:['id','displayName','formattedAddress','location']});
 const point=place.location?.toJSON?.()||place.location;
 return {id:'preview-'+Date.now(),placeId:place.id||'',name:place.displayName||source.name,
  address:place.formattedAddress||'',lat:point?.lat,lng:point?.lng,
  fetchedAt:Date.now()};
}
async function choose(kind,index,opts={}){
 let place=kind==='suggest'?suggestions[index]:
  kind==='home'||kind==='work'?book.slots[kind]:
  kind==='favorites'?book.favorites[index]:book.recent[index];
 if(!place)return false;
 try{place=await resolvePrediction(place)}
 catch(e){error='Ort konnte nicht geladen werden: '+String(e.message||e);listUpdate();return false}
 if(!coordsValid(place)){error='Keine Koordinaten für dieses Ziel vorhanden.';listUpdate();return false}
 if(opts?.saveOnly){pending={...place};return true}
 selected={...place};
 book.recent=[selected,...book.recent.filter(x=>placeKey(x)!==placeKey(selected))].slice(0,30);
 persist();
 s.nav='preview';s.keyboard=false;window.render?.();
 return true;
}
function saveSlot(slot){
 if(!['home','work'].includes(slot)||!pending)return false;
 book.slots[slot]={...pending,id:pending.id||'preview-'+Date.now()};
 pending=null;persist();return true;
}
function saveFavorite(){
 if(!pending)return false;
 book.favorites=[{...pending,id:pending.id||'preview-'+Date.now()},
  ...book.favorites.filter(x=>placeKey(x)!==placeKey(pending))].slice(0,200);
 pending=null;persist();return true;
}
const typeMap={fuel:'gas_station',charge:'electric_vehicle_charging_station',parking:'parking',
 food:'restaurant',cafe:'cafe',cart:'supermarket',rest:'rest_stop',wrench:'car_repair'};
async function nearby(type,words,origin){
 if(!gmapsReady){
  suggestions=searchSamples(words);
  if(!suggestions.length)suggestions=demoSuggestions.slice(0,4).map(clone);
  error='';listUpdate();return;
 }
 const id=++searchId;
 try{
  const {Place}=await google.maps.importLibrary('places');
  let response;
  if(type==='text'){
   response=await Place.searchByText({
    textQuery:words,fields:['id','displayName','formattedAddress','location'],
    locationBias:origin||{lat:49.590,lng:11.005},maxResultCount:15
   });
  }else{
   response=await Place.searchNearby({
    fields:['id','displayName','formattedAddress','location'],
    locationRestriction:{center:origin||{lat:49.590,lng:11.005},radius:16000},
    includedPrimaryTypes:[typeMap[type]||'restaurant'],maxResultCount:15
   });
  }
  if(id!==searchId)return;
  suggestions=(response.places||[]).map(p=>{
   const loc=p.location?.toJSON?.()||p.location;
   return {id:'preview-'+Date.now(),placeId:p.id||'',name:p.displayName||p.formattedAddress||'Ort',
    address:p.formattedAddress||'',lat:loc?.lat,lng:loc?.lng};
  }).filter(coordsValid);
  error=suggestions.length?'':'Keine passenden Orte gefunden.';
  listUpdate();
 }catch(e){if(id!==searchId)return;suggestions=[];error='Google Places: '+String(e.message||e);listUpdate()}
}
window.MeviSharedNavigationProvider={
 isReady:()=>true,
 read:()=>({...book,suggestions,query,error,origin:null}),
 search,choose,saveSlot,saveFavorite,searchNearby:nearby,
 write:changes=>{
  if(changes&&typeof changes==='object'){
   for(const key of ['favorites','recent','slots'])if(Object.prototype.hasOwnProperty.call(changes,key))book[key]=clone(changes[key]);
   normalizeBook();persist();
  }
  return true;
 }
};
window.browseOverlay=()=>'<div class="inner"></div>';
window.render=function(){
 const holder=document.getElementById('previewRoot');
 if(!holder)return;
 if(s.nav==='search'){holder.innerHTML=window.searchOverlay?.()||'';return}
 if(s.nav==='preview'){
  holder.innerHTML='<div class="preview-home"><h1>Ziel ausgewählt</h1><h2>'+safe(selected?.name||'')+'</h2>'+
   '<p>'+safe(selected?.address||'')+'</p><p>Dies ist nur die Such- und Adressbuch-Vorschau. Es wird keine Route gestartet.</p>'+
   '<button onclick="MeviWebNavParity.open()">Neues Ziel suchen</button>'+
   '<button onclick="MeviWebNavParity.book()">Adressbuch</button></div>';
  return;
 }
 holder.innerHTML='<div class="preview-home"><div class="preview-label">MEVICAR NEXT · UI-TEST</div>'+
 '<h1>Gemeinsame Navigation</h1><p>Suche und Adressbuch aus dem Entwicklungsbranch. '+
 'Die Daten hier sind unabhängig von deiner stabilen Web-App.</p>'+
 '<div class="preview-controls"><button onclick="MeviWebNavParity.open()">Ziel / POI</button>'+
 '<button onclick="MeviWebNavParity.book()">Adressbuch</button></div>'+
 '<section class="preview-api"><h2>Optional: Google Places live testen</h2>'+
 '<p>Ohne Schlüssel nutzt diese Vorschau Beispieldaten. Für echte Suchtreffer kannst du deinen <strong>Web-API-Key</strong> eingeben. Der Schlüssel wird hier nur im Arbeitsspeicher gehalten.</p>'+
 '<div class="preview-key-row"><input id="previewGoogleKey" type="password" autocomplete="off" placeholder="Google Maps Web-API-Key" aria-label="Google Maps Web-API-Key">'+
 '<button onclick="MeviPreview.connect()">Verbinden</button></div>'+
 '<p id="previewStatus" role="status">'+safe(connected?'Google Places verbunden':lastError||'Beispieldaten aktiv')+'</p></section>'+
 '<p class="preview-caution">Experimenteller Stand · kein Routing · keine Android-Änderung</p>'+
 '<button class="preview-reset" onclick="MeviPreview.reset()">Testdaten zurücksetzen</button></div>';
};
async function connect(){
 const input=document.getElementById('previewGoogleKey');
 const key=input?.value.trim()||'';
 const node=document.getElementById('previewStatus');
 if(!/^AIza[A-Za-z0-9_-]{20,}$/.test(key)){if(node)node.textContent='Bitte einen gültigen Browser-API-Schlüssel eingeben.';return}
 if(window.google?.maps?.importLibrary){gmapsReady=true;connected=true;if(node)node.textContent='Google Places bereit.';return}
 if(node)node.textContent='Verbinde Google Places …';
 try{
  await new Promise((resolve,reject)=>{
   const callback='__meviPreviewGoogleReady';
   let expired=false;
   const timeout=setTimeout(()=>{expired=true;reject(Error('Zeitüberschreitung bei Google Maps.'))},12000);
   window[callback]=()=>{clearTimeout(timeout);if(!expired)resolve()};
   const script=document.createElement('script');
   script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&v=weekly&language=de&region=DE&loading=async&callback='+callback;
   script.onerror=()=>{clearTimeout(timeout);reject(Error('Google Maps konnte nicht geladen werden.'))};
   document.head.appendChild(script);
  });
  await google.maps.importLibrary('places');
  gmapsReady=true;connected=true;lastError='';
  if(input)input.value='';
  if(node)node.textContent='Google Places verbunden – jetzt Ziel / POI öffnen.';
 }catch(e){gmapsReady=false;connected=false;lastError=String(e.message||e);if(node)node.textContent=lastError}
}
function reset(){
 if(!window.confirm('Nur die Testdaten dieser Navigationsvorschau zurücksetzen?'))return;
 window.localStorage.removeItem(DATA_KEY);
 book=clone(demo);suggestions=[];query='';selected=null;pending=null;lastError='';
 window.render();
}
window.MeviPreview={connect,reset};
})();
