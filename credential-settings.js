/* Central configuration UI. Never embed entered secrets into HTML or logs.
   Browser API keys / OAuth client identifiers retain their legacy local keys for compatibility.
   HA access token and MeviTV PIN are session-memory only; Android stores its native SDK key in Keystore. */
(function(global){
'use strict';
const MAPS_KEY='mevicar-next-google-maps-key-v1';
const SPOTIFY_KEY='mevicar-spotify-client-v1';
const CAL_KEY='mevicar-next-calendar-settings-v1';
const ROAD_KEY='mevicar-next-roadassist-v1';
let tvPin='', feedback='', nativeStatus=null, requestNumber=0;
const pending=new Map();
const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function saved(key){try{return localStorage.getItem(key)||''}catch{return ''}}
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
function nativeCall(action,name,secret){
 const plugin=global.Capacitor?.Plugins?.MeviSecureSettings;
 if(plugin){
  if(action==='settings.status')return plugin.status();
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
if(global.MeviNativeBridge)global.MeviNativeBridge.onmessage=onNativeMessage;
function html(){
 const ha=global.MeviHA?.debug?.()||{};
 const cal=json(CAL_KEY),road=json(ROAD_KEY);
 const android=nativeAvailable();
 const groups=[
  '<h3>Google-Dienste</h3>',
  row('maps','Google Maps · Browser-API-Key','Neuen Browser-API-Key eingeben',
      saved(MAPS_KEY)?'Eingerichtet':'Nicht eingerichtet',
      'Für die Web-App: HTTP-Referrer auf die MeviCar-Seite einschränken. Kein Android-SDK-Schlüssel.'),
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
      tvPin?'Für diese Sitzung hinterlegt':'Nicht hinterlegt',
      'PIN wird nur im Arbeitsspeicher aufbewahrt und nach Neustart verworfen.',{secret:true,pin:true}),
  '<h3>Home Assistant</h3>',
  row('ha','Home Assistant · Long-Lived Access Token','Neuen HA-Token einfügen',
      ha.connected?'API verbunden':ha.tokenPresent?'Token in dieser Sitzung vorhanden':'Nicht verbunden',
      'Der Browser bewahrt den Token nur bis zum Neuladen im Arbeitsspeicher auf.',{secret:true}),
  '<div class="mevi-cred-row"><label for="mevi-cred-ha-origin">Home Assistant · HTTPS-Adresse</label>'+
  '<div class="mevi-cred-form"><input id="mevi-cred-ha-origin" type="url" spellcheck="false" value="'+escapeHTML(ha.origin||'')+'" placeholder="https://homeassistant.example">'+
  '<button type="button" onclick="MeviCredentials.save(\'ha-origin\')">Adresse speichern</button></div>'+
  '<label for="mevi-cred-ha-path">Dashboard-Pfad</label><input id="mevi-cred-ha-path" type="text" spellcheck="false" value="'+escapeHTML(ha.dashboard?.replace(ha.origin||'','')||'/')+'">'+
  '<p>API und Dashboard verwenden dieselbe gespeicherte HTTPS-Basisadresse. Für die Browser-API muss Home Assistant die CORS-Herkunft erlauben.</p></div>'
 ];
 if(android){
  groups.push('<h3>Nur Android-APK</h3>');
  groups.push(row('android-maps','Google Navigation SDK · Android-API-Key','Android-SDK-Schlüssel eingeben',
    nativeStatus?.mapsKey?'Verschlüsselt auf dem Gerät gespeichert':'Status auf dem Gerät prüfen',
    'Nur für de.mevicar.next. Google Cloud muss die passende Paket-ID und den SHA-1-Fingerabdruck erlauben.',{secret:true}));
  groups.push('<button type="button" onclick="MeviCredentials.refreshNativeStatus()">Gespeicherte Android-Zugänge prüfen</button>');
 }else{
  groups.push('<p class="mevi-cred-note">Der Android-Navigation-SDK-Schlüssel wird ausschließlich in Settings der APK eingegeben, nicht im Browser.</p>');
 }
 return '<div class="mevi-credentials"><p class="mevi-cred-intro">Alle Schlüssel, Client-IDs, PINs und Zugänge werden hier verwaltet. Die übrigen Apps haben keine eigenen Zugangsdatenfelder mehr.</p>'+
  groups.join('')+
  '<p class="mevi-cred-note">Sicherheit: Browser-Schlüssel und öffentliche Client-IDs bleiben im lokalen Browser-Speicher. Browser-Schlüssel müssen bei Google Cloud eingeschränkt werden; sie sind keine geheimen Server-Schlüssel. Home-Assistant-Token und MeviTV-PIN werden im Browser nicht dauerhaft gespeichert. Android-SDK-Schlüssel liegen verschlüsselt im Android Keystore.</p>'+
  '<div id="mevi-credentials-feedback" role="status" aria-live="polite">'+escapeHTML(feedback)+'</div></div>';
}
async function save(id){
 const v=value(id);
 try {
  switch(id){
   case 'maps':
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
    tvPin=v;break;
   case 'ha':
    if(v.length<20||/\s/.test(v))throw new Error('Bitte einen gültigen Home-Assistant-Token eingeben.');
    await global.MeviHA?.connectWithToken?.(v);
    if(!global.MeviHA?.debug?.().connected)throw new Error('HA-Verbindung fehlgeschlagen. URL, Token und CORS prüfen.');
    if(nativeAvailable())await nativeCall('settings.set','haToken',v).catch(()=>null);
    break;
   case 'ha-origin':{
    const origin=value('ha-origin'),path=value('ha-path');
    global.MeviHA?.configureEndpoint(origin,path);
    break;
   }
   case 'android-maps':
    if(!/^[A-Za-z0-9_-]{20,}$/.test(v))throw new Error('Android-Navigation-API-Key ist ungültig.');
    await nativeCall('settings.set','mapsKey',v);
    nativeStatus={...nativeStatus,mapsKey:true};break;
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
   case 'maps':localStorage.removeItem(MAPS_KEY);break;
   case 'spotify':global.meviSpotifyResetClient?.(true);break;
   case 'calendar':global.MeviCalendar?.setClientId?.('');break;
   case 'road':global.MeviRoadAssist?.setConfigId?.('');break;
   case 'tv':tvPin='';break;
   case 'ha':global.MeviHA?.disconnect?.();if(nativeAvailable())await nativeCall('settings.clear','haToken').catch(()=>null);break;
   case 'android-maps':await nativeCall('settings.clear','mapsKey');nativeStatus={...nativeStatus,mapsKey:false};break;
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
global.MeviCredentials={html,save,clear,tvPin:()=>tvPin,refreshNativeStatus,nativeAvailable,onNativeMessage};
if(global.MeviNativeBridge)global.MeviNativeBridge.onmessage=onNativeMessage;
})(typeof window==='undefined'?globalThis:window);
