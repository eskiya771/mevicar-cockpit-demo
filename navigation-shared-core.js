/* Shared navigation UI contract. Platform-specific Google SDKs stay behind providers.
   Pure browser JavaScript: usable by Web/PWA and, when explicitly integrated, Android WebView. */
(function(root){
'use strict';
function destination(value){
 if(!value||typeof value!=='object'||typeof value.name!=='string'||!value.name.trim())return null;
 const lat=value.lat,lng=value.lng;
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return null;
 const result={name:value.name.trim().slice(0,120),address:String(value.address??'').slice(0,200),lat,lng};
 if(typeof value.placeId==='string'&&value.placeId)result.placeId=value.placeId.slice(0,250);
 return result;
}
function distinct(values,max){
 const seen=new Set(),out=[];
 for(const value of Array.isArray(values)?values:[]){
  const item=destination(value);if(!item)continue;
  const id=item.lat.toFixed(5)+','+item.lng.toFixed(5);
  if(seen.has(id))continue;seen.add(id);out.push(item);
  if(out.length>=max)break;
 }
 return out;
}
function snapshot(input){
 const source=input&&typeof input==='object'?input:{},rawSlots=source.slots||{};
 return {
  favorites:distinct(source.favorites,100),recent:distinct(source.recent,20),
  slots:{home:destination(rawSlots.home),work:destination(rawSlots.work)},
  suggestions:Array.isArray(source.suggestions)?source.suggestions:[],
  origin:source.origin||null,
  query:String(source.query||''),error:String(source.error||'')
 };
}
function createProvider(methods){
 const required=['isReady','read','search','choose','saveSlot','saveFavorite','searchNearby','write'];
 if(!methods||required.some(key=>typeof methods[key]!=='function'))throw new TypeError('Navigation provider: missing method');
 // The UI communicates solely through this interface, not through any Google SDK.
 return Object.freeze(Object.fromEntries(required.map(key=>[key,(...args)=>methods[key](...args)])));
}
function createBrowserProvider(navigation){
 if(!navigation||typeof navigation.webData!=='function'||typeof navigation.webWrite!=='function')throw new TypeError('Browser navigation unavailable');
 return createProvider({
  isReady:()=>!!navigation.hasKey?.(),
  read:()=>snapshot(navigation.webData()),
  search:query=>navigation.changeQuery(query),
  choose:(kind,index)=>navigation.pick(kind,index),
  saveSlot:slot=>navigation.webSaveSelectedSlot?.(slot),
  saveFavorite:()=>navigation.saveFavorite?.(),
  searchNearby:(type,query,origin)=>navigation.webPoi?.(type,query,origin),
  write:changes=>navigation.webWrite(changes)
 });
}
function exportAddressBook(source){
 const data=snapshot(source),saved=[
  ...['home','work'].filter(slot=>data.slots[slot]).map(slot=>({...data.slots[slot],slot})),
  ...data.favorites.map(item=>({...item,slot:''}))
 ];
 return {version:2,
  saved:saved.map((item,index)=>({
   id:'web-'+(index+1),placeId:item.placeId||'',name:item.name,
   address:item.address,lat:item.lat,lng:item.lng,fetchedAt:0,
   slot:item.slot,icon:'',note:'',order:index
  })),
  recent:data.recent.map(item=>({
   placeId:item.placeId||'',name:item.name,address:item.address,lat:item.lat,lng:item.lng,usedAt:Date.now(),count:1
  }))
 };
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
 return {changes:{slots,favorites:distinct(favorites,100),recent:distinct(history,20)},added,skipped};
}
root.MeviNavigationShared=Object.freeze({
 destination,distinct,snapshot,createProvider,createBrowserProvider,exportAddressBook,importAddressBook
});
})(window);
