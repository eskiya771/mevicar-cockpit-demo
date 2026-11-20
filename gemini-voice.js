/* MeviCar Next – one-shot voice intent entry for the shared Navi search.
   The user's own key is kept in Android Keystore or a device-bound Web store.
   With a saved key the app calls Gemini directly, no Synology or proxy. */
(function(root){
'use strict';
let overlay=null,recognizer=null,pending=null,abort=null,serial=0,busy=false,hearing=false;
let injectedProvider=null,transcript='',lastReply='',lastSource='demo',clarification=null;
const safeText=v=>String(v||'').trim().slice(0,200);
const keySource=()=>root.MeviGeminiKey;
const configured=()=>!!keySource()?.stored?.();
const ready=()=>configured()&&!!keySource()?.isUnlocked?.();
function dialog(){
 const el=document.createElement('div');
 el.className='mg-gemini-backdrop';
 el.id='mg-gemini-voice';
 el.innerHTML='<section class="mg-gemini-dialog" role="dialog" aria-modal="true" aria-label="Gemini Sprach-Zielsuche">'+
  '<header><div><strong>Gemini · Navi-Assistent</strong><small id="mg-gemini-mode"></small></div>'+
  '<button type="button" class="mg-gemini-close" aria-label="Schließen" onclick="MeviGeminiVoice.close()">×</button></header>'+
  '<p class="mg-gemini-help">Sag zum Beispiel: „Navigiere zum Bahnhof Erlangen“ oder „Suche eine Tankstelle auf meiner Route“.</p>'+
  '<label for="mg-gemini-input">Dein Wunsch</label>'+
  '<div class="mg-gemini-inputrow"><textarea id="mg-gemini-input" maxlength="400" rows="2" spellcheck="false" placeholder="Ziel, Zwischenstopp oder POI frei beschreiben"></textarea>'+
  '<button type="button" class="mg-gemini-mic" id="mg-gemini-mic" onclick="MeviGeminiVoice.listen()" aria-label="Spracheingabe starten">🎙</button></div>'+
  '<div class="mg-gemini-controls"><button type="button" id="mg-gemini-send" onclick="MeviGeminiVoice.send()">Verstehen</button>'+
  '<button type="button" id="mg-gemini-accept" hidden onclick="MeviGeminiVoice.accept()">In Navi suchen</button></div>'+
  '<div class="mg-gemini-status" id="mg-gemini-status" role="status" aria-live="polite">Bereit. Mikrofon oder Tastatur verwenden.</div>'+
  '<p class="mg-gemini-answer" id="mg-gemini-answer"></p>'+
  '<small class="mg-gemini-privacy">Kein dauerndes Zuhören. Die Navigation startet nicht ohne deine Auswahl.</small>'+
  '</section>';
 el.addEventListener('click',e=>{if(e.target===el)close()});
 return el;
}
function part(id){return overlay?.querySelector('#'+id)||null}
function status(value){const e=part('mg-gemini-status');if(e)e.textContent=String(value||'')}
function answer(value){const e=part('mg-gemini-answer');if(e)e.textContent=String(value||'')}
function updateButton(){
 const button=part('mg-gemini-send');if(button)button.disabled=busy||hearing;
 const mic=part('mg-gemini-mic');if(mic){mic.disabled=busy;mic.textContent=hearing?'■':'🎙';mic.setAttribute('aria-label',hearing?'Spracheingabe beenden':'Spracheingabe starten')}
 const accept=part('mg-gemini-accept');if(accept)accept.hidden=!pending||busy;
 const mode=part('mg-gemini-mode');if(mode)mode.textContent=ready()?'Gemini bereit · direkter Gerätezugriff':
  configured()?'Gemini-Key gespeichert · wird geladen':'Lokaler Testmodus · Gemini-Key fehlt';
}
function open(){
 if(overlay)return true;
 root.MeviWebNavParity?.hideSearchKeyboard?.();
 overlay=dialog();document.body.appendChild(overlay);
 pending=null;transcript='';lastReply='';clarification=null;hearing=false;busy=false;
 updateButton();part('mg-gemini-input')?.focus?.({preventScroll:true});
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
function stopRecognition(){
 if(!recognizer)return;
 const last=recognizer;recognizer=null;hearing=false;
 try{last.abort()}catch{}
 updateButton();
}
function close(){
 serial++;abort?.abort?.();abort=null;stopRecognition();
 root.speechSynthesis?.cancel?.();
 overlay?.remove();overlay=null;pending=null;clarification=null;busy=false;
}
function speak(value){
 if(!root.speechSynthesis||!root.SpeechSynthesisUtterance)return;
 try{
  root.speechSynthesis.cancel();
  const speech=new root.SpeechSynthesisUtterance(String(value).slice(0,230));
  speech.lang='de-DE';speech.rate=1.04;speech.volume=1;
  root.speechSynthesis.speak(speech);
 }catch{}
}
function listen(){
 if(!overlay||busy)return false;
 if(keySource()?.native?.()){
  // Android WebView: the system recogniser dictates, the Web gets the text.
  if(hearing)return true;
  if(!keySource().dictate){status('Spracheingabe braucht eine neuere APK. Bitte den Wunsch eintippen.');return false}
  const current=serial;
  root.speechSynthesis?.cancel?.();
  hearing=true;status('Ich höre zu … bitte jetzt sprechen.');updateButton();
  void keySource().dictate().then(words=>{
   if(!overlay||current!==serial)return;
   hearing=false;updateButton();
   words=safeText(words);
   if(!words){status('Keine Sprache erkannt. Du kannst den Text eingeben.');return}
   const field=part('mg-gemini-input');if(field)field.value=words;
   void send();
  }).catch(error=>{
   if(!overlay||current!==serial)return;
   hearing=false;updateButton();
   status(/Unbekannte Funktion/.test(error?.message||'')?
    'Spracheingabe braucht eine neuere APK. Bitte den Wunsch eintippen.':
    safeText(error?.message)||'Spracheingabe fehlgeschlagen. Bitte erneut versuchen.');
  });
  return true;
 }
 if(hearing){stopRecognition();status('Aufnahme beendet.');return true}
 const Speech=root.SpeechRecognition||root.webkitSpeechRecognition;
 if(!Speech){status('Spracherkennung ist hier nicht verfügbar. Bitte den Wunsch eintippen.');return false}
 try{
  root.speechSynthesis?.cancel?.();
  const recognition=new Speech();
  recognizer=recognition;recognition.lang='de-DE';recognition.continuous=false;
  recognition.interimResults=false;recognition.maxAlternatives=1;
  recognition.onresult=e=>{
   if(recognizer!==recognition||!overlay)return;
   const words=safeText(e.results?.[0]?.[0]?.transcript);
   if(!words)return;
   const field=part('mg-gemini-input');if(field)field.value=words;
   stopRecognition();void send();
  };
  recognition.onerror=e=>{
   if(recognizer!==recognition)return;
   recognizer=null;hearing=false;updateButton();
   status({'not-allowed':'Mikrofonberechtigung fehlt.',
    'service-not-allowed':'Der Browser erlaubt hier keine Spracherkennung. Bitte den Wunsch eintippen.',
    'network':'Spracherkennung nicht erreichbar (Netzwerk). Bitte den Wunsch eintippen.',
    'audio-capture':'Kein Mikrofon gefunden.',
    'no-speech':'Keine Sprache erkannt. Du kannst den Text eingeben.',
    'aborted':'Aufnahme beendet.'}[e.error]||'Spracheingabe fehlgeschlagen. Bitte erneut versuchen.');
  };
  recognition.onend=()=>{
   if(recognizer!==recognition)return;
   recognizer=null;hearing=false;updateButton();
   status('Keine Sprache erkannt. Du kannst den Text eingeben.');
  };
  hearing=true;status('Ich höre zu …');updateButton();recognition.start();return true;
 }catch{
  recognizer=null;hearing=false;updateButton();
  status('Mikrofon konnte nicht gestartet werden.');return false;
 }
}
function localInterpret(utterance,context={}){
 const text=safeText(utterance),low=text.toLocaleLowerCase('de-DE');
 if(!text)return {intent:'clarify',reply:'Was soll ich für dich suchen?',query:''};
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
function validate(raw,context){
 if(!raw||typeof raw!=='object')throw Error('Ungültige Antwort vom Gemini-Dienst.');
 const intent=String(raw.intent||'');
 if(!['destination','stop','poi','clarify'].includes(intent))throw Error('Gemini-Antwort enthält kein unterstütztes Ziel.');
 const query=safeText(raw.query);
 const poiType=['fuel','charge','parking','food','cafe','cart','rest','wrench'].includes(raw.poiType)?raw.poiType:'';
 const reply=safeText(raw.reply)||'Ich habe deine Anfrage verstanden.';
 if(['destination','stop','poi'].includes(intent)&&!query)throw Error('Ein Ziel für die Suche fehlt.');
 if(intent==='stop'&&!context.hasRoute)
  return {intent:'clarify',query:'',reply:'Für einen Zwischenstopp benötigst du zuerst eine geplante Route.'};
 return {intent,query,poiType,reply};
}
async function requestGemini(text,context){
 if(injectedProvider)return validate(await injectedProvider(text,context),context);
 const vault=keySource();
 if(!vault?.stored?.())return validate(localInterpret(text,context),context);
 if(!vault.isUnlocked())await vault.refresh?.();
 if(!vault.isUnlocked())throw Error('Der gespeicherte Gemini-Key ist nicht lesbar. Bitte unter Settings → Zugänge neu speichern.');
 const controller=new AbortController();abort=controller;
 const timeout=setTimeout(()=>controller.abort(),35000);
 try{return validate(await vault.generate(text,context,controller.signal),context)}
 finally{clearTimeout(timeout);if(abort===controller)abort=null}
}
async function send(){
 if(!overlay||busy)return;
 const text=safeText(part('mg-gemini-input')?.value);
 if(!text){status('Bitte ein Ziel oder eine Frage eingeben.');return}
 stopRecognition();const current=++serial;busy=true;pending=null;transcript=text;
 answer('');status(configured()?'Gemini verarbeitet deine Anfrage …':'Lokaler Testmodus verarbeitet deine Anfrage …');
 updateButton();
 const hasRoute=!!root.MeviGoogleNav?.hasPlannedRoute?.()||!!root.MeviGoogleNav?.guidanceDashboardData?.()?.routeActive;
 const previousClarification=clarification;
 try{
  const result=await requestGemini(text,{hasRoute,clarification:previousClarification});
  if(!overlay||serial!==current)return;
  pending=result.intent==='clarify'?null:result;lastReply=result.reply;
  clarification=result.intent==='clarify'?{original:text,reply:result.reply}:null;
  lastSource=injectedProvider?'adapter':configured()?'gemini':'demo';
  answer(result.reply);
  status(result.intent==='clarify'?'Bitte präzisieren.':lastSource==='demo'?'Testmodus · keine Gemini-Antwort':
   lastSource==='adapter'?'Testanbieter · bitte Ziel bestätigen.':'Bitte Ziel bestätigen.');
  speak(result.reply);
 }catch(e){
  if(!overlay||serial!==current)return;
  status(e.name==='AbortError'?'Gemini antwortet nicht. Bitte erneut versuchen.':safeText(e.message)||'Gemini nicht erreichbar.');
 }finally{if(overlay&&serial===current){busy=false;updateButton()}}
}
function accept(){
 if(!overlay||!pending||busy)return false;
 const item=pending,api=root.MeviWebNavParity;
 if(!api){status('Die gemeinsame Navi-Suche ist noch nicht geladen.');return false}
 const hasRoute=!!root.MeviGoogleNav?.hasPlannedRoute?.()||!!root.MeviGoogleNav?.guidanceDashboardData?.()?.routeActive;
 if(item.intent==='stop'&&!hasRoute){status('Bitte zuerst eine Route planen.');return false}
 close();
 if(item.intent==='stop')api.openStopSearch();
 else api.open();
 if(item.poiType&&typeof api.poi==='function')api.poi(item.poiType,item.query);
 else {
  api.input(item.query);
  const field=document.getElementById('searchInput');
  if(field)field.value=item.query;
 }
 return true;
}
function setProvider(fn){injectedProvider=typeof fn==='function'?fn:null}
root.MeviGeminiVoice={open,close,listen,send,accept,configured,ready,
 setProvider,localInterpret,validate};
})(window);
