/* MeviCar Next Android-only: iPhone ANCS calling through the Classic BLE transport.
   No fake phone calls, no contacts scraping, no persistent names or numbers. */
(function(root){
'use strict';
const plugin=()=>root.Capacitor?.Plugins?.MeviPhone;
const native=()=>root.Capacitor?.isNativePlatform?.()===true;
const available=()=>native()&&!!plugin();
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
let snapshot={state:'OFF',detail:'Noch nicht verbunden',incoming:null,missed:[],supported:true,
  permissionGranted:false,bluetoothEnabled:false,adapterName:'',active:false,connected:false};
let error='',busy=false,initialized=false;
function redraw(){
 const view=document.querySelector('.mevi-phone-panel');
 if(view)view.outerHTML=html();
 banner();
}
function banner(){
 let node=document.getElementById('mevi-phone-incoming');
 if(!node){node=document.createElement('div');node.id='mevi-phone-incoming';document.body.appendChild(node)}
 const call=snapshot.incoming;
 if(!call){node.hidden=true;node.innerHTML='';return}
 node.hidden=false;
 node.innerHTML='<div class="mevi-phone-banner-text"><strong>☎ Eingehender iPhone-Anruf</strong><span>'+
  esc(call.name||'Unbekannter Anrufer')+'</span><small>'+esc(call.detail||'')+'</small></div>'+
  '<div class="mevi-phone-banner-actions">'+
  (call.canAnswer?'<button type="button" onclick="MeviPhone.answer()">Annehmen</button>':'')+
  (call.canDecline?'<button type="button" onclick="MeviPhone.decline()">Ablehnen</button>':'')+'</div>';
}
function receive(payload){
 if(!payload||typeof payload!=='object')return;
 snapshot={...snapshot,...payload,missed:Array.isArray(payload.missed)?payload.missed:snapshot.missed};
 error='';redraw();
}
async function refresh(){
 if(!available())return;
 try{receive(await plugin().getStatus())}
 catch(e){error=String(e?.message||e);redraw()}
}
async function init(){
 if(initialized||!available())return;
 initialized=true;
 for(const [event,callback] of [
  ['phoneState',receive],['incomingCall',call=>receive({...snapshot,incoming:call})],
  ['callEnded',()=>refresh()],['missedCall',()=>refresh()]
 ]){
   try{await plugin().addListener(event,callback)}catch(e){error=String(e?.message||e)}
 }
 await refresh();
}
async function run(method){
 if(!available()||busy)return;
 busy=true;error='';redraw();
 try{
   const data=await plugin()[method]();
   if(data&&data.state)receive(data);
   else await refresh();
 }catch(e){error=String(e?.message||e);redraw()}
 finally{busy=false;redraw()}
}
const start=()=>run('start');
const stop=()=>run('stop');
const answer=()=>run('answer');
const decline=()=>run('decline');
function html(compact=false){
 if(!available())return '<section class="mevi-phone-panel"><h2>Telefon</h2><p>Native Bluetooth-Telefonanbindung ist auf diesem Gerät nicht verfügbar.</p></section>';
 const call=snapshot.incoming;
 const connected=snapshot.connected;
 const status=snapshot.detail||snapshot.state;
 const actions=call?'<section class="mevi-phone-call"><small>EINGEHENDER IPHONE-ANRUF</small><strong>'+
  esc(call.name||'Unbekannter Anrufer')+'</strong><span>'+esc(call.detail||'')+'</span><div class="mevi-phone-actions">'+
  (call.canAnswer?'<button onclick="MeviPhone.answer()">Annehmen</button>':'')+
  (call.canDecline?'<button onclick="MeviPhone.decline()">Ablehnen</button>':'')+'</div></section>':'';
 const missed=snapshot.missed.length?'<div class="mevi-phone-history">'+
  snapshot.missed.map(x=>'<div><strong>'+esc(x.name||'Unbekannt')+'</strong><small>'+
  esc(x.detail||'Verpasster iPhone-Anruf')+'</small></div>').join('')+'</div>':
  '<p class="mevi-phone-subtle">Noch keine verpassten Anrufe in dieser Sitzung.</p>';
 return '<section class="mevi-phone-panel'+(compact?' is-compact':'')+'"><header>'+
  '<small>MEVICAR NEXT · IPHONE</small><h2>Telefonanbindung</h2></header>'+
  '<div class="mevi-phone-state"><span class="'+(connected?'connected':'')+'">'+(connected?'● VERBUNDEN':'○ NICHT VERBUNDEN')+'</span>'+
  '<p>'+esc(status)+'</p></div>'+
  '<div class="mevi-phone-actions">'+
  (snapshot.active?'<button type="button" onclick="MeviPhone.stop()"'+(busy?' disabled':'')+'>Verbindung beenden</button>':
    '<button type="button" onclick="MeviPhone.start()"'+(busy?' disabled':'')+'>iPhone verbinden</button>')+
  '<button type="button" onclick="MeviPhone.refresh()">Status prüfen</button></div>'+
  (error?'<div class="mevi-phone-error" role="alert">'+esc(error)+'</div>':'')+
  actions+'<div class="mevi-phone-guide">Auf dem iPhone unter <strong>Einstellungen → Bluetooth</strong> das '+
  'Samsung-Gerät auswählen und die Kopplung bzw. Mitteilungen bestätigen. '+(snapshot.adapterName?'Android-Bluetoothname: <strong>'+esc(snapshot.adapterName)+'</strong>. ':'')+
  'Telefon-Audio bleibt auf dem iPhone oder dessen Freisprechanlage.</div>'+
  '<h3>Verpasste Anrufe</h3>'+missed+
  '<p class="mevi-phone-subtle">ANCS zeigt nur Anruf-Mitteilungen während der aktiven Verbindung – '+
  'kein iPhone-Telefonbuch, keine vollständige Anrufliste und keine ausgehenden iPhone-Anrufe.</p></section>';
}
root.MeviPhone={available,html,start,stop,answer,decline,refresh,init};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})(window);
