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
// Route query at Home Assistant for every newly planned route (planSerial counts the Android plans).
let planSerial=0,scanWanted=false,autoTimer=null,scanRev=0,scanReportKey='';
const AUTO_DELAY=1200;
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
 detectNative();pushCameras();
 updateMatch();paint();
 if(scanWanted&&!autoTimer)autoScan();
}
function onHAChange(){updateFromHA()}
function onRoute(raw,options={}){
 const path=raw?.path||raw||[];
 const built=buildRoute(path);
 // A browser reroute changes the remaining route, not the current drive.
 const preserveTrip=options.reroute===true&&built.points.length>=2&&guiding&&!demo&&!!trip&&!nativeOn;
 const previousHits=preserveTrip?webHits(trip.driven,trip.base||0).filter(hit=>hit.passed):[];
 if(!preserveTrip)endTrip();
 if(preserveTrip){
  trip.pastCameras.push(...previousHits);
  trip.base=trip.driven;
  trip.plannedMeters=Math.round(trip.driven+built.length);
  trip.dataAvailable=trip.dataAvailable||connected;
 }
 route=built.points;segments=built.segments;routeLength=built.length;routeSerial++;
 guiding=preserveTrip;demo=false;fix=null;fixAt=0;positionOnRoute=null;currentMatch=null;notified.clear();lastAudioAt=0;
 scanCameras=[];scanState='idle';scanNote='';scanProgress=0;scanTotal=0;scanCoverage='nicht geprüft';
 cancelScan();updateFromHA();
 if(!nativeOn&&route.length>=2)wantScan();
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
 if(!trip)startTrip();
 paint();
}
function onGuidanceStop(){
 endTrip();
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
 if(trip&&positionOnRoute)trip.driven=Math.max(trip.driven,(trip.base||0)+positionOnRoute.progress);
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
 if(!window.MeviGoogleNav?.announceRoadAssist)return;
 const label=messageFor(currentMatch.camera);
 const speed=currentMatch.camera.vmax?', erlaubt '+currentMatch.camera.vmax+' km/h':'';
 // When first position jumps straight to close range, do not speak a late 500m warning.
 const say=stage==='final'?'Achtung! '+label+' jetzt'+speed+'.':'Achtung, '+label+' in '+formatMeters(dist)+speed+'.';
 if(Date.now()-lastAudioAt<1400)return; // retry the warning on the next valid fix
 notified.add(key);
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
   '<button type="button" onclick="openApp(\'roadassist\')">Road Assist öffnen</button>'+
   '</div><small>Nur geprüfte Positionen auf der Google-Route · keine Vollständigkeitsgarantie</small></div>';
}
function overlayHTML(){
 // Like the native Road Assist banner, only real upcoming matched cameras are
 // shown over the map. Diagnostics remain available in the Road Assist app.
 if(!guiding||demo||!settings.enabled||!connected||!positionOnRoute||!currentMatch)return '';
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
 paintApp();
}
function refresh(){
 const h=window.MeviHA;
 if(!h?.debug?.().connected){updateFromHA();return Promise.resolve(false)}
 return Promise.resolve(h.refresh()).then(()=>{updateFromHA();return true},()=>{updateFromHA();return false});
}
function setEnabled(value){settings.enabled=!!value;persist();nativeSetting();updateMatch();paint();if(scanWanted&&!autoTimer)autoScan()}
function setVoice(value){settings.voice=!!value;persist();nativeSetting();paint()}
function setConfigId(value){
 const val=String(value||'').trim().toUpperCase();
 if(val&&!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(val))return false;
 settings.configId=val;persist();paint();
 if(val&&scanWanted&&!autoTimer)autoScan();
 return true;
}
function infoHTML(){
 const m=model();
 const routeKm=(m.plannedMeters/1000).toFixed(1).replace('.',',');
 const coverage=scanState==='completed'?'Routenscan abgeschlossen ('+scanCoverage+')':
  scanState==='running'?'Routenscan läuft: '+scanProgress+'/'+scanTotal:
  scanState==='cancelled'?'Routenscan abgebrochen':
  scanState==='error'?'Routenscan fehlgeschlagen':'Kein aktiver Routenscan';
 return '<section class="mevi-ra-tools"><h3>Routenblitzer · Diagnose</h3><p>'+esc(m.native?appStatus(m):routeStatus())+'</p>'+
   '<dl><dt>Routenlänge</dt><dd>'+esc(routeKm)+' km</dd>'+
   (m.native?'<dt>Auswertung</dt><dd>Android-Navigation</dd>':'<dt>Routenpunkte</dt><dd>'+route.length+'</dd>')+
   '<dt>HA-Kameras</dt><dd>'+m.cameraCount+'</dd>'+
   '<dt>Routentreffer</dt><dd>'+m.hits.length+'</dd>'+
   '<dt>Abdeckung</dt><dd>'+esc(coverage)+'</dd></dl>'+
   '<p class="mevi-ra-hint">Blitzer.de-Konfigurations-ID wird unter Settings → Zugänge &amp; Schlüssel verwaltet.</p>'+
   '<button type="button" onclick="meviOpenCredentialSettings()">Blitzer-ID in Settings öffnen</button>'+
   '<p class="mevi-ra-hint">Der Routenscan setzt zeitweise den Home-Assistant-Tracker '+TRACKER+
   ' und ruft den Dienst blitzer.refresh_controls an mehreren Routenpunkten auf. Er startet nach dem Planen einer Route von selbst, sobald Home Assistant verbunden und die Blitzer-ID gespeichert ist; hier lässt er sich wiederholen.</p>'+
   '<div class="mevi-ra-tool-actions">'+
   '<button onclick="MeviRoadAssist.scan()" '+(!m.connected||!m.route||scanState==='running'?'disabled':'')+'>Routenscan starten</button>'+
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
 diagOpen=true;
 window.openApp?.('roadassist');
 paintApp();
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
function wantScan(){
 scanWanted=true;
 clearTimeout(autoTimer);
 autoTimer=setTimeout(autoScan,AUTO_DELAY);
}
// Starts the route query on its own once everything it needs is there; otherwise it stays wanted.
function autoScan(){
 autoTimer=null;
 if(!scanWanted||scanState==='running'||!settings.enabled)return;
 const native=!!window.MeviGoogleNav?.isNativeMode?.();
 if(native&&!nativeOn){detectNative();return}
 if(!native&&route.length<2){scanWanted=false;return}
 if(!window.MeviHA?.debug?.().connected){reportScan('offline');return}
 if(!settings.configId){reportScan('noconfig');return}
 scan(true);
}
// Android shows the progress in its route overview; a report for an older plan is dropped there.
function reportScan(state){
 if(!nativeOn)return;
 const key=[planSerial,state,scanProgress,scanTotal].join('|');
 if(key===scanReportKey)return;
 scanReportKey=key;
 nativeCall('roadassist.scan',{plan:planSerial,state,progress:scanProgress,total:scanTotal})
  .then(takeStatus).catch(()=>{scanReportKey=''});
}
// Android planned another route (or dropped it): forget the old result and query the new route.
function nativePlan(serial,hasRoute){
 serial=Number(serial);
 if(!Number.isInteger(serial)||serial===planSerial)return;
 cancelScan();
 planSerial=serial;scanReportKey='';
 scanCameras=[];scanRev++;scanState='idle';scanNote='';scanProgress=0;scanTotal=0;scanCoverage='nicht geprüft';
 clearTimeout(autoTimer);autoTimer=null;scanWanted=false;
 detectNative();updateFromHA();
 if(hasRoute)wantScan();
}
window.meviRoadAssistNativeRoute=(serial,hasRoute)=>nativePlan(serial,hasRoute);
async function scan(auto=false){
 if(scanState==='running')return false;
 scanWanted=false;
 const h=window.MeviHA;
 if(!h?.debug?.().connected){scanNote='Home Assistant ist nicht verbunden.';scanState='error';paint();return false}
 if(!nativeOn&&route.length<2){scanNote='Bitte zuerst eine Route berechnen.';scanState='error';paint();return false}
 if(!settings.configId){scanNote='Bitte zuerst die Blitzer.de Konfigurations-ID speichern.';scanState='error';paint();return false}
 if(typeof h.requestService!=='function'){scanNote='Aktualisiere die Home-Assistant-Anbindung.';scanState='error';paint();return false}
 let tasks;
 if(nativeOn){
  // In the APK the route lives in the Android navigation; it hands out at most 12 scan points.
  try{
   const reply=await nativeCall('roadassist.scanpoints');
   tasks=(Array.isArray(reply?.points)?reply.points:[]).map(point).filter(Boolean).slice(0,MAX_SAMPLES);
   if(Number.isInteger(reply?.plan)&&reply.plan!==planSerial){planSerial=reply.plan;scanReportKey=''}
  }catch{tasks=[]}
  if(!tasks.length&&auto)return false;
  if(!tasks.length){scanNote='Bitte zuerst eine Route berechnen.';scanState='error';paint();return false}
  if(scanState==='running')return false;
 }else tasks=sampleRoute();
 if(!tasks.length)return false;
 const serial=++scanSerial;scanCancel=new AbortController();
 scanState='running';scanProgress=0;scanTotal=tasks.length;scanCoverage='nicht bestätigt';
 scanNote='Routenscan begonnen: '+tasks.length+' Suchpunkte. Home Assistant Tracker wird vorübergehend verändert.';
 const results=new Map(),startedRoute=routeSerial,signal=scanCancel.signal;
 let confirmed=0;
 reportScan('running');paint();
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
    scanProgress=i+1;reportScan('running');paint();continue;
   }
   confirmed++;
   const data=await h.requestService('/api/services/blitzer/refresh_controls?return_response',{
    method:'POST',body:{config_entry_id:settings.configId}
   });
   for(const c of responseCameras(data))results.set(cameraKey(c),c);
   scanProgress=i+1;scanNote='Suchpunkt '+(i+1)+'/'+tasks.length+' · '+results.size+' Meldungen';
   reportScan('running');paint();
  }
  if(serial!==scanSerial||startedRoute!==routeSerial)return false;
  if(!confirmed)throw new Error('Kein Suchpunkt bestätigt: Home Assistant hat die Tracker-Position nicht übernommen.');
  scanCameras=[...results.values()];scanRev++;
  scanState='completed';scanCoverage=confirmed===tasks.length?'Suchpunkte abgefragt; Integrationsergebnis nicht garantiert':'teilweise ('+confirmed+'/'+tasks.length+' Suchpunkte)';
  scanNote='Routenscan abgeschlossen · '+scanCameras.length+' gefundene Meldungen. Ergebnisse gelten nur für diese Route.';
  // Cameras first, then the final state: the route overview then shows the complete number.
  updateFromHA();reportScan(confirmed===tasks.length?'done':'failed');paint();return true;
 }catch(e){
  if(serial!==scanSerial)return false;
  scanState=signal.aborted?'cancelled':'error';scanNote=String(e?.message||e).slice(0,210);
  reportScan('failed');paint();return false;
 }finally{if(serial===scanSerial)scanCancel=null}
}
function cancelScan(){
 scanSerial++;
 if(scanCancel){scanCancel.abort();scanCancel=null}
 if(scanState==='running'){scanState='cancelled';scanNote='Routenscan abgebrochen.';reportScan('idle')}
 paint();
}
function routeState(){
 return{routeLength,routePoints:route.length,haCount,connected,matched:matched.map(x=>({id:x.camera.id,progress:x.progress,lateral:x.lateral})),
  currentMatch:currentMatch?{id:currentMatch.camera.id,ahead:currentMatch.ahead}:null,
  positionValid:!!positionOnRoute,scanState,scanProgress,scanTotal,scanNote,guiding,demo,settings:{enabled:settings.enabled,voice:settings.voice,configSet:!!settings.configId}};
}
/* ---- Road Assist as its own cockpit app: planned route with cameras, past trips. ----
   In the APK (capability roadAssistNative) the Android navigation matches cameras and keeps
   the trips; the web side only delivers the HA cameras and shows the native state.
   In the browser the web engine above feeds the same view. Trips never hold coordinates. */
