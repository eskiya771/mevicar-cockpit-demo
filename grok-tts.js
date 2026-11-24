/* xAI Grok German TTS, separate from Groq Whisper.
 * Device-bound encrypted BYOK storage. The key is never sent to Synology.
 * Direct browser access can fail due to CORS; keys are visible to same-origin
 * scripts/devtools during calls. No global access to raw decrypted key. */
(function(root){
'use strict';
const VAULT='mevicar-next-xai-grok-tts-encrypted-v1';
const DB='mevicar-next-device-keys',STORE='keys',KEY_ID='xai-grok-tts-v1';
const URL='https://api.x.ai/v1/tts';
const VOICES=['eve','rex','ara','sal'];
const VOICE_KEY='mevicar-next-xai-grok-tts-voice-v1';
let unlocked=null,loading=null;
const native=()=>!!root.MeviNativeBridge?.postMessage;
const validKey=value=>{
 const s=String(value||'').trim();
 if(!/^xai-[A-Za-z0-9._-]{16,256}$/.test(s))
  throw Error('Bitte einen gültigen xAI-API-Key (xai-…) eingeben.');
 return s;
};
function cryptoApi(){
 const c=root.crypto;
 if(!c?.subtle||!c.getRandomValues||!root.TextEncoder||!root.TextDecoder||!root.indexedDB)
  throw Error('Für xAI-Key-Speicherung sind HTTPS, Web Crypto und IndexedDB erforderlich.');
 return c;
}
const encode=bytes=>root.btoa(String.fromCharCode(...bytes));
const decode=value=>Uint8Array.from(root.atob(value),char=>char.charCodeAt(0));
function deviceStore(mode,work){
 return new Promise((resolve,reject)=>{
  const fail=()=>reject(Error('Gerätegebundener Schlüsselspeicher nicht verfügbar.'));
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
function stored(){
 if(native())return false; // APK keeps its existing native speech pathway.
 try{return !!root.localStorage.getItem(VAULT)}catch{return false}
}
async function save(value){
 if(native())throw Error('Grok-TTS ist derzeit nur in der iPhone-/Browser-Web-App verfügbar.');
 const secret=validKey(value),c=cryptoApi();
 const deviceKey=await c.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 await deviceStore('readwrite',store=>store.put(deviceKey,KEY_ID));
 const iv=c.getRandomValues(new Uint8Array(12));
 const data=new Uint8Array(await c.subtle.encrypt({name:'AES-GCM',iv},deviceKey,
  new root.TextEncoder().encode(secret)));
 const payload=JSON.stringify({v:1,iv:encode(iv),data:encode(data)});
 root.localStorage.setItem(VAULT,payload);
 if(root.localStorage.getItem(VAULT)!==payload)throw Error('xAI-Key konnte nicht gespeichert werden.');
 unlocked=secret;
 return true;
}
async function load(){
 if(native())return false;
 if(unlocked)return true;
 if(!stored())return false;
 if(loading)return loading;
 loading=(async()=>{
  try{
   const c=cryptoApi(),payload=JSON.parse(root.localStorage.getItem(VAULT));
   if(payload?.v!==1||typeof payload.iv!=='string'||typeof payload.data!=='string'||
      payload.iv.length>64||payload.data.length>700)throw Error('Ungültiger Speicherinhalt.');
   const iv=decode(payload.iv),bytes=decode(payload.data);
   if(iv.length!==12||bytes.length<20||bytes.length>350)throw Error('Ungültiger Speicherinhalt.');
   const key=await deviceStore('readonly',store=>store.get(KEY_ID));
   if(!key)throw Error('Gerätebindung fehlt.');
   const plain=await c.subtle.decrypt({name:'AES-GCM',iv},key,bytes);
   unlocked=validKey(new root.TextDecoder().decode(plain));
  }catch{unlocked=null}
  finally{loading=null}
  return !!unlocked;
 })();
 return loading;
}
async function remove(){
 unlocked=null;
 try{root.localStorage.removeItem(VAULT)}catch{}
 try{await deviceStore('readwrite',store=>store.delete(KEY_ID))}catch{}
}

function selectedVoice(){
 try{const v=root.localStorage.getItem(VOICE_KEY);return VOICES.includes(v)?v:'rex'}
 catch{return 'rex'}
}
function setVoice(value){
 if(!VOICES.includes(value))throw Error('Nicht unterstützte Grok-Stimme.');
 root.localStorage.setItem(VOICE_KEY,value);
 return true;
}
async function synthesize(value,signal){
 if(native())throw Error('Grok-TTS ist in der Android-APK noch nicht eingerichtet.');
 const text=String(value||'').trim();
 if(!text||text.length>1200)throw Error('Grok-TTS benötigt 1 bis 1200 Zeichen.');
 if(!unlocked&&!await load())throw Error('xAI-API-Key fehlt. Bitte unter Settings → Zugänge → Grok speichern.');
 if(signal?.aborted)throw Error('Grok-Sprachausgabe abgebrochen.');
 const controller=new root.AbortController(),onAbort=()=>controller.abort();
 if(signal)signal.addEventListener('abort',onAbort,{once:true});
 const timer=root.setTimeout(()=>controller.abort(),24000);
 let response;
 try{
  response=await root.fetch(URL,{
   method:'POST',headers:{Authorization:'Bearer '+unlocked,'Content-Type':'application/json'},
   credentials:'omit',cache:'no-store',signal:controller.signal,
   body:JSON.stringify({text,voice_id:selectedVoice(),language:'de',
    output_format:{codec:'wav',sample_rate:24000}})
  });
 }catch(error){
  if(signal?.aborted)throw Error('Grok-Sprachausgabe abgebrochen.');
  if(error?.name==='AbortError')throw Error('Grok-TTS hat nicht rechtzeitig geantwortet.');
  throw Error('Grok-TTS konnte vom Browser nicht erreicht werden (Netzwerk/CORS).');
 }finally{
  root.clearTimeout(timer);
  signal?.removeEventListener?.('abort',onAbort);
 }
 if(!response.ok){
  const code=response.status;
  if(code===401||code===403)throw Error('xAI-Key ungültig oder nicht berechtigt (HTTP '+code+').');
  if(code===402)throw Error('xAI-Guthaben oder Abrechnung prüfen (HTTP 402).');
  if(code===429)throw Error('Grok-TTS-Kontingent erreicht (HTTP 429).');
  throw Error('Grok-TTS fehlgeschlagen (HTTP '+code+').');
 }
 const contentType=response.headers?.get?.('content-type')||'';
 if(/application\/json/i.test(contentType))throw Error('Grok-TTS hat JSON statt Audio geliefert.');
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.length<44||String.fromCharCode(...bytes.slice(0,4))!=='RIFF'||
    String.fromCharCode(...bytes.slice(8,12))!=='WAVE')
  throw Error('Grok-TTS hat keine gültige WAV-Audiodatei geliefert.');
 return bytes;
}
root.MeviGrokTTS={save,load,remove,stored,synthesize,selectedVoice,setVoice,voices:VOICES};
})(window);
