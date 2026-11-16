/* Opt-in shared navigation UI provider for the Android Hybrid WebView.
   The native Kotlin DestinationStore owns the book; Android Places owns search;
   the native navigation owns the route (navigation.route.* only reads it and
   adds or removes single stops).
   Disabled unless ?sharedNavPreview=1 on this DEVELOPMENT branch.
   Does not expose a Web Google key or create shadow browser storage. */
(function(root){
'use strict';
if(!root.MeviNativeBridge?.postMessage ||
   new URLSearchParams(root.location?.search||'').get('sharedNavPreview')!=='1')return;
const book=root.MeviNativeBook,places=root.MeviAndroidPlaces,nav=root.MeviGoogleNav;
const shared=root.MeviNavigationShared;
if(!book||!places||!nav?.nativeRequest||!shared)return;
let ready=false,connecting=null,searchOpen=false,pending=null,sequence=0,uiError='';
const NO_HITS='Keine passenden Orte gefunden.';
let poiBusy=0,poiOptions={sort:'distance',openNow:false,alongRoute:false},resolvedPlace=null;
// routeContext() is synchronous for the shared UI, so the native route state is
// cached. nativeOwned: Android draws route and guidance itself; the shared UI
// must return to the map instead of its own Web route panels.
const NO_ROUTE=Object.freeze({hasRoute:false,active:false,stops:[],maxStops:8,destination:null,nativeOwned:true});
let route=NO_ROUTE;
function routeFrom(raw){
 if(!raw||raw.hasRoute!==true)return NO_ROUTE;
 const spot=x=>({lat:Number(x?.lat),lng:Number(x?.lng),name:String(x?.name||''),
  address:String(x?.address||''),placeId:String(x?.placeId||'')});
 const max=Number.isInteger(raw.maxStops)&&raw.maxStops>0?raw.maxStops:8;
 return {hasRoute:true,active:raw.active===true,
  stops:(Array.isArray(raw.stops)?raw.stops:[]).slice(0,max).map(spot).filter(valid),
  maxStops:max,destination:valid(spot(raw.destination))?spot(raw.destination):null,nativeOwned:true};
}
function routeContext(){return copy(route)}
function takeRoute(raw){
 const before=JSON.stringify(route);
 route=routeFrom(raw);
 return JSON.stringify(route)!==before;
}
// Older APKs have no route bridge: the search then simply offers no stops.
async function refreshRoute(){
 let changed;
 try{changed=takeRoute((await nativeRequest('navigation.route.read')).route)}
 catch{changed=takeRoute(null)}
 if(changed&&searchOpen)root.render?.();
 return routeContext();
}
const valid=d=>d&&Number.isFinite(d.lat)&&Number.isFinite(d.lng)&&
 Math.abs(d.lat)<=90&&Math.abs(d.lng)<=180;
const copy=v=>JSON.parse(JSON.stringify(v));
const id=()=>('web-'+Date.now().toString(36)+'-'+(++sequence).toString(36));
const nativeRequest=(action,fields)=>nav.nativeRequest(action,fields||{});
// Visible result rows. "Jetzt geöffnet" and the ranking are applied by the native
// search (Google filters open places server-side; list rows carry no hours).
// The distance order is only re-established here; every index-based action
// must use this same list.
function rows(query){
 const q=query||places.snapshot();
 let list=q.suggestions;
 if(q.mode!=='poi')return list;
 if(poiOptions.sort==='distance'){
  const far=item=>Number.isFinite(item.distanceMeters)?item.distanceMeters:Infinity;
  list=list.map((item,i)=>[item,i]).sort((a,b)=>far(a[0])-far(b[0])||a[1]-b[1]).map(x=>x[0]);
 }
 return list;
}
function read(){
 const state=book.view(),query=places.snapshot(),poi=query.mode==='poi',list=rows(query);
 const failure=uiError||query.error;
 return {...state,suggestions:list,query:query.query,error:failure,
  poiResults:poi?list:[],poiActive:poi,poiLoading:poiBusy>0,
  // An empty hit list is a normal result for the shared UI, not a failure.
  poiError:poi&&!poiBusy?(uiError||(query.error===NO_HITS?'':query.error)):''};
}
function refreshResults(){
 const node=root.document?.getElementById('suggestions');
 if(node&&root.MeviWebNavParity?.resultsHTML)
  node.innerHTML=root.MeviWebNavParity.resultsHTML();
}
function warn(e){
 uiError=String(e?.message||e||'Android-Navigation fehlgeschlagen.').slice(0,200);
 refreshResults();
 return false;
}
async function connect(){
 if(ready)return true;
 if(connecting)return connecting;
 connecting=Promise.all([book.connect(),places.connect()]).then(()=>{
  ready=true;uiError='';return true;
 });
 try{return await connecting}finally{connecting=null}
}
function search(value){
 const q=String(value||'');
 uiError='';resolvedPlace=null;
 void connect().then(()=>places.search(q)).then(refreshResults).catch(warn);
}
function searchNearby(type,text,origin,options){
 uiError='';resolvedPlace=null;
 poiOptions={sort:options?.sort==='relevance'?'relevance':'distance',openNow:options?.openNow===true,
  alongRoute:options?.alongRoute===true&&route.hasRoute};
 poiBusy++;
 return connect().then(()=>places.searchNearby(type,text,origin,poiOptions))
  .then(()=>{poiBusy--;refreshResults()},e=>{poiBusy--;return warn(e)});
}
// Google place details for the shared place view. Keeps the result so that
// "Route" right afterwards does not pay for a second details request.
async function details(kind,index){
 if(kind!=='suggest')return null;
 await connect();
 const row=rows()[index];
 if(!row?.placeId)return null;
 const resolved=await places.resolve(row,row.name);
 resolvedPlace={...resolved,fetchedAt:Date.now()};
 const {openingNote,...detail}=resolved;
 return {...detail,hours:openingNote?[openingNote]:[]};
}
// Favorite toggle of the shared place view as single native book operations.
async function savePlace(place,saved){
 await connect();
 const item=shared.destination(place);
 if(!item)throw new Error('Ort kann nicht gespeichert werden.');
 const key=x=>x.placeId?'p:'+x.placeId:valid(x)?'c:'+x.lat.toFixed(5)+','+x.lng.toFixed(5):'';
 if(saved){
  const old=read().favorites.find(x=>key(x)&&key(x)===key(item));
  if(!old)return false;
  await book.remove(old.id);
 }else{
  const entry={id:id(),slot:'',name:item.name,address:item.address||''};
  if(item.placeId)entry.placeId=item.placeId;
  if(valid(item)){entry.lat=item.lat;entry.lng=item.lng;entry.fetchedAt=Date.now()}
  await book.save(entry);
 }
 return true;
}
async function choose(kind,index,options={}){
 await connect();
 const data=read();
 const row=kind==='suggest'?data.suggestions[index]:
  kind==='favorites'?data.favorites[index]:
  kind==='recent'?data.recent[index]:
  kind==='home'||kind==='work'?data.slots[kind]:null;
 if(!row)return false;
 let entry={...row};
 const age=Date.now()-Number(entry.fetchedAt||entry.usedAt||0);
 const fresh=valid(entry)&&(!entry.placeId||(age>=0&&age<=30*86400000));
 if(entry.placeId&&(kind==='suggest'||!fresh)){
  const known=kind==='suggest'&&resolvedPlace?.placeId===entry.placeId?resolvedPlace:null;
  const resolved=known||await places.resolve(entry,entry.name);
  entry={...entry,...resolved,fetchedAt:Date.now()};
  if((kind==='home'||kind==='work'||kind==='favorites')&&entry.id)
   await book.save({...entry,slot:kind==='favorites'?'':kind});
 }
 if(!valid(entry))throw new Error('Gespeichertes Ziel hat keine gültige Position.');
 if(options?.saveOnly){pending=entry;return true}
 await nativeRequest('navigation.open',{
  lat:entry.lat,lng:entry.lng,title:entry.name,placeId:entry.placeId||'',address:entry.address||''
 });
 root.MeviWebNavParity?.close(); // Restore native map without restarting its route.
 return true;
}
// Stops change the native route in place; guidance continues when it was running.
async function addStop(place){
 if(!valid(place))return false;
 try{
  const reply=await nativeRequest('navigation.route.addStop',{lat:place.lat,lng:place.lng,
   title:String(place.name||'').slice(0,120),address:String(place.address||'').slice(0,200),
   placeId:place.placeId||''});
  takeRoute(reply.route);uiError='';return true;
 }catch(e){void refreshRoute();warn(e);return false}
}
async function removeStop(index){
 if(!Number.isInteger(index)||index<0||index>=route.stops.length)return false;
 try{
  takeRoute((await nativeRequest('navigation.route.removeStop',{index})).route);
  uiError='';return true;
 }catch(e){void refreshRoute();warn(e);return false}
}
// Stored places without coordinates (imported books) get them from Google.
async function resolveStop(place){
 if(valid(place))return place;
 if(!place?.placeId)return null;
 await connect();
 const resolved=await places.resolve(place,place.name);
 return valid(resolved)?{...place,...resolved}:null;
}
// navigation.open already shows the native route preview; starting guidance
// stays a deliberate tap on the native "Start" button.
async function startRoute(){return route.hasRoute}
async function saveSlot(slot){
 if(!['home','work'].includes(slot)||!pending)throw new Error('Schnellziel fehlt.');
 const item={...pending,id:pending.id||id(),slot};
 await book.save(item);pending=null;root.render?.();return true;
}
async function saveFavorite(){
 if(!pending)throw new Error('Favorit fehlt.');
 const item={...pending,id:pending.id||id(),slot:''};
 await book.save(item);pending=null;root.render?.();return true;
}
async function editSaved(kind,index,patch){
 const data=read();
 const original=kind==='favorites'?data.favorites[index]:data.slots[kind];
 if(!original)throw new Error('Ziel existiert nicht mehr.');
 shared.editSaved(data,kind,index,patch); // Same validation as Web, Android validates again.
 const nextSlot=patch?.slot??(kind==='favorites'?'':kind);
 const icon=String(patch.icon??shared.effectiveIcon(original,kind==='favorites'?'':kind));
 const next={...original,name:String(patch.name).trim(),note:String(patch.note||'').trim(),
  icon:icon===shared.defaultIcon(nextSlot)?'':icon,slot:nextSlot};
 await book.save(next);return true;
}
async function moveFavorite(index,delta){
 const item=read().favorites[index];
 if(!item)return false;
 await book.move(item.id,delta);return true;
}
async function removeEntry(kind,index){
 const data=read();
 const item=kind==='favorites'?data.favorites[index]:
  kind==='recent'?data.recent[index]:
  data.slots[kind];
 if(!item)return false;
 if(kind==='recent'){
  const key=item.placeId?'p:'+item.placeId:
   'c:'+Math.round(item.lat*1e5)+':'+Math.round(item.lng*1e5);
  await book.removeRecent(key);
 }else await book.remove(item.id);
 return true;
}
async function clearHistory(){await book.clearRecent();return true}
async function importPicker(){
 await nativeRequest('navigation.book.importPicker');
 return true;
}
async function exportPicker(){
 await nativeRequest('navigation.book.exportPicker');
 return true;
}
async function refreshBook(){
 if(!ready)return;
 try{await book.refresh();root.render?.()}catch(warn){}
}
function setOpen(value){
 searchOpen=!!value;
 nav.syncNativeLayout?.(true);
 if(!searchOpen)places.cancel();
 else void refreshRoute();
}
const methods={
 isReady:()=>ready,read,search,choose,saveSlot,saveFavorite,searchNearby,
 write:()=>{throw new Error('Android-Daten dürfen nur mit einzelnen nativen Aktionen geändert werden.')},
 details,savePlace,routeContext,addStop,removeStop,resolveStop,startRoute,
 editSaved,moveFavorite,removeEntry,clearHistory,importPicker,exportPicker,
 cancel:()=>places.cancel()
};
root.MeviSharedNavigationProvider=Object.freeze(methods);
root.MeviAndroidSharedNav=Object.freeze({
 connect,refreshBook,refreshRoute,setOpen,isOpen:()=>searchOpen,isOptedIn:()=>true,
 isReady:()=>ready,showError:warn
});
})(window);
