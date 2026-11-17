/* Central configuration UI. Never embed entered secrets into HTML or logs.
   Browser API keys / OAuth client identifiers retain their legacy local keys for compatibility.
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
  '<button type="button" onclick="MeviCredentials.save(\''+id+'\')">Speichern</button>'+
  '<button type="button" class="mevi-cred-remove" onclick="MeviCredentials.clear(\''+id+'\')">Entfernen</button></div>'+
  '<small class="mevi-cred-status">'+escapeHTML(status)+'</small><p>'+escapeHTML(description)+'</p></div>';
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
function html(){
 const ha=global.MeviHA?.debug?.()||{};
 const cal=json(CAL_KEY),road=json(ROAD_KEY);
 const android=nativeAvailable();
 const haSaved=!android&&!!webHaRecord();
 const groups=[
  '<h3>Google-Dienste</h3>',
  ...(android?[
   row('android-maps','Google Navigation SDK · Android-API-Key','Android-SDK-Schlüssel eingeben',
       nativeStatus?.mapsKey?'Verschlüsselt auf dem Gerät gespeichert':'Status auf dem Gerät prüfen',
       'Für Android-Karte, Google-Places-Adresssuche und Routenführung. Paket de.mevicar.next und SHA-1 der signierten APK in Google Cloud freigeben.',{secret:true})
  ]:[
   row('maps','Google Maps · Browser-API-Key','Neuen Browser-API-Key eingeben',
       saved(MAPS_KEY)?'Eingerichtet':'Nicht eingerichtet',
       'Nur für die Web-App: HTTP-Referrer auf die MeviCar-Seite einschränken. Kein Android-SDK-Schlüssel.')
  ]),
  row('calendar','Google Kalender · OAuth-Web-Client-ID','…apps.googleusercontent.com',
      cal.clientId?'Eingerichtet':'Nicht eingerichtet',
      'Client-ID für den lesenden Kalenderzugriff; Google-Passwort wird niemals hier eingegeben.'),
  '<h3>Medien und Blitzer</h3>',
  row('spotify','Spotify · Client-ID','Neue Spotify Client-ID eingeben',
      saved(SPOTIFY_KEY)?'Eingerichtet':'Nicht eingerichtet',
      'OAuth PKCE: kein Client Secret oder Spotify-Passwort erforderlich.'),
  row('road','Blitzer.de · HA-Konfigurations-ID','26-stellige Config Entry ID',
      road.configId?'Eingerichtet':'Nicht eingerichtet',
      'Steuert den optionalen Routenscan; kein Home-Assistant-Token.'),
  row('tv','MeviTV · vierstelliger PIN','Vierstelligen Zugangscode eingeben',
      tvPin?(nativePinAvailable?'Verschlüsselt in der APK gespeichert':'Auf diesem Gerät gespeichert'):'Nicht hinterlegt',
      android?'Die neue Android-APK speichert die PIN verschlüsselt. Bei älteren APK-Versionen kann die PIN im WebView-Speicher liegen.':'Der PIN bleibt auf diesem Gerät im Browser-Speicher; dort ist er nicht verschlüsselt.',{secret:true,pin:true}),
  '<h3>Home Assistant</h3>',
  row('ha','Home Assistant · Long-Lived Access Token','Neuen HA-Token einfügen',
      ha.connected?(haSaved?'API verbunden · im Browser gespeichert':'API verbunden'):haSaved?'Im Browser gespeichert · nicht verbunden':ha.tokenPresent?'Token in dieser Sitzung vorhanden':'Nicht verbunden',
      android?'Die Android-APK nutzt ihren bisherigen geschützten Gerätespeicher.':'Der Token bleibt nach einem Neustart in diesem Browser gespeichert (nicht verschlüsselt). Nur auf einem privaten PC verwenden; mit „Entfernen“ wieder löschen.',{secret:true}),
  '<div class="mevi-cred-row"><label for="mevi-cred-ha-origin">Home Assistant · HTTPS-Adresse</label>'+
  '<div class="mevi-cred-form"><input id="mevi-cred-ha-origin" type="url" spellcheck="false" value="'+escapeHTML(ha.origin||'')+'" placeholder="https://homeassistant.example">'+
  '<button type="button" onclick="MeviCredentials.save(\'ha-origin\')">Adresse speichern</button></div>'+
  '<label for="mevi-cred-ha-path">Dashboard-Pfad</label><input id="mevi-cred-ha-path" type="text" spellcheck="false" value="'+escapeHTML(ha.dashboard?.replace(ha.origin||'','')||'/')+'">'+
  '<p>API und Dashboard verwenden dieselbe gespeicherte HTTPS-Basisadresse. Für die Browser-API muss Home Assistant die CORS-Herkunft erlauben.</p></div>'
 ];
 if(android){
  groups.push('<h3>Nur Android-APK</h3>');
  groups.push(row('github-token','GitHub · Token für private APK-Updates','GitHub Fine-grained PAT eingeben',
    nativeStatus?.githubToken?'Verschlüsselt auf dem Gerät gespeichert':'Status auf dem Gerät prüfen',
    'Nur Zugriff auf eskiya771/mevicar-next · Contents: Read-only. Der Token wird ausschließlich im Android Keystore gespeichert.',{secret:true}));
  groups.push('<button type="button" onclick="MeviCredentials.refreshNativeStatus()">Gespeicherte Android-Zugänge prüfen</button>');
 }else{
  groups.push('<p class="mevi-cred-note">Der Android-Navigation-SDK-Schlüssel wird ausschließlich in Settings der APK eingegeben, nicht im Browser.</p>');
 }
 return '<div class="mevi-credentials"><p class="mevi-cred-intro">Alle Schlüssel, Client-IDs, PINs und Zugänge werden hier verwaltet. Die übrigen Apps haben keine eigenen Zugangsdatenfelder mehr.</p>'+
  groups.join('')+
  '<p class="mevi-cred-note">'+(android?
   'Android: Google-Navigation und Places verwenden ausschließlich den Android-API-Key im verschlüsselten Android Keystore; ein Browser-Key wird nicht benötigt.':
   'Web-App: Google Maps nutzt einen auf diese Website eingeschränkten Browser-API-Key.')+
   ' Der MeviTV-PIN wird in der aktuellen Android-APK verschlüsselt, in der Web-App lokal gespeichert. '+
   (android?'Die Android-APK verwaltet HA-Zugänge weiterhin separat.':'Der HA-Token wird lokal und unverschlüsselt in diesem Browser gespeichert, nicht auf GitHub.')+'</p>'+
  '<section class="mevi-backup" aria-label="Verschlüsselter Zugangsdaten-Transfer">'+
    '<h3>Verschlüsseltes Backup</h3>'+
    '<p>Überträgt API-Schlüssel, Zugangsdaten und die Spotify-Anmeldung auf ein anderes Gerät. Keine Cloud, kein GitHub-Upload.</p>'+
    '<label for="mevi-backup-pass">Backup-Passwort (mindestens 12 Zeichen)</label>'+
    '<input id="mevi-backup-pass" type="password" autocomplete="new-password" placeholder="Eigenes sicheres Passwort">'+
    '<label for="mevi-backup-confirm">Passwort für Export wiederholen</label>'+
    '<input id="mevi-backup-confirm" type="password" autocomplete="new-password" placeholder="Nur beim Export nötig">'+
    '<label for="mevi-backup-file">Gesicherte Datei zum Importieren</label>'+
    '<input id="mevi-backup-file" type="file" accept=".mevibackup,application/json">'+
    '<div class="mevi-backup-actions"><button type="button" onclick="MeviCredentials.exportBackup()">Backup exportieren</button>'+
    '<button type="button" onclick="MeviCredentials.importBackup()">Backup importieren</button></div>'+
    '<small>Die Backup-Datei enthält auch Spotify-Refresh-Token. Passwort und Datei getrennt aufbewahren. Die Anmeldung kann durch Spotify ungültig werden.</small></section>'+
  '<div id="mevi-credentials-feedback" role="status" aria-live="polite">'+escapeHTML(feedback)+'</div></div>';
}
async function save(id){
 const v=value(id);
 try {
  switch(id){
   case 'maps':
    if(nativeAvailable())throw new Error('Der Browser-Key ist in der APK nicht verfügbar. Bitte den Android-Navigation-Key verwenden.');
    if(!/^[A-Za-z0-9_-]{20,}$/.test(v))throw new Error('Google Maps Browser-Key ist ungültig.');
    localStorage.setItem(MAPS_KEY,v);break;
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
async function refreshNativeStatus(){
 try{const d=await nativeCall('settings.status');nativeStatus=d.configured||{};report('Android-Speicherstatus aktualisiert.');global.render?.()}
 catch(e){report(e.message)}
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

global.MeviCredentials={html,save,clear,exportBackup,importBackup,tvPin:()=>tvPin,tvPinReady,refreshNativeStatus,nativeAvailable,onNativeMessage};

})(typeof window==='undefined'?globalThis:window);
