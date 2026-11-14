/* MeviCar Next in-APK updater: adapted from Classic's private GitHub installer.
 * Pure web PWA: informational view only. Native APK: releases, download, install.
 * The private GitHub token is NEVER available to JavaScript; native Keystore owns it.
 */
(function(global){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const native=()=>!!global.MeviNativeBridge?.postMessage;
const tasks=new Map();
let serial=0;
let state={
  initialized:false,supported:null,busy:false,channel:'preview',
  installedBuild:null,installedVersion:'',release:null,available:false,
  canInstall:false,downloaded:false,progress:0,total:0,message:'',error:''
};
function receive(event) {
  let data;
  try{data=JSON.parse(event.data)}catch{return}
  const item=tasks.get(data.id); if(!item)return;
  if(data.type==='progress'){
    item.onProgress?.(Number(data.loaded)||0,Number(data.total)||0);
    clearTimeout(item.timer);
    item.timer=setTimeout(()=>{tasks.delete(data.id);item.reject(new Error('Zeitüberschreitung beim Download.'))},300000);
    return;
  }
  tasks.delete(data.id);clearTimeout(item.timer);
  if(data.ok)item.resolve(data);
  else item.reject(new Error(String(data.error||'Update fehlgeschlagen.')));
}
if(native()){
  const previous=global.MeviNativeBridge.onmessage;
  global.MeviNativeBridge.onmessage=event=>{
    if(typeof previous==='function')previous(event);
    receive(event);
  };
}
function request(action,fields={},onProgress){
  return new Promise((resolve,reject)=>{
    if(!native()){reject(new Error('APK-Updater ist nur in der Android-App verfügbar.'));return;}
    const id='update-'+(++serial);
    const timer=setTimeout(()=>{
      tasks.delete(id);reject(new Error('Keine Antwort der Android-App.'));
    },(action==='update.download'||action==='web.update')?300000:45000);
    tasks.set(id,{resolve,reject,timer,onProgress});
    try{global.MeviNativeBridge.postMessage(JSON.stringify({id,action,...fields}))}
    catch(error){clearTimeout(timer);tasks.delete(id);reject(new Error('Android-Bridge nicht erreichbar.'))}
  });
}
function formatSize(n){return Number(n)>0?(Number(n)/1000000).toFixed(1)+' MB':'—'}
function progressText(){
 const count=Number(state.progress)||0,total=Number(state.total)||0;
 return total>0?'Download: '+Math.round(100*count/total)+' % ('+formatSize(count)+' / '+formatSize(total)+')':'Bereit';
}
function liveProgress(){
 const node=document.getElementById('mevi-update-progress-label');
 if(node)node.textContent=progressText();
 const bar=document.getElementById('mevi-update-progress');
 if(bar)bar.value=state.total>0?Math.min(100,Math.round(100*state.progress/state.total)):0;
}
function paint(){global.render?.()}
function statusInfo(data){
 const x=data?.update||{};
 state.initialized=true;
 state.channel=x.channel==='stable'?'stable':'preview';
 state.installedBuild=Number.isInteger(x.installedBuild)?x.installedBuild:null;
 state.installedVersion=String(x.installedVersion||'');
 state.canInstall=!!x.canInstall;
 if(x.latest){
  state.release=x.latest;
  state.available=Number(x.latest.build)>Number(state.installedBuild);
 }
}
function html(){
 if(!native()){
  return '<section class="mevi-updates"><h3>Web-App-Updates</h3><p>Diese Seite läuft als Web-App. Updates werden durch GitHub Pages veröffentlicht und über die Update-Funktion der Web-App geladen.</p>'+
  '<button type="button" onclick="checkForUpdate()">Web-App auf Updates prüfen</button>'+
  '<p class="mevi-update-note">Der native APK-Installer und GitHub-Token werden ausschließlich in der Android-APK angeboten.</p></section>';
 }
 if(state.supported===false)return '<section class="mevi-updates"><h3>APK-Updates</h3><p>Diese ältere Android-APK enthält noch keinen nativen Update-Installer. Nach dem einmaligen Umstieg auf die dauerhaft signierte Next-APK stehen künftige Updates hier zur Verfügung.</p><p>Die alte Debug-Signatur kann nicht überinstalliert werden. Vor einer Neuinstallation zuerst Einstellungen und Daten sichern.</p></section>';
 const x=state.release;
 const available=state.available;
 const installed=state.installedBuild===null?'Status noch nicht gelesen':esc(state.installedVersion)+' · APK-Build '+state.installedBuild;
 return '<section class="mevi-updates" aria-label="Android Updates">'+
  '<h3>MeviCar Next · Android-Updates</h3>'+
  '<p>Wie bei MeviCar Classic: Privates GitHub-Release prüfen, signierte APK herunterladen und anschließend mit Android installieren.</p>'+
  '<div class="mevi-update-panel"><strong>Installiert:</strong> '+installed+'</div>'+
  '<div class="mevi-update-panel"><strong>Updatekanal</strong><div class="mevi-update-actions">'+
  '<button type="button" aria-pressed="'+(state.channel==='preview')+'" '+(state.busy?'disabled':'')+' onclick="MeviNativeUpdates.channel(\'preview\')">Preview / Beta</button>'+
  '<button type="button" aria-pressed="'+(state.channel==='stable')+'" '+(state.busy?'disabled':'')+' onclick="MeviNativeUpdates.channel(\'stable\')">Stable</button>'+
  '</div><small>Preview sucht nur dauerhaft signierte Next-Test-APKs. Die alten Debug-Builds werden ausdrücklich ausgeschlossen.</small></div>'+
  '<div class="mevi-update-panel">'+
  '<div class="mevi-update-actions"><button type="button" '+(state.busy?'disabled':'')+' onclick="MeviNativeUpdates.check()">Auf Updates prüfen</button>'+
  (available?'<button type="button" '+(state.busy?'disabled':'')+' onclick="MeviNativeUpdates.download()">APK laden &amp; installieren</button>':'')+
  (state.downloaded?'<button type="button" '+(state.busy?'disabled':'')+' onclick="MeviNativeUpdates.install()">Installieren</button>':'')+
  (!state.canInstall&&state.initialized?'<button type="button" onclick="MeviNativeUpdates.permission()">Installationsberechtigung</button>':'')+
  (state.busy?'<button type="button" onclick="MeviNativeUpdates.cancel()">Abbrechen</button>':'')+
  '</div>'+
  (x?'<p><strong>Neuestes Release:</strong> '+esc(x.title||x.tag)+' · APK-Build '+esc(x.build)+
      ' · '+formatSize(x.size)+'</p>'+ (x.notes?'<p class="mevi-update-notes">'+esc(x.notes)+'</p>':'')+
      '<p>'+ (available?'Eine neuere APK ist verfügbar.':'Auf diesem Kanal ist keine neuere APK verfügbar.')+'</p>'
     :'<p>Noch kein Release geprüft.</p>')+
  (state.busy||state.progress>0?'<progress id="mevi-update-progress" max="100" value="'+(state.total?Math.round(100*state.progress/state.total):0)+'"></progress>'+
      '<p id="mevi-update-progress-label">'+esc(progressText())+'</p>':'')+
  (state.message?'<p class="mevi-update-success" role="status">'+esc(state.message)+'</p>':'')+
  (state.error?'<p class="mevi-update-error" role="alert">'+esc(state.error)+'</p>':'')+
  '</div>'+
  '<p class="mevi-update-note">GitHub-Zugriffstoken: Settings → Zugänge. Nur Repository <code>eskiya771/mevicar-next</code> mit <code>Contents: Read-only</code> freigeben. Die APK wird vor der Installation auf Paketname, höhere Buildnummer und dieselbe Android-Signatur geprüft. Nicht mit dem früheren Debug-Zertifikat aktualisierbar.</p>'+
  '</section>';
}
async function refresh(){
 if(!native())return;
 try {
  const caps=await request('capabilities');
  state.supported=!!caps.capabilities?.nativeUpdater;
  if(!state.supported){state.error='';state.initialized=true;paint();return}
  statusInfo(await request('update.status'));state.error='';paint();
 } catch(e){state.error=e.message||String(e);paint()}
}
async function channel(v){
 if(state.busy||!['stable','preview'].includes(v))return;
 try {
  statusInfo(await request('update.channel',{channel:v}));
  state.release=null;state.available=false;state.downloaded=false;state.error='';state.message='';
  paint();
 }catch(e){state.error=e.message||String(e);paint()}
}
async function check(){
 if(state.busy)return;
 state.busy=true;state.error='';state.message='Prüfe signierte GitHub-Releases …';state.downloaded=false;paint();
 try {
  const x=await request('update.check');
  state.installedBuild=x.installedBuild;
  state.release=x.release||null;
  state.available=!!x.available;
  state.message=state.available?'Neues Update verfügbar.':'Auf diesem Kanal ist die App aktuell.';
 } catch(e){state.error=e.message||String(e);state.message=''}
 finally{state.busy=false;paint()}
}
async function download(){
 if(state.busy||!state.available)return;
 state.busy=true;state.error='';state.message='Lade signiertes Update …';state.progress=0;state.total=0;paint();
 try{
  await request('update.download',{},(loaded,total)=>{state.progress=loaded;state.total=total;liveProgress()});
  state.downloaded=true;state.message='APK vollständig heruntergeladen und ihre Signatur geprüft.';
  state.busy=false;paint();
  await install();
 }catch(e){state.error=e.message||String(e);state.message='';state.busy=false;paint()}
}
async function install(){
 try {
  const r=await request('update.install');
  state.message='Android-Paketinstaller wurde geöffnet.';state.error='';
  paint();return r;
 }catch(e){state.error=e.message||String(e);paint()}
}
async function permission(){
 try{await request('update.permission');state.message='Bitte Installation aus dieser Quelle zulassen und zurückkehren.';paint()}
 catch(e){state.error=e.message||String(e);paint()}
}
async function cancel(){
 try{await request('update.cancel');state.message='Abbruch angefordert.';paint()}
 catch(e){state.error=e.message||String(e);paint()}
}
// Unlike the signed native APK updater, this only refreshes the locally stored
// Web shell. The server is contacted exclusively after the user taps Update.
async function webUpdate(onProgress){return request('web.update',{},onProgress);}
global.MeviNativeUpdates={html,refresh,channel,check,download,install,permission,cancel,webUpdate,debug:()=>({...state})};
})(typeof window==='undefined'?globalThis:window);
