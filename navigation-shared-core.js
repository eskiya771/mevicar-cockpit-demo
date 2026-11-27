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
  addStop:(place,options)=>navigation.addRouteStop?.(place,options),
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
// Route-level traffic snapshot; no guessed live remaining delay.
const TRAFFIC_MAX_AGE=300000;
function trafficObservationFresh(at,now=Date.now()){
 return Number.isFinite(at)&&at>=0&&Number.isFinite(now)&&at<=now&&now-at<=TRAFFIC_MAX_AGE;
}
// Match Google's ordered speed-path geometry to the same route polyline.
// Reject partial or inconsistent geometry instead of inventing an offset.
function trafficPoint(p){
 const v=p?.toJSON?.()||p;const q={lat:typeof v?.lat==='function'?v.lat():v?.lat,lng:typeof v?.lng==='function'?v.lng():v?.lng};return validCoordinates(q)?q:null;
}
function trafficSections(route){
 const point=trafficPoint;
 const path=Array.isArray(route?.path)?route.path.map(point):[];
 const groups=route?.speedPaths;
 if(path.length<2||path.some(p=>!p)||!Array.isArray(groups)||!groups.length)return null;
 const distances=[0];
 for(let i=1;i<path.length;i++)distances.push(distances[i-1]+distanceMeters(path[i-1],path[i]));
 const total=distances.at(-1);
 if(!(total>0))return null;
 let cursor=0;const sections=[];
 for(const group of groups){
  const speed=group?.speed,points=Array.isArray(group?.path)?group.path.map(point):[];
  if(!['NORMAL','SLOW','TRAFFIC_JAM'].includes(speed)||points.length<2||points.some(p=>!p)||cursor+points.length>path.length)return null;
  for(let i=0;i<points.length;i++)if(distanceMeters(points[i],path[cursor+i])>2)return null;
  const start=distances[cursor];cursor+=points.length-1;const end=distances[cursor];
  if(end<=start)continue;
  const previous=sections.at(-1);
  if(previous?.speed===speed)previous.end=end;else sections.push({speed,start,end});
 }
 return cursor===path.length-1?{total,sections}:null;
}
// Refresh only when the new Google standard route is a verified suffix of
// the existing path. No fuzzy route choice, no new routing engine. The first
// point may lie within the first retained segment; every subsequent vertex
// must match the original. Earlier unobserved distance stays unknown.
function trafficRefreshGeometry(previous,candidate,originAlong){
 const path=previous?.path?.map?.(trafficPoint),fresh=candidate?.path?.map?.(trafficPoint);
 if(!Array.isArray(path)||!Array.isArray(fresh)||path.length<2||fresh.length<2||
    path.some(p=>!p)||fresh.some(p=>!p)||fresh.length>path.length||!Number.isFinite(originAlong))return null;
 const geometry=trafficSections(candidate);if(!geometry)return null;
 const index=path.length-fresh.length,distances=[0];
 for(let i=1;i<path.length;i++)distances.push(distances[i-1]+distanceMeters(path[i-1],path[i]));
 const total=distances.at(-1);
 for(let i=1;i<fresh.length;i++)if(distanceMeters(fresh[i],path[index+i])>.25)return null;
 const a=path[index],b=path[index+1],start=fresh[0],segment=distanceMeters(a,b),
  first=distanceMeters(a,start),remaining=distanceMeters(start,b);
 if(!(segment>0)||Math.abs(first+remaining-segment)>.25||first>segment||remaining>segment)return null;
 // Reject points that are close in length but displaced sideways.
 const ratio=first/segment,projected={lat:a.lat+(b.lat-a.lat)*ratio,lng:a.lng+(b.lng-a.lng)*ratio};
 if(distanceMeters(start,projected)>1)return null;
 const offset=distances[index]+first;
 if(Math.abs(offset-originAlong)>50||Math.abs(total-offset-geometry.total)>2||total<=offset)return null;
 const scale=(total-offset)/geometry.total;
 return {total,sections:geometry.sections.map(s=>({speed:s.speed,start:offset+s.start*scale,end:Math.min(total,offset+s.end*scale)}))};
}
// Android SDK provides metre offsets relative to a RouteSegment polyline,
// not Web speed paths. Convert only confirmed stretches into the shared geometry.
// The caller must supply the length of that same polyline and a current-position
// anchored segment. Never infer normal traffic from missing or UNKNOWN intervals.
function trafficSectionsFromNativeLeg(leg){
 const total=leg?.lengthMeters,stretches=leg?.stretches;
 if(leg?.status!=='OK'||!Number.isFinite(total)||total<=0||
    !Array.isArray(stretches)||stretches.length>10000)return null;
 const sections=[];let cursor=0;
 for(const stretch of stretches){
  const start=stretch?.offsetMeters,length=stretch?.lengthMeters,style=stretch?.style;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||start<cursor||length<=0||
     !['SLOWER_TRAFFIC','TRAFFIC_JAM','UNKNOWN'].includes(style))return null;
  const end=start+length;
  if(!Number.isSafeInteger(end)||end>total)return null;
  cursor=end;
  if(style==='UNKNOWN')continue;
  const speed=style==='SLOWER_TRAFFIC'?'SLOW':'TRAFFIC_JAM';
  const previous=sections.at(-1);
  if(previous?.speed===speed&&previous.end===start)previous.end=end;
  else sections.push({start,end,speed});
 }
 return {total,sections};
}
// Native legs are already anchored at the remaining journey's current position.
// A missing/invalid traffic report leaves its own distance gray, not the entire
// route compressed and not an inferred free-flow section.
function trafficGeometryFromNativeRoute(input,now=Date.now()){
 const legs=input?.legs;
 if(input?.scope!=='remaining-route'||!Array.isArray(legs)||!legs.length||legs.length>9)return null;
 const fresh=trafficObservationFresh(input.observedAt,now);
 const sections=[],markers=[],legStates=[];let total=0;
 for(let i=0;i<legs.length;i++){
  const leg=legs[i],length=leg?.lengthMeters;
  if(!Number.isSafeInteger(length)||length<=0||total+length>2147483647)return null;
  const geometry=fresh?trafficSectionsFromNativeLeg(leg):null;
  legStates.push(!fresh?'stale':leg.status!=='OK'?'unavailable':!geometry?'invalid':geometry.sections.length?'known':'unknown');
  for(const part of geometry?.sections||[]){
   const start=total+part.start,end=total+part.end,previous=sections.at(-1);
   if(previous?.speed===part.speed&&previous.end===start)previous.end=end;
   else sections.push({speed:part.speed,start,end});
  }
  total+=length;
  if(i<legs.length-1){
   if(typeof leg.stop!=='string'||!leg.stop.trim())return null;
   markers.push({kind:'stop',meters:total,label:leg.stop});
  }
 }
 if(Array.isArray(input.cameras))for(const camera of input.cameras.slice(0,80)){
  if(Number.isFinite(camera?.meters)&&camera.meters>=0&&camera.meters<=total)
   markers.push({kind:'camera',meters:camera.meters,label:camera.label});
 }
 const rail=routeRail({progress:0,destination:input.destination,
  sections:sections.map(x=>({...x,start:x.start/total,end:x.end/total})),
  markers:markers.map(x=>({...x,position:x.meters/total}))});
 return {total,sections,rail,legStates};
}
function trafficAhead(geometry,progressFraction){
 if(!geometry||!Number.isFinite(progressFraction)||progressFraction<0||progressFraction>1)return null;
 const along=progressFraction*geometry.total;
 const remaining=geometry.sections.filter(s=>s.end>along);
 const jam=remaining.find(s=>s.speed==='TRAFFIC_JAM');
 // A few NORMAL intervals are not evidence that the entire remaining
 // journey is clear. Require continuous NORMAL coverage all the way to goal.
 let cursor=along;
 for(const part of remaining){
  if(part.speed!=='NORMAL'||part.start>cursor+1e-6)break;
  cursor=Math.max(cursor,part.end);
 }
 const complete=remaining.length>0&&cursor>=geometry.total-1e-6;
 const status=jam?'heavy':remaining.some(s=>s.speed==='SLOW')?'slow':complete?'normal':'unknown';
 const first=remaining.find(s=>s.speed==='SLOW'||s.speed==='TRAFFIC_JAM');
 const disruption=first?{nextDisruptionMeters:Math.round(Math.max(0,first.start-along)),
  disruptionLengthMeters:Math.round(first.end-Math.max(first.start,along)),disruptionSpeed:first.speed,inDisruption:along>=first.start}:{};
 if(!jam)return {status,nextJamMeters:null,jamLengthMeters:null,inJam:false,...disruption};
 return {status,nextJamMeters:Math.round(Math.max(0,jam.start-along)),jamLengthMeters:Math.round(jam.end-Math.max(jam.start,along)),jamStartMeters:Math.round(jam.start),inJam:along>=jam.start,...disruption};
}
// A normalized remaining-route rail, shared by every renderer. Unknown
// traffic is neutral (never green); only validated provider positions appear.
function routeRail(input){
 const s=input||{},fraction=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;
 if(!fraction(s.progress)||s.progress>=1)return null;
 const start=s.progress,span=1-start;
 const sections=[];
 if(Array.isArray(s.sections))for(const item of s.sections){
  if(!fraction(item?.start)||!fraction(item?.end)||item.end<=item.start||item.end<=start||
     !['NORMAL','SLOW','TRAFFIC_JAM'].includes(item.speed))continue;
  sections.push({start:(Math.max(start,item.start)-start)/span,end:(item.end-start)/span,speed:item.speed});
 }
 const markers=[];
 if(Array.isArray(s.markers))for(const item of s.markers){
  if(!fraction(item?.position)||item.position<start||!['stop','camera'].includes(item.kind))continue;
  markers.push({kind:item.kind,position:(item.position-start)/span,label:String(item.label||'').slice(0,120)});
 }
 markers.sort((a,b)=>a.position-b.position);
 return {sections,markers,destination:String(s.destination||'Ziel').slice(0,120)};
}
// Compare only candidates returned for the same origin, destination and request.
function trafficRouteChoices(routes){
 const valid=r=>Number.isFinite(r?.durationMillis)&&r.durationMillis>0&&
  Number.isFinite(r.distanceMeters)&&r.distanceMeters>0&&Array.isArray(r.path)&&r.path.length>1;
 if(!Array.isArray(routes)||!valid(routes[0]))return null;
 const standard=routes[0];
 const alternative=routes.slice(1).filter(valid).sort((a,b)=>a.durationMillis-b.durationMillis)[0];
 const saving=alternative?Math.floor((standard.durationMillis-alternative.durationMillis)/1000):0;
 return {standard,alternative:saving>=120?alternative:null,savingSeconds:saving>=120?saving:0};
}
function trafficSnapshot(input,now=Date.now()){
 const s=input||{},num=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 const observedAt=s.observedAt,revision=s.routeRevision;
 const unknown={routeRevision:revision??null,observedAt:num(observedAt)?observedAt:null,status:'unknown',delaySeconds:null,scope:null,nextJamMeters:null,jamLengthMeters:null,jamStartMeters:null,inJam:false,nextDisruptionMeters:null,disruptionLengthMeters:null,disruptionSpeed:null,inDisruption:false};
 if(!trafficObservationFresh(observedAt,now))return unknown;
 const status=['normal','slow','heavy'].includes(s.status)?s.status:'unknown';
 const delay=num(s.delaySeconds)&&s.scope==='calculated-route'?Math.ceil(s.delaySeconds):null;
 const disruption=['SLOW','TRAFFIC_JAM'].includes(s.disruptionSpeed)&&num(s.nextDisruptionMeters)&&num(s.disruptionLengthMeters);
 return {...unknown,status,delaySeconds:delay,scope:delay!==null?'calculated-route':null,
  nextDisruptionMeters:disruption?Math.round(s.nextDisruptionMeters):null,
  disruptionLengthMeters:disruption?Math.round(s.disruptionLengthMeters):null,
  disruptionSpeed:disruption?s.disruptionSpeed:null,
  inDisruption:!!disruption&&s.inDisruption===true&&s.nextDisruptionMeters===0,
  nextJamMeters:num(s.nextJamMeters)?Math.round(s.nextJamMeters):null,
  jamLengthMeters:num(s.jamLengthMeters)?Math.round(s.jamLengthMeters):null,
  jamStartMeters:num(s.jamStartMeters)?Math.round(s.jamStartMeters):null,
  inJam:s.inJam===true&&s.nextJamMeters===0&&num(s.jamLengthMeters)};
}
// Web fallback only: warn about a confirmed upcoming jam, never stale data,
 // free-flow inference or an already passed interval. Route revision + interval
 // are a stable identity; a trip-wide cooldown also covers route recalculations.
