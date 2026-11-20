/* Personal Gemini API key, never bundled or sent to a MeviCar server.
   Android: existing trusted first-party NativeBridge/Keystore only.
   Web/PWA: locally AES-GCM encrypted at rest with a user passphrase.
   A browser-origin key remains potentially exposed to scripts/devtools and
   during direct API calls. This is a BYOK personal-use preview, not a
   production-secure client-side key management system. */
(function(root){
'use strict';
const VAULT='mevicar-next-gemini-encrypted-key-v1';
const ITERATIONS=310000;
let unlocked=null,nativeConfigured=null;
let nativeCounter=0;
const pending=new Map();
const native=()=>!!root.MeviNativeBridge?.postMessage;
function validKey(value){
 const s=String(value||'').trim();
 if(!/^[A-Za-z0-9._-]{20,256}$/.test(s))throw Error('Ungültiges Gemini-API-Key-Format.');
 return s;
}
function validPassword(value){
 const s=String(value||'');
 if(s.length<12||s.length>256)throw Error('Speicherpasswort: mindestens 12, maximal 256 Zeichen.');
 return s;
}
function cryptoApi(){
 const c=root.crypto;
 if(!c?.subtle||!c.getRandomValues||!root.TextEncoder||!root.TextDecoder)
  throw Error('Verschlüsselte Speicherung erfordert HTTPS und Web Crypto.');
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
async function derive(pass,salt){
 const c=cryptoApi();
 const secret=await c.subtle.importKey('raw',new root.TextEncoder().encode(validPassword(pass)),
  'PBKDF2',false,['deriveKey']);
 return c.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},secret,
  {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
function nativeRequest(action,name,value){
 if(!native())return Promise.reject(Error('Kein Android-Keystore verfügbar. Bitte APK aktualisieren.'));
 return new Promise((resolve,reject)=>{
  const id='gemini-secret-'+(++nativeCounter);
  const timeout=setTimeout(()=>{pending.delete(id);reject(Error('Keine Antwort der Android-App.'))},action==='gemini.navigation'?35000:8000);
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
async function save(value,password){
 const key=validKey(value);
 if(native()){
  await nativeRequest('settings.set','geminiKey',key);
  nativeConfigured=true;unlocked=null;
  return 'android-keystore';
 }
 const pass=validPassword(password),c=cryptoApi();
 const salt=c.getRandomValues(new Uint8Array(16));
 const iv=c.getRandomValues(new Uint8Array(12));
 const cipher=await c.subtle.encrypt({name:'AES-GCM',iv},await derive(pass,salt),
   new root.TextEncoder().encode(key));
 const payload=JSON.stringify({v:1,salt:encode(salt),iv:encode(iv),
  data:encode(new Uint8Array(cipher))});
 root.localStorage.setItem(VAULT,payload);
 if(root.localStorage.getItem(VAULT)!==payload)throw Error('Schlüssel konnte nicht gespeichert werden.');
 unlocked=key;
 return 'browser-encrypted';
}
function stored(){
 if(native())return nativeConfigured===true;
 try{return !!root.localStorage.getItem(VAULT)}catch{return false}
}
function isUnlocked(){return native()?nativeConfigured===true:!!unlocked}
async function refresh(){
 if(!native())return stored();
 const info=await nativeRequest('settings.status','',null);
 nativeConfigured=info?.configured?.geminiKey===true;
 return nativeConfigured;
}
async function unlock(password){
 if(native())return true;
 const raw=root.localStorage.getItem(VAULT);
 if(!raw)throw Error('Noch kein Gemini-Schlüssel gespeichert.');
 const pass=validPassword(password),c=cryptoApi();
 try{
  const v=JSON.parse(raw);
  if(v.v!==1)throw Error('version');
  const salt=decode(v.salt),iv=decode(v.iv),data=decode(v.data);
  if(salt.length!==16||iv.length!==12||data.length<17||data.length>1024)throw Error('format');
  const plain=await c.subtle.decrypt({name:'AES-GCM',iv},await derive(pass,salt),data);
  unlocked=validKey(new root.TextDecoder().decode(plain));
  return true;
 }catch{unlocked=null;throw Error('Falsches Speicherpasswort oder beschädigter Schlüssel.')}
}
function lock(){unlocked=null}
async function remove(){
 if(native()){
  await nativeRequest('settings.clear','geminiKey');
  nativeConfigured=false;
 }else root.localStorage.removeItem(VAULT);
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
async function generate(text,context={},signal){
 const phrase=String(text||'').trim().slice(0,400);
 if(!phrase)throw Error('Bitte einen Sprachwunsch eingeben.');
 if(native())return requestNative(phrase,context);
 if(!unlocked)throw Error(stored()?
  'Gemini-Key ist gesperrt. Bitte unter Settings → Zugänge entsperren.':
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
  if(code===401||code===403)throw Error('Gemini-API-Key nicht berechtigt (HTTP '+code+').');
  if(code===429)throw Error('Gemini-Anfragelimit erreicht.');
  if(code===404)throw Error('Gemini-Modell für deinen API-Key nicht verfügbar.');
  throw Error('Gemini antwortet nicht (HTTP '+code+').');
 }
 const result=await response.json();
 const textResponse=result?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
 if(!textResponse||textResponse.length>10000)throw Error('Gemini lieferte keine gültige JSON-Antwort.');
 try{return JSON.parse(textResponse)}
 catch{throw Error('Gemini-Antwort ist kein gültiges JSON.')}
}
root.MeviGeminiKey={save,unlock,lock,remove,stored,isUnlocked,refresh,generate,native};
})(window);
