/* MeviCar Next Road Assist – port of Classic route camera geometry, not a fake overlay.
   Uses only camera entities from the user's connected Home Assistant session.
   Route sampling is opt-in: it changes an HA device_tracker and calls blitzer.refresh_controls.
   No tokens, keys or camera positions are committed. */
(function(){
'use strict';
const PREFS='mevicar-next-roadassist-v1';
const CAMERA_CORRIDOR=35, FIX_CORRIDOR=100, MAX_FIX_AGE=15000, MAX_ACCURACY=50;
const MAX_AHEAD=5000, PREWARN=500, FINAL_WARN=35, SCAN_STEP=15000, MAX_SAMPLES=12;
const TRACKER='mevicar_route_scan';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const finite=Number.isFinite;
let settings={enabled:true,voice:true,configId:''};
try{
 const saved=JSON.parse(localStorage.getItem(PREFS)||'{}');
 if(typeof saved.enabled==='boolean')settings.enabled=saved.enabled;
 if(typeof saved.voice==='boolean')settings.voice=saved.voice;
 if(typeof saved.configId==='string'&&/^[0-9A-HJKMNP-TV-Z]{26}$/.test(saved.configId))settings.configId=saved.configId;
}catch{}
let route=[],segments=[],routeLength=0,matched=[],connected=false,haCount=0,haUpdated=0,scanCameras=[];
let routeSerial=0,guiding=false,demo=false,fix=null,fixAt=0,fixAccuracy=null,positionOnRoute=null;
let currentMatch=null,scanState='idle',scanNote='',scanProgress=0,scanTotal=0,scanCoverage='nicht geprüft',scanCancel=null;
let notified=new Set(),scanSerial=0,lastAudioAt=0,lastCameraId='',lastHARefresh=0,pollTimer=null;
const point=p=>{
 if(!p)return null;
 const q=typeof p.toJSON==='function'?p.toJSON():p;
 const lat=typeof q.lat==='function'?q.lat():q.lat;
 const lng=typeof q.lng==='function'?q.lng():q.lng;
 return finite(lat)&&finite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null;
};
function distance(a,b){
 if(!a||!b)return Infinity;
 const R=Math.PI/180,dLat=(b.lat-a.lat)*R,dLng=(b.lng-a.lng)*R;
 const h=Math.sin(dLat/2)**2+Math.cos(a.lat*R)*Math.cos(b.lat*R)*Math.sin(dLng/2)**2;
 return 12742000*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
function formatMeters(m){
 if(!finite(m))return '–';
 return m>=1000?new Intl.NumberFormat('de-DE',{maximumFractionDigits:1}).format(m/1000)+' km':
  Math.max(0,Math.round(m/10)*10)+' m';
}
function buildRoute(path){
 const points=(path||[]).map(point).filter(Boolean);
 if(points.length<2)return {points:[],segments:[],length:0};
 const anchor=points[0],k=Math.cos(anchor.lat*Math.PI/180);
 const toXY=p=>({x:(p.lng-anchor.lng)*111320*k,y:(p.lat-anchor.lat)*111320});
 const segs=[];let traveled=0;
 for(let i=1;i<points.length;i++){
  const a=toXY(points[i-1]),b=toXY(points[i]),len=distance(points[i-1],points[i]);
  if(len<0.01)continue;
  segs.push({a,b,len,start:traveled,dx:b.x-a.x,dy:b.y-a.y});
  traveled+=len;
 }
 return {points,segments:segs,length:traveled,origin:anchor,k};
}
function project(raw){
 const p=point(raw);
 if(!p||!segments.length||!route.length)return null;
 const origin=route[0],scale=Math.cos(origin.lat*Math.PI/180);
 const xy={x:(p.lng-origin.lng)*111320*scale,y:(p.lat-origin.lat)*111320};
 let best=null;
 for(const seg of segments){
  const d2=seg.dx*seg.dx+seg.dy*seg.dy;
  const t=d2>0?Math.max(0,Math.min(1,((xy.x-seg.a.x)*seg.dx+(xy.y-seg.a.y)*seg.dy)/d2)):0;
  const lateral=Math.hypot(xy.x-seg.a.x-seg.dx*t,xy.y-seg.a.y-seg.dy*t);
  if(!best||lateral<best.lateral)best={lateral,progress:seg.start+seg.len*t};
 }
 return best;
}
function cameraKey(c){
 return String(c.id||c.entityId||((+c.lat).toFixed(5)+','+(+c.lng).toFixed(5)));
}
function sanitizeCamera(c){
 if(!c)return null;
 const p=point(c);
 if(!p)return null;
 const vmax=Number(c.vmax??c.limit);
 return{id:cameraKey(c),lat:p.lat,lng:p.lng,type:String(c.type||'unknown').slice(0,60),
  street:String(c.street||'').slice(0,120),city:String(c.city||'').slice(0,120),
  name:String(c.name||'').slice(0,120),vmax:finite(vmax)&&vmax>0&&vmax<350?Math.round(vmax):null};
}
function cameraMatches(cameras){
 if(!route.length||!segments.length)return [];
 const known=new Map();
 for(const raw of cameras||[]){
  const c=sanitizeCamera(raw);if(!c)continue;
  const projected=project(c);
  if(!projected||projected.lateral>CAMERA_CORRIDOR)continue;
  // Different HA entity ids may refer to the same camera. Merge by approximate GPS.
  const spatial=c.lat.toFixed(5)+','+c.lng.toFixed(5);
  if(!known.has(spatial)||(!known.get(spatial).camera.vmax&&c.vmax))
   known.set(spatial,{camera:c,progress:projected.progress,lateral:projected.lateral});
 }
 return [...known.values()].sort((a,b)=>a.progress-b.progress);
}
function persist(){
 try{localStorage.setItem(PREFS,JSON.stringify(settings))}catch{}
}
function messageFor(c){
 const t=c?.type?.toLowerCase()||'';
 if(t==='fixed'||t.includes('station'))return 'Fester Blitzer';
 if(t.includes('mobile'))return 'Mobiler Blitzer';
 if(t.includes('trailer'))return 'Anhängerblitzer';
 if(t.includes('red')||t.includes('light'))return 'Ampelkontrolle';
 return 'Blitzerkontrolle';
}
function camerasFromHA(){
 const ha=window.MeviHA;
 const snapshot=ha?.cameraSnapshot?.();
 if(!snapshot||!snapshot.connected)return {connected:false,updatedAt:0,cameras:[]};
 return {connected:true,updatedAt:snapshot.updatedAt||0,cameras:Array.isArray(snapshot.cameras)?snapshot.cameras:[]};
}
function updateFromHA(){
 const snapshot=camerasFromHA();
 connected=snapshot.connected;haUpdated=snapshot.updatedAt;haCount=snapshot.cameras.length;
 matched=connected?cameraMatches([...snapshot.cameras,...scanCameras]):[];
 updateMatch();paint();
}
function onHAChange(){updateFromHA()}
function onRoute(raw){
 const path=raw?.path||raw||[];
 const built=buildRoute(path);
 route=built.points;segments=built.segments;routeLength=built.length;routeSerial++;
 guiding=false;demo=false;fix=null;fixAt=0;positionOnRoute=null;currentMatch=null;notified.clear();lastAudioAt=0;
 scanCameras=[];scanState='idle';scanNote='';scanProgress=0;scanTotal=0;scanCoverage='nicht geprüft';
 cancelScan();updateFromHA();
 // Home Assistant is never contacted if not connected. Refresh stale camera data once.
 const h=window.MeviHA;
 if(h?.debug?.().connected&&Date.now()-lastHARefresh>30000){
  lastHARefresh=Date.now();
  Promise.resolve(h.refresh?.()).catch(()=>{});
 }
}
function onGuidanceStart(isDemo=false){
 guiding=true;demo=!!isDemo;fix=null;fixAt=0;fixAccuracy=null;positionOnRoute=null;
 currentMatch=null;notified.clear();lastAudioAt=0;
 if(pollTimer!==null){clearInterval(pollTimer);pollTimer=null}
 if(!demo){
  pollTimer=setInterval(()=>{
   if(document?.hidden||!window.MeviHA?.debug?.().connected)return;
   refresh().catch(()=>{});
  },30000);
  if(Date.now()-haUpdated>=30000&&window.MeviHA?.debug?.().connected)refresh().catch(()=>{});
 }
 paint();
}
function onGuidanceStop(){
 guiding=false;demo=false;fix=null;positionOnRoute=null;currentMatch=null;lastCameraId='';
 if(pollTimer!==null){clearInterval(pollTimer);pollTimer=null}
 cancelScan();paint();
}
function onPosition(p,options={}){
 if(!guiding||demo)return;
 const position=point(p);
 const stamp=Number(options.timestamp)||Date.now();
 const accuracy=Number(options.accuracy);
 fix=position;fixAt=stamp;fixAccuracy=accuracy;
 if(!position||!finite(accuracy)||accuracy>MAX_ACCURACY||accuracy<0||
    Date.now()-stamp>MAX_FIX_AGE||stamp>Date.now()+5000){
  positionOnRoute=null;currentMatch=null;paint();return;
 }
 const projected=project(position);
 positionOnRoute=projected&&projected.lateral<=FIX_CORRIDOR?projected:null;
 updateMatch();
 maybeSpeak();paint();
}
function updateMatch(){
 currentMatch=null;
 if(!guiding||demo||!settings.enabled||!connected||!positionOnRoute)return;
 const candidate=matched.find(item=>item.progress>=positionOnRoute.progress-15&&
   item.progress-positionOnRoute.progress<=MAX_AHEAD);
 if(!candidate)return;
 const ahead=Math.max(0,candidate.progress-positionOnRoute.progress);
 currentMatch={...candidate,ahead};
}
function maybeSpeak(){
 if(!guiding||demo||!settings.enabled||!settings.voice||!currentMatch)return;
 if(!fixAt||Date.now()-fixAt>MAX_FIX_AGE||fixAccuracy>MAX_ACCURACY)return;
 const id=currentMatch.camera.id,dist=currentMatch.ahead;
 const stage=dist<=FINAL_WARN?'final':dist<=PREWARN?'early':null;
 if(!stage)return;
 const key=id+'|'+stage;if(notified.has(key))return;
 notified.add(key);
 if(!window.MeviGoogleNav?.announceRoadAssist)return;
 const label=messageFor(currentMatch.camera);
 const speed=currentMatch.camera.vmax?', erlaubt '+currentMatch.camera.vmax+' km/h':'';
 // When first position jumps straight to close range, do not speak a late 500m warning.
 const say=stage==='final'?'Achtung! '+label+' jetzt'+speed+'.':'Achtung, '+label+' in '+formatMeters(dist)+speed+'.';
 if(Date.now()-lastAudioAt<1400){return} // no speech spam from clustered controls
 lastAudioAt=Date.now();window.MeviGoogleNav.announceRoadAssist(say);
}
function routeStatus(){
 if(!route.length)return 'Keine Route geplant';
 if(!connected)return 'Home Assistant nicht verbunden – keine Blitzerprüfung';
 if(!haCount&&!scanCameras.length)return 'Home Assistant meldet keine Kameras – Abdeckung unbekannt';
 return matched.length+' Kamera'+(matched.length===1?'':'s')+' im 35-m-Routenkorridor · '+haCount+' HA-Meldungen';
}
function summaryHTML(){
 if(!route.length)return '';
 return '<div class="mevi-ra-summary"><div class="mevi-ra-summary-line"><b>◈ ROAD ASSIST</b><span>'+esc(routeStatus())+'</span></div>'+
  '<div class="mevi-ra-summary-actions">'+
   (!connected?'<button type="button" onclick="openApp(\'ha\')" class="mevi-ra-setup">Home Assistant verbinden</button>':
   '<button type="button" onclick="MeviRoadAssist.refresh()">Daten aktualisieren</button>')+
   (connected?'<button type="button" onclick="MeviRoadAssist.openScan()">Routenscan</button>':'')+
   '</div><small>Nur geprüfte Positionen auf der Google-Route · keine Vollständigkeitsgarantie</small></div>';
}
function overlayHTML(){
 if(!guiding)return '';
 if(demo)return '<div class="mevi-ra-overlay mevi-ra-diagnostic"><strong>ROAD ASSIST · DEMO</strong><span>Keine echten Blitzerwarnungen während der Simulation</span></div>';
 if(!settings.enabled)return '<div class="mevi-ra-overlay mevi-ra-diagnostic"><strong>ROAD ASSIST AUS</strong><button onclick="MeviRoadAssist.setEnabled(true)">Einschalten</button></div>';
 if(!connected)return '<div class="mevi-ra-overlay mevi-ra-diagnostic"><strong>ROAD ASSIST</strong><span>Home Assistant nicht verbunden</span></div>';
 if(!positionOnRoute)return '<div class="mevi-ra-overlay mevi-ra-diagnostic"><strong>ROAD ASSIST · GPS</strong><span>Präzisen Standort auf der Route abwarten</span></div>';
 if(!currentMatch)return '<div class="mevi-ra-overlay mevi-ra-diagnostic"><strong>ROAD ASSIST</strong><span>Keine gemeldete Kontrolle bis 5 km voraus</span></div>';
 const c=currentMatch.camera;
 const urgent=currentMatch.ahead<=FINAL_WARN;
 return '<div class="mevi-ra-overlay '+(urgent?'mevi-ra-urgent':'mevi-ra-ahead')+'" role="status">'+
  '<div class="mevi-ra-alerthead"><b>⚠ '+(urgent?'ACHTUNG · BLITZER':'BLITZER VORAUS')+'</b><span>'+esc(formatMeters(currentMatch.ahead))+'</span></div>'+
  '<div class="mevi-ra-alertbody"><div class="mevi-ra-speed">'+(c.vmax||'!')+'</div>'+
  '<div class="mevi-ra-alerttext"><strong>'+esc(messageFor(c))+'</strong>'+
  '<small>'+esc([c.street,c.city].filter(Boolean).join(' · ')||c.name||'Home Assistant')+'</small></div></div>'+
  '<small>HA-Meldung · Position im Routenkorridor ±35 m</small></div>';
}
function paint(){
 const overlay=document.getElementById('mevi-ra-overlay');
 if(overlay)overlay.innerHTML=overlayHTML();
 const overview=document.getElementById('mevi-ra-summary');
 if(overview)overview.innerHTML=summaryHTML();
 const status=document.getElementById('mevi-ra-scan-status');
 if(status)status.textContent=scanNote;
}
function refresh(){
 const h=window.MeviHA;
 if(!h?.debug?.().connected){updateFromHA();return Promise.resolve(false)}
 return Promise.resolve(h.refresh()).then(()=>{updateFromHA();return true},()=>{updateFromHA();return false});
}
function setEnabled(value){settings.enabled=!!value;persist();updateMatch();paint()}
function setVoice(value){settings.voice=!!value;persist();paint()}
function setConfigId(value){
 const val=String(value||'').trim().toUpperCase();
 if(val&&!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(val))return false;
 settings.configId=val;persist();paint();return true;
}
function infoHTML(){
 const routeKm=(routeLength/1000).toFixed(1).replace('.',',');
 const coverage=scanState==='completed'?'Routenscan abgeschlossen ('+scanCoverage+')':
  scanState==='running'?'Routenscan läuft: '+scanProgress+'/'+scanTotal:
  scanState==='cancelled'?'Routenscan abgebrochen':
  scanState==='error'?'Routenscan fehlgeschlagen':'Kein aktiver Routenscan';
 return '<section class="mevi-ra-tools"><h3>Routenblitzer · Diagnose</h3><p>'+esc(routeStatus())+'</p>'+
   '<dl><dt>Routenlänge</dt><dd>'+esc(routeKm)+' km</dd>'+
   '<dt>Routenpunkte</dt><dd>'+route.length+'</dd>'+
   '<dt>HA-Kameras</dt><dd>'+haCount+'</dd>'+
   '<dt>Routentreffer</dt><dd>'+matched.length+'</dd>'+
   '<dt>Abdeckung</dt><dd>'+esc(coverage)+'</dd></dl>'+
   '<label for="mevi-ra-config">Blitzer.de Konfigurations-ID für optionalen Routenscan</label>'+
   '<input id="mevi-ra-config" type="text" autocapitalize="characters" spellcheck="false" autocomplete="off" '+
    'placeholder="26-stellige Konfigurations-ID" maxlength="26" value="'+esc(settings.configId)+'">'+
   '<p class="mevi-ra-hint">Der Routenscan setzt zeitweise den Home-Assistant-Tracker '+TRACKER+
   ' und ruft den Dienst blitzer.refresh_controls an mehreren Routenpunkten auf. Nur bewusst starten; keine automatische Aktivierung.</p>'+
   '<div class="mevi-ra-tool-actions"><button onclick="MeviRoadAssist.storeConfig()">ID speichern</button>'+
   '<button onclick="MeviRoadAssist.scan()" '+(!connected||!route.length||scanState==='running'?'disabled':'')+'>Routenscan starten</button>'+
   (scanState==='running'?'<button onclick="MeviRoadAssist.cancelScan()">Abbrechen</button>':'')+
   '<button onclick="MeviRoadAssist.setEnabled('+(!settings.enabled)+')">Warnung '+(settings.enabled?'ausschalten':'einschalten')+'</button>'+
   '<button onclick="MeviRoadAssist.setVoice('+(!settings.voice)+')">Sprachausgabe '+(settings.voice?'ausschalten':'einschalten')+'</button></div>'+
   '<div class="mevi-ra-scan-status" id="mevi-ra-scan-status" role="status">'+esc(scanNote)+'</div>'+
   '</section>';
}
function storeConfig(){
 const input=document.getElementById('mevi-ra-config');
 if(!setConfigId(input?.value||'')){scanNote='Konfigurations-ID muss 26 gültige Zeichen enthalten.';paint();return}
 scanNote=settings.configId?'Konfigurations-ID gespeichert.':'Konfigurations-ID gelöscht.';paint();
}
function openScan(){
 const h=window.MeviHA;
 if(h){h.tab('radar');window.openApp?.('ha')}
 else{scanNote='Home Assistant nicht geladen.';paint()}
}
function sampleRoute(spacing=SCAN_STEP,maxSamples=MAX_SAMPLES){
 if(!route.length||routeLength<1)return [];
 const samples=[route[0]],maxCount=Math.max(2,Math.min(maxSamples,50));
 const interval=Math.max(spacing,routeLength/(maxCount-1));
 let next=interval,traveled=0;
 for(let i=1;i<route.length;i++){
  const a=route[i-1],b=route[i],len=distance(a,b);
  while(len>0&&traveled+len>=next&&samples.length<maxCount-1){
   const t=Math.max(0,Math.min(1,(next-traveled)/len));
   samples.push({lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t});
   next+=interval;
  }
  traveled+=len;
 }
 if(distance(samples[samples.length-1],route[route.length-1])>100&&samples.length<maxCount)
  samples.push(route[route.length-1]);
 return samples;
}
function wait(ms,signal){
 return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{signal?.removeEventListener?.('abort',cancel);resolve()},ms);
  const cancel=()=>{clearTimeout(timeout);reject(new Error('Scan abgebrochen'))};
  signal?.addEventListener?.('abort',cancel,{once:true});
  if(signal?.aborted)cancel();
 });
}
function responseCameras(payload){
 const obj=payload?.service_response||payload;
 const controls=Array.isArray(obj?.controls)?obj.controls:[];
 return controls.map(x=>sanitizeCamera({id:x.id||'route-scan-'+x.latitude+','+x.longitude,
  lat:x.latitude,lng:x.longitude,name:x.street||'Blitzer',street:x.street,city:x.city,
  type:x.type||'unknown',vmax:x.vmax})).filter(Boolean);
}
async function scan(){
 if(scanState==='running')return false;
 const h=window.MeviHA;
 if(!h?.debug?.().connected){scanNote='Home Assistant ist nicht verbunden.';scanState='error';paint();return false}
 if(route.length<2){scanNote='Bitte zuerst eine Route berechnen.';scanState='error';paint();return false}
 if(!settings.configId){scanNote='Bitte zuerst die Blitzer.de Konfigurations-ID speichern.';scanState='error';paint();return false}
 if(typeof h.requestService!=='function'){scanNote='Aktualisiere die Home-Assistant-Anbindung.';scanState='error';paint();return false}
 const tasks=sampleRoute();
 if(!tasks.length)return false;
 const serial=++scanSerial;scanCancel=new AbortController();
 scanState='running';scanProgress=0;scanTotal=tasks.length;scanCoverage='nicht bestätigt';
 scanNote='Routenscan begonnen: '+tasks.length+' Suchpunkte. Home Assistant Tracker wird vorübergehend verändert.';
 const results=new Map(),startedRoute=routeSerial,signal=scanCancel.signal;
 paint();
 try{
  for(let i=0;i<tasks.length;i++){
   if(signal.aborted||serial!==scanSerial||startedRoute!==routeSerial)throw new Error('Scan abgebrochen');
   const p=tasks[i];
   await h.requestService('/api/services/device_tracker/see',{
    method:'POST',body:{dev_id:TRACKER,gps:[p.lat,p.lng],gps_accuracy:10}
   });
   await wait(900,signal);
   const tracker=await h.requestService('/api/states/device_tracker.'+TRACKER);
   const tr=point({lat:Number(tracker?.attributes?.latitude),lng:Number(tracker?.attributes?.longitude)});
   if(!tr||distance(p,tr)>=100){
    scanNote='Suchpunkt '+(i+1)+': Tracker-Position nicht bestätigt; Meldungen übersprungen.';
    scanProgress=i+1;paint();continue;
   }
   const data=await h.requestService('/api/services/blitzer/refresh_controls?return_response',{
    method:'POST',body:{config_entry_id:settings.configId}
   });
   for(const c of responseCameras(data))results.set(cameraKey(c),c);
   scanProgress=i+1;scanNote='Suchpunkt '+(i+1)+'/'+tasks.length+' · '+results.size+' Meldungen';
   paint();
  }
  if(serial!==scanSerial||startedRoute!==routeSerial)return false;
  scanCameras=[...results.values()];
  scanState='completed';scanCoverage=scanTotal===tasks.length?'Suchpunkte abgefragt; Integrationsergebnis nicht garantiert':'teilweise';
  scanNote='Routenscan abgeschlossen · '+scanCameras.length+' gefundene Meldungen. Ergebnisse gelten nur für diese Route.';
  updateFromHA();paint();return true;
 }catch(e){
  if(serial!==scanSerial)return false;
  scanState=signal.aborted?'cancelled':'error';scanNote=String(e?.message||e).slice(0,210);paint();return false;
 }finally{if(serial===scanSerial)scanCancel=null}
}
function cancelScan(){
 scanSerial++;
 if(scanCancel){scanCancel.abort();scanCancel=null}
 if(scanState==='running'){scanState='cancelled';scanNote='Routenscan abgebrochen.'}
 paint();
}
function routeState(){
 return{routeLength,routePoints:route.length,haCount,connected,matched:matched.map(x=>({id:x.camera.id,progress:x.progress,lateral:x.lateral})),
  currentMatch:currentMatch?{id:currentMatch.camera.id,ahead:currentMatch.ahead}:null,
  positionValid:!!positionOnRoute,scanState,scanProgress,scanTotal,scanNote,guiding,demo,settings:{enabled:settings.enabled,voice:settings.voice,configSet:!!settings.configId}};
}
window.MeviRoadAssist={nativeConfig:()=>({configId:settings.configId,enabled:settings.enabled,voice:settings.voice}),onRoute,onGuidanceStart,onGuidanceStop,onPosition,onHAChange,summaryHTML,overlayHTML,paint,
 refresh,setEnabled,setVoice,setConfigId,storeConfig,openScan,infoHTML,scan,cancelScan,
 routeState,project,buildRoute,cameraMatches,sampleRoute,responseCameras,formatMeters};
})();