function trafficWarning(snapshot,previous,now=Date.now()){
 const s=trafficSnapshot(snapshot,now);
 if(s.inJam||s.routeRevision==null||s.jamStartMeters==null||
    !Number.isFinite(s.nextJamMeters)||s.nextJamMeters<150||s.nextJamMeters>1500)return null;
 const key=String(s.routeRevision)+':'+s.jamStartMeters;
 if(previous?.keys?.has(key)||Number.isFinite(previous?.at)&&now-previous.at<180000)return null;
 return {key,meters:s.nextJamMeters};
}
function trafficFromRoute(route,routeRevision,observedAt){
 const speeds=Array.isArray(route?.speedPaths)?route.speedPaths.map(x=>x?.speed):[];
 const status=speeds.includes('TRAFFIC_JAM')?'heavy':speeds.includes('SLOW')?'slow':
  speeds.length&&speeds.every(x=>x==='NORMAL')?'normal':'unknown';
 const duration=route?.durationMillis,baseline=route?.staticDurationMillis;
 const valid=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
 return trafficSnapshot({routeRevision,observedAt,status,scope:'calculated-route',
  delaySeconds:valid(duration)&&valid(baseline)?Math.max(0,(duration-baseline)/1000):null},observedAt);
}
root.MeviNavigationShared=Object.freeze({
 trafficObservationFresh,trafficSnapshot,trafficFromRoute,trafficSections,trafficRefreshGeometry,trafficSectionsFromNativeLeg,trafficGeometryFromNativeRoute,trafficAhead,routeRail,trafficRouteChoices,trafficWarning,destination,destinationKey,validCoordinates,validPlaceId,escapeHtml,distanceMeters,bearingBetween,forwardPoint,distinct,snapshot,createProvider,createBrowserProvider,ICONS,SLOTS,defaultIcon,effectiveIcon,editSaved,moveFavorite,exportAddressBook,importAddressBook
});
})(window);
