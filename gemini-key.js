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
let nativeCounter=0,nativeCaptureEvents=null;
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
function nativeRequest(action,name,value,onCapture){
 if(!native())return Promise.reject(Error('Kein Android-Keystore verfügbar. Bitte APK aktualisieren.'));
 return new Promise((resolve,reject)=>{
  const id='gemini-secret-'+(++nativeCounter);
  const timeout=setTimeout(()=>{pending.delete(id);reject(Error('Keine Antwort der Android-App.'))},action==='voice.listen'?90000:action==='gemini.navigation'?35000:8000);
  pending.set(id,{resolve,reject,timeout,onCapture});
  try{root.MeviNativeBridge.postMessage(JSON.stringify({id,action,name,value,captureEvents:onCapture?true:undefined}))}
  catch{clearTimeout(timeout);pending.delete(id);reject(Error('Android-Schnittstelle nicht erreichbar.'))}
 });
}
function receive(event){
 let msg;try{msg=JSON.parse(event.data)}catch{return}
 const item=pending.get(msg.id);if(!item)return;
 if('captureLevel' in msg){
  const level=msg.captureLevel;
  if(level===null||Number.isFinite(level)&&level>=0&&level<=1)item.onCapture?.(level);
  return;
 }
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
 nativeCaptureEvents=info?.voiceCaptureEvents===true;
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
 'Du bist die KI für natürliche Fahrwünsche von MeviCar Next.',
 'Verstehe den vollständigen Satz und gib GENAU EINEN Funktionsaufruf zurück.',
 'Nur wenn jemand ausdrücklich zu einem Ziel fahren will, verwende navigate_to. Für ein Ziel PLUS weitere Aktion verwende plan_trip.',
 'Wer nur eine Aktivität oder eine Art von Ort in einer Gegend sucht (Bier trinken, Essen gehen, Café, Biergarten, Kneipe), will find_place, NICHT navigate_to zu dem Gebiet.',
 'Für „Ich würde gerne heute in der Nähe von Erlangenhöchstadt ein Bierchen trinken“: find_place(category=bar,alongRoute=false,near=„Erlangen-Höchstadt“).',
 'Bei find_place.near übernimm eine ausdrücklich genannte Stadt, einen Landkreis oder ein Suchgebiet; korrigiere naheliegende Transkript-Schreibfehler.',
 '„Heute“ bedeutet nicht automatisch „jetzt geöffnet“. Erfinde keine Geschäftszeiten.',
 'Eine zweite Aktion kann unterwegs, am Ziel oder bei einer ausdrücklich genannten Stadt liegen.',
 '„Dort“/„vor Ort“ meint am Ziel (at_destination). „Unterwegs“ meint entlang der Route (along_route).',
 '„Bei Würzburg tanken“ entlang einer Fahrt meint near_city, city="Würzburg".',
 'Wenn der Nutzer einen bestimmten Betrieb, eine Marke oder Kette wie McDonald’s, Burger King, Starbucks, Shell oder Aral nennt, übernimm den Namen UNVERÄNDERT in followUp.placeName bzw. find_place.placeName.',
 'Bei „Navigiere zu Serife und auf der Strecke würde ich gerne zu McDonalds“: plan_trip mit destination="Serife", followUp={category:"food",scope:"along_route",placeName:"McDonalds"}. Suche NICHT generisch Restaurants.',
 'placeName nur setzen, wenn ein konkreter Name vom Nutzer genannt ist. Die KI erfindet keine Filialen und wählt keinen Treffer aus.',
 'Wenn pendingDestination vorhanden ist und der Nutzer den bisherigen Wunsch ergänzt, bewahre dieses Ziel.',
 'Bei Gemini-Zieleingaben niemals anbieten, die Adresse zu speichern oder ins Adressbuch zu übernehmen. Speichern ist ausschließlich eine separate, ausdrücklich gewünschte Aktion.',
 'Ist ein Fahrtziel eindeutig, gehe ohne weitere Rückfrage zur Navi-Zielauswahl. Falls bereits eine Route existiert, frage nur dann nach Neue Route oder Zwischenstopp, wenn der Nutzer das nicht ausdrücklich bestimmt hat.',
 'Frage nach, wenn eine Zuordnung oder ein gewünschter Filter nicht zuverlässig umsetzbar ist.',
 'MeviCar kann POI-Kategorien und Suchbereiche auswählen, aber keine Preise, Überdachung, Fußwegzeiten oder Verfügbarkeit garantieren.',
 'Erfinde niemals Koordinaten, echte Treffer, Preise, Fahrzeiten oder Adressen.',
 'Keine Route starten, kein Ziel auswählen und keine Zwischenstopps automatisch hinzufügen.',
 'Ohne bestehende Route verwende kein find_place mit alongRoute=true; plan_trip darf trotzdem einen späteren Zwischenstopp enthalten.'
].join('\n');
// Speech transcription has its own audio model. Interpreting one short
// navigation wish needs only the low-latency, Free-Tier Flash-Lite model.
const model='gemini-3.5-flash-lite';
async function requestNative(text,context){
 const response=await nativeRequest('gemini.navigation','',JSON.stringify({
  text:String(text||'').slice(0,400),
  hasRoute:!!context.hasRoute,
  clarification:context.clarification||null,
  pendingDestination:String(context.pendingDestination||'').slice(0,200)
 }));
 return response.result;
}
/* Android WebView has no working Web Speech API: the APK dictates natively. */
async function dictate(onCapture){
 if(onCapture&&nativeCaptureEvents===null)await refresh();
 // Older APKs only return a final transcript. Keep their listening indicator.
 if(!nativeCaptureEvents)onCapture?.(0);
 const response=await nativeRequest('voice.listen','',null,onCapture);
 return String(response.transcript||'').trim().slice(0,400);
}
// Explicit tool declarations keep Gemini's navigation output separate from prose.
// Tool calls are proposals; only the MeviCar UI can confirm and execute them.
const TRIP_CATEGORIES=['fuel','charge','parking','food','cafe','cart','rest','wrench','bar'];
const TRIP_AREAS=['along_route','at_destination','near_city'];
const NAV_TOOLS=[{functionDeclarations:[
 {name:'navigate_to',description:'One driving destination only. Do not select a real Places result.',parameters:{type:'OBJECT',properties:{destination:{type:'STRING'}},required:['destination']}},
 {name:'plan_trip',description:'A driving destination PLUS one requested activity/place. Use this for any combined driving request or an extension of pendingDestination. This proposes a later Places search, not a waypoint or navigation action.',parameters:{type:'OBJECT',properties:{
  destination:{type:'STRING',description:'Primary trip destination, or the unchanged pendingDestination when extending an open proposal.'},
  followUp:{type:'OBJECT',properties:{
   category:{type:'STRING',enum:TRIP_CATEGORIES},
   scope:{type:'STRING',enum:TRIP_AREAS,description:'along_route=on the way, at_destination=there/at goal, near_city=near an explicitly named town along the route'},
   city:{type:'STRING',description:'Only for near_city: explicitly requested town; no guessed location'},
   placeName:{type:'STRING',description:'Exact named chain/business/place explicitly requested, e.g. McDonalds. Leave empty when user asks for a general category.'}
  },required:['category','scope']}
 },required:['destination','followUp']}},
 {name:'find_place',description:'Find an activity or business (pub, beer garden, café, food, parking, etc.) near an optionally named region, WITHOUT treating the region itself as a driving destination. alongRoute true only for existing routes.',parameters:{type:'OBJECT',properties:{
  category:{type:'STRING',enum:TRIP_CATEGORIES},alongRoute:{type:'BOOLEAN'},
  near:{type:'STRING',description:'Optional explicitly mentioned town or district / region for a standalone search. Empty when user did not name a search area.'},
  placeName:{type:'STRING',description:'Specific brand/business name explicitly mentioned by user, e.g. McDonalds, Starbucks or Shell.'}
 },required:['category','alongRoute']}},
 {name:'ask_clarification',description:'Ask one short question if the user intent is ambiguous or requires an unavailable real-world condition.',parameters:{type:'OBJECT',properties:{question:{type:'STRING'}},required:['question']}}
]}];
function normalizeToolCall(call,context){
 const args=call?.args||{};
 if(call?.name==='navigate_to'&&typeof args.destination==='string'&&args.destination.trim())
  return {intent:'destination',query:args.destination.trim().slice(0,200),poiType:'',reply:'Soll ich nach '+args.destination.trim().slice(0,100)+' suchen?'};
 if(call?.name==='plan_trip'){
  const destination=String(args.destination||context.pendingDestination||'').trim().slice(0,200);
  const next=args.followUp||{};
  const category=String(next.category||''),scope=String(next.scope||'');
  const city=String(next.city||'').trim().slice(0,60);
  const placeName=String(next.placeName||'').trim().slice(0,80);
  if(!destination||!TRIP_CATEGORIES.includes(category)||!TRIP_AREAS.includes(scope))
   throw Error('Gemini hat keinen vollständigen Fahrplan geliefert.');
  if(scope==='near_city'&&!city)
   return {intent:'clarify',query:'',poiType:'',reply:'In welcher Stadt möchtest du unterwegs suchen?'};
  // A follow-up to a confirmed target must not quietly retarget the trip.
  if(context.pendingDestination&&destination!==context.pendingDestination)
   return {intent:'clarify',query:'',poiType:'',reply:'Möchtest du dein bisheriges Ziel ändern oder nur einen Zwischenhalt ergänzen?'};
  return {intent:'destination',query:destination,poiType:'',reply:'',
   afterRoute:{poiType:category,scope:scope==='at_destination'?'destination':'route',
    ...(scope==='near_city'?{near:city}:{}),...(placeName?{placeName}:{})}};
 }
 if(call?.name==='find_place'&&TRIP_CATEGORIES.includes(args.category)){
  const names={fuel:'Tankstelle',charge:'Ladestation',parking:'Parkplatz',food:'Restaurant',
   cafe:'Café',cart:'Supermarkt',rest:'Rastplatz',wrench:'Werkstatt',
   bar:'Biergarten oder Kneipe'};
  if(args.alongRoute&&!context.hasRoute)return {intent:'clarify',query:'',poiType:'',reply:'Bitte zuerst eine Route planen.'};
  const near=String(args.near||'').trim().slice(0,60);
  const placeName=String(args.placeName||'').trim().slice(0,80);
  const term=placeName||names[args.category];
  const location=near?' in der Nähe von '+near:args.alongRoute?' entlang der Route':' in deiner Nähe';
  return {intent:args.alongRoute?'stop':'poi',query:term,
   poiType:args.category,...(!args.alongRoute&&near?{near}:{}),
   ...(placeName?{placeName}:{}),
   reply:'Soll ich nach '+term+location+' suchen?'};
 }
 if(call?.name==='ask_clarification')return {intent:'clarify',query:'',poiType:'',reply:String(args.question||'Was möchtest du suchen?').slice(0,200)};
 throw Error('Gemini hat einen nicht unterstützten Funktionsaufruf geliefert.');
}
async function generate(text,context={},signal,onProgress){
 const phrase=String(text||'').trim().slice(0,400);
 if(!phrase)throw Error('Bitte einen Sprachwunsch eingeben.');
 if(native())return requestNative(phrase,context);
 if(!unlocked&&!await load())throw Error(stored()?
  'Der gespeicherte Gemini-Key ist in diesem Browser nicht mehr lesbar. Bitte unter Settings → Zugänge neu speichern.':
  'Bitte den Gemini-Key unter Settings → Zugänge speichern.');
 const payload={
  systemInstruction:{parts:[{text:SYSTEM+'\nVerwende ausschließlich die angebotenen Navigationsfunktionen. Gib keine freie Antwort.'}]},
  contents:[{role:'user',parts:[{text:JSON.stringify({text:phrase,hasRoute:!!context.hasRoute,
   clarification:context.clarification||null,pendingDestination:context.pendingDestination||null})}]}],
  tools:NAV_TOOLS,toolConfig:{functionCallingConfig:{mode:'ANY'}},
  generationConfig:{temperature:0.2,thinkingConfig:{thinkingLevel:'MINIMAL'}}
 };
 // One device-side request with one bounded retry for transient service
 // overload/timeouts. Never retry billing, quota, invalid key or validation.
 // Keep the personal API key on the device, not on Synology.
 const payloadJson=JSON.stringify(payload);
 let response;
 for(let attempt=0;attempt<2;attempt++){
  if(signal?.aborted)throw Error('Gemini-Anfrage abgebrochen.');
  const controller=new AbortController();
  const onAbort=()=>controller.abort();
  if(signal){
   if(signal.aborted)onAbort();
   else signal.addEventListener('abort',onAbort,{once:true});
  }
  let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;controller.abort()},11000);
  try{
   response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{
    method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':unlocked},
    credentials:'omit',cache:'no-store',signal:controller.signal,body:payloadJson
   });
  }catch(e){
   if(signal?.aborted)throw e;
   if(timedOut){
    if(attempt===0){
     onProgress?.('Gemini antwortet langsam – ein zweiter Versuch …');
     await new Promise(resolve=>setTimeout(resolve,750));
     continue;
    }
    throw Error('Gemini braucht zu lange. Zwei Versuche fehlgeschlagen. Bitte später erneut versuchen.');
   }
   if(e?.name==='AbortError')throw e;
   throw Error('Direkter Gemini-Aufruf im Browser fehlgeschlagen (Netzwerk oder CORS).');
  }finally{
   clearTimeout(timer);
   signal?.removeEventListener?.('abort',onAbort);
  }
  if(response.status===503&&attempt===0){
   onProgress?.('Gemini ist vorübergehend überlastet – ein zweiter Versuch …');
   await new Promise(resolve=>setTimeout(resolve,750));
   continue;
  }
  break;
 }
 if(!response)throw Error('Keine Antwort von Gemini.');
 if(!response.ok){
  const code=response.status;
  // Google decides whether a key is valid; only its answer counts.
  let detail='';try{detail=JSON.stringify((await response.json())?.error||'').slice(0,2000)}catch{}
  if(/API_KEY_INVALID|API key not valid|API key expired/i.test(detail)||code===401)
   throw Error('Google lehnt den Gemini-API-Key als ungültig ab. Bitte den Schlüssel prüfen.');
  if(code===402)throw Error('Google Gemini: API-Guthaben oder Abrechnung prüfen (HTTP 402). Bitte Google AI Studio → Abrechnung öffnen.');
  if(code===403)throw Error('Gemini-API-Key hat keine Berechtigung für die Gemini API (HTTP 403).');
  if(code===429)throw Error('Gemini-Kontingent aufgebraucht oder Anfragelimit erreicht.');
  if(code===503)throw Error('Gemini ist überlastet (HTTP 503). Zwei Versuche fehlgeschlagen.');
  if(code===404)throw Error('Gemini-Modell '+model+' ist für deinen API-Key nicht verfügbar.');
  if(code===400)throw Error('Gemini hat die Anfrage abgelehnt (HTTP 400).');
  throw Error('Gemini antwortet nicht (HTTP '+code+').');
 }
 const result=await response.json();
 const calls=result?.candidates?.[0]?.content?.parts?.map(p=>p.functionCall).filter(Boolean)||[];
 if(calls.length)return normalizeToolCall(calls[0],context);
 throw Error('Gemini lieferte keinen gültigen Navigations-Funktionsaufruf.');
}
/* One-shot speech recognition: a lower-latency, audio-capable Flash model
   suffices for verbatim transcription. Gemini navigation intent generation
   remains on the separate configured 'model' and is not called automatically. */
