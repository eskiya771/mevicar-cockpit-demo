/* MeviCar Next – one-shot voice intent entry for the shared Navi search.
   The user's own key is kept in Android Keystore or a device-bound Web store.
   With a saved key the app calls Gemini directly, no Synology or proxy. */
(function(root){
'use strict';
let overlay=null,recognizer=null,pending=null,abort=null,serial=0,busy=false,hearing=false;
let injectedProvider=null,clarification=null;
let speechSession=0,activeUtterance=null,speechWatchdog=null;
let ttsSeq=0,ttsAbort=null,ttsCtx=null,ttsSource=null,ttsWarmup=null;
let ttsCachedText='',ttsCachedBuffer=null,ttsCachedProvider='',ttsBusy=false;
let errorSpeech='';
let dialoguePhase='idle',voiceDialogue=false,autoFollowUps=0;
let routeStopPlan=null; // Ephemeral, one-time follow-up after a confirmed destination route.
let remainingStops=null; // At most two extra confirmed-search steps, never background requests.
let spokenDestination=null; // Only a finished spoken acknowledgement may hand off a clear goal.
let micMonitor=null;
const MAX_AUTO_FOLLOWUPS=4;
// Single bounded follow-up transition for device and WAV speech.
// Caller supplies its generation check; WAV may retain its audio context.
function queueVoiceFollowUp(automatic,stillCurrent,beforeListen=()=>{}){
 if(!automatic||!voiceDialogue)return false;
 if(autoFollowUps>=MAX_AUTO_FOLLOWUPS){
  status('Weitere Antwort: bitte 🎙 tippen.');
  return false;
 }
 if(dialoguePhase!=='clarification'&&dialoguePhase!=='confirmation')return false;
 autoFollowUps++;
 beforeListen();
 Promise.resolve().then(()=>{
  if(!stillCurrent()||!overlay||!voiceDialogue||hearing)return;
  if(!listen({automatic:true}))status('Für deine Antwort bitte 🎙 tippen.');
 });
 return true;
}
const safeText=v=>String(v||'').trim().slice(0,200);
const keySource=()=>root.MeviGeminiKey;
// One route-presence guard shared by Gemini interpretation and confirmation.
const hasPlannedRoute=()=>!!root.MeviGoogleNav?.hasPlannedRoute?.()||
 !!root.MeviGoogleNav?.guidanceDashboardData?.()?.routeActive;
const track=(stage,state,message)=>root.MeviNavDiagnostics?.record?.(stage,state,message);
/* A numbered result choice is a deterministic UI action, NOT an AI guess.
   Never call Gemini or resolve a place from a guessed index. */
function requestedResultNumber(value){
 const input=safeText(value).toLocaleLowerCase('de-DE')
  .replace(/[.!?,;:]+$/,'').replace(/\s+/g,' ').trim();
 if(!/^(?:nimm|nehme|wähl(?:e)?|waehle|such(?:e)?(?:\s+mir)?(?:\s+aus)?|fahr(?:e)?(?:\s+(?:bitte|direkt))?\s+(?:zu|zum|zur))\b/u.test(input))return 0;
 const words={erste:1,ersten:1,erstes:1,erster:1,zweite:2,zweiten:2,zweites:2,zweiter:2,
  dritte:3,dritten:3,drittes:3,dritter:3,vierte:4,vierten:4,vierter:4,
  fünfte:5,fünften:5,fuenfte:5,fuenften:5,sechste:6,sechsten:6,
  siebte:7,siebten:7,achte:8,achten:8,neunte:9,neunten:9,
  zehnte:10,zehnten:10,elfte:11,elften:11,zwölfte:12,zwölften:12};
 const matches=[];
 // Use explicit numbered phrases or ordinal adjectives. Do not treat any
 // other numeric value in an address as a result index.
 for(const match of input.matchAll(/\b(?:nummer|nr\.?|treffer|platz)\s*(\d{1,2})\b/gu))
  matches.push(Number(match[1]));
 const named={eins:1,zwei:2,drei:3,vier:4,'fünf':5,fuenf:5,sechs:6,sieben:7,acht:8,neun:9,zehn:10};
 for(const match of input.matchAll(/\b(?:nummer|nr\.?|treffer)\s*(eins|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zehn)\b/gu))
  matches.push(named[match[1]]);
 for(const match of input.matchAll(/\b(?:die|den|das|der)\s+(\d{1,2})\s*\./gu))
  matches.push(Number(match[1]));
 for(const match of input.matchAll(/\b(erste[nrs]?|zweite[nrs]?|dritte[nrs]?|vierte[nrs]?|fünfte[nrs]?|fuenfte[nrs]?|sechste[nrs]?|siebte[nrs]?|achte[nrs]?|neunte[nrs]?|zehnte[nrs]?|elfte[nrs]?|zwölfte[nrs]?)\b/gu))
  matches.push(words[match[1]]);
 const unique=[...new Set(matches)].filter(Number.isInteger);
 return unique.length===1&&unique[0]>=1&&unique[0]<=20?unique[0]:0;
}

/* Multi-step requests are deliberately narrow and never resolve actual Places.
   Google's existing route/POI search is the only component that can add a stop. */
const ROUTE_STOP_LABELS={
 fuel:{poiType:'fuel',query:'Tankstelle',plural:'Tankstellen'},
 charge:{poiType:'charge',query:'Ladestation',plural:'Ladestationen'},
 parking:{poiType:'parking',query:'Parkplatz',plural:'Parkplätze'},
 food:{poiType:'food',query:'Restaurant',plural:'Restaurants'},
 cafe:{poiType:'cafe',query:'Café',plural:'Cafés'},
 cart:{poiType:'cart',query:'Supermarkt',plural:'Supermärkte'},
 rest:{poiType:'rest',query:'Rastplatz',plural:'Rastplätze'},
 wrench:{poiType:'wrench',query:'Werkstatt',plural:'Werkstätten'},
 bar:{poiType:'bar',query:'Biergarten oder Kneipe',plural:'Biergärten oder Kneipen'}
};
function requestedStopArea(value){
 // Preserve the user's explicit city instead of silently searching the whole route.
 // Do not treat any other mention of a town as a fuel station location.
 const match=String(value||'').match(/\b(?:in\s+der\s+nähe\s+von|in\s+der\s+naehe\s+von|rund\s+um|bei)\s+([\p{L}][\p{L}\p{M}0-9 .-]{1,65}?)(?=\s+(?:tanken|nachtanken|aufladen|laden|parken|essen|suchen|anhalten|noch\s+tanken)\b|[.,!?]|$)/iu);
 return match?match[1].trim().replace(/[.,!?]+$/,'').slice(0,60):'';
}
function mentionedStop(value){
 const words=safeText(value).toLocaleLowerCase('de-DE');
 const near=requestedStopArea(value);
 const atDestination=/\b(?:dort|vor ort|am ziel(?:ort)?|beim ziel|im zielgebiet)\b/i.test(words);
 if(!/\b(?:auf dem weg|unterwegs|auf (?:der|meiner) route|zwischenstopp|noch|in der nähe|in der naehe|rund um|bei)\b/i.test(words)&&!atDestination)
  return null;
 let stop=null;
 if(/\b(?:tanken|nachtanken|tankstelle(?:n)?|sprit)\b/i.test(words))stop=ROUTE_STOP_LABELS.fuel;
 else if(/\b(?:laden|aufladen|ladesäule|ladestation(?:en)?)\b/i.test(words))stop=ROUTE_STOP_LABELS.charge;
 else if(/\b(?:parken|parkplatz|parkhaus|parkgarage)\b/i.test(words))stop=ROUTE_STOP_LABELS.parking;
 else if(/\b(?:essen|restaurant|imbiss)\b/i.test(words))stop=ROUTE_STOP_LABELS.food;
 return stop?{...stop,...(near?{near}:{}),...(atDestination?{scope:'destination'}:{})}:null;
}
function combinedTrip(value){
 const text=safeText(value);
 const direct=text.match(/^(?:bitte\s+)?(?:fahre|fahr|navigiere|bring(?:e)?\s+mich)\s+(?:mich\s+)?(?:nach|zu|zum|zur|in)\s+(.+?)\s*(?:,|\bund\b|\baber\b)\s+(.+)$/i);
 const natural=text.match(/^(?:ich\s+)?(?:möchte|will|würde\s+gern(?:e)?)\s+(?:gerne\s+)?(?:nach|zu|zum|zur|in)\s+(.+?)\s+(?:fahren|navigieren)\s*(?:,|\bund\b|\baber\b)\s+(.+)$/i);
 const naturalEllipsis=text.match(/^(?:ich\s+)?(?:möchte|will|würde\s+gern(?:e)?)\s+(?:gerne\s+)?(?:nach|zu|zum|zur|in)\s+(.+?)\s+(?:und|aber)\s+(.+)$/i);
 const match=direct||natural||naturalEllipsis;
 if(!match)return null;
 const destination=match[1].trim().replace(/^(.+?)\s+in\s+die\s+(innenstadt|altstadt|city)$/i,'$1 $2');
 const stop=mentionedStop(match[2]);
 return stop&&destination.length>=2&&destination.length<=100?{destination,stop}:null;
}
function stopDescription(stop){
 return (stop.placeName||stop.plural)+(stop.near?' bei '+stop.near:stop.scope==='destination'?' am Ziel':'');
}
function multiStopConfirmation(destination,stops){
 return safeText('Nach '+destination+' fahren und nacheinander '+stops.map(stopDescription).join(', ')+' suchen?');
}
function stopConfirmation(destination,stop){
 const named=!!stop.placeName;
 const what=named?stop.placeName:stop.plural;
 const where=stop.scope==='destination'?' am Ziel':
  stop.near?' in der Nähe von '+stop.near+' entlang der Route':' entlang der Route';
 return safeText('Soll ich nach '+destination+' suchen und danach '+
  what+where+(named?' suchen':' anzeigen')+'?');
}
function normalizedPlace(value){
 return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('de-DE').replace(/[^a-z0-9]+/g,' ').trim();
}
/* Google Places resolves the real destination after the user chooses a hit.
   Tie the pending stop to its stable Place ID or validated coordinates:
   a speech transcript like "Lauteken" may resolve to "Lauterecken". */
function selectedPlaceKey(place){
 if(!place||typeof place!=='object')return '';
 const id=String(place.placeId||'').trim();
 if(id)return 'place:'+id;
 const lat=Number(place.lat),lng=Number(place.lng);
 if(Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180)
  return 'coordinates:'+lat.toFixed(5)+','+lng.toFixed(5);
 return '';
}
// A pending follow-up is valid for five minutes. Both Google Places
// selection and route completion must enforce the same expiration rule.
function currentRouteStopPlan(){
 const plan=routeStopPlan;
 if(plan&&Date.now()>plan.expires){routeStopPlan=null;return null}
 return plan;
}
function onDestinationSelected(context){
 if(remainingStops){remainingStops=null;}
 const plan=currentRouteStopPlan();
 if(plan)track('places','ok','Google-Places-Ziel ausgewählt');
 if(!plan)return false;
 const key=selectedPlaceKey(context?.destination);
 if(!key)return false;
 // Do not retarget the pending stop after the user changes destinations.
 if(plan.selectedKey&&plan.selectedKey!==key){routeStopPlan=null;return false}
 plan.selectedKey=key;
 return true;
}
/* Called only AFTER the shared navigation has computed a route successfully.
   The actual destination must match the user's confirmed, selected Place. */
function onRouteReady(context){
 const plan=currentRouteStopPlan();
 if(plan)track('route',context?.hasRoute?'ok':'error',
  context?.hasRoute?'Route bereit für Zusatzsuche':'Route noch nicht verfügbar');
 if(!plan)return false;
 if(!context?.hasRoute)return false;
 const destination=context.destination||{};
 const selected=normalizedPlace([destination.name,destination.address].filter(Boolean).join(' '));
 const wanted=normalizedPlace(plan.destination);
 const key=selectedPlaceKey(destination);
 const matches=plan.selectedKey?
  !!key&&key===plan.selectedKey:
  !!selected&&!!wanted&&(selected.includes(wanted)||wanted.includes(selected));
 if(!matches){
  routeStopPlan=null;return false;
 }
 routeStopPlan=null; // Single use; never initiate a search on later reroutes.
 const api=root.MeviWebNavParity;
 if(typeof api?.openStopSearch!=='function'||typeof api?.poi!=='function')return false;
 if(plan.more?.length){
  if(!key||!Number.isInteger(context.revision)||!Array.isArray(context.stops)||context.stops.length+1+plan.more.length>(context.maxStops||8))return false;
  remainingStops={items:plan.more.slice(),key,revision:context.revision,count:context.stops.length,expires:plan.expires,waiting:true};
 }
 if(plan.stop.scope==='destination'){
  // "Dort parken" belongs at the selected destination, not at the current
  // GPS position or a random waypoint along the way. The user can select
  // a car park as the final destination using the existing Places UI.
  api.open({gemini:true});
  api.poi(plan.stop.poiType,plan.stop.query,'','destination',!!plan.stop.placeName);
 }else{
  api.openStopSearch({gemini:true,...(plan.more?.length?{preserveOrder:true}:{})});
  if(plan.stop.poiType==='address')api.input(plan.stop.query);
  else api.poi(plan.stop.poiType,plan.stop.query,plan.stop.near||'','route',!!plan.stop.placeName);
 }
 // The Places selection itself still requires user action; no auto-waypoint.
 return true;
}
// Only a committed stop unlocks the next search. Every subsequent search
// needs a new user confirmation; no automatic paid Places calls.
function onStopSearchCancelled(){remainingStops=null;}
function onStopCommitted(before,after){
 const p=remainingStops;
 if(!p)return false;
 if(Date.now()>p.expires||!p.waiting||before?.revision!==p.revision||
    selectedPlaceKey(before.destination)!==p.key||selectedPlaceKey(after?.destination)!==p.key||
    !after?.hasRoute||!Array.isArray(after.stops)||after.stops.length!==p.count+1||!Number.isInteger(after.revision)){
  remainingStops=null;return false;
 }
 p.revision=after.revision;p.count=after.stops.length;p.waiting=false;
 if(!overlay)offerNextStop();
 return true;
}
function offerNextStop(){
 const p=remainingStops;
 if(!p||p.waiting||!p.items.length||Date.now()>p.expires){remainingStops=null;return false}
 const ctx=root.MeviGoogleNav?.routeContext?.();
 if(!ctx?.hasRoute||ctx.revision!==p.revision||selectedPlaceKey(ctx.destination)!==p.key||ctx.stops?.length!==p.count){remainingStops=null;return false}
 if(!overlay)open();
 if(busy)return false;
 const message='Nächsten geplanten Zwischenstopp suchen: '+stopDescription(p.items[0])+'?';
 pending={intent:'next_stop_confirm',revision:p.revision};dialoguePhase='confirmation';
 answer(message);status('Weitere Suche erst nach Bestätigung');updateButton();
 speakFreeFollowUp(message,false);
 return true;
}
const PREFERENCES='mevicar-next-voice-providers-v1';
const VOICE_OPTIONS={stt:['auto','groq','google'],ai:['google','groq'],tts:['local','piper','piper-book','google','groq','grok']};
function getProvider(kind){
 const freePiperWeb=!keySource()?.native?.()&&/iPhone|iPad|iPod|Windows/i.test(root.navigator?.userAgent||'');
 const defaults={stt:'auto',ai:'google',tts:freePiperWeb?'piper':'local'};
 if(!VOICE_OPTIONS[kind])return '';
 if(keySource()?.native?.())return kind==='stt'?'google':defaults[kind];
 try{
  const record=JSON.parse(root.localStorage?.getItem(PREFERENCES)||'{}');
  return VOICE_OPTIONS[kind].includes(record?.[kind])?record[kind]:defaults[kind];
 }catch{return defaults[kind]}
}
function setProviderChoice(kind,value){
 if(!VOICE_OPTIONS[kind]?.includes(value))throw Error('Unbekannter Sprachanbieter.');
 if(keySource()?.native?.()&&['groq','grok','piper','piper-book'].includes(value))
  throw Error('Dieser Sprachanbieter ist in der Android-APK noch nicht verfügbar.');
 const current={stt:getProvider('stt'),ai:getProvider('ai'),tts:getProvider('tts')};
 current[kind]=value;
 root.localStorage?.setItem(PREFERENCES,JSON.stringify(current));
 if(kind==='tts'){stopSpeech();stopCloudSpeech()}
 if(overlay)updateButton();
 return true;
}
const configured=()=>getProvider('ai')==='groq'?
 !!root.MeviGroqSpeech?.stored?.():!!keySource()?.stored?.();
const ready=()=>getProvider('ai')==='groq'?configured():
 configured()&&!!keySource()?.isUnlocked?.();
const providerName=()=>getProvider('ai')==='groq'?'Groq':'Gemini';
function dialog(){
 const el=document.createElement('div');
 el.className='mg-gemini-backdrop';
 el.id='mg-gemini-voice';
 el.innerHTML='<div id="mg-voice-frame" class="mg-voice-frame" aria-hidden="true" hidden>'+
  '<span class="mg-voice-wave"></span><span class="mg-voice-wave"></span></div>'+
  '<section class="mg-gemini-dialog" role="dialog" aria-modal="true" aria-label="KI Sprach-Zielsuche">'+
  '<header><div><strong>KI · Navi-Assistent</strong><small id="mg-gemini-mode"></small></div>'+
  '<button type="button" class="mg-gemini-close" aria-label="Schließen" onclick="MeviGeminiVoice.close()">×</button></header>'+
  '<p class="mg-gemini-help">Zum Beispiel: „Fahr nach Erlangen und unterwegs tanken“. MeviCar fragt nach und öffnet erst nach der Routenberechnung passende Zwischenstopps.</p>'+
  '<label for="mg-gemini-input">Dein Wunsch · per Sprache automatisch, per Tastatur mit Enter</label>'+
  '<div class="mg-gemini-inputrow"><textarea id="mg-gemini-input" maxlength="400" rows="2" enterkeyhint="go" spellcheck="false" placeholder="Ziel, Zwischenstopp oder POI frei beschreiben"></textarea>'+
  '<button type="button" class="mg-gemini-mic" id="mg-gemini-mic" onclick="MeviGeminiVoice.listen()" aria-label="Spracheingabe starten">🎙</button></div>'+
  '<div class="mg-gemini-spoken" id="mg-gemini-spoken" role="status" aria-live="polite" hidden><span>Du hast gesagt:</span> <strong id="mg-gemini-spoken-text"></strong></div>'+
  '<div class="mg-gemini-controls"><button type="button" id="mg-gemini-accept" hidden onclick="MeviGeminiVoice.accept()">In Navi suchen</button></div>'+
  '<div class="mg-gemini-status-row"><div class="mg-gemini-status" id="mg-gemini-status" role="status" aria-live="polite">Bereit. Mikrofon oder Tastatur verwenden.</div>'+
  '<button type="button" class="mg-gemini-error-replay" id="mg-gemini-error-replay" hidden onclick="MeviGeminiVoice.replayError()" aria-label="Fehlermeldung erneut vorlesen" title="Fehlermeldung vorlesen">🔊 Fehler</button></div>'+
  '<div class="mg-gemini-answer-row" id="mg-gemini-answer-row" hidden><p class="mg-gemini-answer" id="mg-gemini-answer"></p>'+
  '<button type="button" class="mg-gemini-replay" id="mg-gemini-replay" onclick="MeviGeminiVoice.replay()" aria-label="Antwort erneut vorlesen" title="Antwort erneut vorlesen">'+
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg></button>'+
  '<button type="button" class="mg-gemini-tone-test" id="mg-gemini-tone-test" onclick="MeviGeminiVoice.testTone()" aria-label="Audioausgabe mit Testton prüfen" title="Prüfen, ob Ton hörbar ist">Testton</button>'+
  '<button type="button" class="mg-gemini-tone-test" id="mg-gemini-voice-test" onclick="MeviGeminiVoice.testVoice()" aria-label="Gewählte Stimme zum Testen vorlesen" title="Sprachtest mit gewähltem Anbieter">Sprachtest</button></div>'+
  '<small class="mg-gemini-audio-status" id="mg-gemini-audio-status" role="status" aria-live="polite" hidden></small>'+
  '<details class="mg-gemini-diagnostics" ontoggle="MeviGeminiVoice.refreshDiagnostics()"><summary>Ablaufdiagnose (lokal)</summary><pre id="mg-gemini-diagnostics-text"></pre></details>'+
  '<small class="mg-gemini-privacy">Kein dauerndes Zuhören. Eindeutige Ziele öffnen direkt die Navigation, unklare Treffer musst du auswählen.</small>'+
  '</section>';
 el.addEventListener('click',e=>{if(e.target===el)close()});
 // If the user edits the recognized words, avoid showing a stale transcript.
 el.addEventListener('input',e=>{
  if(e.target?.id==='mg-gemini-input'){
   clearSpokenText();
   // Editing is a new, deliberate typed request. Never auto-open its mic.
   voiceDialogue=false;
  }
 });
 // Voice results are interpreted automatically. For manually typed wishes,
 // Enter replaces the removed "Verstehen" button (Shift+Enter = newline).
 el.addEventListener('keydown',e=>{
  if(e.target?.id==='mg-gemini-input'&&e.key==='Enter'&&!e.shiftKey&&
     !e.isComposing&&e.keyCode!==229){
   e.preventDefault();void send();
  }
 });
 return el;
}
function part(id){return overlay?.querySelector('#'+id)||null}
function refreshDiagnostics(){
 const panel=part('mg-gemini-diagnostics-text');
 if(panel)panel.textContent=root.MeviNavDiagnostics?.text?.()||'Noch keine Diagnose verfügbar.';
}
function status(value){
 const e=part('mg-gemini-status');if(e){e.textContent=String(value||'');e.hidden=!e.textContent.trim();}
 errorSpeech='';
 const replayButton=part('mg-gemini-error-replay');
 if(replayButton)replayButton.hidden=true;
}
function audioStatus(value){
 const element=part('mg-gemini-audio-status');
 if(!element)return;
 element.textContent=String(value||'');
 element.hidden=!value;
}
function answer(value){
 const content=String(value||'');
 const e=part('mg-gemini-answer'),row=part('mg-gemini-answer-row');
 // Keep the AudioContext unlocked by the "Verstehen" tap while Gemini
 // returns its new answer. Invalidate only stale audio/buffers.
 if(e&&e.textContent!==content&&(ttsBusy||ttsSource||ttsCachedText))stopCloudSpeech();
 if(e)e.textContent=content;
 if(row)row.hidden=!content.trim();
 if(!content)audioStatus('');
}
function clearSpokenText(){
 const row=part('mg-gemini-spoken'),value=part('mg-gemini-spoken-text');
 if(value)value.textContent='';
 if(row)row.hidden=true;
}
function showSpokenText(words){
 const text=safeText(words),row=part('mg-gemini-spoken'),
  value=part('mg-gemini-spoken-text');
 if(!text||!row||!value)return false;
 value.textContent=text;
 row.hidden=false;
 return true;
}
// A null level switches the frame off. Zero still shows the listening pulse.
function captureLevel(level){
 const frame=part('mg-voice-frame');
 if(!frame)return;
 frame.hidden=level===null;
 if(level!==null)frame.style?.setProperty('--voice-energy',level.toFixed(2));
}
function updateButton(){
 const mic=part('mg-gemini-mic');
 if(mic){
  const nativeTurn=hearing&&keySource()?.native?.();
  mic.disabled=busy||nativeTurn;
  mic.textContent=hearing&&!nativeTurn?'■':'🎙';
  mic.setAttribute('aria-label',nativeTurn?'Spracheingabe läuft':hearing?'Spracheingabe beenden':'Spracheingabe starten');
 }
 const accept=part('mg-gemini-accept');
 if(accept){
  accept.hidden=!pending||busy;
  const directAddress=pending?.intent==='destination'&&
   root.MeviGoogleNav?.exactAddressParts?.(pending.query)&&!keySource()?.native?.();
  const poiLabel=pending?.afterRoute?.scope==='destination'?
   pending.afterRoute.plural+' am Ziel danach':
   pending?.afterRoute?'Stopps danach':'';
  accept.textContent=pending?.intent==='compare_poi_confirm'?'Umwege vergleichen':pending?.intent==='next_stop_confirm'?'Nächsten Stopp suchen':pending?.intent==='route_edit_confirm'?'Bestätigen':pending?.intent==='traffic_confirm'?'Alternative übernehmen':directAddress?
   pending?.afterRoute?'Adresse übernehmen · '+poiLabel:'Adresse übernehmen · Route berechnen':
   pending?.afterRoute?'Ziel auswählen · '+poiLabel:'In Navi suchen';
 }
 const mode=part('mg-gemini-mode');if(mode)mode.textContent=ready()?providerName()+' bereit · direkter Gerätezugriff':
  configured()?providerName()+'-Key gespeichert · wird geladen':'Lokaler Testmodus · '+providerName()+'-Key fehlt';
}
function open(options={}){
 if(overlay)return true;
 root.MeviWebNavParity?.hideSearchKeyboard?.();
 overlay=dialog();document.body.appendChild(overlay);
 // Hide the native sibling map; CSS stacking alone cannot cover it on Android.
 root.MeviGoogleNav?.syncNativeLayout?.();
 pending=null;clarification=null;hearing=false;busy=false;
 dialoguePhase='idle';voiceDialogue=false;autoFollowUps=0;errorSpeech='';
 updateButton();
 // Voice-first entry must not open the iPhone keyboard before mic permission.
 if(!options.voice)part('mg-gemini-input')?.focus?.({preventScroll:true});
 if(keySource()?.refresh){
  const android=!!keySource().native?.();
  void keySource().refresh().then(()=>{
   if(overlay)updateButton();
  }).catch(()=>{
   if(overlay&&android)status('Android Gemini-Key-Status konnte nicht geprüft werden. APK eventuell veraltet.');
  });
 }
 return true;
}
/* Called directly by a user tap in the Navi UI: request the microphone
   synchronously with that gesture, without a second click or keyboard focus. */
function start(){
 if(!overlay)open({voice:true});
 if(hearing||busy)return true;
 return listen();
}
function stopMicMonitor(){
 if(!micMonitor)return;
 root.clearInterval?.(micMonitor.timer);
 try{micMonitor.source?.disconnect?.()}catch{}
 micMonitor=null;
}
function stopRecognition(){
 stopMicMonitor();
 if(hearing&&!keySource()?.native?.())selectAudioSession('playback');
 captureLevel(null);
 hearing=false;
 const last=recognizer;recognizer=null;
 try{if(last?.state==='recording')last.stop();else last?.abort?.()}catch{}
 updateButton();
}
/* WebKit can retain microphone/ambient routing after the recorder stops.
 * On iPhone PWAs this can make speechSynthesis report 'end' in silence.
 * Reassert the playback audio category when speaking or playing a test tone. */
function selectAudioSession(mode){
 const session=root.navigator?.audioSession;
 if(!session)return false;
 try{
  if(mode==='playback'){
   // Re-assert a genuinely changed category to heal stale Safari sessions.
   if(session.type==='playback')session.type='auto';
   session.type='playback';
   return session.type==='playback';
  }
  if(mode==='record'){
   session.type='play-and-record';
   return session.type==='play-and-record';
  }
 }catch{}
 return false;
}
function releaseSpeechAudioContext(){
 // The VAD's idle oscillator should not contend with iOS device speech.
 try{ttsWarmup?.stop?.()}catch{}
 ttsWarmup=null;
 const context=ttsCtx;ttsCtx=null;
 try{void context?.close?.()?.catch?.(()=>{})}catch{}
}
// One cancellation path for iPhone speech start/end/error and explicit stop.
function clearSpeechWatchdog(){
 if(speechWatchdog!==null){clearTimeout(speechWatchdog);speechWatchdog=null}
}
function stopSpeech(){
 speechSession++;
 clearSpeechWatchdog();
 activeUtterance=null;
 if(keySource()?.native?.())void keySource()?.stopNativeSpeech?.()?.catch?.(()=>{});
 try{root.speechSynthesis?.cancel?.()}catch{}
}
function close(){
 if(pending?.intent==='next_stop_confirm')remainingStops=null;
 serial++;abort?.abort?.();abort=null;stopRecognition();
 stopSpeech();stopCloudSpeech();
 const wasOpen=!!overlay;
 overlay?.remove();overlay=null;pending=null;clarification=null;busy=false;spokenDestination=null;
 // Recompute current layout instead of restoring a potentially stale map rectangle.
 if(wasOpen)root.MeviGoogleNav?.syncNativeLayout?.();
 dialoguePhase='idle';voiceDialogue=false;autoFollowUps=0;errorSpeech='';
}
function speak(value,manual=false,automatic=false){
 if(keySource()?.native?.()){
  const text=String(value||'').trim().slice(0,230);
  if(!text||!keySource()?.speakNative)return false;
  const id=++speechSession;
  audioStatus('Android-Sprachausgabe …');
  void keySource().speakNative(text).then(()=>{
   if(id!==speechSession||!overlay)return;
   audioStatus('Android meldet: Vorlesen beendet.');
   if(finishSpokenDestination())return;
   queueVoiceFollowUp(automatic,()=>id===speechSession);
  }).catch(error=>{
   if(id!==speechSession||!overlay)return;
   audioStatus('Android-Sprachausgabe: '+safeText(error?.message||'nicht verfügbar')+'. Bitte deutsche TTS-Stimme und Medienlautstärke prüfen.');
  });
  return true;
 }
 const synth=root.speechSynthesis;
 if(!synth||!root.SpeechSynthesisUtterance){
  if(manual)audioStatus('Die iPhone-Sprachausgabe ist hier nicht verfügbar.');
  return false;
 }
 const text=String(value||'').trim().slice(0,230);
 if(!text)return false;
 const id=++speechSession;
 clearSpeechWatchdog();
 // Avoid cancelling an idle speech queue. On iOS, cancel+immediate speak
 // sometimes results in silence. Replay is called directly by user gesture.
 try{
  selectAudioSession('playback');
  if(synth.speaking||synth.pending)synth.cancel();
  if(synth.paused)synth.resume?.();
  const utterance=new root.SpeechSynthesisUtterance(text);
  activeUtterance=utterance; // Hold an explicit reference for iOS Safari.
  utterance.lang='de-DE';utterance.rate=1;utterance.pitch=1;utterance.volume=1;
  const voices=synth.getVoices?.()||[];
  const german=voices.find(v=>v.lang?.toLowerCase()==='de-de')||
   voices.find(v=>v.lang?.toLowerCase().startsWith('de'));
  if(german)utterance.voice=german;
  let began=false;
  utterance.onstart=()=>{
   if(id!==speechSession||!overlay)return;
   began=true;
   clearSpeechWatchdog();
   if(manual)audioStatus('iPhone meldet: Vorlesen gestartet. Kein Ton? Bitte Testton ausprobieren.');
  };
  utterance.onend=()=>{
   if(id!==speechSession||!overlay)return;
   clearSpeechWatchdog();
   activeUtterance=null;
   // Some WebKit voices emit "end" without ever reporting "start".
   // That is not evidence of a spoken acknowledgement: do not silently
   // open Places until the user can retry the answer or explicitly confirm.
   if(!began){
    spokenDestination=null;
    audioStatus('Kein Sprachstart gemeldet. Bitte 🔊 erneut tippen oder mit Ja bestätigen.');
    return;
   }
   if(finishSpokenDestination())return;
   if(manual||automatic)audioStatus('iPhone meldet: Vorlesen beendet. Ob Ton hörbar war, kann die App nicht prüfen. Bei Stille: Testton oder anderen TTS-Anbieter wählen.');
    queueVoiceFollowUp(automatic,()=>id===speechSession);
  };
  utterance.onerror=event=>{
   if(id!==speechSession||!overlay)return;
   clearSpeechWatchdog();
   activeUtterance=null;
   spokenDestination=null;
   if(manual||automatic)audioStatus('Geräte-Sprachausgabe fehlgeschlagen ('+
    safeText(event?.error||'unbekannter Fehler')+'). Anderen Anbieter unter Settings → Zugänge wählen.');
  };
  if(manual)audioStatus('iPhone-Vorlesen wird gestartet …');
  synth.speak(utterance);
  if(manual){
   speechWatchdog=setTimeout(()=>{
    if(id===speechSession&&overlay&&!began)
     audioStatus('Das iPhone hat Vorlesen nicht gestartet. Bitte Testton und Lautstärke prüfen.');
    speechWatchdog=null;
   },2500);
  }
  return true;
 }catch{
  activeUtterance=null;
  if(manual)audioStatus('Vorlesen nicht möglich. Bitte Testton und Audioausgabe prüfen.');
  return false;
 }
}
/* Cancel a pending TTS request and any Web Audio output. Keep the
   decoded buffer only when restarting the *same* answer on another tap. */
function stopCloudSpeech(clearCache=true){
 ttsSeq++;
 ttsAbort?.abort?.();ttsAbort=null;
 try{ttsWarmup?.stop?.()}catch{}
 ttsWarmup=null;
 try{ttsSource?.stop?.()}catch{}
 ttsSource=null;
 const previous=ttsCtx;ttsCtx=null;
 try{if(previous)void previous.close?.()?.catch?.(()=>{})}catch{}
 ttsBusy=false;
 const button=part('mg-gemini-replay');
 if(button)button.disabled=false;
 if(clearCache){ttsCachedText='';ttsCachedBuffer=null;ttsCachedProvider=''}
}
/* iOS requires audio to be unlocked by a direct touch, not after awaiting
   the slow Gemini interpretation request. Prime Web Audio synchronously from
   the "Verstehen" tap and keep a nearly silent source running while Gemini
   prepares its reply. This does not request TTS or emit an audible tone. */
function holdSpeechContext(context){
 if(ttsWarmup||!context)return;
 try{
  const oscillator=context.createOscillator(),gain=context.createGain();
  gain.gain.setValueAtTime(0.00001,context.currentTime);
  oscillator.connect(gain);gain.connect(context.destination);
  oscillator.start(context.currentTime);
  ttsWarmup=oscillator;
 }catch{}
}
function prepareAutoSpeech(){
 const vault=keySource(),Audio=root.AudioContext||root.webkitAudioContext;
 if(!overlay||injectedProvider||vault?.native?.()||!Audio)return false;
 stopCloudSpeech(false);
 let context;
 try{
  context=new Audio();
  ttsCtx=context;
  const resume=context.resume?.();
  resume?.catch?.(()=>{
   if(ttsCtx===context)audioStatus('Audiofreigabe fehlgeschlagen. Bitte 🔊 tippen.');
  });
  // Keeps Safari's user-authorized audio session alive between speech and
  // microphone follow-ups without emitting a perceptible sound.
  holdSpeechContext(context);
  return true;
 }catch{
  stopCloudSpeech(false);
  return false;
 }
}
function playCloudSpeech(words,automatic=false){
 const phrase=String(words||'').trim();
 if(!phrase||!overlay||ttsBusy)return false;
 const serviceName=getProvider('tts');
 if(serviceName==='local'){
  // Release the microphone monitor's silent Web Audio session before TTS.
  stopCloudSpeech(false);
  return speak(phrase,!automatic,automatic);
 }
 const service=serviceName==='piper'?root.MeviPiperTTS:
  serviceName==='piper-book'?root.MeviPiperAudiobookTTS:
  serviceName==='grok'?root.MeviGrokTTS:serviceName==='groq'?root.MeviGroqSpeech:keySource();
 const Audio=root.AudioContext||root.webkitAudioContext;
 if(!Audio){audioStatus('Web Audio ist nicht verfügbar.');return false}
 if(!service?.synthesize){
  audioStatus('Gewählter TTS-Dienst nicht geladen. Bitte aktualisieren.');
  return false;
 }
 let context=automatic?ttsCtx:null;
 if(!context){
  // A manual tap unlocks a new context, if the automatic session wasn't
  // available or the user wants to replay after an audio session ended.
  stopCloudSpeech(false);
  try{
   context=new Audio();
   ttsCtx=context;
   const resumed=context.resume?.();
   resumed?.catch?.(()=>{
    if(ttsCtx===context)audioStatus('iPhone blockiert Audio. Bitte 🔊 erneut tippen.');
   });
  }catch{
   audioStatus('iPhone-Audio konnte nicht gestartet werden.');
   return false;
  }
 }
 const id=ttsSeq,controller=new AbortController();
 ttsAbort=controller;ttsBusy=true;
 const button=part('mg-gemini-replay');if(button)button.disabled=true;
 const cached=ttsCachedText===phrase&&ttsCachedProvider===serviceName?ttsCachedBuffer:null;
 audioStatus(cached?'Sprachausgabe wird erneut abgespielt …':
  (serviceName==='piper-book'?'Piper Hörbuch (gratis, offline)':serviceName==='piper'?'Piper (gratis, offline)':serviceName==='grok'?'Grok':serviceName==='groq'?'Groq':'Gemini')+' erzeugt die Sprachantwort …');
 void (async()=>{
  let started=false,warningStarted=false;
  try{
   let buffer=cached;
   if(!buffer){
    const wav=await service.synthesize(phrase,controller.signal,notice=>audioStatus(notice));
    if(id!==ttsSeq||!overlay)return;
    buffer=await context.decodeAudioData(
     wav.buffer.slice(wav.byteOffset,wav.byteOffset+wav.byteLength));
    if(id!==ttsSeq||!overlay)return;
    ttsCachedText=phrase;ttsCachedProvider=serviceName;ttsCachedBuffer=buffer;
   }
   if(context.state==='suspended')await context.resume();
   if(id!==ttsSeq||!overlay)return;
   const source=context.createBufferSource();
   source.buffer=buffer;source.connect(context.destination);
   ttsSource=source;
   source.onended=()=>{
    if(id!==ttsSeq||!overlay)return;
    audioStatus('Sprachausgabe beendet.');
    ttsSource=null;ttsBusy=false;ttsAbort=null;
    const btn=part('mg-gemini-replay');if(btn)btn.disabled=false;
    if(finishSpokenDestination())return;
    if(!queueVoiceFollowUp(automatic,()=>id===ttsSeq,
       ()=>holdSpeechContext(context))){
     if(voiceDialogue&&!automatic&&autoFollowUps>=MAX_AUTO_FOLLOWUPS)
      status('Weitere Antwort: bitte 🎙 tippen.');
     void context.close?.()?.catch?.(()=>{});
     if(ttsCtx===context)ttsCtx=null;
    }
   };
   // Start real audio first, then stop the inaudible unlock oscillator.
   selectAudioSession('playback');
   source.start(0);started=true;
   try{ttsWarmup?.stop?.()}catch{}
   ttsWarmup=null;
   audioStatus((serviceName==='piper-book'?'Piper Hörbuch':serviceName==='piper'?'Piper':serviceName==='grok'?'Grok':serviceName==='groq'?'Groq':'Gemini')+'-Stimme wird abgespielt …');
  }catch(error){
   spokenDestination=null;
   if(id===ttsSeq&&overlay){
    const isErrorReadout=!!errorSpeech&&errorSpeech===phrase;
    audioStatus(isErrorReadout?
     'Fehler ist sichtbar, aber die Sprachansage ist nicht verfügbar.':
     'Vorlesen fehlgeschlagen: '+
      safeText(error?.message||'Unbekannter Audiofehler')+
      (automatic?' · Bitte 🔊 erneut tippen.':''));
    // Cloud quota/network errors fall back once to local German speech.
    releaseSpeechAudioContext();
    if(serviceName==='piper'||serviceName==='piper-book'){
     audioStatus('Piper konnte nicht vorlesen: '+safeText(error?.message||'Unbekannter Fehler')+
      ' · Bitte Web-Version/Download prüfen. Kein kostenpflichtiger TTS-Aufruf.');
     if(isErrorReadout)warningStarted=errorTone();
    }else if(speak(phrase,false,automatic))
     audioStatus('Cloud-TTS nicht verfügbar ('+(serviceName==='grok'?'Grok':serviceName==='groq'?'Groq':'Gemini')+'). Die lokale Stimme wird versucht.');
    else if(isErrorReadout)warningStarted=errorTone(); // Never request another TTS file.
   }
  }finally{
   if(!started&&id===ttsSeq){
    try{ttsWarmup?.stop?.()}catch{}
    ttsWarmup=null;
    ttsBusy=false;ttsAbort=null;
    const btn=part('mg-gemini-replay');if(btn)btn.disabled=false;
    // The local warning tone must finish before the audio context is closed.
    if(!warningStarted){
     try{void context.close?.()?.catch?.(()=>{})}catch{}
     if(ttsCtx===context)ttsCtx=null;
    }
   }
  }
 })();
 return true;
}
/* Manual replay uses the exact same decoded Web Audio buffer as the
   automatic response. It only calls Gemini when no cached buffer exists. */
function replay(){
 const words=part('mg-gemini-answer')?.textContent?.trim();
 if(!words||!overlay)return false;
 if(hearing){audioStatus('Erst die Spracheingabe beenden, dann 🔊 drücken.');return false}
 return playCloudSpeech(words,false);
}
/* A spoken error is an explicit, one-shot message. It is never routed
   back into Gemini's intent model, and TTS failure must not recursively
   request TTS again (especially when the user's free quota is exhausted). */
function errorTone(){
 if(!overlay)return false;
 const Audio=root.AudioContext||root.webkitAudioContext;
 if(!Audio)return false;
 try{
  const context=ttsCtx||new Audio(),t=context.currentTime;
  const tone=context.createOscillator(),volume=context.createGain();
  tone.type='sine';tone.frequency.value=420;
  tone.connect(volume);volume.connect(context.destination);
  volume.gain.setValueAtTime(0.0001,t);
  volume.gain.exponentialRampToValueAtTime(0.1,t+0.03);
  volume.gain.exponentialRampToValueAtTime(0.0001,t+0.22);
  const ready=context.resume?.();
  ready?.catch?.(()=>{});
  tone.onended=()=>{
   if(ttsCtx===context)ttsCtx=null;
   void context.close?.()?.catch?.(()=>{});
  };
  tone.start(t);tone.stop(t+0.23);
  return true;
 }catch{return false}
}
function showError(message,spoken=message){
 if(!overlay)return false;
 const details=safeText(message),phrase=safeText(spoken)||details;
 if(!details)return false;
 voiceDialogue=false; // No automatic microphone loop while the service fails.
 dialoguePhase='idle';
 status(details);
 errorSpeech=phrase;
 const replayButton=part('mg-gemini-error-replay');
 if(replayButton)replayButton.hidden=false;
 // Preserve the already unlocked audio session of the user's mic tap. The
 // existing Gemini WAV engine can read the error even when WebKit TTS is mute.
 if(ttsBusy)stopCloudSpeech();
 if(!playCloudSpeech(phrase,true)){
  errorTone();
  audioStatus('Fehlermeldung angezeigt. Tippe auf 🔊 Fehler zum erneuten Vorlesen.');
 }
 return true;
}
function replayError(){
 if(!overlay||!errorSpeech)return false;
 if(ttsBusy)return false;
 return playCloudSpeech(errorSpeech,false);
}
/* Local Web Audio tone differentiates mute/output trouble from iOS TTS
   errors. No additional Gemini request or external audio dependencies. */
function testTone(){
 if(!overlay)return false;
 selectAudioSession('playback');
 const Audio=root.AudioContext||root.webkitAudioContext;
 if(!Audio){audioStatus('Web Audio nicht verfügbar. Bitte Lautstärke und Bluetooth prüfen.');return false}
 try{
  const context=new Audio();
  const oscillator=context.createOscillator(),gain=context.createGain(),now=context.currentTime;
  oscillator.type='sine';oscillator.frequency.value=620;
  oscillator.connect(gain);gain.connect(context.destination);
  gain.gain.setValueAtTime(0.0001,now);
  gain.gain.exponentialRampToValueAtTime(0.13,now+0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001,now+0.38);
  oscillator.onended=()=>{void context.close?.()};
  // Start synchronously with the tap so Safari can grant playback.
  const resume=context.resume?.();
  resume?.catch?.(()=>audioStatus('Audioausgabe wurde vom iPhone blockiert.'));
  oscillator.start(now);oscillator.stop(now+0.4);
  audioStatus('Testton ausgelöst. Kein Ton? Medienlautstärke, Lautlosmodus und Bluetooth/AirPlay prüfen.');
  return true;
 }catch{
  audioStatus('Testton konnte nicht abgespielt werden. Bitte Audioausgabe prüfen.');
  return false;
 }
}
/* One-tap speech sample without invoking Gemini/Groq intent interpretation. */
function testVoice(){
 if(!overlay)return false;
 if(hearing||ttsBusy){audioStatus('Bitte erst die Spracheingabe beenden.');return false}
 return playCloudSpeech('Hallo, ich bin der Navi-Assistent von MeviCar. Kannst du meine Stimme hören?',false);
}
/* Auto STT prefers configured Groq with one bounded Gemini fallback.
 * An explicit STT selection never silently calls a different provider. */
async function transcribeRecorded(blob,mimeType,onProgress){
 const groq=root.MeviGroqSpeech,selected=getProvider('stt');
 if(selected==='groq'){
  if(!groq?.stored?.())throw Error('Groq-Key für Spracheingabe fehlt unter Settings → Zugänge.');
  return groq.transcribe(blob,mimeType,undefined,onProgress);
 }
 if(selected==='auto'&&groq?.stored?.()){
  try{return await groq.transcribe(blob,mimeType,undefined,onProgress)}
  catch(primaryError){
   const reason=safeText(primaryError?.message)||'Groq nicht erreichbar';
   onProgress?.('Groq fehlgeschlagen · Gemini-Transkription als Reserve …');
   try{return await keySource().transcribe(blob,mimeType,undefined,onProgress)}
   catch(fallbackError){
    throw Error('Groq: '+reason+' · Gemini: '+
     (safeText(fallbackError?.message)||'Spracherkennung fehlgeschlagen.'));
   }
  }
 }
 if(!keySource()?.stored?.())throw Error('Google-Gemini-Key für die Spracheingabe fehlt.');
 return keySource().transcribe(blob,mimeType,undefined,onProgress);
}
function listen(options={}){
 if(!overlay||busy)return false;
 if(keySource()?.native?.()){
  // The Android bridge records and transcribes this turn.
  if(hearing)return true;
  if(!keySource().dictate){
   showError('Spracheingabe braucht eine neuere APK. Bitte den Wunsch eintippen.',
    'Die Spracheingabe benötigt eine neuere App-Version. Bitte den Wunsch eintippen.');
   return false
  }
  clearSpokenText();
  const current=serial;
  root.speechSynthesis?.cancel?.();
  // Android has its native voice pathway; no Web Audio session needed.
  voiceDialogue=true;
  if(!options.automatic)autoFollowUps=0;
  hearing=true;status('Mikrofon wird geöffnet …');updateButton();
  let nativeRecording=false;
  void keySource().dictate(level=>{
   if(!overlay||current!==serial||!hearing)return;
   const recording=level!==null;
   if(recording!==nativeRecording){
    status(recording?'Ich höre zu … bitte jetzt sprechen.':'Spracheingabe wird verarbeitet …');
    nativeRecording=recording;
   }
   captureLevel(level);
  }).then(words=>{
   if(!overlay||current!==serial)return;
   hearing=false;captureLevel(null);updateButton();
   words=safeText(words);
   if(!words){status('Keine Sprache erkannt. Du kannst den Text eingeben.');return}
   const field=part('mg-gemini-input');if(field)field.value=words;
   showSpokenText(words);
   void send();
  }).catch(error=>{
   if(!overlay||current!==serial)return;
   hearing=false;captureLevel(null);updateButton();
   showError(/Unbekannte Funktion/.test(error?.message||'')?
    'Spracheingabe braucht eine neuere APK. Bitte den Wunsch eintippen.':
    safeText(error?.message)||'Spracheingabe fehlgeschlagen. Bitte erneut versuchen.',
    'Die Spracheingabe ist fehlgeschlagen. Bitte versuche es erneut.');
  });
  return true;
 }
 if(hearing){
  if(recognizer?.state==='recording'){recognizer.stop();captureLevel(null)}
  else if(!recognizer){serial++;stopRecognition();stopCloudSpeech()}
  status('Aufnahme beendet.');return true;
 }
 if(!root.navigator?.mediaDevices?.getUserMedia||!root.MediaRecorder){
  showError('Mikrofonaufnahme ist in diesem Browser nicht verfügbar.');
  return false
 }
 if(!configured()){
  showError('Bitte zuerst den API-Key für '+providerName()+' in den Einstellungen speichern.');
  return false
 }
 voiceDialogue=true;
 if(!options.automatic){
  autoFollowUps=0;
  clearSpokenText();
 }
 // Keep the previous transcript visible while automatically listening for
 // a follow-up. Replace it only after fresh speech was actually recognized.
 // Keep the recognized destination visible while the user says "Ja" or
 // "Nein"; replacing it must never happen before the answer is processed.
 // First microphone tap unlocks iOS sound; a follow-up reuses that session.
 if(!options.automatic||!ttsCtx)prepareAutoSpeech();
 const current=++serial;
 hearing=true;status('Mikrofon wird geöffnet …');updateButton();
 void (async()=>{
  let stream;
  try{
   selectAudioSession('record');
   stream=await root.navigator.mediaDevices.getUserMedia({audio:true});
   if(!overlay||current!==serial||!hearing){stream.getTracks().forEach(t=>t.stop());return}
   const type=['audio/webm;codecs=opus','audio/mp4','audio/webm']
    .find(t=>typeof root.MediaRecorder.isTypeSupported!=='function'||root.MediaRecorder.isTypeSupported(t));
   const rec=new root.MediaRecorder(stream,type?{mimeType:type}:undefined);
   recognizer=rec;const chunks=[];
   rec.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
   rec.onstop=()=>{
    stream.getTracks().forEach(t=>t.stop());
    if(recognizer!==rec)return;
    const monitor=micMonitor;
    stopMicMonitor();
    selectAudioSession('playback');
    recognizer=null;hearing=false;captureLevel(null);updateButton();
    if(!overlay||current!==serial)return;
    if(!chunks.length||(monitor?.timedOut&&monitor?.analyser&&!monitor.heard)){
     stopCloudSpeech();
     status('Keine Antwort erkannt. Bitte bei Bedarf 🎙 antippen.');
     return;
    }
    busy=true;updateButton();status((getProvider('stt')==='groq'||getProvider('stt')==='auto'&&root.MeviGroqSpeech?.stored?.())?'Groq Whisper transkribiert …':'Gemini transkribiert …');
    // A spoken turn is transcribed and sent into the dialogue state machine.
    // No navigation starts until the user unambiguously confirms the target.
    void (async()=>{
     try{
      const words=await transcribeRecorded(
       new Blob(chunks,{type:rec.mimeType}),rec.mimeType,
       notice=>{if(overlay&&current===serial)status(notice)}
      );
      if(!overlay||current!==serial)return;
      const field=part('mg-gemini-input');if(field)field.value=safeText(words);
      if(!field?.value){
       stopCloudSpeech();status('Keine Sprache erkannt. Bitte erneut sprechen.');return
      }
      // Display the speech provider's verbatim transcript immediately. Interpret the
      // destination automatically, but NEVER start navigation without the
      // user's later "In Navi suchen" confirmation.
      showSpokenText(field.value);
      
      status('Gesprochene Antwort erkannt. '+providerName()+' verarbeitet sie …');
      busy=false;updateButton();
      // Keep the saved target and unlocked audio until send() has handled
      // a local "Ja"/"Nein" or routed a correction through Gemini.
      void send({reuseAudio:true});
     }catch(e){
      if(overlay&&current===serial){
       const isAudioQuota=/Gemini-Free-Tier-Limit erreicht|Audio.*429|HTTP 429/i
        .test(e?.message||'');
       const bothFailed=/^Groq: /.test(e?.message||'');
       voiceDialogue=false;
       // Keep the already activated iPhone audio session for reading the error.
       showError(bothFailed?
        safeText(e?.message):
        isAudioQuota?
        'Spracherkennung-Limit erreicht (HTTP 429). Du kannst dein Ziel per Tastatur eingeben und mit Enter senden – oder es später erneut versuchen.':
        safeText(e?.message)||'Transkription fehlgeschlagen.',
        bothFailed?
        'Groq und Gemini konnten die Spracheingabe nicht verarbeiten. Bitte gib dein Ziel über die Tastatur ein.':
        isAudioQuota?
        'Das kostenlose Kontingent für die Spracherkennung ist aufgebraucht. Bitte gib dein Ziel über die Tastatur ein oder versuche es später erneut.':
        'Die Spracherkennung ist fehlgeschlagen. Bitte versuche es erneut.');
      }
     }finally{
      if(overlay&&current===serial){busy=false;updateButton()}
     }
    })();
   };
   rec.onerror=()=>{
    stream.getTracks().forEach(t=>t.stop());
    if(recognizer!==rec)return;
    stopMicMonitor();
    selectAudioSession('playback');
    recognizer=null;hearing=false;captureLevel(null);updateButton();
    if(overlay&&current===serial){
     showError('Mikrofonaufnahme fehlgeschlagen. Bitte erneut versuchen.');
    }
   };
   rec.start();
   captureLevel(0);
   status(options.automatic?'Ich höre deine Antwort … Sprechpause beendet die Aufnahme.':
    'Ich höre zu … bei einer Sprechpause endet die Aufnahme automatisch.');
   updateButton();
   // Only hands-free follow-ups auto-stop after a short pause in speech.
   // The initial user-started recording still supports a manual stop tap.
   // Detect speech and its end for EVERY Web recording, including the very
   // first microphone tap. The user can still tap ■ to stop manually.
   // Microphone samples are analyzed locally and never sent to Synology.
   const session=ttsCtx||null;
   const monitor={source:null,analyser:null,timer:null,heard:false,
    speechFrames:0,quietFrames:0,timedOut:false,noise:0.006};
   micMonitor=monitor;
   try{
    const analyser=session?.createAnalyser?.();
    const source=session?.createMediaStreamSource?.(stream);
    if(analyser&&source&&root.setInterval){
     analyser.fftSize=1024;
     source.connect(analyser);
     monitor.source=source;monitor.analyser=analyser;
     const samples=new Float32Array(analyser.fftSize);
     monitor.timer=root.setInterval(()=>{
      if(recognizer!==rec||rec.state!=='recording')return;
      analyser.getFloatTimeDomainData(samples);
      let power=0;
      for(const n of samples)power+=n*n;
      const rms=Math.sqrt(power/samples.length);
      // Learn a conservative ambient baseline before the first utterance.
      const speechLimit=Math.max(0.012,monitor.noise*2.7);
      captureLevel(Math.min(1, Math.max(0, (rms - monitor.noise) * 9)));
      if(!monitor.heard&&rms<speechLimit)
       monitor.noise=0.96*monitor.noise+0.04*rms;
      monitor.speechFrames=rms>=speechLimit?monitor.speechFrames+1:0;
      if(monitor.speechFrames>=2)monitor.heard=true;
      if(monitor.heard){
       const silenceLimit=Math.max(0.008,monitor.noise*1.6);
       monitor.quietFrames=rms<silenceLimit?monitor.quietFrames+1:0;
       // ~1.2 seconds of quiet after speech: end the recording automatically.
       if(monitor.quietFrames>=10){
        status('Sprechpause erkannt · '+providerName()+' verarbeitet deine Anfrage …');
        rec.stop();
       }
      }
     },120);
    }
   }catch{stopMicMonitor()}
   // Bounded fallback if the microphone is blocked, no voice was detected,
   // or the iPhone exposes no analyser; no permanent recording.
   root.setTimeout?.(()=>{
    if(recognizer===rec&&rec.state==='recording'){
     if(micMonitor)micMonitor.timedOut=true;
     rec.stop();
    }
   },options.automatic?9000:12000);
  }catch(e){
   stream?.getTracks().forEach(t=>t.stop());
   if(overlay&&current===serial){
    selectAudioSession('playback');
    recognizer=null;hearing=false;captureLevel(null);updateButton();
    showError(e?.name==='NotAllowedError'?
     'Mikrofonberechtigung fehlt. Bitte den Zugriff in Safari erlauben.':
     'Mikrofon konnte nicht geöffnet werden.');
   }
  }
 })();
 return true;
}
function localInterpret(utterance,context={}){
 const text=safeText(utterance),low=text.toLocaleLowerCase('de-DE');
 if(!text)return {intent:'clarify',reply:'Was soll ich für dich suchen?',query:''};
 // Offline test mode only. With a Gemini key, the COMPLETE utterance goes
 // to Gemini instead of being reduced by these legacy example patterns.
 const fallback=combinedTrip(text);
 if(fallback)return {intent:'destination',query:fallback.destination,
  afterRoute:{...fallback.stop,scope:fallback.stop.scope||'route'},
  reply:stopConfirmation(fallback.destination,fallback.stop)};
 if(context.pendingDestination){
  const followUp=mentionedStop(text);
  if(followUp)return {intent:'destination',query:context.pendingDestination,
   afterRoute:{...followUp,scope:followUp.scope||'route'},
   reply:stopConfirmation(context.pendingDestination,followUp)};
 }
 // A clarification is still one short tap-to-talk conversation. The answer
 // may be a bare place name or a yes/no reply rather than a full command.
 const follow=context.clarification;
 if(follow&&/^(ja|okay|ok|bitte|gerne)[.!]?$/i.test(text)){
  const prior=localInterpret(follow.original,{hasRoute:false});
  if(prior.intent==='clarify'&&/tankstelle|tanken/i.test(follow.original))
   return {intent:'poi',poiType:'fuel',query:'Tankstelle',reply:'Ich suche Tankstellen in deiner Nähe. Soll ich die Treffer öffnen?'};
  if(prior.poiType)return {...prior,intent:'poi'};
 }
 if(follow&&!/^(nein|abbrechen|stopp)$/i.test(text)&&
    /wohin|welche adresse|welchen ort/i.test(follow.reply)&&
    !/^(fahre|fahr|navigiere|suche|füge|setze)\b/i.test(text)&&text.length<=75)
  return {intent:'destination',query:text,reply:'Du möchtest nach „'+text+'“. Soll ich dort suchen?'};
 const poi=[
  ['fuel',/\b(tankstelle|tanken|sprit)\b/i,'Tankstelle'],
  ['charge',/\b(ladesäule|laden|ladestation)\b/i,'Ladestation'],
  ['parking',/\b(parkplatz|parken|parkhaus)\b/i,'Parkplatz'],
  ['food',/\b(restaurant|essen|imbiss)\b/i,'Restaurant'],
  ['cafe',/\b(café|cafe|kaffee)\b/i,'Café'],
  ['bar',/\b(biergarten|kneipe|bierchen|bier trinken|pub)\b/i,'Biergarten oder Kneipe'],
  ['cart',/\b(supermarkt|einkaufen)\b/i,'Supermarkt'],
  ['rest',/\b(rastplatz|raststätte)\b/i,'Rastplatz'],
  ['wrench',/\b(werkstatt)\b/i,'Werkstatt']
 ].find(([,re])=>re.test(low));
 if(poi){
  if(/\b(auf (der|meiner) route|auf dem weg|unterwegs|als zwischenstopp)\b/.test(low)&&!context.hasRoute)
   return {intent:'clarify',reply:'Du hast noch keine aktive Route. Soll ich in deiner Nähe suchen?',query:''};
  return {intent:context.hasRoute&&/\b(route|unterwegs|zwischenstopp|auf dem weg)\b/.test(low)?'stop':'poi',
   poiType:poi[0],query:poi[2],reply:'Ich kann nach '+poi[2]+' suchen. Soll ich dir die Treffer zeigen?'};
 }
 let target=text.replace(/^(?:bitte\s+)?(?:fahre|fahr|navigiere|bring(?:e)? mich|route|suche)\s+(?:mich\s+)?(?:mal\s+)?(?:nach|zu|zum|zur|in|den|die|das)\s+/i,'').trim();
 target=target.replace(/^(?:füge|setze)\s+(?:einen\s+)?(?:zwischenstopp|stopp)\s+(?:in|bei|nach|zu)\s+/i,'').trim();
 if(/^ich (?:möchte|will|würde gerne)\s+(?:nach|zu|zum|zur|in)\s+/i.test(target))
  target=target.replace(/^ich (?:möchte|will|würde gerne)\s+(?:nach|zu|zum|zur|in)\s+/i,'').trim();
 if(/^hause$/i.test(target))target='Zuhause';
 target=target.replace(/\s*(?:bitte|danke)[.!?]*$/i,'').trim();
 if(target===text||target.length<2)
  return {intent:'clarify',reply:'Wohin möchtest du fahren? Sag zum Beispiel „Navigiere nach Bamberg“.',query:''};
 const isStop=/\b(zwischenstopp|stopp hinzufügen)\b/i.test(text);
 if(isStop&&!context.hasRoute)
  return {intent:'clarify',reply:'Für einen Zwischenstopp benötigst du zuerst eine geplante Route.',query:''};
 return {intent:isStop?'stop':'destination',query:target,
  reply:'Ich habe „'+target+'“ verstanden. Soll ich in MeviCar danach suchen?'};
}
// Read-only navigation responses are assembled locally, never from model prose.
async function navigationReadReply(topic){
 const nav=root.MeviGoogleNav,format=root.MeviNavRouteDetails;
 let data;
 try{
  data=nav?.isNativeMode?.()? (typeof nav.readNativeTrafficMetrics==='function'?await nav.readNativeTrafficMetrics():(await nav.nativeRequest('navigation.metrics'))?.metrics):nav?.guidanceDashboardData?.();
 }catch{return 'Die aktuellen Navigationsdaten sind nicht verfügbar.'}
 if(!data?.routeActive)return 'Es ist keine Route aktiv.';
 if(topic==='street'){
  const street=await nav?.readCurrentStreet?.();
  return street?'Laut Google liegt deine aktuelle Position auf oder nahe '+street+'.':'Die aktuelle Straße ist nicht zuverlässig verfügbar.';
 }
 const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 const duration=v=>format?.duration?.(v,'ceil')||Math.ceil(v/60)+' Minuten';
 const distance=v=>format?.distance?.(v,'compact')||Math.round(v/1000*10)/10+' km';
 const t=root.MeviNavigationShared?.trafficSnapshot?.(data.traffic);
 if(topic==='eta')return number(data.arrivalEpochMs)&&data.arrivalEpochMs>0?
  'Voraussichtliche Ankunft: '+(format?.clock?.(data.arrivalEpochMs,false)||new Date(data.arrivalEpochMs).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}))+'.':'Die Ankunftszeit ist noch nicht verfügbar.';
 if(topic==='remaining'){
  const parts=[number(data.remainingSeconds)?duration(data.remainingSeconds):'',number(data.remainingMeters)?distance(data.remainingMeters):''].filter(Boolean);
  return parts.length?'Verbleibend: '+parts.join(' und ')+'.':'Restzeit und Reststrecke sind nicht verfügbar.';
 }
 if(topic==='destination'||topic==='stops'){
  const ctx=nav?.isNativeMode?.()?null:nav?.routeContext?.();
  if(!ctx?.hasRoute)return 'Die Ziel- und Zwischenstoppdaten sind nicht verfügbar.';
  if(topic==='destination')return ctx.destination?.name||ctx.destination?.address?
   'Dein Ziel ist '+(ctx.destination.name||ctx.destination.address)+'.':'Das Ziel ist nicht verfügbar.';
  if(!Array.isArray(ctx.stops))return 'Die Zwischenstopps sind nicht verfügbar.';
  if(!ctx.stops.length)return 'Es sind keine Zwischenstopps geplant.';
  return 'Geplante Zwischenstopps: '+ctx.stops.map((s,i)=>(i+1)+'. '+(s.name||s.address||'Unbenannter Stopp')).join(', ')+'.';
 }
 if(topic==='alternatives'){
  if(nav?.isNativeMode?.())return 'Google prüft die Route laufend. Falls Google Alternativen anbietet, kannst du sie auf der Karte auswählen. Ein geprüfter Zeitgewinn für eine bestimmte Alternative liegt mir nicht vor.';
  const offer=data.trafficCheck?.offer;
  return number(offer?.savingSeconds)&&offer.savingSeconds>=120?
   'Eine geprüfte Alternative spart gegenüber der neuen Google-Standardroute '+duration(offer.savingSeconds)+'. Du kannst sie in den Routendetails auswählen.':
   'Mir liegt keine geprüfte schnellere Alternative vor. Es wurde keine neue Route berechnet.';
 }
 if(topic==='delay')return number(t?.delaySeconds)&&t.scope==='calculated-route'?
  'Bei der letzten Routenberechnung betrug die geschätzte verkehrsbedingte Mehrzeit '+duration(t.delaySeconds)+'. Das ist nicht die aktuelle Restverzögerung.':
  'Eine aktuelle Verzögerung in Minuten ist nicht verfügbar.';
 if(t?.disruptionSpeed==='SLOW'&&number(t.nextDisruptionMeters)){
  if(t.inDisruption)return 'Du befindest dich laut letzter Verkehrsberechnung in zähfließendem Verkehr.';
  return 'Die nächste gemeldete Verkehrsbehinderung ist zähfließender Verkehr in ungefähr '+distance(t.nextDisruptionMeters)+'.'+
   (number(t.disruptionLengthMeters)?' Der Abschnitt ist ungefähr '+distance(t.disruptionLengthMeters)+' lang.':'');
 }
 if(t?.inJam)return 'Du befindest dich laut letzter Verkehrsberechnung in einem Stauabschnitt.';
 if(number(t?.nextJamMeters))return 'Der nächste bestätigte Stauabschnitt beginnt in ungefähr '+distance(t.nextJamMeters)+'.';
 if(t?.status==='heavy')return 'Google meldet starken Verkehr. Eine genaue Entfernung zum Stau ist nicht verfügbar.';
 if(t?.status==='slow')return 'Google meldet zähfließenden Verkehr auf der berechneten Route.';
 if(t?.status==='normal')return 'Die vorliegenden Google-Daten melden keine starke Verkehrsbelastung.';
 return 'Für diese Route liegen keine ausreichend aktuellen Verkehrsdaten vor.';
}
// Closed set of reversible Web controls; exact common phrases need no model call.
const NAV_CONTROLS=new Set(['mute','unmute','overview','follow','north','travel']);
function localNavigationControl(text){
 const phrase=String(text||'').toLocaleLowerCase('de-DE')
  .replace(/[.!?,;:]+/g,' ').replace(/\s+/g,' ').trim().replace(/^bitte /,'').replace(/ bitte$/,'');
 const patterns=[
  ['mute',/^(?:navi(?:gation)?(?:- | |-)?ansagen (?:aus|ausschalten|stumm)|ansagen (?:aus|ausschalten)|navi stumm(?: schalten)?|navigation stumm(?: schalten)?)$/],
  ['unmute',/^(?:navi(?:gation)?(?:- | |-)?ansagen (?:an|ein|einschalten)|ansagen (?:an|ein|einschalten)|navi ton an|navigation ton an)$/],
  ['overview',/^(?:routenübersicht(?: anzeigen)?|zeige (?:mir )?(?:die )?(?:ganze route|routenübersicht)|gesamte route anzeigen)$/],
  ['follow',/^(?:zurück zur fahransicht|fahransicht(?: anzeigen)?|auf meinen standort zentrieren|karte zentrieren)$/],
  ['north',/^(?:norden oben|karte nach norden ausrichten|norden nach oben)$/],
  ['travel',/^(?:fahrtrichtung oben|fahrtrichtung nach oben|karte in fahrtrichtung ausrichten)$/]
 ];
 return patterns.find(([,pattern])=>pattern.test(phrase))?.[0]||'';
}
function localRouteEdit(text){
 const phrase=String(text||'').toLocaleLowerCase('de-DE').replace(/[.!?,;:]+/g,' ').replace(/\s+/g,' ').trim().replace(/^bitte /,'').replace(/ bitte$/,'');
 if(/^(?:navigation|navi|route) starten$/.test(phrase))return {action:'start'};
 if(/^(?:navigation|navi|route) (?:beenden|stoppen|abbrechen)$/.test(phrase))return {action:'end'};
 const remove=phrase.match(/^(?:zwischenstopp|stopp) ([1-8]) (?:entfernen|löschen|überspringen)$/);
 if(remove)return {action:'remove',index:Number(remove[1])};
 const move=phrase.match(/^(?:zwischenstopp|stopp) ([1-8]) (?:auf|an) (?:position|stelle) ([1-8]) (?:verschieben|setzen)$/);
 if(move)return {action:'move',index:Number(move[1]),to:Number(move[2])};
 const namedRemove=phrase.match(/^(?:lösche|entferne|überspringe) den (ersten|zweiten|dritten|vierten|fünften|sechsten|siebten|achten) (?:zwischenstopp|stopp)$/);
 if(namedRemove)return {action:'remove',index:['ersten','zweiten','dritten','vierten','fünften','sechsten','siebten','achten'].indexOf(namedRemove[1])+1};
 const imperative=phrase.match(/^(vermeide|erlaube) (maut|autobahnen?|fähren?)$/);
 const option=phrase.match(/^(maut|autobahnen?|fähren?) (vermeiden|erlauben)$/)||(imperative?[null,imperative[2],imperative[1]==='vermeide'?'vermeiden':'erlauben']:null);
 if(option)return {action:'option',option:option[1]==='maut'?'avoidTolls':option[1].startsWith('autobahn')?'avoidHighways':'avoidFerries',value:option[2]==='vermeiden'};
 return null;
}
function validatedRouteEdit(raw){
 const a=raw?.action,idx=v=>Number.isInteger(v)&&v>=1&&v<=8;
 if(a==='start'||a==='end')return {action:a};
 if(a==='remove'&&idx(raw.index))return {action:a,index:raw.index};
 if(a==='move'&&idx(raw.index)&&idx(raw.to)&&raw.index!==raw.to)return {action:a,index:raw.index,to:raw.to};
 if(a==='option'&&['avoidTolls','avoidHighways','avoidFerries'].includes(raw.option)&&typeof raw.value==='boolean')return {action:a,option:raw.option,value:raw.value};
 throw Error('Bitte einen eindeutigen Navi-Befehl mit gültiger Stoppnummer oder Routenoption nennen.');
}
function validate(raw,context){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))
  throw Error('Ungültige Antwort vom KI-Dienst.');
 const intent=String(raw.intent||'');
 if(intent==='edit_route'){const edit=validatedRouteEdit(raw.routeEdit);return {intent,query:edit.action,routeEdit:edit,poiType:'',reply:''};}
 if(intent==='control_navigation'){
  if(!NAV_CONTROLS.has(raw.query))throw Error('Nicht unterstützter Navi-Bedienbefehl.');
  return {intent,query:raw.query,poiType:'',reply:''};
 }
 if(intent==='check_traffic')return {intent,query:'',poiType:'',reply:''};
 if(intent==='read_navigation'){
  if(!['traffic','delay','eta','remaining','alternatives','destination','stops','street'].includes(raw.query))throw Error('Unbekannte Navigationsabfrage.');
  return {intent,query:raw.query,poiType:'',reply:''};
 }
 if(!['destination','stop','poi','clarify'].includes(intent))
  throw Error('KI-Antwort enthält keine unterstützte Aktion.');
 const query=safeText(raw.query);
 const poiType=Object.hasOwn(ROUTE_STOP_LABELS,String(raw.poiType))?String(raw.poiType):'';
 let reply=safeText(raw.reply)||'Ich habe deine Anfrage verstanden.';
 if(['destination','stop','poi'].includes(intent)&&!query)
  throw Error('Ein Ziel für die Suche fehlt.');
 if(intent==='stop'&&!context.hasRoute)
  return {intent:'clarify',query:'',poiType:'',reply:'Für einen Zwischenstopp benötigst du zuerst eine geplante Route.'};
 const near=raw.near==null?'':safeText(raw.near).slice(0,60);
 if(near&&!['poi','stop'].includes(intent))
  throw Error('Eine Ortsbeschränkung ist nur für eine lokale POI-Suche zulässig.');
 if(raw.afterRoute!=null){
  if(intent!=='destination'||typeof raw.afterRoute!=='object'||Array.isArray(raw.afterRoute))
   throw Error('Der KI-Fahrplan enthält eine ungültige Zusatzaktion.');
  const normalizeFollow=follow=>{
   if(!follow||typeof follow!=='object'||Array.isArray(follow))throw Error('Der KI-Fahrplan enthält eine ungültige Zusatzaktion.');
   const type=String(follow.poiType||follow.category||'');
   const scope=String(follow.scope||'');
   const near=safeText(follow.near||'').slice(0,60);
   const placeName=safeText(follow.placeName||'').slice(0,80);
   if(placeName&&(!/^[\p{L}\p{N}][\p{L}\p{M}\p{N}\s.'’&+\-/]{1,79}$/u.test(placeName)||
     /https?:|\b(?:www|javascript)\b/i.test(placeName)))
    throw Error('Der genannte Betrieb ist kein gültiger Suchname.');
   if(type==='address'&&scope==='route'&&placeName&&!near)return {poiType:'address',query:placeName,plural:placeName,placeName};
   if(!Object.hasOwn(ROUTE_STOP_LABELS,type)||!['route','destination'].includes(scope)||(scope==='destination'&&near))
    throw Error('Die zusätzliche KI-Aktion kann nicht sicher ausgeführt werden.');
   return {...ROUTE_STOP_LABELS[type],...(scope==='destination'?{scope:'destination'}:{}),
    ...(near?{near}:{}),...(placeName?{placeName,query:placeName}:{})};
  };
  const afterRoute=normalizeFollow(raw.afterRoute);
  if(raw.afterRoutes!=null){
   if(!Array.isArray(raw.afterRoutes)||raw.afterRoutes.length<1||raw.afterRoutes.length>2)
    throw Error('Der KI-Fahrplan darf maximal drei Zwischenstopps enthalten.');
   const afterRoutes=raw.afterRoutes.map(normalizeFollow);
   if([afterRoute,...afterRoutes].some(stop=>stop.scope==='destination'))
    throw Error('Bitte Zwischenstopps entlang der Route und eine Suche am Ziel getrennt angeben.');
   reply=multiStopConfirmation(query,[afterRoute,...afterRoutes]);
   return {intent,query,poiType:'',reply,afterRoute,afterRoutes};
  }
  reply=stopConfirmation(query,afterRoute);
  return {intent,query,poiType:'',reply,afterRoute};
 }
 const placeName=safeText(raw.placeName||'').slice(0,80);
 if(placeName&&(!/^[\p{L}\p{N}][\p{L}\p{M}\p{N}\s.'’&+\-/]{1,79}$/u.test(placeName)||
   /https?:|\b(?:www|javascript)\b/i.test(placeName)))
  throw Error('Der genannte Betrieb ist kein gültiger Suchname.');
 if(placeName&&intent!=='poi'&&intent!=='stop')
  throw Error('Betriebsname kann nur für eine POI-Suche verwendet werden.');
 if(intent==='poi'&&near){
  if(!poiType)throw Error('Die POI-Suche benötigt eine gültige Kategorie.');
  reply='Soll ich nach '+(placeName||ROUTE_STOP_LABELS[poiType].plural)+
   ' in der Nähe von '+near+' suchen?';
 }
 let filters=null;
 if(raw.filters!=null){
  if(!['stop','poi'].includes(intent)||!poiType||typeof raw.filters!=='object'||Array.isArray(raw.filters)||
     (raw.filters.openNow!=null&&typeof raw.filters.openNow!=='boolean')||
     (raw.filters.arrivalOpen!=null&&typeof raw.filters.arrivalOpen!=='boolean')||
     (raw.filters.sort!=null&&!['distance','relevance','detour'].includes(raw.filters.sort)))
   throw Error('Der gewünschte Suchfilter ist nicht verfügbar.');
  if((raw.filters.sort==='detour'||raw.filters.arrivalOpen===true)&&intent!=='stop')
   return {intent:'clarify',query:'',poiType:'',reply:'Umwege kann ich nur für Orte entlang einer geplanten Route vergleichen.'};
  filters={...(raw.filters.openNow===true?{openNow:true}:{}),...(raw.filters.arrivalOpen===true?{arrivalOpen:true}:{}),...(raw.filters.sort?{sort:raw.filters.sort}:{})};
  if(filters.openNow||filters.sort||filters.arrivalOpen){
   reply='Soll ich '+(placeName||query)+(filters.openNow?', die jetzt geöffnet sind':'')+
    (near?' bei '+near:intent==='stop'?' entlang der Route':'')+
    (filters.arrivalOpen?' suchen und bei bis zu drei Treffern die voraussichtliche Öffnung bei Ankunft prüfen? Zusätzliche Google-Abfragen sind nötig.':filters.sort==='detour'?' suchen und die Umwege für bis zu drei Treffer vergleichen? Bis zu sechs zusätzliche Google-Routenanfragen.':filters.sort==='relevance'?' nach Relevanz suchen?':' nach Entfernung suchen?');
  }
 }
 return {intent,query:placeName||query,poiType,reply,
  ...(placeName?{placeName}:{}),...(near?{near}:{}),...(filters?{filters}:{})};
}
async function requestGemini(text,context,onProgress){
 // Do not intercept a reply to a pending destination/clarification.
 const local=!context.clarification&&!context.pendingDestination&&!root.MeviGoogleNav?.isNativeMode?.()?localNavigationControl(text):'';
 if(local)return validate({intent:'control_navigation',query:local},context);
 const edit=!context.clarification&&!context.pendingDestination&&!root.MeviGoogleNav?.isNativeMode?.()?localRouteEdit(text):null;
 if(!context.clarification&&!context.pendingDestination&&/^(?:auf welcher straße bin ich(?: gerade)?|wo bin ich gerade)[.!?]?$/i.test(text))
  return validate({intent:'read_navigation',query:'street'},context);
 if(edit)return validate({intent:'edit_route',routeEdit:edit},context);
 if(!context.clarification&&!context.pendingDestination&&!root.MeviGoogleNav?.isNativeMode?.()){
  const phrase=safeText(text).replace(/[.!?]+$/,'').toLocaleLowerCase('de-DE');
  const topic=/^(wann (?:komme ich an|bin ich da)|ankunftszeit|wie spät komme ich an)$/.test(phrase)?'eta':
   /^(wie (?:lange|weit) noch|wie lange dauert die fahrt noch|restzeit|reststrecke)$/.test(phrase)?'remaining':
   /^(wie ist (?:der )?verkehr|gibt es stau|was kommt als nächste verkehrsbehinderung)$/.test(phrase)?'traffic':'';
  if(topic)return validate({intent:'read_navigation',query:topic},context);
 }
 if(!context.clarification&&!context.pendingDestination&&context.hasRoute&&!root.MeviGoogleNav?.isNativeMode?.()){
  const follow=safeText(text).match(/^(?:und )?danach (?:möchte|will) ich (?:noch )?(essen|tanken|laden|parken)[.!?]?$/i);
  if(follow){
   const stop=mentionedStop('unterwegs '+follow[1]);
   if(stop)return validate({intent:'stop',query:stop.query,poiType:stop.poiType,reply:'Soll ich '+stop.plural+' als weiteren Zwischenstopp suchen?'},context);
  }
 }
 if(injectedProvider)return validate(await injectedProvider(text,context),context);
 if(getProvider('ai')==='groq'){
  if(!root.MeviGroqSpeech?.stored?.())throw Error('Bitte zuerst den Groq-Key unter Settings → Zugänge speichern.');
  const controller=new AbortController();abort=controller;
  const timer=setTimeout(()=>controller.abort(),35000);
  try{return validate(await root.MeviGroqSpeech.generate(text,context,controller.signal,onProgress),context)}
  finally{clearTimeout(timer);if(abort===controller)abort=null}
 }
 const vault=keySource();
 if(!vault?.stored?.())return validate(localInterpret(text,context),context);
 if(!vault.isUnlocked())await vault.refresh?.();
 if(!vault.isUnlocked())throw Error('Der gespeicherte Gemini-Key ist nicht lesbar. Bitte unter Settings → Zugänge neu speichern.');
 const controller=new AbortController();abort=controller;
 const timeout=setTimeout(()=>controller.abort(),35000);
 try{return validate(await vault.generate(text,context,controller.signal,onProgress),context)}
 finally{clearTimeout(timeout);if(abort===controller)abort=null}
}
/* No fuzzy substring matching: an isolated "Ja" approves only a currently
   saved destination/POI proposal. Answers to Gemini clarification questions
   always return to Gemini with the prior clarification context. */
/* Short conversational feedback uses only free device speech or installed
 * offline Piper. Never spend an extra Gemini/Groq TTS call on a simple
 * confirmation rejection or clarification reminder. */
function speakFreeFollowUp(words,automatic=false){
 const selected=getProvider('tts');
 if((selected==='piper'||selected==='piper-book')&&playCloudSpeech(words,automatic))return true;
 return speak(words,false,automatic);
}
function confirmationReply(text){
 const phrase=String(text||'').toLocaleLowerCase('de-DE')
  .replace(/[.!?،,;:]+/g,' ').replace(/\s+/g,' ').trim();
 if(/^(ja|ja bitte|jawohl|genau|richtig|okay|ok|mach das|bitte|bestätigen)$/.test(phrase))
  return 'yes';
 if(/^(nein|nein danke|nö|abbrechen|stopp|stop|lass es)$/.test(phrase))
  return 'no';
 if(/^(anderes ziel|ein anderes ziel|neues ziel|falsches ziel)$/.test(phrase))
  return 'change';
 return '';
}
/* A Gemini command is already a navigation request. Ask for Route/Stop
   only if an active route exists and the requested change is ambiguous. */
function shouldAskRouteChoice(text,result,hasRoute){
 if(!hasRoute||result.intent!=='destination'||result.afterRoute)return false;
 return !/\b(?:navigier\w*|fahr\w*|bring(?:e)?\s+mich|route\s+(?:nach|zu)|neue\w*\s+route|(?:ziel|route)\s+(?:aendern|ändern|ersetzen))\b/i.test(text);
}
function routeChoiceAnswer(value){
 const words=String(value||'').toLocaleLowerCase('de-DE').replace(/[.!?]+$/,'').trim();
 if(/^(?:als\s+)?(?:zwischenstopp|zwischenhalt|stopp|stop)(?:\s+(?:hinzufügen|ergänzen|einfügen))?$/.test(words))return 'stop';
 if(/^(?:(?:als\s+)?(?:neue|neuen)\s+)?(?:route|fahrtziel|endziel|ziel)(?:\s+(?:ersetzen|ändern|starten))?$/.test(words)||/^(?:bisherige|alte)\s+route\s+ersetzen$/.test(words))return 'destination';
 return '';
}
/* Validated intent is a PROPOSAL. Spoken Ja/Nein decides whether Places opens.
   No new AI request is needed to approve the exact saved destination. */
function finishSpokenDestination(){
 if(!spokenDestination||!overlay||pending!==spokenDestination)return false;
 spokenDestination=null;
 // The TTS completion callback can fire while send() is still finishing.
 // Defer the UI handoff until its busy flag has been released.
 Promise.resolve().then(()=>{
  if(overlay&&pending&&dialoguePhase==='confirmation'&&!busy)accept();
 });
 return true;
}
function confirmationPrompt(result,hasRoute=false){
 if(result.intent==='clarify')return safeText(result.reply);
 const reply=safeText(result.reply),target=safeText(result.query),extra=result.afterRoute;
 let question='';
 if(extra)question=result.afterRoutes?.length?multiStopConfirmation(target,[extra,...result.afterRoutes]):stopConfirmation(target,extra);
 else if(result.intent==='stop')question='Soll ich nach '+target+' als Zwischenstopp suchen?';
 else if(result.intent==='poi')question='Soll ich '+target+
  (result.near?' in der Nähe von '+result.near:hasRoute?' entlang deiner Route':' in deiner Nähe')+
  ' suchen und die Treffer anzeigen?';
 else question='Soll ich '+target+
  (hasRoute?' als neues Navigationsziel':' als Navigationsziel')+' suchen?';
 // Preserve a real Gemini question instead of replacing it with a generic
 // navigation confirmation. Only append the fallback question when the
 // model supplied a statement; do not repeat the same proposal twice.
 if(reply.includes('?'))return reply;
 const normalized=reply.replace(/[.!?\s]+$/,'');
 const proposal=normalized&&normalized.length+question.length+2<=200?
  normalized+'. '+question:question;
 return safeText(proposal);
}
// Short, explicit refinements of a pending or currently visible POI search.
 // No transcript archive, model guess, or permission to change the route.
function refinePoi(text,prior){
 if(!prior||!['stop','poi'].includes(prior.intent)||!prior.poiType)return null;
 const phrase=safeText(text).replace(/[.!?]+$/,'').trim();
 const brand=phrase.match(/^(?:lieber|stattdessen) (?:eine[n]? |ein |die |den |das )?(Shell|Aral|Esso|TotalEnergies|JET|McDonald['’]?s|Burger King|Starbucks)$/i);
 const fuel=/^(shell|aral|esso|totalenergies|jet)$/i;
 const category=brand?(fuel.test(brand[1])?'fuel':/^starbucks$/i.test(brand[1])?'cafe':'food'):null;
 if(brand&&category!==prior.poiType)return null;
 const detour=/^(?:(?:die|der|das) soll(?:te)? )?(?:möglichst wenig umweg verursachen|mit (?:dem )?kleinsten umweg|kleinster umweg|möglichst wenig umweg)$/i.test(phrase);
 const open=/^(?:(?:die|der|das) soll(?:te)? )?(?:jetzt geöffnet sein|nur jetzt geöffnet)$/i.test(phrase);
 const arrival=/^(?:(?:die|der|das) soll(?:te)? )?(?:bei (?:meiner )?ankunft geöffnet sein|bei ankunft geöffnet)$/i.test(phrase);
 if(!brand&&!detour&&!open&&!arrival)return null;
 if((detour||arrival)&&prior.intent!=='stop')return null;
 const filters={...prior.filters,...(detour?{sort:'detour'}:{}),...(open?{openNow:true}:{}),...(arrival?{arrivalOpen:true}:{})};
 return {...prior,...(brand?{query:brand[1],placeName:brand[1]}:{}),filters,reply:''};
}
async function send(options={}){
 if(!overlay||busy)return;
 const text=safeText(part('mg-gemini-input')?.value);
 if(!text){status('Bitte ein Ziel oder eine Frage eingeben.');return}
 // Resolve the route-versus-stop answer locally; no extra model call or
 // second confirmation screen is needed after this choice.
 if(dialoguePhase==='clarification'&&clarification?.routeChoiceDestination){
  const choice=routeChoiceAnswer(text);
  if(!choice){
   answer(clarification.reply);
   status('Bitte „Neue Route“ oder „Zwischenstopp“ wählen.');
   return;
  }
  pending={intent:choice==='stop'?'stop':'destination',
   query:clarification.routeChoiceDestination,poiType:'',reply:''};
  clarification=null;dialoguePhase='confirmation';updateButton();
  return accept();
 }
 let number=requestedResultNumber(text);
 const resultsApi=root.MeviWebNavParity;
 const visible=resultsApi?.voicePoiContext?.();
 const prior=pending&&['stop','poi'].includes(pending.intent)?pending:!pending&&dialoguePhase!=='clarification'?visible?.intent:null;
 const refined=refinePoi(text,prior);
 if(refined){
  const ctx=root.MeviGoogleNav?.routeContext?.();
  if(pending&&(pending.refinementRoute!==undefined&&pending.refinementRoute!==ctx?.revision||
     pending.refinementLease!==undefined&&pending.refinementLease!==visible?.lease)){
   pending=null;dialoguePhase='idle';answer('Die Suche oder Route hat sich geändert. Bitte neu suchen.');updateButton();return;
  }
  if(prior.intent==='stop'&&!hasPlannedRoute()){answer('Die bisherige Route ist nicht mehr verfügbar.');pending=null;updateButton();return}
  stopRecognition();stopSpeech();
  const result=validate(refined,{hasRoute:hasPlannedRoute()});
  pending={...result,refinementLease:visible&&!pending?visible.lease:pending?.refinementLease,refinementRoute:pending?.refinementRoute??ctx?.revision};
  dialoguePhase='confirmation';clarification=null;spokenDestination=null;
  const message=confirmationPrompt(result,hasPlannedRoute());
  answer(message);status('Suchwunsch angepasst · bitte bestätigen');updateButton();speakFreeFollowUp(message,voiceDialogue);return;
 }
 const alternative=/^(?:nein[,. ]+)?(?:nimm|wähle|waehle) (?:die|den|das) andere[nrs]?(?: (?:tankstelle|restaurant|parkplatz|treffer|ort|raststätte|ladestation))?[.!]?$/i.test(text);
 const best=/^(?:nimm|wähle|waehle) (?:die|den|das) (?:mit dem kleinsten umweg|schnellste[nrs]?|günstigste[nrs]? bezogen auf die fahrzeit)[.!]?$/i.test(text);
 if((alternative||best)&&!pending&&dialoguePhase!=='clarification'){
  const shown=resultsApi?.voiceResultState?.();
  if(best&&shown){
   const eligible=shown.hits.map((item,i)=>({item,i})).filter(({item})=>Number.isFinite(item.detour?.minutes)&&(!shown.arrivalOpen||item.detour.openAtArrival===true)).sort((a,b)=>(a.item.detour.seconds??a.item.detour.minutes*60)-(b.item.detour.seconds??b.item.detour.minutes*60));
   const score=x=>x.item.detour.seconds??x.item.detour.minutes*60;
   if(eligible.length===1||eligible.length>1&&score(eligible[0])<score(eligible[1]))number=eligible[0].i+1;
  }
  if(!number){const message=shown?'Welchen Treffer meinst du? Bitte nenne die Nummer.':'Bitte zuerst passende Orte suchen und gegebenenfalls Umwege vergleichen.';answer(message);status(message);speakFreeFollowUp(message);return;}
 }
 if(!pending&&dialoguePhase!=='clarification'&&/^(?:vergleiche|berechne|prüfe) (?:bitte )?(?:die )?umwege[.!]?$/i.test(text)){
  const shown=resultsApi?.voiceResultState?.();
  if(!shown||shown.mode!=='stop'){answer('Bitte zuerst eine passende Zwischenstopp-Trefferliste öffnen.');return}
  const message='Soll ich die Umwege für bis zu drei Treffer berechnen? Dafür sind bis zu sechs zusätzliche Google-Routenanfragen nötig.';
  pending={intent:'compare_poi_confirm',lease:shown.lease};dialoguePhase='confirmation';answer(message);status('Bitte bestätigen');updateButton();speakFreeFollowUp(message,voiceDialogue);return;
 }
 if(number&&!pending&&dialoguePhase!=='clarification'){
  const api=root.MeviWebNavParity;
  const shown=api?.voiceResultState?.();
  if(!shown){
   const message='Keine aktive nummerierte Google-Places-Liste. Bitte zuerst Tankstellen oder Parkplätze suchen.';
   answer(message);status(message);
   track('selection','error','Keine gültige POI-Trefferliste');return;
  }
  if(number>shown.count){
   const message='Es gibt nur '+shown.count+' Treffer. Bitte eine gültige Nummer nennen.';
   answer(message);status(message);
   track('selection','error','Gewählte Nummer außerhalb der Trefferliste');return;
  }
  stopRecognition();stopSpeech();busy=true;dialoguePhase='processing';
  const selectionName=shown.hits[number-1]?.name||'Treffer';
  answer('Übernehme Treffer '+number+': '+selectionName+' …');
  status('Google Places: Treffer '+number+' wird übernommen.');
  updateButton();
  track('selection','start','Sprachbefehl für nummerierten Treffer');
  try{
   const outcome=await api.voiceSelectResult(number);
   if(!overlay)return;
   if(outcome?.ok){
    track('selection','ok','Treffer auf bestehendem Navigationsweg übernommen');
    close();
    offerNextStop();
   }else{
    dialoguePhase='idle';
    const message=outcome?.message||'Treffer konnte nicht übernommen werden. Bitte erneut auswählen.';
    answer(message);status(message);
   }
  }catch(error){
   if(overlay){
    dialoguePhase='idle';answer('Die Auswahl konnte nicht ausgeführt werden.');
    status('Navigation: Trefferübernahme fehlgeschlagen.');
   }
   track('selection','error','Trefferübernahme fehlgeschlagen');
  }finally{
   if(overlay){busy=false;updateButton();refreshDiagnostics()}
  }
  return;
 }
 // Parse short confirmations once; both clarification and confirmation
 // must interpret the same utterance identically without a Gemini request.
 const shortReply=confirmationReply(text);
 // A generic "Ja" cannot resolve an either/or Gemini question, and must
 // never be interpreted as a destination or trigger another Gemini intent
 // call. If a previously spoken prompt is cached, repeat it at no API cost.
 if(dialoguePhase==='clarification'&&clarification&&
    /\boder\b/i.test(clarification.reply||'')&&
    shortReply==='yes'){
  const reminder='Bitte nenne eine der beiden Möglichkeiten, zum Beispiel „Ziel eingeben“ oder „In der Nähe suchen“.';
  status(reminder);
  if(voiceDialogue&&!speakFreeFollowUp(reminder,true))
   audioStatus('Bitte eine Option nennen oder erneut 🎙 tippen.');
  return;
 }
 const replyType=dialoguePhase==='confirmation'&&pending?shortReply:'';
 // A NEW utterance such as "und dort parken" is interpreted by Gemini
 // once, with the pending destination as conversational context. "Ja" never
 // causes a second AI request and immediately confirms the saved plan.
 if(replyType==='yes'){
  // No second Gemini request, no changed destination: use the exact saved
  // proposal, and still only perform the safe search handoff (not guidance).
  return accept();
 }
 if(replyType==='no'){
  const spokenReply=voiceDialogue;
  if(pending?.intent==='next_stop_confirm')remainingStops=null;
  pending=null;clarification=null;dialoguePhase='idle';voiceDialogue=false;
  stopCloudSpeech();
  const message='Okay, die Suche wurde abgebrochen.';
  answer(message);
  status('Abgebrochen. Für ein neues Ziel einfach 🎙 tippen.');
  updateButton();
  if(spokenReply&&!speakFreeFollowUp(message))
   audioStatus('Abgebrochen. Sprachbestätigung nicht verfügbar.');
  return;
 }
 if(replyType==='change'){
  pending=null;dialoguePhase='clarification';
  clarification={original:'Neues Navigationsziel',reply:'Wohin möchtest du stattdessen fahren?'};
  // Retain the Web Audio context authorized by the original mic tap.
  const autoAudio=!!ttsCtx||prepareAutoSpeech();
  if(autoAudio){ttsCachedText='';ttsCachedBuffer=null}
  answer('Wohin möchtest du stattdessen fahren?');
  status('Bitte das neue Ziel nennen.');
  updateButton();
  if(autoAudio)playCloudSpeech('Wohin möchtest du stattdessen fahren?',true);
  else speak('Wohin möchtest du stattdessen fahren?');
  return;
 }
 stopRecognition();
 stopSpeech();
 const current=++serial,previousClarification=clarification;
 track('gemini','start','Sprachwunsch wird interpretiert');
 const previousDestination=dialoguePhase==='confirmation'&&pending?.intent==='destination'?
  pending.query:'';
 // The AI receives the COMPLETE spoken request, including all destination
 // conditions. Regex parsing is retained only for the no-key test fallback.
 routeStopPlan=null;
 remainingStops=null;
 // Suppress stale audio while retaining the iOS session between microphone
 // follow-ups. Invalidate only the old response, not the unlocked context.
 if(options.reuseAudio&&ttsCtx){ttsCachedText='';ttsCachedBuffer=null}
 answer('');
 const autoAudio=options.reuseAudio&&ttsCtx?true:
  getProvider('tts')==='local'?false:prepareAutoSpeech();
 busy=true;pending=null;dialoguePhase='processing';
 status(configured()?providerName()+' verarbeitet deine Anfrage …':'Lokaler Testmodus verarbeitet deine Anfrage …');
 updateButton();
 const hasRoute=hasPlannedRoute();
 const editBaseline=root.MeviGoogleNav?.routeContext?.();
 try{
  let result=await requestGemini(text,
   {hasRoute,clarification:previousClarification,
    ...(previousDestination?{pendingDestination:previousDestination}:{})},
   notice=>{if(overlay&&serial===current)status(notice)});
  if(!overlay||serial!==current)return;
  if(result.intent==='edit_route'){
   const nav=root.MeviGoogleNav;
   const proposal=nav?.isNativeMode?.()?null:nav?.voiceRouteProposal?.(result.routeEdit,editBaseline?.revision);
   const message=proposal?.message||'Diese Routenaktion ist derzeit nicht verfügbar.';
   clarification=null;spokenDestination=null;
   pending=proposal?.ok?{intent:'route_edit_confirm',edit:result.routeEdit,revision:proposal.revision,active:proposal.active,stopKey:proposal.stopKey}:null;
   dialoguePhase=pending?'confirmation':'idle';
   if(!pending)voiceDialogue=false;
   answer(message);status(pending?'Bitte bestätigen · Route unverändert':'Keine Routenänderung');
   if(!speakFreeFollowUp(message,!!pending&&voiceDialogue))audioStatus('Bitte 🔊 tippen.');
   return;
  }
  if(result.intent==='control_navigation'){
   const nav=root.MeviGoogleNav;
   const replies={mute:'Die Navi-Ansagen sind ausgeschaltet.',unmute:'Die Navi-Ansagen sind eingeschaltet.',
    overview:'Die Routenübersicht wird angezeigt.',follow:'Zurück zur Fahransicht.',
    north:'Die Karte ist nach Norden ausgerichtet.',travel:'Die Karte ist in Fahrtrichtung ausgerichtet.'};
   let message;
   if(nav?.isNativeMode?.())message=result.query==='overview'&&await nav.nativeGuidanceAction?.('overviewShow')===true?replies.overview:'Diese Navi-Aktion ist hier momentan nicht verfügbar.';
   else if(!nav?.guidanceRunning?.())message='Bitte zuerst die Navigation starten.';
   else message=nav.voiceControl?.(result.query)===true?replies[result.query]:'Diese Navi-Aktion ist momentan nicht verfügbar.';
   if(!overlay||serial!==current)return;
   pending=null;clarification=null;spokenDestination=null;dialoguePhase='idle';voiceDialogue=false;
   answer(message);status('Navi-Bedienung · Route unverändert');
   // Reuse free device/offline speech for simple control feedback.
   if(!speakFreeFollowUp(message))audioStatus('Bitte 🔊 tippen.');
   return;
  }
  if(result.intent==='check_traffic'){
   const nav=root.MeviGoogleNav;
   let message,offer=null;
   if(nav?.isNativeMode?.()){
    const situation=await navigationReadReply('traffic');
    if(!overlay||serial!==current)return;
    const shown=await nav.nativeGuidanceAction?.('overviewShow')===true;
    if(!overlay||serial!==current)return;
    message=situation+(shown?' Die Google-Routenübersicht ist geöffnet. Falls Google Alternativen anbietet, kannst du sie auf der Karte auswählen.':' Google berücksichtigt Verkehr bei der Routenführung; eine zusätzliche Alternativberechnung ist hier nicht verfügbar.');
   }
   else{
    let view=nav?.trafficCheckView?.();
    if(!view?.offer&&view?.enabled){
     await nav.checkTraffic();
     if(!overlay||serial!==current)return;
     view=nav.trafficCheckView?.();
    }
    offer=view?.offer;
    if(offer?.id&&Number.isFinite(offer.savingSeconds)&&offer.savingSeconds>=120&&Number.isFinite(offer.alternativeSeconds)){
     message='Die Alternative spart gegenüber der neuen Google-Standardroute '+Math.floor(offer.savingSeconds/60)+' Minuten. Soll ich diese Alternative übernehmen?';
     pending={intent:'traffic_confirm',offerId:offer.id};dialoguePhase='confirmation';
    }else message=view?.message||'Eine Verkehrsprüfung ist momentan nicht möglich.';
   }
   if(!overlay||serial!==current)return;
   clarification=null;spokenDestination=null;
   if(pending?.intent!=='traffic_confirm'){pending=null;dialoguePhase='idle';voiceDialogue=false;}
   answer(message);status(pending?'Alternative bestätigen · bisherige Route bleibt aktiv':'Verkehrsprüfung · keine Routenänderung');
   if(autoAudio){if(!playCloudSpeech(message,!!pending))audioStatus('Bitte 🔊 tippen.');}
   else speak(message,false,!!pending&&voiceDialogue);
   return;
  }
  if(result.intent==='read_navigation'){
   const message=await navigationReadReply(result.query);
   if(!overlay||serial!==current)return;
   pending=null;clarification=null;spokenDestination=null;dialoguePhase='idle';voiceDialogue=false;
   track('gemini','ok','Navigationsdaten gelesen');answer(message);status('Navigationsinformation · keine Routenänderung');
   if(autoAudio){if(!playCloudSpeech(message,false))audioStatus('Bitte 🔊 tippen.');}
   else speak(message,false,false);
   return;
  }
  if(shouldAskRouteChoice(text,result,hasRoute))
   result={intent:'clarify',query:'',poiType:'',
    reply:'Soll „'+result.query+'“ als neue Route oder als Zwischenstopp übernommen werden?',
    routeChoiceDestination:result.query};
  // The native AI reply is free text. Suppress unsolicited address-saving
  // suggestions even if a provider ignores the system instruction.
  if(result.intent!=='clarify'&&/speicher(?:n|st)?|adressbuch|favorit/i.test(result.reply||''))
   result.reply='Navigationsziel erkannt: '+result.query+'.';
  track('gemini','ok',result.afterRoute?'Mehrteiliger Fahrplan validiert':
   result.intent==='clarify'?'Rückfrage nötig':'Navigationswunsch validiert');
  // Automatic handoff is limited to a new, unambiguous destination with no
  // active route or additional stop. Google Places still verifies the result.
  spokenDestination=result.intent==='destination'&&!hasRoute&&!result.afterRoute?result:null;
  pending=result.intent==='clarify'?null:result.intent==='stop'&&editBaseline?.revision!==undefined?{...result,refinementRoute:editBaseline.revision}:result;
  dialoguePhase=result.intent==='clarify'?'clarification':'confirmation';
  clarification=result.intent==='clarify'?{
   original:previousClarification?.original||text,reply:result.reply,
   ...(result.routeChoiceDestination?{routeChoiceDestination:result.routeChoiceDestination}:{})
  }:null;
  const lastSource=injectedProvider?'adapter':configured()?getProvider('ai'):'demo';
  if(spokenDestination)result.reply='Ich suche jetzt nach '+result.query+'.';
  else if(result.intent!=='clarify')result.reply=confirmationPrompt(result,hasRoute);
  answer(result.reply);
  status(result.intent==='clarify'?'Bitte präzisieren.':
   result.intent==='destination'&&root.MeviGoogleNav?.exactAddressParts?.(result.query)&&!keySource()?.native?.()?
    'Nach Bestätigung wird die vollständige Adresse geprüft und bei eindeutigem Treffer die Route berechnet.':
   result.afterRoute?.scope==='destination'?
    'Ziel bestätigen und auswählen. Danach '+result.afterRoute.plural+' am Ziel anzeigen.':
   result.afterRoute?'Zuerst das Ziel bestätigen und auswählen. Nach der Routenberechnung folgen die Zwischenstopps.':
   result.intent==='poi'&&result.near?'Nach Bestätigung werden passende Orte im genannten Gebiet über Google Places gesucht.':
   lastSource==='demo'?'Testmodus · Ziel bestätigen':
   lastSource==='adapter'?'Testanbieter':'');
  // TTS reads the proposal BEFORE showing any Google Places suggestions.
  // Once playback ends, the microphone may reopen for Ja/Nein. It must not
  // capture Gemini's own voice. Only a deliberate Ja invokes accept().
  if(autoAudio){
   if(!playCloudSpeech(result.reply,true)){
    spokenDestination=null;
    audioStatus('Automatische Ausgabe nicht möglich. Bitte 🔊 tippen.');
   }
  }else if(!speak(result.reply,false,voiceDialogue))spokenDestination=null;
 }catch(e){
  if(!overlay||serial!==current)return;
  track('gemini','error','Interpretation oder KI-Antwort fehlgeschlagen');
  dialoguePhase='idle';voiceDialogue=false;spokenDestination=null;
  const quota=/Kontingent|HTTP 429|Free-Tier/i.test(e?.message||'');
  if(root.navigator?.onLine===false){
   showError('Keine Internetverbindung. Die bisherige Route bleibt erhalten.','Keine Internetverbindung. Lokale Navi-Befehle sind weiterhin möglich.');
   return;
  }
  showError(e.name==='AbortError'?providerName()+' antwortet nicht. Bitte erneut versuchen.':
   safeText(e.message)||'Gemini nicht erreichbar.',
   quota?'Gemini hat sein kostenloses Kontingent erreicht. Bitte versuche es später erneut.':
    'Gemini konnte die Anfrage nicht verarbeiten. Bitte versuche es erneut.');
 }finally{if(overlay&&serial===current){busy=false;updateButton()}}
}
function accept(){
 if(!overlay||!pending||busy)return false;
 const item=pending,api=root.MeviWebNavParity;
 if(item.intent==='next_stop_confirm'){
  const p=remainingStops,ctx=root.MeviGoogleNav?.routeContext?.();
  if(!p||p.waiting||Date.now()>p.expires||item.revision!==p.revision||ctx?.revision!==p.revision||
     selectedPlaceKey(ctx?.destination)!==p.key||ctx?.stops?.length!==p.count){
   remainingStops=null;pending=null;answer('Die Route hat sich geändert. Bitte neu planen.');updateButton();return false;
  }
  const stop=p.items.shift();p.waiting=true;
  if(!p.items.length)remainingStops=null;
  pending=null;close();api?.openStopSearch?.({gemini:true,preserveOrder:true});
  if(stop.poiType==='address')api?.input?.(stop.query);
  else api?.poi?.(stop.poiType,stop.query,stop.near||'','route',!!stop.placeName);
  return true;
 }
 if(item.intent==='compare_poi_confirm'){
  pending=null;dialoguePhase='idle';voiceDialogue=false;
  const shown=api?.voiceResultState?.();
  if(!shown||shown.mode!=='stop'||shown.lease!==item.lease){answer('Die Trefferliste oder Route hat sich geändert. Bitte erneut vergleichen.');updateButton();return false}
  close();void api?.comparePoiDetours?.();return true;
 }
 if(item.intent==='route_edit_confirm'){
  pending=null;dialoguePhase='idle';voiceDialogue=false;busy=true;updateButton();
  const turn=serial,nav=root.MeviGoogleNav;
  return Promise.resolve().then(()=>overlay&&serial===turn?nav?.voiceRouteAction?.(item.edit,item.revision,item.active,item.stopKey):false).then(ok=>{
   if(!overlay||serial!==turn)return !!ok;
   busy=false;
   const message=ok===true?'Die Navi-Aktion wurde ausgeführt.':'Die Routenaktion konnte nicht ausgeführt werden. Bitte prüfe die aktuelle Route.';
   answer(message);status(message);updateButton();
   speakFreeFollowUp(message);return ok===true;
  }).catch(()=>{
   if(overlay&&serial===turn){busy=false;answer('Die Routenaktion ist fehlgeschlagen.');status('Bitte Route prüfen.');updateButton();}
   return false;
  });
 }
 if(item.intent==='traffic_confirm'){
  pending=null;dialoguePhase='idle';voiceDialogue=false;
  const ok=root.MeviGoogleNav?.acceptTrafficRoute?.(true,item.offerId)===true;
  if(ok){close();return true}
  answer('Der Routenvorschlag ist nicht mehr gültig. Die bisherige Route bleibt aktiv.');status('Bitte Verkehr erneut prüfen.');updateButton();return false;
 }
 if(!api){status('Die gemeinsame Navi-Suche ist noch nicht geladen.');return false}
 if(item.refinementLease!==undefined&&api.voicePoiContext?.()?.lease!==item.refinementLease||
    item.refinementRoute!==undefined&&root.MeviGoogleNav?.routeContext?.()?.revision!==item.refinementRoute){
  pending=null;dialoguePhase='idle';answer('Die Suche oder Route hat sich geändert. Bitte neu suchen.');updateButton();return false;
 }
 const hasRoute=hasPlannedRoute();
 if(item.intent==='stop'&&!hasRoute){status('Bitte zuerst eine Route planen.');return false}
 // An active-list refinement reuses that same search session, including any
 // ordered multi-stop lease. It must not silently replace the selected route.
 if(item.refinementLease!==undefined&&typeof api.refineVoicePoi==='function'){
  const ok=api.refineVoicePoi(item,item.refinementLease);
  if(ok){close();return true}
  pending=null;dialoguePhase='idle';answer('Die Suchliste ist nicht mehr gültig.');updateButton();return false;
 }
 close();
 if(item.intent==='destination'&&item.afterRoute){
  routeStopPlan={destination:item.query,stop:item.afterRoute,more:item.afterRoutes||[],expires:Date.now()+300000};
  track('gemini','ok','Zusatzsuche wartet auf berechnete Route');
 }
 if(item.intent==='destination'&&!item.afterRoute&&
    typeof api.routeSavedDestination==='function'&&api.routeSavedDestination(item.query))
  return true;
 if(item.intent==='destination'&&!keySource()?.native?.()&&
    root.MeviGoogleNav?.exactAddressParts?.(item.query)&&
    typeof api.routeExactAddress==='function'){
  // A clear Gemini navigation request is enough to resolve one verified house-number hit
  // and compute a route immediately, without a second list selection.
  // Ambiguous/inexact Google results retain the existing manual search UI.
  void api.routeExactAddress(item.query,{gemini:true});
  return true;
 }
 if(item.intent==='destination'&&!item.afterRoute&&
    typeof api.routeExactCity==='function'&&api.routeExactCity(item.query,{gemini:true}))
  return true;
 if(item.intent==='stop')api.openStopSearch({gemini:true});
 else api.open({gemini:true});
 if(item.poiType&&typeof api.poi==='function')
  api.poi(item.poiType,item.query,item.near||'',item.intent==='stop'?'route':item.near?'area':'route',!!item.placeName,...(item.filters?[{...item.filters,...(item.intent==='stop'&&(item.filters.sort==='detour'||item.filters.arrivalOpen)?{compareConfirmed:true}:{})}]:[]));
 else {
  api.input(item.query);
  const field=document.getElementById('searchInput');
  if(field)field.value=item.query;
 }
 return true;
}
function setProvider(fn){injectedProvider=typeof fn==='function'?fn:null}
root.MeviGeminiVoice={open,start,close,listen,send,accept,replay,replayError,testTone,testVoice,configured,ready,
 setProvider,localInterpret,validate,onDestinationSelected,onRouteReady,onStopCommitted,onStopSearchCancelled,combinedTrip,mentionedStop,requestedStopArea,
 requestedResultNumber,refreshDiagnostics};
 root.MeviVoiceProviders={get:getProvider,set:setProviderChoice,options:VOICE_OPTIONS};
})(window);
