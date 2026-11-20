/* Central configuration UI. Never embed entered secrets into HTML or logs.
   Gemini uses a device-bound browser store or Android Keystore; no proxy.
   HA token is persisted only in the standalone Web browser, scoped to the HA origin.
   Android keeps its existing native Keystore flow. The MeviTV PIN uses Android
   Keystore when supported by the APK, otherwise localStorage. */
(function(global){
'use strict';
const MAPS_KEY='mevicar-next-google-maps-key-v1';
const SPOTIFY_KEY='mevicar-spotify-client-v1';
const CAL_KEY='mevicar-next-calendar-settings-v1';
const ROAD_KEY='mevicar-next-roadassist-v1';
const TV_PIN_KEY='mevicar-next-tv-pin-v1';
const HA_WEB_TOKEN_KEY='mevicar-next-ha-web-token-v1';
let tvPin='', feedback='', nativeStatus=null, requestNumber=0;
let tvPinLoad=null,nativePinAvailable=false;
const pending=new Map();
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function saved(key){try{return localStorage.getItem(key)||''}catch{return ''}}
// The PIN is read only on this origin/device; it is never rendered in HTML or logs.
{const storedPin=saved(TV_PIN_KEY);if(/^\d{4}$/.test(storedPin))tvPin=storedPin;}
function json(key){try{return JSON.parse(saved(key)||'{}')}catch{return {}}}
function input(id){return document.getElementById('mevi-cred-'+id)}
function value(id){return String(input(id)?.value||'').trim()}
function clearInput(id){const field=input(id);if(field)field.value=''}
function report(s){feedback=String(s||'').slice(0,220);const e=document.getElementById('mevi-credentials-feedback');if(e)e.textContent=feedback}
function row(id,title,placeholder,status,description,options={}){
 const type=options.secret?'password':'text';
 const inputmode=options.pin?' inputmode="numeric" maxlength="4" pattern="[0-9]{4}"':'';
 return '<div class="mevi-cred-row"><label for="mevi-cred-'+id+'">'+escapeHTML(title)+'</label>'+
  '<div class="mevi-cred-form"><input id="mevi-cred-'+id+'" type="'+type+'"'+inputmode+
  ' autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="'+escapeHTML(placeholder)+'">'+
  (options.secret?'<button type="button" class="mevi-cred-reveal" aria-controls="mevi-cred-'+id+'" aria-pressed="false" onclick="MeviCredentials.toggleVisibility(\''+id+'\',this)">Anzeigen</button>':'')+
  '<button type="button" onclick="MeviCredentials.save(\''+id+'\')">Speichern</button>'+
  '<button type="button" class="mevi-cred-remove" onclick="MeviCredentials.clear(\''+id+'\')">Entfernen</button></div>'+
  '<small class="mevi-cred-status">'+escapeHTML(status)+'</small><p>'+escapeHTML(description)+'</p></div>';
}
/** Inspect a freshly entered secret locally without exposing it in generated HTML. */
function toggleVisibility(id,button){
 const field=input(id);
 if(!field||!button||!['password','text'].includes(field.type))return false;
 const revealed=field.type==='password';
 field.type=revealed?'text':'password';
 button.textContent=revealed?'Verbergen':'Anzeigen';
 button.setAttribute('aria-pressed',String(revealed));
 return revealed;
}
function nativeAvailable(){return !!(global.MeviNativeBridge?.postMessage || global.Capacitor?.Plugins?.MeviSecureSettings)}
// This opt-in is Web-only: do not copy an Android Keystore secret into localStorage.
function webHaRecord(){
 if(nativeAvailable())return null;
 try{
  const record=JSON.parse(localStorage.getItem(HA_WEB_TOKEN_KEY)||'null');
  if(!record||typeof record.origin!=='string'||typeof record.token!=='string'||
      record.token.length<20||/\s/.test(record.token))return null;
  return record;
 }catch{return null}
}
async function restoreWebHaToken(){
 const record=webHaRecord();
 const ha=global.MeviHA;
 if(!record||!ha?.debug||!ha?.connectWithToken)return false;
 // Never send a saved bearer token to a different HA installation.
 if(record.origin!==ha.debug().origin)return false;
 if(ha.debug().connected)return true;
 try{
  await ha.connectWithToken(record.token);
  return !!ha.debug().connected;
 }catch(e){
  // Offline and CORS failures must not erase the saved token.
  if(/HTTP 40[13]\b/.test(String(e?.message||e))){
   try{localStorage.removeItem(HA_WEB_TOKEN_KEY)}catch{}
  }
  return false;
 }
}
if(typeof global.addEventListener==='function'){
 global.addEventListener('load',()=>{void restoreWebHaToken()});
}
function nativeCall(action,name,secret){
 const plugin=global.Capacitor?.Plugins?.MeviSecureSettings;
 if(plugin&&!action.startsWith('settings.backup.')){
  if(action==='settings.status')return plugin.status();
  if(action==='settings.get')return plugin.get?.({name})||Promise.reject(new Error('Android-PIN-Abruf nicht verfügbar.'));
  if(action==='settings.set')return plugin.set({name,value:secret});
  if(action==='settings.clear')return plugin.remove({name});
  return Promise.reject(new Error('Android-Einstellung unbekannt.'));
 }
 return new Promise((resolve,reject)=>{
  if(!nativeAvailable())return reject(new Error('Nur in der Android-APK verfügbar.'));
  const id='settings-'+(++requestNumber);
  const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Keine Antwort der Android-App.'))},8000);
  pending.set(id,{resolve,reject,timer});
  try{global.MeviNativeBridge.postMessage(JSON.stringify({id,action,name,value:secret}))}
  catch(e){clearTimeout(timer);pending.delete(id);reject(new Error('Android-Schnittstelle nicht verfügbar.'))}
 });
}
function onNativeMessage(event){
 let data;try{data=JSON.parse(event.data)}catch{return}
 const item=pending.get(data.id);if(!item)return;
 pending.delete(data.id);clearTimeout(item.timer);
 if(data.ok)item.resolve(data);else item.reject(new Error(data.error||'Einstellung nicht gespeichert.'));
}
// Chain instead of overwrite: Spotify and update replies share this single bridge handler.
if(global.MeviNativeBridge){const previousNativeHandler=global.MeviNativeBridge.onmessage;global.MeviNativeBridge.onmessage=event=>{if(typeof previousNativeHandler==='function'){try{previousNativeHandler(event)}catch{}}onNativeMessage(event)}}
// Restore from the encrypted APK vault after WebView navigation, with automatic
// migration of an old localStorage PIN on the first updated APK launch.
function tvPinReady(){
 if(!nativeAvailable())return Promise.resolve(tvPin);
 if(tvPinLoad)return tvPinLoad;
 tvPinLoad=nativeCall('settings.get','tvPin').then(async response=>{
  const securePin=String(response?.value||'');
  nativePinAvailable=true;
  if(/^\d{4}$/.test(securePin))tvPin=securePin;
  else if(/^\d{4}$/.test(tvPin))await nativeCall('settings.set','tvPin',tvPin);
  try{localStorage.removeItem(TV_PIN_KEY)}catch{}
  return tvPin;
 }).catch(()=>tvPin);
 return tvPinLoad;
}
if(nativeAvailable())void tvPinReady();
const openGroups=new Set();
function toggleGroup(id,open){if(open)openGroups.add(id);else openGroups.delete(id)}
function group(id,title,status,body){
 return '<details class="mevi-service"'+(openGroups.has(id)?' open':'')+' ontoggle="MeviCredentials.toggleGroup(\''+id+'\',this.open)"><summary><span class="mevi-service-title">'+escapeHTML(title)+'</span><span class="mevi-service-status">'+escapeHTML(status)+'</span><span class="mevi-service-chevron" aria-hidden="true">›</span></summary><div class="mevi-service-body">'+body+'</div></details>';
}
let backupMode='export';
function setBackupMode(mode){backupMode=mode==='import'?'import':'export';global.render?.()}
function backupHTML(){
 const importing=backupMode==='import';
 return '<section class="mevi-backup" aria-label="Verschlüsselter Zugangsdaten-Transfer">'+
 '<div class="mevi-backup-modes" role="group" aria-label="Sicherungsaktion"><button type="button" aria-pressed="'+(!importing)+'" onclick="MeviCredentials.setBackupMode(\'export\')">Exportieren</button><button type="button" aria-pressed="'+importing+'" onclick="MeviCredentials.setBackupMode(\'import\')">Importieren</button></div>'+
 '<h3>'+(importing?'Sicherung wiederherstellen':'Verschlüsselte Sicherung erstellen')+'</h3>'+
 '<p>'+(importing?'Wähle deine .mevibackup-Datei und gib das zugehörige Passwort ein.':'Enthält API-Schlüssel, Zugangsdaten und die Spotify-Anmeldung.')+'</p>'+
 (importing?'<label for="mevi-backup-file">Sicherungsdatei</label><input id="mevi-backup-file" type="file" accept=".mevibackup,application/json">':'')+
 '<div class="mevi-backup-fields"><div><label for="mevi-backup-pass">'+(importing?'Backup-Passwort':'Passwort · mindestens 12 Zeichen')+'</label><input id="mevi-backup-pass" type="password" autocomplete="new-password" placeholder="Backup-Passwort"></div>'+
 (!importing?'<div><label for="mevi-backup-confirm">Passwort wiederholen</label><input id="mevi-backup-confirm" type="password" autocomplete="new-password" placeholder="Passwort bestätigen"></div>':'')+'</div>'+
 '<div class="mevi-backup-actions"><button type="button" onclick="MeviCredentials.'+(importing?'importBackup':'exportBackup')+'()">'+(importing?'Backup importieren':'Backup exportieren')+'</button></div>'+
 '<small>'+(importing?'Vorhandene Zugänge werden nach Bestätigung ersetzt.':'Datei und Passwort getrennt aufbewahren. Die Datei enthält auch die Spotify-Sitzung; Spotify kann eine erneute Anmeldung verlangen.')+'</small></section>'+
 '<div id="mevi-credentials-feedback" role="status" aria-live="polite">'+escapeHTML(feedback)+'</div>';
}
function html(){
 loadNativeStatus();
 const ha=global.MeviHA?.debug?.()||{};
 const cal=json(CAL_KEY),road=json(ROAD_KEY),android=nativeAvailable();
 const haSaved=!android&&!!webHaRecord();
 const status=ready=>ready?'Eingerichtet':'Nicht eingerichtet';
 const groups=[
 group('navigation','Google Navigation',android?(nativeStatus?.mapsKey?'Gespeichert':'Status prüfen'):status(saved(MAPS_KEY)),
 android?row('android-maps','Android-API-Key','Android-SDK-Schlüssel eingeben',nativeStatus?.mapsKey?'Verschlüsselt auf dem Gerät gespeichert':'Status auf dem Gerät prüfen','Für Karte, Adresssuche und Routenführung. In Google Cloud: Paket de.mevicar.next und SHA-1 der signierten APK freigeben.',{secret:true}):row('maps','Browser-API-Key','Neuen Browser-API-Key eingeben',status(saved(MAPS_KEY)),'In Google Cloud den HTTP-Referrer auf deine MeviCar-Website einschränken.',{secret:true})),
 group('gemini','Google Gemini',android?
   (nativeStatus?.geminiKey?'Im Android Keystore':nativeStatus?'Nicht eingerichtet':'Status wird geprüft …'):
   (global.MeviGeminiKey?.stored?.()?'Gespeichert':'Nicht eingerichtet'),
 row('gemini-key','Gemini API-Key','API-Key aus Google AI Studio einfügen',
  android?(nativeStatus?.geminiKey?'Sicher im Android Keystore · bleibt nach Updates erhalten':nativeStatus?'Nicht eingerichtet':'Status wird geprüft …'):
   (global.MeviGeminiKey?.stored?.()?'Auf diesem Gerät gespeichert · kein Passwort nötig':'Nicht eingerichtet'),
  android?'Einmal eingeben: Der Schlüssel bleibt im Android Keystore und übersteht Neustarts und App-Updates.':
   'Einmal eingeben: Der Schlüssel wird gerätegebunden in diesem Browser verschlüsselt und nach einem Neustart automatisch verwendet. Browserspeicher ist schwächer geschützt als der Android Keystore; direkte Anfragen können den Schlüssel im Netzwerk-/Entwicklerprotokoll zeigen.',
  {secret:true})),
 group('spotify','Spotify',status(saved(SPOTIFY_KEY)),row('spotify','Client-ID','Neue Spotify Client-ID eingeben',status(saved(SPOTIFY_KEY)),'Die Anmeldung erfolgt in der Spotify-App von MeviCar. Kein Client Secret oder Spotify-Passwort erforderlich.')),
 group('ha','Home Assistant',ha.connected?'Verbunden':haSaved?'Gespeichert · offline':'Nicht verbunden',
 '<div class="mevi-cred-row"><label for="mevi-cred-ha-origin">Server-Adresse</label><div class="mevi-cred-form"><input id="mevi-cred-ha-origin" type="url" spellcheck="false" value="'+escapeHTML(ha.origin||'')+'" placeholder="https://homeassistant.example"></div><label for="mevi-cred-ha-path">Dashboard-Pfad</label><div class="mevi-cred-form"><input id="mevi-cred-ha-path" type="text" spellcheck="false" value="'+escapeHTML(ha.dashboard?.replace(ha.origin||'','')||'/')+'"><button type="button" onclick="MeviCredentials.save(\'ha-origin\')">Adresse speichern</button></div></div>'+
 row('ha','Zugriffstoken','Neuen HA-Token einfügen',ha.connected?(haSaved?'API verbunden · im Browser gespeichert':'API verbunden'):haSaved?'Im Browser gespeichert · nicht verbunden':'Nicht verbunden',android?'Geschützter Gerätespeicher der Android-APK.':'Wird lokal und unverschlüsselt in diesem Browser gespeichert. Home Assistant muss diese Website per CORS erlauben.',{secret:true})),
 group('calendar','Google Kalender',status(cal.clientId),row('calendar','OAuth-Web-Client-ID','…apps.googleusercontent.com',status(cal.clientId),'Lesender Kalenderzugriff. Dein Google-Passwort wird hier nicht benötigt.')),
 group('road','Blitzer.de',status(road.configId),row('road','HA-Konfigurations-ID','26-stellige Config Entry ID',status(road.configId),'Für den optionalen Routenscan der Home-Assistant-Integration.')),
 group('tv','MeviTV',tvPin?'PIN hinterlegt':'Nicht eingerichtet',row('tv','Vierstelliger PIN','Vierstelligen Zugangscode eingeben',tvPin?(nativePinAvailable?'Verschlüsselt in der APK gespeichert':'Auf diesem Gerät gespeichert'):'Nicht hinterlegt',android?'Aktuelle APK: verschlüsselt im Gerätespeicher. Ältere APKs: gegebenenfalls im WebView-Speicher.':'Lokal und unverschlüsselt in diesem Browser gespeichert.',{secret:true,pin:true}))
 ];
 if(android)groups.push(group('android','Android-Updates',nativeStatus?.githubToken?'Gespeichert':'Status prüfen',row('github-token','GitHub-Token','GitHub Fine-grained PAT eingeben',nativeStatus?.githubToken?'Verschlüsselt auf dem Gerät gespeichert':'Status auf dem Gerät prüfen','Nur eskiya771/mevicar-next · Contents: Read-only. Speicherung im Android Keystore.',{secret:true})+'<button type="button" onclick="MeviCredentials.refreshNativeStatus()">Gerätespeicher prüfen</button>'));
 // Keep save/validation feedback above the service list so it stays visible
 // while editing an expanded service near the bottom of the scroll region.
 return '<div class="mevi-credentials"><div id="mevi-credentials-feedback" role="status" aria-live="polite">'+escapeHTML(feedback)+'</div>'+groups.join('')+'</div>';
}
async function save(id){
 const v=value(id);
 try {
  switch(id){
   case 'maps':
    if(nativeAvailable())throw new Error('Der Browser-Key ist in der APK nicht verfügbar. Bitte den Android-Navigation-Key verwenden.');
    if(!/^[A-Za-z0-9_-]{20,}$/.test(v))throw new Error('Google Maps Browser-Key ist ungültig.');
    localStorage.setItem(MAPS_KEY,v);break;
   case 'gemini-key':
    if(!global.MeviGeminiKey)throw new Error('Gemini-Schlüsselspeicher ist nicht verfügbar.');
    await global.MeviGeminiKey.save(v);
    if(nativeAvailable())nativeStatus={...nativeStatus,geminiKey:true};
    break;
   case 'spotify':
    if(!/^[A-Za-z0-9]{8,64}$/.test(v))throw new Error('Spotify Client-ID ist ungültig.');
    global.meviSpotifySaveClient?.(v);break;
   case 'calendar':
    if(!global.MeviCalendar?.setClientId?.(v))throw new Error('Google OAuth-Client-ID ist ungültig.');break;
   case 'road':
    if(!global.MeviRoadAssist?.setConfigId?.(v))throw new Error('Blitzer Konfigurations-ID ist ungültig.');break;
   case 'tv':
    if(!/^\d{4}$/.test(v))throw new Error('PIN muss aus genau vier Ziffern bestehen.');
    await tvPinReady();
    if(nativePinAvailable){
     await nativeCall('settings.set','tvPin',v);
     try{localStorage.removeItem(TV_PIN_KEY)}catch{}
    }else{
     // Web or legacy APK: do not claim success unless persistence is verified.
     localStorage.setItem(TV_PIN_KEY,v);
     if(saved(TV_PIN_KEY)!==v)throw new Error('Die PIN konnte nicht dauerhaft gespeichert werden.');
    }
    tvPin=v;break;
   case 'ha':
    if(v.length<20||/\s/.test(v))throw new Error('Bitte einen gültigen Home-Assistant-Token eingeben.');
    await global.MeviHA?.connectWithToken?.(v);
    if(!global.MeviHA?.debug?.().connected)throw new Error('HA-Verbindung fehlgeschlagen. URL, Token und CORS prüfen.');
    if(nativeAvailable())await nativeCall('settings.set','haToken',v).catch(()=>null);
    else{
     const origin=global.MeviHA.debug().origin;
     if(typeof origin!=='string'||!origin.startsWith('https://'))throw new Error('Ungültige Home-Assistant-Adresse.');
     const record=JSON.stringify({origin,token:v});
     localStorage.setItem(HA_WEB_TOKEN_KEY,record);
     if(localStorage.getItem(HA_WEB_TOKEN_KEY)!==record)throw new Error('Der HA-Token konnte nicht dauerhaft gespeichert werden.');
    }
    break;
   case 'ha-origin':{
    const origin=value('ha-origin'),path=value('ha-path');
    const previousOrigin=global.MeviHA?.debug?.().origin;
    global.MeviHA?.configureEndpoint(origin,path);
    // An old token must never be replayed after changing the server address.
    if(!nativeAvailable()&&previousOrigin!==global.MeviHA?.debug?.().origin){
     localStorage.removeItem(HA_WEB_TOKEN_KEY);
    }
    break;
   }
   case 'android-maps':
    if(!/^[A-Za-z0-9_-]{20,}$/.test(v))throw new Error('Android-Navigation-API-Key ist ungültig.');
    await nativeCall('settings.set','mapsKey',v);
    nativeStatus={...nativeStatus,mapsKey:true};break;
   case 'github-token':
    if(v.length<20||v.length>8192||/\s/.test(v))throw new Error('GitHub-Token ist ungültig.');
    await nativeCall('settings.set','githubToken',v);
    nativeStatus={...nativeStatus,githubToken:true};break;
   default:throw new Error('Einstellung nicht bekannt.');
  }
  clearInput(id);report('Einstellung gespeichert.'); 
  if(id==='maps'){global.location.reload();return}
  if(id==='ha-origin'){const d=document.getElementById('mevi-cred-ha-path');if(d)d.blur()}
  global.render?.();
 }catch(e){report(e.message||'Speichern fehlgeschlagen.')}
}
async function clear(id){
 try{
  switch(id){
   case 'maps':
    if(nativeAvailable())throw new Error('In der APK ist nur der Android-Navigation-Key verfügbar.');
    localStorage.removeItem(MAPS_KEY);break;
   case 'gemini-key':
    await global.MeviGeminiKey?.remove?.();
    if(nativeAvailable())nativeStatus={...nativeStatus,geminiKey:false};
    break;
   case 'spotify':global.meviSpotifyResetClient?.(true);break;
   case 'calendar':global.MeviCalendar?.setClientId?.('');break;
   case 'road':global.MeviRoadAssist?.setConfigId?.('');break;
   case 'tv':
    await tvPinReady();
    if(nativePinAvailable)await nativeCall('settings.clear','tvPin');
    localStorage.removeItem(TV_PIN_KEY);tvPin='';break;
   case 'ha':
    global.MeviHA?.disconnect?.();
    // Clear any browser copy even when an old hybrid had used the same WebView origin.
    localStorage.removeItem(HA_WEB_TOKEN_KEY);
    if(nativeAvailable())await nativeCall('settings.clear','haToken').catch(()=>null);
    break;
   case 'android-maps':await nativeCall('settings.clear','mapsKey');nativeStatus={...nativeStatus,mapsKey:false};break;
   case 'github-token':await nativeCall('settings.clear','githubToken');nativeStatus={...nativeStatus,githubToken:false};break;
   default:throw new Error('Einstellung nicht bekannt.');
  }
  clearInput(id);report('Einstellung entfernt.');
  if(id==='maps'){global.location.reload();return}
  global.render?.();
 }catch(e){report(e.message||'Entfernen fehlgeschlagen.')}
}
async function refreshNativeStatus(silent){
 try{const d=await nativeCall('settings.status');nativeStatus=d.configured||{};if(silent!==true)report('Android-Speicherstatus aktualisiert.');global.render?.()}
 catch(e){if(silent!==true)report(e.message)}
}
/* Keys saved in the Android Keystore survive updates: show that without a manual status check. */
let nativeStatusRequested=false;
function loadNativeStatus(){
 if(nativeStatus||nativeStatusRequested||!nativeAvailable())return;
 nativeStatusRequested=true;
 void refreshNativeStatus(true).finally(()=>{nativeStatusRequested=false});
}

/* Portable backup v1. Only the explicit allowlist is exported, never all of localStorage.
   Spotify's access/refresh tokens are included to preserve the session where permitted.
   Android's Keystore contents are encrypted inside Kotlin before being returned to JS. */
const BACKUP_KEY_MAP=Object.freeze({
 maps:MAPS_KEY,spotifyClient:SPOTIFY_KEY,spotifySession:'mevicar-spotify-token-v1',
 calendar:CAL_KEY,road:ROAD_KEY,tvPin:TV_PIN_KEY,
 haConfig:'mevicar-next-ha-config-v1',haToken:HA_WEB_TOKEN_KEY
});
const BACKUP_FORMAT='mevicar-next-credentials';
const BACKUP_ROUNDS=310000;
function backupPassword(){
 const pass=String(document.getElementById('mevi-backup-pass')?.value||'');
 if(pass.length<12||pass.length>256)throw new Error('Backup-Passwort: 12 bis 256 Zeichen eingeben.');
 return pass;
}
function backupCrypto(){
 const wc=global.crypto;
 if(!wc?.subtle||!wc?.getRandomValues)throw new Error('Verschlüsselung benötigt HTTPS und einen aktuellen Browser.');
 return wc;
}
function backupEncode(bytes){
 let out='';for(let i=0;i<bytes.length;i+=4096)out+=String.fromCharCode(...bytes.subarray(i,i+4096));
 return global.btoa(out);
}
function backupDecode(value){
 if(typeof value!=='string'||value.length>2000000)throw Error('Ungültiger Backup-Datenblock.');
 const s=global.atob(value),bytes=new Uint8Array(s.length);
 for(let i=0;i<s.length;i++)bytes[i]=s.charCodeAt(i);
 return bytes;
}
async function backupKey(pass,salt){
 const base=await backupCrypto().subtle.importKey('raw',new TextEncoder().encode(pass),
  'PBKDF2',false,['deriveKey']);
 return backupCrypto().subtle.deriveKey({name:'PBKDF2',salt,iterations:BACKUP_ROUNDS,hash:'SHA-256'},
  base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function encryptBackup(data,pass){
 const salt=backupCrypto().getRandomValues(new Uint8Array(16));
 const iv=backupCrypto().getRandomValues(new Uint8Array(12));
 const key=await backupKey(pass,salt);
 const bytes=new TextEncoder().encode(JSON.stringify(data));
 const encrypted=await backupCrypto().subtle.encrypt({name:'AES-GCM',iv},key,bytes);
 return JSON.stringify({format:BACKUP_FORMAT,version:1,kdf:'PBKDF2-SHA256',iterations:BACKUP_ROUNDS,
  salt:backupEncode(salt),iv:backupEncode(iv),ciphertext:backupEncode(new Uint8Array(encrypted))});
}
async function decryptBackup(text,pass){
 let envelope;try{envelope=JSON.parse(text)}catch{throw Error('Keine gültige MeviCar-Backupdatei.')}
 if(envelope?.format!==BACKUP_FORMAT||envelope.version!==1||
    envelope.kdf!=='PBKDF2-SHA256'||envelope.iterations!==BACKUP_ROUNDS)throw Error('Backup-Format nicht unterstützt.');
 const salt=backupDecode(envelope.salt),iv=backupDecode(envelope.iv);
 if(salt.length!==16||iv.length!==12)throw Error('Backup-Datei ist beschädigt.');
 try{
  const key=await backupKey(pass,salt);
  const out=await backupCrypto().subtle.decrypt({name:'AES-GCM',iv},key,backupDecode(envelope.ciphertext));
  return JSON.parse(new TextDecoder().decode(out));
 }catch{throw Error('Passwort falsch oder Backup-Datei beschädigt.')}
}
function collectBackupWeb(){
 const result={};
 for(const [name,key] of Object.entries(BACKUP_KEY_MAP)){
  if(nativeAvailable()&&(name==='maps'||name==='haToken'||name==='tvPin'))continue;
  const value=saved(key);if(value)result[name]=value;
 }
 return result;
}
function inspectBackupItems(payload){
 if(!payload||payload.format!==BACKUP_FORMAT||payload.version!==1||!payload.items||
    typeof payload.items!=='object'||Array.isArray(payload.items))throw Error('Backup-Inhalt ungültig.');
 const out={};
 for(const [name,value] of Object.entries(payload.items)){
  if(!Object.prototype.hasOwnProperty.call(BACKUP_KEY_MAP,name))continue;
  if(typeof value!=='string'||value.length<1||value.length>16384)throw Error('Ungültiger Eintrag: '+name);
  out[name]=value;
 }
 if(out.maps&&!/^[A-Za-z0-9_-]{20,256}$/.test(out.maps))throw Error('Ungültiger Google-Web-Key im Backup.');
 if(out.spotifyClient&&!/^[A-Za-z0-9]{8,64}$/.test(out.spotifyClient))throw Error('Ungültige Spotify Client-ID.');
 if(out.tvPin&&!/^\d{4}$/.test(out.tvPin))throw Error('Ungültige TV-PIN.');
 if(out.spotifySession){
  let t;try{t=JSON.parse(out.spotifySession)}catch{throw Error('Spotify-Sitzung ist beschädigt.')}
  if(!t||typeof t.access_token!=='string'||!t.access_token||
     typeof t.refresh_token!=='string'||!t.refresh_token||
     !Number.isFinite(Number(t.expires_at))||String(t.token_type||'Bearer')!=='Bearer')
   throw Error('Spotify-Sitzung enthält keinen gültigen Refresh-Token.');
  if(!out.spotifyClient)throw Error('Zur Spotify-Sitzung fehlt die zugehörige Client-ID im Backup.');
 }
 for(const k of ['calendar','road','haConfig','haToken']){
  if(!out[k])continue;
  let data;try{data=JSON.parse(out[k])}catch{throw Error('Ungültige Einstellung: '+k)}
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Ungültige Einstellung: '+k);
  if(k==='haConfig'&&(!/^https:\/\//.test(data.origin||'')||data.origin.length>300))
   throw Error('Home-Assistant-Adresse im Backup ungültig.');
  if(k==='haToken'&&(!/^https:\/\//.test(data.origin||'')||typeof data.token!=='string'||
      data.token.length<20||/\s/.test(data.token)))throw Error('HA-Token im Backup ungültig.');
 }
 if(out.haToken&&out.haConfig){
  const record=JSON.parse(out.haToken),config=JSON.parse(out.haConfig);
  if(record.origin!==config.origin)throw Error('Home-Assistant-Token passt nicht zur gespeicherten Adresse.');
 }
 if(payload.nativeVault!==undefined&&(typeof payload.nativeVault!=='string'||
    payload.nativeVault.length>100000))throw Error('Ungültiger Android-Backupblock.');
 return out;
}
function clearBackupFields(){
 for(const id of ['mevi-backup-pass','mevi-backup-confirm']){
  const el=document.getElementById(id);if(el)el.value='';
 }
}
async function exportBackup(){
 try{
  const pass=backupPassword();
  if(pass!==String(document.getElementById('mevi-backup-confirm')?.value||''))
   throw Error('Die beiden Backup-Passwörter stimmen nicht überein.');
  if(nativeAvailable())await tvPinReady();
  const payload={format:BACKUP_FORMAT,version:1,created:new Date().toISOString(),
   source:nativeAvailable()?'android':'web',items:collectBackupWeb()};
  if(nativeAvailable()){
   const secure=await nativeCall('settings.backup.export','',pass);
   if(typeof secure?.blob!=='string'||!secure.blob)throw Error('Android-Schlüssel konnten nicht gesichert werden.');
   payload.nativeVault=secure.blob;
  }
  if(!Object.keys(payload.items).length&&!payload.nativeVault)throw Error('Keine gespeicherten Zugangsdaten gefunden.');
  inspectBackupItems(payload);
  const sealed=await encryptBackup(payload,pass);
  const file=new Blob([sealed],{type:'application/json'});
  const uri=global.URL.createObjectURL(file);
  const a=document.createElement('a');a.href=uri;a.download='mevicar-zugaenge-'+new Date().toISOString().slice(0,10)+'.mevibackup';
  document.body.appendChild(a);a.click();a.remove();
  global.setTimeout(()=>global.URL.revokeObjectURL(uri),60000);
  report('Verschlüsseltes Backup erstellt. Datei sicher aufbewahren.');clearBackupFields();
 }catch(_){report(_?.message||'Backup konnte nicht erstellt werden.')}
}
async function importBackup(){
 try{
  const pass=backupPassword();
  const file=document.getElementById('mevi-backup-file')?.files?.[0];
  if(!file)throw Error('Bitte eine .mevibackup-Datei auswählen.');
  if(file.size>2000000)throw Error('Backup-Datei ist zu groß.');
  const payload=await decryptBackup(await file.text(),pass);
  const items=inspectBackupItems(payload);
  if(!global.confirm('Gespeicherte Zugangsdaten auf diesem Gerät durch die importierten Werte ersetzen?'))return;
  // Import the encrypted native vault before changing any local browser settings.
  if(nativeAvailable()){
   if(payload.nativeVault){
    await nativeCall('settings.backup.import',payload.nativeVault,pass);
   }else{
    if(items.tvPin)await nativeCall('settings.set','tvPin',items.tvPin);
    if(items.haToken)await nativeCall('settings.set','haToken',JSON.parse(items.haToken).token);
   }
  }
  let count=0;
  for(const [name,value] of Object.entries(items)){
   if(nativeAvailable()&&(name==='maps'||name==='tvPin'||name==='haToken'))continue;
   localStorage.setItem(BACKUP_KEY_MAP[name],value);count++;
  }
  clearBackupFields();
  report('Backup importiert: '+count+' Browser-Einstellungen'+
   (nativeAvailable()?' und geschützter Android-Speicher':'')+
   (!nativeAvailable()&&payload.nativeVault?' (Android-Keystore-Zugänge nur in der APK wiederherstellbar)':'')+
   '. App wird neu geladen.');
  global.setTimeout(()=>global.location.reload(),400);
 }catch(_){report(_?.message||'Backup konnte nicht importiert werden.')}
}

global.MeviCredentials={html,backupHTML,setBackupMode,toggleGroup,toggleVisibility,save,clear,exportBackup,importBackup,tvPin:()=>tvPin,tvPinReady,refreshNativeStatus,nativeAvailable,onNativeMessage};

})(typeof window==='undefined'?globalThis:window);

