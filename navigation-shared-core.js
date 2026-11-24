/* Shared navigation UI contract. Platform-specific Google SDKs stay behind providers.
   Pure browser JavaScript: usable by Web/PWA and, when explicitly integrated, Android WebView. */
(function(root){
'use strict';
/** Common input validation for the Web and Android navigation providers. */
function validCoordinates(value){
 return !!value&&Number.isFinite(value.lat)&&Number.isFinite(value.lng)&&
  Math.abs(value.lat)<=90&&Math.abs(value.lng)<=180;
}
function validPlaceId(value){return typeof value==='string'&&/^[A-Za-z0-9_-]{1,300}$/.test(value)}
function escapeHtml(value){
 return String(value??'').replace(/[&<>"']/g,c=>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
/** Canonical native DestinationBook identity, shared by all Web providers.
 * Match Kotlin Math.round(lat*100000) and Math.round(lng*100000) exactly. */
function destinationKey(value){
 if(!value||typeof value!=='object')return '';
 if(validPlaceId(value.placeId))
  return 'p:'+value.placeId;
 const lat=value.lat,lng=value.lng;
 if(!validCoordinates(value))return '';
 return 'c:'+Math.round(lat*100000)+':'+Math.round(lng*100000);
}
function destination(value){
 if(!value||typeof value!=='object'||typeof value.name!=='string'||!value.name.trim())return null;
 const lat=value.lat,lng=value.lng;
 const coords=validCoordinates(value);
 const placeId=validPlaceId(value.placeId)?value.placeId:'';
 const hasExplicitCoords=(lat!=null||lng!=null);
 if(!coords&&(hasExplicitCoords||!placeId))return null;
 // Native Android may store a Google place ID before its coordinates are fetched.
 const result={name:value.name.trim().slice(0,120),address:String(value.address??'').slice(0,200)};
 if(coords){result.lat=lat;result.lng=lng}
 if(placeId)result.placeId=placeId;
 if(typeof value.id==='string'&&/^[A-Za-z0-9-]{1,64}$/.test(value.id))result.id=value.id;
 if(typeof value.icon==='string'&&ICONS.includes(value.icon))result.icon=value.icon;
 if(typeof value.note==='string')result.note=value.note.slice(0,200);
 for(const key of ['fetchedAt','usedAt','count']){
  if(Number.isFinite(value[key])&&value[key]>=0)result[key]=value[key];
 }
 return result;
}
function distinct(values,max){
 const seen=new Set(),out=[];
 for(const value of Array.isArray(values)?values:[]){
  const item=destination(value);if(!item)continue;
  const id=destinationKey(item);
  if(seen.has(id))continue;seen.add(id);out.push(item);
  if(out.length>=max)break;
 }
 return out;
}
function snapshot(input){
 const source=input&&typeof input==='object'?input:{},rawSlots=source.slots||{};
 return {
  favorites:distinct(source.favorites,200),recent:distinct(source.recent,30).filter(item=>Number.isFinite(item.lat)&&Number.isFinite(item.lng)),
  slots:{home:destination(rawSlots.home),work:destination(rawSlots.work)},
  suggestions:Array.isArray(source.suggestions)?source.suggestions:[],
  poiResults:Array.isArray(source.poiResults)?source.poiResults:[],
  poiLoading:source.poiLoading===true,poiActive:source.poiActive===true,
  poiError:String(source.poiError||''),
  origin:source.origin||null,
  query:String(source.query||''),error:String(source.error||'')
 };
}
function createProvider(methods){
 const required=['isReady','read','search','choose','saveSlot','saveFavorite','searchNearby','write'];
 if(!methods||required.some(key=>typeof methods[key]!=='function'))throw new TypeError('Navigation provider: missing method');
 // The UI communicates solely through this interface, not through any Google SDK.
 // Place details are optional for a browser provider; Android has no parallel dialog.
 const adapter=Object.fromEntries(required.map(key=>[key,(...args)=>methods[key](...args)]));
 adapter.details=typeof methods.details==='function'?(...args)=>methods.details(...args):async()=>null;
 adapter.startRoute=typeof methods.startRoute==='function'?(...args)=>methods.startRoute(...args):async()=>false;
 adapter.routeContext=typeof methods.routeContext==='function'?(...args)=>methods.routeContext(...args):
  ()=>({hasRoute:false,active:false,stops:[],maxStops:8});
 adapter.addStop=typeof methods.addStop==='function'?(...args)=>methods.addStop(...args):async()=>false;
 adapter.removeStop=typeof methods.removeStop==='function'?(...args)=>methods.removeStop(...args):async()=>false;
 adapter.resolveStop=typeof methods.resolveStop==='function'?(...args)=>methods.resolveStop(...args):async()=>null;
 for(const key of ['editSaved','moveFavorite','removeEntry','clearHistory','importPicker','exportPicker','cancel','savePlace','externalDetails','routeExternal']){
   if(typeof methods[key]==='function')adapter[key]=(...args)=>methods[key](...args);
  }
  return Object.freeze(adapter);
}
function createBrowserProvider(navigation){
 if(!navigation||typeof navigation.webData!=='function'||typeof navigation.webWrite!=='function')throw new TypeError('Browser navigation unavailable');
 return createProvider({
  isReady:()=>!!navigation.hasKey?.(),
  read:()=>snapshot(navigation.webData()),
  search:query=>navigation.changeQuery(query),
  choose:(kind,index,options)=>navigation.pick(kind,index,options),
  saveSlot:slot=>navigation.webSaveSelectedSlot?.(slot),
  saveFavorite:()=>navigation.saveFavorite?.(),
  searchNearby:(type,query,origin,options)=>navigation.webPoi?.(type,query,origin,options),
  details:(kind,index)=>navigation.webPlaceDetails?.(kind,index),
  startRoute:()=>root.startRoute?.()??false,
  routeContext:()=>navigation.routeContext?.()||{hasRoute:false,active:false,stops:[],maxStops:8},
  addStop:place=>navigation.addRouteStop?.(place),
  removeStop:index=>navigation.removeRouteStop?.(index),
  resolveStop:place=>navigation.webResolveStop?.(place),
  write:changes=>navigation.webWrite(changes)
 });
}
/* Address-book rules mirror DestinationBook.save()/move() from the native beta.
   Keep them pure so both UI implementations use identical transformations. */
const ICONS=Object.freeze(['star','home','work','heart','place','wrench','fuel','food','cart','parking']);
const SLOTS=Object.freeze(['','home','work']);
function defaultIcon(slot){return slot==='home'?'home':slot==='work'?'work':'star'}
function effectiveIcon(entry,slot){return ICONS.includes(entry?.icon)?entry.icon:defaultIcon(slot)}
function editSaved(source,kind,index,patch){
 const book=snapshot(source);
 if(!['favorites','home','work'].includes(kind))throw new Error('Dieses Ziel kann nicht bearbeitet werden.');
 const original=kind==='favorites'?book.favorites[index]:book.slots[kind];
 if(!original)throw new Error('Das Ziel ist nicht mehr vorhanden.');
 const nextSlot=patch?.slot??(kind==='favorites'?'':kind);
 const name=String(patch?.name??original.name).trim();
 const note=String(patch?.note??original.note??'').trim();
 const icon=String(patch?.icon??effectiveIcon(original,kind==='favorites'?'':kind));
 if(!SLOTS.includes(nextSlot))throw new Error('Ungültige Zielkategorie.');
 if(!ICONS.includes(icon))throw new Error('Ungültiges Zielsymbol.');
 if(!name||name.length>120||/[\x00-\x1f\x7f]/.test(name))throw new Error('Bitte einen gültigen Namen eingeben.');
 if(note.length>200||/[\x00-\x1f\x7f]/.test(note))throw new Error('Die Notiz darf höchstens 200 Zeichen enthalten.');
 const next={...original,name,note,icon:icon===defaultIcon(nextSlot)?'':icon};
 const slots={...book.slots},favorites=[...book.favorites];
 if(kind==='favorites')favorites.splice(index,1);else slots[kind]=null;
 if(nextSlot){
  slots[nextSlot]=next; // Native semantics: the previous slot occupant is replaced.
 }else{
  // Native semantics: an existing favourite for the same place is replaced.
  const key=destinationKey;
  const old=favorites.findIndex(x=>key(x)===key(next));
  if(old>=0)favorites.splice(old,1);
  favorites.splice(kind==='favorites'?Math.min(index,favorites.length):favorites.length,0,next);
 }
 return {slots,favorites};
}
function moveFavorite(source,index,delta){
 const favorites=[...snapshot(source).favorites],target=index+delta;
 if(!Number.isInteger(index)||![-1,1].includes(delta)||index<0||target<0||target>=favorites.length)return {favorites};
 [favorites[index],favorites[target]]=[favorites[target],favorites[index]];
 return {favorites};
}
function exportAddressBook(source){
 const data=snapshot(source),saved=[
  ...['home','work'].filter(slot=>data.slots[slot]).map(slot=>({...data.slots[slot],slot})),
  ...data.favorites.map(item=>({...item,slot:''}))
 ];
 return {version:2,
  saved:saved.map((item,index)=>({
   id:item.id||'web-'+(index+1),placeId:item.placeId||'',name:item.name,
   address:item.address,...(Number.isFinite(item.lat)&&Number.isFinite(item.lng)?{lat:item.lat,lng:item.lng}:{}),fetchedAt:item.fetchedAt||0,
   slot:item.slot,icon:item.icon||'',note:item.note||'',order:index
  })),
  recent:data.recent.map(item=>({
   placeId:item.placeId||'',name:item.name,address:item.address,lat:item.lat,lng:item.lng,usedAt:item.usedAt||Date.now(),count:item.count||1
  }))
 };
}
function distanceMeters(a,b){
 if(!a||!b)return Infinity;
 const rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLng=(b.lng-a.lng)*rad;
 const h=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2;
 return 12742000*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
/* One source for navigation geodesy. The Web camera uses these helpers
   rather than calculating its own independent great-circle math. */
function bearingBetween(a,b){
 if(!validCoordinates(a)||!validCoordinates(b)||distanceMeters(a,b)<1)return null;
 const rad=Math.PI/180,lat1=a.lat*rad,lat2=b.lat*rad,delta=(b.lng-a.lng)*rad;
 return (Math.atan2(Math.sin(delta)*Math.cos(lat2),
  Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(delta))/rad+360)%360;
}
function forwardPoint(point,heading,meters){
 if(!validCoordinates(point)||!Number.isFinite(heading)||!Number.isFinite(meters)||meters<0)return null;
 const rad=Math.PI/180,radius=6371000,phi=point.lat*rad,lambda=point.lng*rad;
 const theta=heading*rad,d=meters/radius;
 const lat=Math.asin(Math.sin(phi)*Math.cos(d)+Math.cos(phi)*Math.sin(d)*Math.cos(theta));
 const lng=lambda+Math.atan2(Math.sin(theta)*Math.sin(d)*Math.cos(phi),Math.cos(d)-Math.sin(phi)*Math.sin(lat));
 return {lat:lat/rad,lng:((lng/rad+540)%360)-180};
}
function importAddressBook(payload,current){
 if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Ungültiges Adressbuch.');
 const hasEntries=['saved','favorites','recent'].some(k=>Array.isArray(payload[k]));
 if(!hasEntries)throw new Error('Adressbuch enthält keine Ziellisten.');
 const saved=Array.isArray(payload.saved)?payload.saved:Array.isArray(payload.favorites)?payload.favorites:[];
 const recent=Array.isArray(payload.recent)?payload.recent:[];
 if(saved.length+recent.length>2000)throw new Error('Zu viele Ziele in der Importdatei.');
 const data=snapshot(current),slots={...data.slots},favorites=[...data.favorites],history=[...data.recent];
 let added=0,skipped=0;
 for(const item of saved){
  const clean=destination(item);
  if(!clean){skipped++;continue}
  if(item.slot==='home'||item.slot==='work')slots[item.slot]=clean;
  else favorites.push(clean);
  added++;
 }
 for(const item of recent){const clean=destination(item);if(clean)history.push(clean);else skipped++}
 return {changes:{slots,favorites:distinct(favorites,200),recent:distinct(history,30)},added,skipped};
}
/* Device-local diagnostic breadcrumbs. No API keys, addresses, coordinates,
   speech content or uploads. The developer can distinguish Gemini, Google
   Places, route computation and a user's selection after a failure. */
const diagnosticStages=new Set(['gemini','places','route','selection']);
const diagnosticStates=new Set(['start','ok','error','info']);
const diagnosticLog=[];
let diagnosticSequence=0;
function recordNavDiagnostic(stage,state,message=''){
 if(!diagnosticStages.has(stage)||!diagnosticStates.has(state))return false;
 const event={stage,state,message:String(message||'').slice(0,140),
  sequence:++diagnosticSequence};
 diagnosticLog.push(event);
 if(diagnosticLog.length>30)diagnosticLog.shift();
 return true;
}
root.MeviNavDiagnostics=Object.freeze({
 record:recordNavDiagnostic,
 recent:()=>diagnosticLog.map(x=>({...x})),
 text:()=>diagnosticLog.map(x=>'#'+x.sequence+' · '+x.stage+' · '+x.state+
  (x.message?' · '+x.message:'')).join('\n'),
 clear:()=>{diagnosticLog.length=0}
});
root.MeviNavigationShared=Object.freeze({
 destination,destinationKey,validCoordinates,validPlaceId,escapeHtml,distanceMeters,bearingBetween,forwardPoint,distinct,snapshot,createProvider,createBrowserProvider,ICONS,SLOTS,defaultIcon,effectiveIcon,editSaved,moveFavorite,exportAddressBook,importAddressBook
});
})(window);
