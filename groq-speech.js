/* MeviCar Next · optional, browser-only Groq Whisper speech transcription.
 * User-provided Groq key is stored encrypted at rest with a non-extractable
 * device key in IndexedDB. Calls are direct from the user's browser to Groq.
 * Browser scripts/devtools can still access/use the key; no server relay.
 * Gemini and Groq can be selected independently for navigation and speech.
 */
(function(root){
'use strict';
const VAULT='mevicar-next-groq-speech-encrypted-v1';
const DB='mevicar-next-device-keys',STORE='keys',KEY_ID='groq-speech-v1';
const URL='https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL='whisper-large-v3-turbo';
let unlocked=null,loading=null;
const native=()=>!!root.MeviNativeBridge?.postMessage;
const validKey=value=>{
 const s=String(value||'').trim();
 if(!/^gsk_[A-Za-z0-9_-]{20,200}$/.test(s))
  throw Error('Bitte einen gültigen Groq-API-Key (gsk_…) eingeben.');
 return s;
};
function cryptoApi(){
 const c=root.crypto;
 if(!c?.subtle||!c.getRandomValues||!root.TextEncoder||!root.TextDecoder||!root.indexedDB)
  throw Error('Für Groq-Key-Speicherung sind HTTPS, Web Crypto und IndexedDB erforderlich.');
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
 if(native())throw Error('Groq Whisper steht derzeit nur in der iPhone-/Browser-Web-App bereit.');
 const secret=validKey(value),c=cryptoApi();
 const deviceKey=await c.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 await deviceStore('readwrite',store=>store.put(deviceKey,KEY_ID));
 const iv=c.getRandomValues(new Uint8Array(12));
 const data=new Uint8Array(await c.subtle.encrypt({name:'AES-GCM',iv},deviceKey,
  new root.TextEncoder().encode(secret)));
 const payload=JSON.stringify({v:1,iv:encode(iv),data:encode(data)});
 root.localStorage.setItem(VAULT,payload);
 if(root.localStorage.getItem(VAULT)!==payload)throw Error('Groq-Key konnte nicht gespeichert werden.');
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
function filename(mime){
 const type=String(mime||'').split(';')[0].toLowerCase().trim();
 if(type==='audio/mp4'||type==='audio/x-m4a')return 'mevicar-sprache.m4a';
 if(type==='audio/webm')return 'mevicar-sprache.webm';
 if(type==='audio/ogg')return 'mevicar-sprache.ogg';
 if(type==='audio/wav')return 'mevicar-sprache.wav';
 return '';
}
async function transcribe(blob,mimeType,signal,onProgress){
 if(native())throw Error('Groq ist in der Android-APK nicht aktiviert.');
 if(!blob||!blob.size||blob.size>25*1024*1024)
  throw Error('Groq benötigt eine Audioaufnahme bis 25 MB.');
 const name=filename(mimeType||blob.type);
 if(!name)throw Error('Groq unterstützt dieses Audioformat nicht.');
 if(!unlocked&&!await load())throw Error('Groq-Key fehlt oder lässt sich auf diesem Gerät nicht entschlüsseln.');
 if(signal?.aborted)throw Error('Spracherkennung abgebrochen.');
 onProgress?.('Groq Whisper transkribiert …');
 const form=new root.FormData();
 form.append('file',blob,name);
 form.append('model',MODEL);
 form.append('language','de');
 form.append('response_format','json');
 const controller=new root.AbortController(),onAbort=()=>controller.abort();
 if(signal)signal.addEventListener('abort',onAbort,{once:true});
 const timer=root.setTimeout(()=>controller.abort(),18000);
 let response;
 try{
  response=await root.fetch(URL,{
   method:'POST',headers:{Authorization:'Bearer '+unlocked},
   body:form,credentials:'omit',cache:'no-store',signal:controller.signal
  });
 }catch(error){
  if(signal?.aborted)throw Error('Spracherkennung abgebrochen.');
  if(error?.name==='AbortError')throw Error('Groq antwortet nicht innerhalb von 18 Sekunden.');
  throw Error('Groq ist im Browser nicht erreichbar (Netzwerk/CORS).');
 }finally{
  root.clearTimeout(timer);
  signal?.removeEventListener?.('abort',onAbort);
 }
 if(!response.ok){
  const code=response.status;
  if(code===401||code===403)throw Error('Groq-Key ungültig oder ohne Berechtigung (HTTP '+code+').');
  if(code===429)throw Error('Groq Whisper-Limit erreicht (HTTP 429).');
  if(code===413)throw Error('Groq-Audiodatei zu groß (HTTP 413).');
  throw Error('Groq Whisper nicht verfügbar (HTTP '+code+').');
 }
 const json=await response.json();
 const text=String(json?.text||'').trim().slice(0,400);
 if(!text)throw Error('Groq hat keine Sprache erkannt.');
 return text;
}

/* The same device-bound Groq key can be used for navigation intent and TTS.
 * Explicit selections only: no hidden calls for services the user did not choose. */
async function activeKey(){
 if(native())throw Error('Groq ist derzeit nur in der Web-App verfügbar.');
 if(!unlocked&&!await load())throw Error('Bitte den Groq-API-Key unter Settings → Zugänge speichern.');
 return unlocked;
}
const CHAT_URL='https://api.groq.com/openai/v1/chat/completions';
const CHAT_MODEL='llama-3.3-70b-versatile';
const TTS_URL='https://api.groq.com/openai/v1/audio/speech';
const TTS_MODEL='canopylabs/orpheus-v1-english';
async function generate(text,context={},signal,onProgress){
 const key=await activeKey(),phrase=String(text||'').trim().slice(0,400);
 if(!phrase)throw Error('Bitte einen Navigationswunsch eingeben.');
 onProgress?.('Groq interpretiert deinen Navigationswunsch …');
 const controller=new root.AbortController(),onAbort=()=>controller.abort();
 if(signal?.aborted)onAbort();else signal?.addEventListener?.('abort',onAbort,{once:true});
 const timeout=root.setTimeout(()=>controller.abort(),18000);
 let response;
 try{
  response=await root.fetch(CHAT_URL,{
   method:'POST',credentials:'omit',cache:'no-store',signal:controller.signal,
   headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
   body:JSON.stringify({
    model:CHAT_MODEL,temperature:0.1,max_completion_tokens:220,
    response_format:{type:'json_object'},
    messages:[
     {role:'system',content:[
      'Du bist der deutsche MeviCar-Navi-Assistent. Gib ausschließlich ein JSON-Objekt zurück.',
      'Pflichtfelder: intent (destination, stop, poi, clarify, read_navigation, check_traffic, control_navigation, edit_route), query, poiType, reply.',
      'Reine Fragen zu Verkehr, Verzögerung, Ankunft, Reststrecke/Restzeit oder vorhandenen Alternativen: read_navigation, query=traffic/delay/eta/remaining/alternatives/destination/stops/street (Ziel/Zwischenstopps/aktuelle Straße). Keine Werte erfinden. Ausdrückliche Bitte um Verkehrsprüfung oder Stauumfahrung: check_traffic, query leer. Niemals Route selbst ändern.',
      'Nur ausdrückliche Bedienbefehle für die laufende Navigation: control_navigation, query=mute/unmute/overview/follow/north/travel (Navi-Ansagen aus/ein, Übersicht, Fahransicht, Norden/Fahrtrichtung oben). Keine Routenänderung, kein Start/Ende.',
      'Explizite Befehle für vorhandene Route: intent=edit_route, query=start/end/remove/move/option, routeEdit={action:query,index,to,option,value}. index/to 1-basiert nur ausdrücklich genannte Stoppnummern. option=avoidTolls/avoidHighways/avoidFerries, value=true vermeiden oder false erlauben. App bestätigt vor Ausführung. Keine Nummer erfinden.',
      'Bei Ziel plus Zusatzaktion: intent=destination, query=Hauptziel, afterRoute={poiType,scope,near,placeName}. Bei zwei oder drei ausdrücklich genannten Zwischenstopps: erster in afterRoute, übrige in afterRoutes (Array). Alle scope=route; Adressen als poiType=address, placeName=genauer Ort/Adresse, near leer. Keine Stopps erfinden.',
      'Bei ausdrücklich genannten Ketten/Marken/Betrieben (McDonalds, Burger King, Shell, Starbucks) MUSS placeName den genauen Namen enthalten, auch wenn poiType=food/charge/fuel ist.',
      'Beispiel: „Navigiere zu Serife und auf der Strecke zu McDonalds“ → afterRoute={poiType:"food",scope:"route",placeName:"McDonalds"} statt nur generischer Restaurantsuche.',
      'placeName nicht erfinden; bei allgemeiner Kategorie weglassen.',
      'afterRoute.poiType nur fuel, charge, parking, food, cafe, cart, rest, wrench, bar.',
      'afterRoute.scope nur route (auf dem Weg) oder destination (dort, am Ziel).',
      'afterRoute.near nur bei ausdrücklich genannter Stadt auf der Route, sonst weglassen.',
      'Werte immer den VOLLSTÄNDIGEN Sprachwunsch aus, auch natürlich formulierte Wünsche.',
      'Wer nur in einer bestimmten Region essen, Kaffee trinken oder ein Bierchen trinken will, sucht einen Ort: intent=poi, nicht destination.',
      'Für Biergarten/Kneipe/Bierchen: poiType=bar und query=Biergarten oder Kneipe.',
      'Nur ausdrückliche POI-Filter: filters={openNow:true,arrivalOpen:true,sort:distance/relevance/detour}. arrivalOpen nur bei ausdrücklich gewünschter Öffnung zur Ankunft entlang der Route. Heute ist nicht jetzt geöffnet. detour nur entlang aktiver/geplanter Route; Vergleich erst nach Bestätigung.',
      'Bei lokaler Suche in einer genannten Stadt oder Region: near=die genannte Region, z. B. Erlangen-Höchstadt; kein GPS-Ziel daraus machen.',
      'Bei pendingDestination und einer Ergänzung bewahre das bisherige Ziel exakt.',
      'Beachte hasRoute; ohne Route keinen alleinstehenden stop-Intent. destination plus afterRoute ist erlaubt.',
      'Bei unverifizierbaren Preisen, Laufzeiten oder Überdachung lieber clarify als falsche Filter versprechen.',
      'Erfinde niemals Adressen, Koordinaten, Preise oder Routen. Keine Navigation selbst starten.'
     ].join(' ')},
     {role:'user',content:JSON.stringify({text:phrase,hasRoute:!!context.hasRoute,
       clarification:context.clarification||null,
       pendingDestination:context.pendingDestination||null})}
    ]
   })
  });
 }catch(e){
  if(signal?.aborted)throw Error('Groq-Anfrage abgebrochen.');
  if(e?.name==='AbortError')throw Error('Groq antwortet nicht rechtzeitig.');
  throw Error('Groq ist im Browser nicht erreichbar (Netzwerk/CORS).');
 }finally{
  root.clearTimeout(timeout);signal?.removeEventListener?.('abort',onAbort);
 }
 if(!response.ok){
  if(response.status===429)throw Error('Groq-Kontingent erreicht (HTTP 429).');
  if(response.status===401||response.status===403)throw Error('Groq-API-Key nicht gültig oder nicht freigeschaltet (HTTP '+response.status+').');
  throw Error('Groq-Navigation fehlgeschlagen (HTTP '+response.status+').');
 }
 const json=await response.json();
 let result;
 try{result=JSON.parse(json?.choices?.[0]?.message?.content||'')}
 catch{throw Error('Groq hat keine gültige JSON-Navigationsantwort geliefert.')}
 return result;
}
/* Groq currently documents only English and Arabic Orpheus models.
 * The experimental English voice is opt-in; German TTS defaults to local. */
async function synthesize(text,signal){
 const phrase=String(text||'').trim();
 if(!phrase||phrase.length>200)throw Error('Groq Orpheus benötigt 1 bis 200 Zeichen.');
 const key=await activeKey();
 const controller=new root.AbortController(),onAbort=()=>controller.abort();
 if(signal?.aborted)onAbort();else signal?.addEventListener?.('abort',onAbort,{once:true});
 const timer=root.setTimeout(()=>controller.abort(),18000);
 let response;
 try{
  response=await root.fetch(TTS_URL,{
   method:'POST',credentials:'omit',cache:'no-store',signal:controller.signal,
   headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
   body:JSON.stringify({model:TTS_MODEL,input:phrase,voice:'hannah',response_format:'wav'})
  });
 }catch(e){
  if(signal?.aborted)throw Error('Sprachausgabe abgebrochen.');
  if(e?.name==='AbortError')throw Error('Groq-TTS antwortet nicht rechtzeitig.');
  throw Error('Groq-TTS im Browser nicht erreichbar (Netzwerk/CORS).');
 }finally{
  root.clearTimeout(timer);signal?.removeEventListener?.('abort',onAbort);
 }
 if(!response.ok){
  if(response.status===429)throw Error('Groq-TTS-Kontingent erreicht (HTTP 429).');
  if(response.status===401||response.status===403)throw Error('Groq-TTS: API-Key nicht gültig (HTTP '+response.status+').');
  throw Error('Groq-TTS fehlgeschlagen (HTTP '+response.status+').');
 }
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.length<44||String.fromCharCode(...bytes.slice(0,4))!=='RIFF'||
   String.fromCharCode(...bytes.slice(8,12))!=='WAVE')
  throw Error('Groq hat keine gültige WAV-Datei zurückgegeben.');
 return bytes;
}

root.MeviGroqSpeech={save,load,remove,stored,transcribe,generate,synthesize,model:MODEL,chatModel:CHAT_MODEL,ttsModel:TTS_MODEL};
})(window);