const AUDIO_MODEL='gemini-3.6-flash';
async function transcribe(blob,mimeType,signal,onProgress){
 if(native())throw Error('Native Audioaufnahme noch nicht auf Web umgestellt.');
 if(!unlocked&&!await load())throw Error('Gemini-Key fehlt.');
 const bytes=new Uint8Array(await blob.arrayBuffer());
 if(!bytes.length||bytes.length>8*1024*1024)throw Error('Ungültige Audioaufnahme.');
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 // Safari records MP4, Chromium typically WebM/Opus; only the base MIME is
 // supported by Gemini inlineData, not the semicolon-delimited codec suffix.
 const audioMime=String(mimeType||blob.type||'').split(';')[0].trim().toLowerCase();
 if(!['audio/mp4','audio/webm','audio/wav','audio/ogg','audio/mpeg'].includes(audioMime))
  throw Error('Dieses Audioformat wird von Gemini nicht unterstützt.');
 const payload=JSON.stringify({contents:[{parts:[
  {text:'Transkribiere diese deutsche Sprache wortgetreu. Gib nur den gesprochenen Text zurück.'},
  {inlineData:{mimeType:audioMime,data:root.btoa(binary)}}
 ]}]});
 let response;
 for(let attempt=0;attempt<2;attempt++){
  if(signal?.aborted)throw Error('Aufnahme abgebrochen.');
  const controller=new AbortController();
  const externalAbort=()=>controller.abort();
  if(signal){
   if(signal.aborted)externalAbort();
   else signal.addEventListener('abort',externalAbort,{once:true});
  }
  let timedOut=false;
  // Hard upper bound per attempt. A one-shot audio request should not leave
  // the iPhone stuck indefinitely on "Gemini transkribiert …".
  const timer=setTimeout(()=>{timedOut=true;controller.abort()},12000);
  try{
   response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+AUDIO_MODEL+':generateContent',{
    method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':unlocked},
    credentials:'omit',cache:'no-store',signal:controller.signal,body:payload
   });
  }catch(e){
   if(signal?.aborted)throw Error('Aufnahme abgebrochen.');
   if(timedOut){
    if(attempt===0){
     onProgress?.('Gemini antwortet langsam – ein zweiter Versuch …');
     await new Promise(resolve=>setTimeout(resolve,1100));
     continue;
    }
    throw Error('Gemini antwortet zu langsam. Bitte später erneut sprechen.');
   }
   if(e?.name==='AbortError')throw e;
   throw Error('Gemini-Audioaufruf fehlgeschlagen (Netzwerk oder CORS).');
  }finally{
   clearTimeout(timer);
   signal?.removeEventListener?.('abort',externalAbort);
  }
  // Google documents transient UNAVAILABLE errors and exponential-backoff
  // retry; cap the audio test at one additional request to preserve Free Tier.
  if(response.status===503&&attempt===0){
   onProgress?.('Gemini ist vorübergehend überlastet – ein zweiter Versuch …');
   await new Promise(resolve=>setTimeout(resolve,1100));
   continue;
  }
  break;
 }
 if(!response)throw Error('Keine Antwort von Gemini.');
 if(!response.ok){
  const code=response.status;
  let detail='';try{detail=JSON.stringify((await response.json())?.error||'').slice(0,2000)}catch{}
  if(/API_KEY_INVALID|API key not valid/i.test(detail)||code===401)
   throw Error('Google lehnt den Gemini-API-Key als ungültig ab.');
  if(code===402)throw Error('Google Gemini: API-Guthaben oder Abrechnung prüfen (HTTP 402). Bitte Google AI Studio → Abrechnung öffnen.');
  if(code===403)throw Error('Gemini-API-Key hat keine Berechtigung für Audio.');
  if(code===404)throw Error('Gemini-Audiomodell '+AUDIO_MODEL+' ist für diesen API-Key nicht verfügbar.');
  if(code===429)throw Error('Gemini-Free-Tier-Limit erreicht (HTTP 429). Bitte später erneut versuchen.');
  if(code===503)throw Error('Gemini ist zurzeit überlastet (HTTP 503). Zwei Versuche fehlgeschlagen; bitte später erneut sprechen.');
  throw Error('Gemini-Transkription fehlgeschlagen (HTTP '+code+').');
 }
 const json=await response.json();
 const result=String(json?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'').trim().slice(0,400);
 if(!result)throw Error('Gemini hat keinen Sprachtext zurückgegeben. Bitte erneut sprechen.');
 return result;
}

