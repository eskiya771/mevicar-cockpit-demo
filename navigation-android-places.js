/* Google Places (New) Android SDK adapter for the shared MeviCar Web UI.
   Unlike the browser provider this uses no JS Google key or network fetch.
   The native bridge owns the SDK, origin validation and cancellation. */
(function(root){
'use strict';
if(!root.MeviNativeBridge?.postMessage)return;
const rpc=(action,fields)=>root.MeviGoogleNav?.nativeRequest?.(action,fields);
let connected=false,connecting=null,serial=0,items=[],error='',query='',mode='suggest',selected=null;
const clone=x=>JSON.parse(JSON.stringify(x));
const plain=(s,max)=>String(s??'').trim().slice(0,max);
const coordinate=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
const idOK=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,300}$/.test(s);
const originField=origin=>coordinate(origin)?{origin:{lat:origin.lat,lng:origin.lng}}:{};
function clean(raw){
 if(!raw||!idOK(raw.placeId)||typeof raw.name!=='string'||!raw.name.trim())return null;
 const out={placeId:raw.placeId,name:plain(raw.name,120),address:plain(raw.address,200)};
 if(coordinate(raw)){out.lat=raw.lat;out.lng=raw.lng}
 if(Number.isFinite(raw.distanceMeters)&&raw.distanceMeters>=0)out.distanceMeters=raw.distanceMeters;
 if(typeof raw.openNow==='boolean')out.openNow=raw.openNow;
 if(Array.isArray(raw.types))out.types=raw.types.filter(x=>typeof x==='string').slice(0,12);
 // Detail-only fields of navigation.places.resolve; absent in search rows.
 if(Number.isFinite(raw.rating)&&raw.rating>=1&&raw.rating<=5)out.rating=raw.rating;
 if(Number.isInteger(raw.ratingCount)&&raw.ratingCount>0)out.ratingCount=raw.ratingCount;
 if(typeof raw.phone==='string'&&/^[+0-9 ()/-]{3,32}$/.test(raw.phone.trim()))out.phone=raw.phone.trim();
 if(typeof raw.openingNote==='string'&&raw.openingNote.trim())out.openingNote=plain(raw.openingNote,80);
 return out;
}
function snapshot(){
 return {suggestions:clone(items),query,error,mode,selected:selected?clone(selected):null};
}
async function connect(){
 if(connected)return true;
 if(connecting)return connecting;
 connecting=(async()=>{
  if(!root.MeviGoogleNav?.nativeRequest)throw new Error('Native Navigation ist nicht bereit.');
  const caps=await rpc('capabilities');
  if(!caps?.capabilities?.navigationPlacesBridge)
   throw new Error('Native Places SDK in dieser APK noch nicht verfügbar.');
  connected=true;return true;
 })();
 try{return await connecting}finally{connecting=null}
}
async function lookup(action,fields,shownQuery,selectedMode){
 const current=++serial;
 query=shownQuery;mode=selectedMode;items=[];error='';
 try{
  await connect();
  const response=await rpc(action,fields);
  if(current!==serial)return snapshot();
  if(response?.ok===false)throw Error(response.error||'Google Places konnte nicht suchen.');
  items=(Array.isArray(response?.items)?response.items:[]).map(clean).filter(Boolean).slice(0,20);
  if(!items.length)error='Keine passenden Orte gefunden.';
 }catch(e){
  if(current!==serial)return snapshot();
  items=[];error=plain(e?.message||e,200);
 }
 return snapshot();
}
async function search(text,origin){
 const q=plain(text,200);
 if(q.length<2){serial++;query=q;items=[];error='';mode='suggest';return snapshot()}
 return lookup('navigation.places.suggest',{query:q,...originField(origin)},q,'suggest');
}
const CATEGORY=Object.freeze({
 fuel:'fuel',charge:'charging',charging:'charging',
 parking:'parking',food:'food',cafe:'cafe',
 cart:'shopping',shopping:'shopping',rest:'rest',
 wrench:'workshop',workshop:'workshop'
});
async function searchNearby(type,text,origin,options){
 const category=CATEGORY[type]||'text';
 const q=plain(text,200);
 return lookup('navigation.places.search',
  {category,query:q,...originField(origin),
   sort:options?.sort==='relevance'?'relevance':'distance',
   ...(options?.openNow===true?{openNow:true}:{}),
   ...(options?.alongRoute===true?{alongRoute:true}:{})},q,'poi');
}
async function resolve(placeOrId,name,origin){
 // A dismissed overlay or a newer search must invalidate pending place details.
 // Never hand a late response to Android navigation after the user cancelled.
 const requestSerial=serial;
 await connect();
 if(requestSerial!==serial)throw Error('Zielauswahl wurde abgebrochen.');
 const placeId=typeof placeOrId==='string'?placeOrId:placeOrId?.placeId;
 if(!idOK(placeId))throw Error('Ungültige Google-Place-ID.');
 const response=await rpc('navigation.places.resolve',
  {placeId,name:plain(name||(typeof placeOrId==='object'?placeOrId.name:''),120),...originField(origin)});
 if(requestSerial!==serial)throw Error('Zielauswahl wurde abgebrochen.');
 if(response?.ok===false)throw Error(plain(response.error||'Ort konnte nicht geladen werden.',200));
 const resolved=clean(response?.place);
 if(!resolved||!coordinate(resolved))throw Error('Google Places hat keine gültige Position geliefert.');
 selected=resolved;
 return clone(resolved);
}
function cancel(){
 serial++;items=[];error='';query='';
 // Cancel the active native SDK request as well, not only its visual result.
 if(connected)void Promise.resolve(rpc('navigation.places.cancel')).catch(()=>{});
}
root.MeviAndroidPlaces=Object.freeze({
 connect,search,searchNearby,resolve,cancel,snapshot,isReady:()=>connected
});
})(window);
