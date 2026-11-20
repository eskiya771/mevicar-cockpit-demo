/* Personal Gemini API key, never bundled or sent to a MeviCar server.
   Android: existing trusted first-party NativeBridge/Keystore only.
   Web/PWA: AES-GCM encrypted at rest with a non-extractable device key that
   the browser keeps in IndexedDB. No password, usable again after a restart.
   This is weaker than the Android Keystore: scripts of this origin and the
   developer tools can use the key, and it appears in direct API requests. */
(function(root){
'use strict';
const VAULT='mevicar-next-gemini-device-key-v2';
const LEGACY_VAULT='mevicar-next-gemini-encrypted-key-v1';
const DB='mevicar-next-device-keys',STORE='keys',KEY_ID='gemini-v1';
let unlocked=null,nativeConfigured=null,loading=null;
let nativeCounter=0;
const pending=new Map();
const native=()=>!!root.MeviNativeBridge?.postMessage;
function validKey(value){
 const s=String(value||'').trim();
 if(!/^[A-Za-z0-9._-]{20,256}$/.test(s))throw Error('Ungültiges Gemini-API-Key-Format.');
 return s;
}
function cryptoApi(){
 const c=root.crypto;
 if(!c?.subtle||!c.getRandomValues||!root.TextEncoder||!root.TextDecoder||!root.indexedDB)
  throw Error('Verschlüsselte Speicherung erfordert HTTPS, Web Crypto und IndexedDB.');
 return c;
}
function encode(data){
 let text='';for(const b of data)text+=String.fromCharCode(b);
 return root.btoa(text);
}
function decode(text){
 if(typeof text!=='string'||text.length>2048)throw Error('Ungültiger gespeicherter Schlüssel.');
 return Uint8Array.from(root.atob(text),c=>c.charCodeAt(0));
}
function deviceStore(mode,work){
 return new Promise((resolve,reject)=>{
  const fail=()=>reject(Error('Gerätespeicher des Browsers ist nicht verfügbar.'));
  let open;try{open=root.indexedDB.open(DB,1)}catch{return fail()}
  open.onupgradeneeded=()=>open.result.createObjectStore(STORE);
  open.onerror=fail;
  open.onsuccess=()=>{
   const db=open.result;
   try{
    const tx=db.transaction(STORE,mode),request=work(tx.objectStore(STORE));
    tx.oncomplete=()=>{db.close();resolve(request.result)};
    tx.onerror=tx.onabort=()=>{db.close();fail()};
   }catch{db.close();fail()}
  };
 });
}
function nativeRequest(action,name,value){
 if(!native())return Promise.reject(Error('Kein Android-Keystore verfügbar. Bitte APK aktualisieren.'));
 return new Promise((resolve,reject)=>{
  const id='gemini-secret-'+(++nativeCounter);
  const timeout=setTimeout(()=>{pending.delete(id);reject(Error('Keine Antwort der Android-App.'))},action==='voice.listen'?90000:action==='gemini.navigation'?35000:8000);
  pending.set(id,{resolve,reject,timeout});
  try{root.MeviNativeBridge.postMessage(JSON.stringify({id,action,name,value}))}
  catch{clearTimeout(timeout);pending.delete(id);reject(Error('Android-Schnittstelle nicht erreichbar.'))}
 });
}
function receive(event){
 let msg;try{msg=JSON.parse(event.data)}catch{return}
 const item=pending.get(msg.id);if(!item)return;
 pending.delete(msg.id);clearTimeout(item.timeout);
 if(msg.ok)item.resolve(msg);
 else item.reject(Error(msg.error||'Android-Aufruf fehlgeschlagen.'));
}
if(native()){
 const previous=root.MeviNativeBridge.onmessage;
 root.MeviNativeBridge.onmessage=event=>{
  if(typeof previous==='function'){try{previous(event)}catch{}}
  receive(event);
 };
}
async function save(value){
 const key=validKey(value);
 if(native()){
  await nativeRequest('settings.set','geminiKey',key);
  nativeConfigured=true;unlocked=null;
  return 'android-keystore';
 }
 const c=cryptoApi();
 const deviceKey=await c.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 await deviceStore('readwrite',store=>store.put(deviceKey,KEY_ID));
 const iv=c.getRandomValues(new Uint8Array(12));
 const cipher=await c.subtle.encrypt({name:'AES-GCM',iv},deviceKey,new root.TextEncoder().encode(key));
 const payload=JSON.stringify({v:2,iv:encode(iv),data:encode(new Uint8Array(cipher))});
 root.localStorage.setItem(VAULT,payload);
 if(root.localStorage.getItem(VAULT)!==payload)throw Error('Schlüssel konnte nicht gespeichert werden.');
 root.localStorage.removeItem(LEGACY_VAULT);
 unlocked=key;
 return 'browser-device';
}
function stored(){
 if(native())return nativeConfigured===true;
 try{return !!root.localStorage.getItem(VAULT)}catch{return false}
}
function isUnlocked(){return native()?nativeConfigured===true:!!unlocked}
/* Browser: decrypt the saved key once per start, without any user input. */
function load(){
 if(unlocked||!stored())return Promise.resolve(!!unlocked);
 if(!loading)loading=(async()=>{
  try{
   const c=cryptoApi(),v=JSON.parse(root.localStorage.getItem(VAULT));
   if(v.v!==2)throw Error('version');
   const iv=decode(v.iv),data=decode(v.data);
   if(iv.length!==12||data.length<17||data.length>1024)throw Error('format');
   const deviceKey=await deviceStore('readonly',store=>store.get(KEY_ID));
   if(!deviceKey)throw Error('device key');
   const plain=await c.subtle.decrypt({name:'AES-GCM',iv},deviceKey,data);
   unlocked=validKey(new root.TextDecoder().decode(plain));
  }catch{unlocked=null}
  finally{loading=null}
  return !!unlocked;
 })();
 return loading;
}
async function refresh(){
 if(!native()){await load();return stored()}
 const info=await nativeRequest('settings.status','',null);
 nativeConfigured=info?.configured?.geminiKey===true;
 return nativeConfigured;
}
async function remove(){
 if(native()){
  await nativeRequest('settings.clear','geminiKey');
  nativeConfigured=false;
 }else{
  root.localStorage.removeItem(VAULT);root.localStorage.removeItem(LEGACY_VAULT);
  try{await deviceStore('readwrite',store=>store.delete(KEY_ID))}catch{}
 }
 unlocked=null;
}
const SYSTEM=[
 'Du bist ein deutschsprachiger Navi-Sprachassistent von MeviCar Next.',
 'Ermittle nur Ziel, Zwischenstopp, POI oder eine kurze Klärungsfrage.',
 'Gib JSON mit intent, query, poiType, reply zurück.',
 'intent: destination, stop, poi, clarify. Bei clarify ist query leer.',
 'poiType ist leer oder fuel, charge, parking, food, cafe, cart, rest, wrench.',
 'Erfinde nie echte Adressen, Ortskoordinaten, Fahrzeiten oder Routen.',
 'MeviCar zeigt echte Google-Places-Treffer erst nach Bestätigung.',
 'Bei hasRoute=false darf kein stop-Intent erzeugt werden.'
].join('\n');
const model='gemini-3.8-flash';
async function requestNative(text,context){
 const response=await nativeRequest('gemini.navigation','',JSON.stringify({
  text:String(text||'').slice(0,400),
  hasRoute:!!context.hasRoute,
  clarification:context.clarification||null
 }));
 return response.result;
}
/* Android WebView has no working Web Speech API: the APK dictates natively. */
async function dictate(){
 const response=await nativeRequest('voice.listen','',null);
 return String(response.transcript||'').trim().slice(0,400);
}
async function generate(text,context={},signal){
 const phrase=String(text||'').trim().slice(0,400);
 if(!phrase)throw Error('Bitte einen Sprachwunsch eingeben.');
 if(native())return requestNative(phrase,context);
 if(!unlocked&&!await load())throw Error(stored()?
  'Der gespeicherte Gemini-Key ist in diesem Browser nicht mehr lesbar. Bitte unter Settings → Zugänge neu speichern.':
  'Bitte den Gemini-Key unter Settings → Zugänge speichern.');
 const payload={
  systemInstruction:{parts:[{text:SYSTEM}]},
  contents:[{role:'user',parts:[{text:JSON.stringify({
   text:phrase,hasRoute:!!context.hasRoute,
   clarification:context.clarification||null
  })}]}],
  generationConfig:{responseMimeType:'application/json',temperature:0.2,
   responseSchema:{type:'OBJECT',properties:{
    intent:{type:'STRING',enum:['destination','stop','poi','clarify']},
    query:{type:'STRING'},
    poiType:{type:'STRING',enum:['','fuel','charge','parking','food','cafe','cart','rest','wrench']},
    reply:{type:'STRING'}
   },required:['intent','query','poiType','reply']}}
 };
 // This is a personal BYOK preview. The key is not stored in plaintext on
 // disk, but it appears in the browser request header while in use.
 let response;
 try{
  response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{
   method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':unlocked},
   credentials:'omit',cache:'no-store',signal,body:JSON.stringify(payload)
  });
 }catch(e){
  if(e?.name==='AbortError')throw e;
  throw Error('Direkter Gemini-Aufruf im Browser fehlgeschlagen (Netzwerk oder CORS).');
 }
 if(!response.ok){
  const code=response.status;
  // Google decides whether a key is valid; only its answer counts.
  let detail='';try{detail=JSON.stringify((await response.json())?.error||'').slice(0,2000)}catch{}
  if(/API_KEY_INVALID|API key not valid|API key expired/i.test(detail)||code===401)
   throw Error('Google lehnt den Gemini-API-Key als ungültig ab. Bitte den Schlüssel prüfen.');
  if(code===403)throw Error('Gemini-API-Key hat keine Berechtigung für die Gemini API (HTTP 403).');
  if(code===429)throw Error('Gemini-Kontingent aufgebraucht oder Anfragelimit erreicht.');
  if(code===404)throw Error('Gemini-Modell '+model+' ist für deinen API-Key nicht verfügbar.');
  if(code===400)throw Error('Gemini hat die Anfrage abgelehnt (HTTP 400).');
  throw Error('Gemini antwortet nicht (HTTP '+code+').');
 }
 const result=await response.json();
 const textResponse=result?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
 if(!textResponse||textResponse.length>10000)throw Error('Gemini lieferte keine gültige JSON-Antwort.');
 try{return JSON.parse(textResponse)}
 catch{throw Error('Gemini-Antwort ist kein gültiges JSON.')}
}
root.MeviGeminiKey={save,remove,stored,isUnlocked,refresh,generate,dictate,native};
if(!native())void load();
})(window);