const TRIPS='mevicar-next-roadassist-trips-v1',MAX_TRIPS=30,NATIVE_MAX_CAMERAS=2000;
let nativeOn=false,nativeProbe=null,nativeStatus=null,nativeTrips=[],nativePushKey='',appTimer=null;
let trips=[],trip=null,diagOpen=false,clearArmed=false;
const openTrips=new Set();
try{
 const saved=JSON.parse(localStorage.getItem(TRIPS)||'[]');
 if(Array.isArray(saved))trips=saved.map(cleanTrip).filter(t=>t&&t.outcome!=='active').slice(0,MAX_TRIPS);
}catch{}
function cleanHit(c){
 const limit=Number(c?.limit),meters=Number(c?.meters);
 return{title:String(c?.title||c?.label||'Blitzerkontrolle').slice(0,120),city:String(c?.city||'').slice(0,120),
  label:String(c?.label||'').slice(0,60),meters:finite(meters)?Math.max(0,Math.round(meters)):0,
  passed:!!c?.passed,limit:finite(limit)&&limit>0&&limit<350?Math.round(limit):null};
}
function cleanTrip(t){
 if(!t||typeof t!=='object'||!t.id)return null;
 const num=v=>finite(Number(v))&&Number(v)>0?Math.round(Number(v)):0;
 return{id:String(t.id).slice(0,64),startedAt:num(t.startedAt),endedAt:num(t.endedAt),
  destination:String(t.destination||'').slice(0,120),plannedMeters:num(t.plannedMeters),drivenMeters:num(t.drivenMeters),
  outcome:['active','arrived','stopped'].includes(t.outcome)?t.outcome:'stopped',dataAvailable:!!t.dataAvailable,
  cameras:(Array.isArray(t.cameras)?t.cameras:[]).slice(0,200).map(cleanHit)};
}
function nativeCall(action,fields){
 return Promise.resolve(window.MeviGoogleNav.nativeRequest(action,fields));
}
function detectNative(){
 const n=window.MeviGoogleNav;
 if(nativeOn||nativeProbe||!n?.isNativeMode?.()||typeof n.nativeRequest!=='function')return;
 nativeProbe=nativeCall('capabilities').then(result=>{
  nativeOn=!!result?.capabilities?.roadAssistNative;
  if(nativeOn){pushCameras();nativeSetting();pollNative();if(scanWanted&&!autoTimer)autoScan()}
 }).catch(()=>{nativeProbe=null});
}
function takeStatus(reply){
 if(!reply||reply.ok===false||!Array.isArray(reply.hits))return;
 nativeStatus=reply;paintApp();
 // Missed plan event (page loaded later): the result of an earlier query is gone, so query again.
 if(Number.isInteger(reply.planSerial)&&reply.planSerial!==planSerial)nativePlan(reply.planSerial,!!reply.route);
}
function takeTrips(reply){
 if(!reply||reply.ok===false||!Array.isArray(reply.trips))return;
 nativeTrips=reply.trips.map(cleanTrip).filter(Boolean).slice(0,MAX_TRIPS);paintApp();
}
function pushCameras(){
 if(!nativeOn)return;
 const snapshot=camerasFromHA(),list=[],seen=new Set();
 for(const raw of [...snapshot.cameras,...scanCameras]){
  const c=sanitizeCamera(raw);
  if(!c||seen.has(c.id))continue;
  seen.add(c.id);
  const item={id:c.id.slice(0,120),lat:c.lat,lng:c.lng,type:c.type,street:c.street,name:c.name,city:c.city};
  if(c.vmax>=5&&c.vmax<=200)item.vmax=c.vmax;
  list.push(item);
  if(list.length>=NATIVE_MAX_CAMERAS)break;
 }
 const key=[snapshot.connected,snapshot.updatedAt,list.length,scanCameras.length,scanRev].join('|');
 if(key===nativePushKey)return;
 nativePushKey=key;
 nativeCall('roadassist.cameras',{cameras:list,connected:snapshot.connected,updatedAt:snapshot.updatedAt})
  .then(takeStatus).catch(()=>{nativePushKey=''});
}
function pollNative(){
 if(!nativeOn)return Promise.resolve(false);
 return Promise.all([nativeCall('roadassist.status'),nativeCall('roadassist.trips')])
  .then(([status,list])=>{takeStatus(status);takeTrips(list);return true}).catch(()=>false);
}
function nativeSetting(){
 if(!nativeOn)return;
 nativeCall('roadassist.settings',{enabled:settings.enabled,voice:settings.voice}).then(takeStatus).catch(()=>{});
}
function destinationName(){
 try{return String(window.MeviGoogleNav?.destinationName?.()||'').slice(0,120)}catch{return ''}
}
function webHits(driven,base=0){
 return matched.map(m=>cleanHit({title:m.camera.street||messageFor(m.camera),city:m.camera.city,
  label:messageFor(m.camera),meters:base+m.progress,passed:finite(driven)&&base+m.progress<=driven,limit:m.camera.vmax}));
}
function tripJson(t,endedAt=0){
 return{id:t.id,startedAt:t.startedAt,endedAt,destination:t.destination,plannedMeters:t.plannedMeters,
  drivenMeters:Math.round(t.driven),
  outcome:!endedAt?'active':t.plannedMeters>0&&t.driven>=t.plannedMeters-150?'arrived':'stopped',
  dataAvailable:t.dataAvailable&&connected,
  cameras:[...(t.pastCameras||[]),...webHits(t.driven,t.base||0)].slice(0,200)};
}
function saveTrips(){
 try{localStorage.setItem(TRIPS,JSON.stringify(trips))}catch{}
}
/* Browser only: in the APK the web guidance never starts, Android records the trips itself. */
const MIN_TRIP_METERS=100;
function startTrip(){
 endTrip();
 if(demo||nativeOn||route.length<2)return;
 trip={id:'w'+Date.now(),startedAt:Date.now(),destination:destinationName(),
  plannedMeters:Math.round(routeLength),driven:0,base:0,pastCameras:[],dataAvailable:connected};
}
function endTrip(){
 if(!trip)return;
 const done=tripJson(trip,Date.now());trip=null;
 // A guidance that was started but never driven is no trip.
 if(done.outcome==='stopped'&&done.drivenMeters<MIN_TRIP_METERS){paintApp();return}
 trips=[done,...trips].slice(0,MAX_TRIPS);
 saveTrips();paintApp();
}
function model(){
 if(nativeOn&&nativeStatus){
  const st=nativeStatus;
  return{native:true,enabled:st.enabled!==false,voice:st.voice!==false,connected:!!st.connected,
   cameraCount:Number(st.cameraCount)||0,route:!!st.route,guiding:!!st.guiding,
   destination:String(st.destination||'').slice(0,120),plannedMeters:Math.max(0,Number(st.plannedMeters)||0),
   hits:st.hits.map(cleanHit),trips:nativeTrips.filter(t=>t.outcome!=='active')};
 }
 return{native:false,enabled:settings.enabled,voice:settings.voice,connected,cameraCount:haCount,
  route:route.length>1,guiding:guiding&&!demo,destination:destinationName(),plannedMeters:Math.round(routeLength),
  hits:webHits(trip?trip.driven:positionOnRoute?.progress,trip?.base||0),trips};
}
function appStatus(m){
 if(!m.route)return 'Keine Route geplant';
 if(!m.connected)return 'Home Assistant nicht verbunden – keine Blitzerprüfung';
 if(!m.cameraCount)return 'Home Assistant meldet keine Kameras – Abdeckung unbekannt';
 return m.hits.length+' Blitzer auf der Route · '+m.cameraCount+' HA-Meldungen';
}
function dateText(stamp){
 if(!stamp)return '';
 try{return new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(stamp)}
 catch{return ''}
}
function hitHTML(c){
 const detail=[c.label&&c.label!==c.title?c.label:'',c.city].filter(Boolean).join(' · ')||'Meldung aus Home Assistant';
 return '<li class="ra-hit'+(c.passed?' is-passed':'')+'">'+
  '<span class="ra-limit'+(c.limit?'':' is-unknown')+'">'+(c.limit||'!')+'</span>'+
  '<span class="ra-hit-text"><b>'+esc(c.title)+'</b><small>'+esc(detail)+'</small></span>'+
  '<span class="ra-hit-at"><b>'+esc(formatMeters(c.meters))+'</b><small>'+(c.passed?'passiert':'ab Start')+'</small></span></li>';
}
function tripHTML(t,index){
 const open=openTrips.has(t.id),count=t.cameras.length;
 const outcome=t.outcome==='active'?'läuft':t.outcome==='arrived'?'angekommen':'beendet';
 return '<li class="ra-trip'+(open?' is-open':'')+'">'+
  '<button type="button" class="ra-trip-head" aria-expanded="'+open+'" onclick="MeviRoadAssist.toggleTrip('+index+')">'+
  '<span class="ra-trip-main"><b>'+esc(t.destination||'Ziel ohne Namen')+'</b>'+
  '<small>'+esc([dateText(t.startedAt),outcome].filter(Boolean).join(' · '))+'</small></span>'+
  '<span class="ra-trip-side"><b>'+esc(formatMeters(t.drivenMeters))+'</b>'+
  '<small>'+(t.dataAvailable?count+' Blitzer':'ohne Blitzerdaten')+'</small></span>'+
  '<i aria-hidden="true">'+(open?'▾':'▸')+'</i></button>'+
  (open?'<div class="ra-trip-body"><p class="ra-route">Geplant '+esc(formatMeters(t.plannedMeters))+
   ' · gefahren '+esc(formatMeters(t.drivenMeters))+'</p>'+
   (!t.dataAvailable?'<p class="ra-empty">Für diese Fahrt lagen keine Blitzerdaten vor.</p>':
    count?'<ul class="ra-hits">'+t.cameras.map(hitHTML).join('')+'</ul>':
    '<p class="ra-empty">Keine gemeldete Kontrolle auf dieser Route.</p>')+
   (t.outcome==='active'?'':'<div class="ra-actions"><button type="button" class="ra-quiet" onclick="MeviRoadAssist.removeTrip('+index+')">Fahrt löschen</button></div>')+
   '</div>':'')+'</li>';
}
function appInner(){
 const m=model();
 const toggle=(on,label,call)=>'<button type="button" class="ra-switch'+(on?' is-on':'')+'" aria-pressed="'+on+
  '" onclick="MeviRoadAssist.'+call+'('+(!on)+')">'+label+' '+(on?'an':'aus')+'</button>';
 const head='<header class="ra-head"><div class="ra-title"><b>◈ ROAD ASSIST</b><small>'+
  esc(m.connected?m.cameraCount+' Blitzer-Meldungen aus Home Assistant':'Home Assistant nicht verbunden')+'</small></div>'+
  '<div class="ra-switches">'+toggle(m.enabled,'Warnung','setEnabled')+toggle(m.voice,'Sprache','setVoice')+'</div></header>';
 let plan;
 if(!m.route){
  plan='<p class="ra-empty">Keine Route geplant. Ziel in der Navigation wählen – die Blitzer auf der Strecke erscheinen dann hier.</p>'+
   '<div class="ra-actions"><button type="button" onclick="openApp(\'nav\')">Navigation öffnen</button></div>';
 }else{
  plan='<p class="ra-route">'+esc([m.destination||'Ziel ohne Namen',formatMeters(m.plannedMeters),
    m.guiding?'Zielführung aktiv':'geplant'].join(' · '))+'</p>'+
   (!m.connected?'<p class="ra-empty">Home Assistant nicht verbunden – keine Blitzerprüfung.</p>'+
     '<div class="ra-actions"><button type="button" onclick="openApp(\'ha\')">Home Assistant verbinden</button></div>':
    (m.hits.length?'<ul class="ra-hits">'+m.hits.map(hitHTML).join('')+'</ul>':
     '<p class="ra-empty">'+(m.cameraCount?'Keine gemeldete Kontrolle auf dieser Route.':
      'Home Assistant meldet keine Kameras – Abdeckung unbekannt.')+'</p>')+
    '<div class="ra-actions"><button type="button" onclick="MeviRoadAssist.refresh()">Daten aktualisieren</button></div>');
 }
 const past=m.trips.some(t=>t.outcome!=='active');
 return head+
  '<section class="ra-card"><h3>Geplante Route</h3>'+plan+
  '<small class="ra-note">Nur Meldungen aus Home Assistant · keine Vollständigkeitsgarantie</small></section>'+
  '<section class="ra-card"><div class="ra-card-head"><h3>Bisherige Fahrten</h3>'+
  (past?'<button type="button" class="ra-quiet" onclick="MeviRoadAssist.clearTrips()">'+
   (clearArmed?'Wirklich alle löschen?':'Alle löschen')+'</button>':'')+'</div>'+
  (m.trips.length?'<ul class="ra-trips">'+m.trips.map(tripHTML).join('')+'</ul>':
   '<p class="ra-empty">Noch keine Fahrt aufgezeichnet. Eine Fahrt erscheint hier, sobald die Zielführung beendet ist; '+
   'gespeichert werden Ziel, Strecke und Blitzer – keine Koordinaten.</p>')+'</section>'+
  '<section class="ra-card ra-diag"><button type="button" class="ra-fold" aria-expanded="'+diagOpen+
  '" onclick="MeviRoadAssist.toggleDiag()"><b>Diagnose &amp; Routenscan</b><i aria-hidden="true">'+(diagOpen?'▾':'▸')+'</i></button>'+
  (diagOpen?infoHTML():'')+'</section>';
}
function appHTML(compact){
 return '<div class="ra-app'+(compact?' ra-compact':'')+'" id="mevi-ra-app">'+appInner()+'</div>';
}
function paintApp(){
 const host=document.getElementById('mevi-ra-app');
 if(!host)return;
 const html=appInner();
 if(host.__raHTML===html)return; // keep scroll position and running taps on unchanged polls
 host.__raHTML=html;host.innerHTML=html;
}
function mount(){
 if(!document.getElementById('mevi-ra-app'))return;
 updateFromHA();
 if(appTimer===null)appTimer=setInterval(()=>{if(!document?.hidden)pollNative()},3000);
 pollNative();
}
function unmount(){
 if(appTimer!==null){clearInterval(appTimer);appTimer=null}
 clearArmed=false;
}
function toggleTrip(index){
 const item=model().trips[index];
 if(!item)return;
 if(openTrips.has(item.id))openTrips.delete(item.id);else openTrips.add(item.id);
 clearArmed=false;paintApp();
}
function toggleDiag(){diagOpen=!diagOpen;paintApp()}
function removeTrip(index){
 const m=model(),item=m.trips[index];
 if(!item||item.outcome==='active')return;
 openTrips.delete(item.id);
 if(m.native){nativeCall('roadassist.trips.remove',{tripId:item.id}).then(takeTrips).catch(()=>{});return}
 trips=trips.filter(t=>t.id!==item.id);saveTrips();paintApp();
}
function clearTrips(){
 if(!clearArmed){clearArmed=true;paintApp();return}
 clearArmed=false;openTrips.clear();
 if(model().native){nativeCall('roadassist.trips.clear').then(takeTrips).catch(()=>{});paintApp();return}
 trips=[];saveTrips();paintApp();
}
window.MeviRoadAssist={onRoute,onGuidanceStart,onGuidanceStop,onPosition,onHAChange,summaryHTML,overlayHTML,routeNote:routeStatus,paint,
 refresh,setEnabled,setVoice,setConfigId,storeConfig,openScan,infoHTML,scan,cancelScan,
 routeState,project,buildRoute,cameraMatches,sampleRoute,responseCameras,formatMeters,
 appHTML,paintApp,mount,unmount,toggleTrip,toggleDiag,removeTrip,clearTrips,model};
})();