/* Gemini audio reply for iPhone PWA. Unlike Safari speechSynthesis, this
   produces a real, short WAV file which the already-tested Web Audio engine
   can play. The user must explicitly tap the speaker; never call in a loop
   or during navigation recognition. */
const SPEECH_MODEL='gemini-3.8-flash-lite-tts';
async function synthesize(text,signal){
 if(native())throw Error('Diese Audioausgabe ist derzeit nur in der Web-App verfügbar.');
 if(!unlocked&&!await load())throw Error('Gemini-Key fehlt. Bitte in den Einstellungen speichern.');
 const phrase=String(text||'').trim().slice(0,230);
 if(!phrase)throw Error('Keine Gemini-Antwort zum Vorlesen vorhanden.');
 if(signal?.aborted)throw Error('Sprachausgabe abgebrochen.');
 const controller=new AbortController(),abort=()=>controller.abort();
 if(signal){
  if(signal.aborted)abort();
  else signal.addEventListener('abort',abort,{once:true});
 }
 let timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;controller.abort()},18000);
 let response;
 try{
  response=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{
   method:'POST',
   headers:{'Content-Type':'application/json','x-goog-api-key':unlocked},
   credentials:'omit',cache:'no-store',signal:controller.signal,
   body:JSON.stringify({
    model:SPEECH_MODEL,
    input:[{type:'user_input',content:[{type:'text',text:phrase,
     annotations:[{type:'speech_metadata',style:'Natürlich, ruhig und deutlich auf Deutsch sprechen.'}]}]}],
    response_format:{type:'audio'},
    generation_config:{speech_config:[{voice:'Kore'}]}
   })
  });
 }catch(e){
  if(signal?.aborted)throw Error('Sprachausgabe abgebrochen.');
  if(timedOut)throw Error('Gemini-Sprachausgabe antwortet zu langsam. Bitte später erneut versuchen.');
  if(e?.name==='AbortError')throw e;
  throw Error('Gemini-Audioverbindung fehlgeschlagen (Netzwerk oder CORS).');
 }finally{
  clearTimeout(timer);
  signal?.removeEventListener?.('abort',abort);
 }
 if(!response.ok){
  const code=response.status;
  if(code===402)throw Error('Gemini-TTS: API-Guthaben oder Abrechnung prüfen (HTTP 402).');
  if(code===403)throw Error('Gemini-TTS ist für den gespeicherten API-Key nicht freigeschaltet (HTTP 403).');
  if(code===404)throw Error('Gemini-TTS-Modell ist für dieses Projekt nicht verfügbar (HTTP 404).');
  if(code===429)throw Error('Kostenloses Gemini-TTS-Kontingent derzeit erreicht (HTTP 429).');
  if(code===503)throw Error('Gemini-TTS ist vorübergehend überlastet (HTTP 503).');
  throw Error('Gemini konnte keine Sprachdatei erzeugen (HTTP '+code+').');
 }
 const json=await response.json();
 // Official Interactions REST response: steps[].content[].data, audio type.
 const audios=(json?.steps||[]).filter(step=>step.type==='model_output')
  .flatMap(step=>step.content||[]).filter(part=>part.type==='audio'&&typeof part.data==='string');
 const encoded=audios[audios.length-1]?.data||json?.output_audio?.data;
 if(typeof encoded!=='string'||encoded.length<64||encoded.length>16*1024*1024)
  throw Error('Gemini hat keine gültige Audioantwort geliefert.');
 let bytes;
 try{bytes=Uint8Array.from(root.atob(encoded),char=>char.charCodeAt(0))}
 catch{throw Error('Gemini-Audio konnte nicht entschlüsselt werden.')}
 if(bytes.length<44||bytes[0]!==82||bytes[1]!==73||bytes[2]!==70||bytes[3]!==70)
  throw Error('Gemini-Audio hat kein gültiges WAV-Format.');
 return bytes;
}
root.MeviGeminiKey={save,remove,stored,isUnlocked,refresh,generate,dictate,transcribe,synthesize,native};
if(!native())void load();
})(window);
