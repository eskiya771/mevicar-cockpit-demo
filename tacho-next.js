/* Tacho Next: native MeviCar app component, no iframe or separate document. */
(function(){
'use strict';
const speedSvg="<svg class=\"gauge-svg\" id=\"speedScreen\" viewBox=\"0 0 300 300\">\n            <!-- Background Arc Gradient -->\n            <defs>\n              <radialGradient id=\"grad-gauge\" cx=\"50%\" cy=\"50%\" r=\"50%\">\n                <stop offset=\"0%\" stop-color=\"#15202e\" stop-opacity=\"0.2\"/>\n                <stop offset=\"100%\" stop-color=\"#0a0f18\" stop-opacity=\"0.9\"/>\n              </radialGradient>\n            </defs>\n            <circle cx=\"150\" cy=\"150\" r=\"140\" fill=\"url(#grad-gauge)\" />\n            \n            <!-- Scale Arc (from ~135 degrees to ~405 degrees) -->\n            <path class=\"gauge-track\" d=\"M 65.15 234.85 A 120 120 0 1 1 234.85 234.85\" fill=\"none\" />\n            \n            <!-- Live Active Arc Ring (Fills dynamically) -->\n            <path class=\"gauge-fill\" id=\"speedFill\" d=\"M 65.15 234.85 A 120 120 0 1 1 234.85 234.85\" fill=\"none\" \n                  stroke-dasharray=\"565.49\" stroke-dashoffset=\"565.49\" />\n\n            <!-- Dynamic Gauge Ticks appended by JavaScript -->\n\n            <!-- Interactive Needle -->\n            <line x1=\"150\" y1=\"150\" x2=\"150\" y2=\"30\" class=\"gauge-needle\" id=\"speedNeedle\" />\n            <circle cx=\"150\" cy=\"150\" r=\"12\" class=\"gauge-center-cap\" />\n          </svg>";
const rpmSvg="<svg class=\"gauge-svg\" id=\"rpmScreen\" viewBox=\"0 0 300 300\">\n            <circle cx=\"150\" cy=\"150\" r=\"140\" fill=\"url(#grad-gauge)\" />\n            <path class=\"gauge-track\" d=\"M 65.15 234.85 A 120 120 0 1 1 234.85 234.85\" fill=\"none\" />\n            \n            <!-- Live Active RPM fill -->\n            <path class=\"gauge-fill\" id=\"rpmFill\" d=\"M 65.15 234.85 A 120 120 0 1 1 234.85 234.85\" fill=\"none\" \n                  stroke-dasharray=\"565.49\" stroke-dashoffset=\"565.49\" />\n\n            <!-- Dynamic Ticks appended by JavaScript -->\n\n            <!-- RPM Needle -->\n            <line x1=\"150\" y1=\"150\" x2=\"150\" y2=\"30\" class=\"gauge-needle\" id=\"rpmNeedle\" />\n            <circle cx=\"150\" cy=\"150\" r=\"12\" class=\"gauge-center-cap\" />\n          </svg>";
const TRIP_KEY='mevicar-tacho-next-gps-trip-v1';
const staleAfterMs=15000;
const headings=['N','NO','O','SO','S','SW','W','NW'];
let host=null,gpsWatch=null,orientationOn=false,visibilityOn=false,healthTimer=null,generation=0;
let speed=null,rpm=null,odometerKm=null,trip=readTrip();
let gpsHeading=null,sensorHeading=null,lastFixAt=0,lastSensorAt=0,lastPoint=null,gpsAccuracy=null;
let gpsStatus='GPS wird verbunden …';
function readTrip(){try{const x=JSON.parse(localStorage.getItem(TRIP_KEY)||'{}');if(Number.isFinite(x.tripKm)&&x.tripKm>=0&&x.tripKm<100000)return x.tripKm;}catch{}return 0;}
function saveTrip(){try{localStorage.setItem(TRIP_KEY,JSON.stringify({tripKm:trip}));}catch{}}
function normalize(deg){return ((deg%360)+360)%360;}
function distanceKm(a,b){
 const deltaLat=(b.lat-a.lat)*Math.PI/180,deltaLon=(b.lon-a.lon)*Math.PI/180;
 const lat1=a.lat*Math.PI/180,lat2=b.lat*Math.PI/180;
 const h=Math.sin(deltaLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(deltaLon/2)**2;
 return 12742*Math.asin(Math.min(1,Math.sqrt(h)));
}
function trackVerdict(previous,point){
 const shared=window.MeviSpeedometer?.acceptTrackPoint;
 if(typeof shared==='function')return shared(previous,point);
 if(!Number.isFinite(point.lat)||!Number.isFinite(point.lon)||Math.abs(point.lat)>90||Math.abs(point.lon)>180)return {ok:false};
 if(!Number.isFinite(point.accuracy)||point.accuracy<0||point.accuracy>80)return {ok:false};
 if(!previous)return {ok:true,km:0};
 const hours=(point.time-previous.time)/3600000,km=distanceKm(previous,point);
 return {ok:hours>0&&km/hours<=230,km};
}
function compassHeading(){
 const gpsFresh=Date.now()-lastFixAt<staleAfterMs, sensorFresh=Date.now()-lastSensorAt<staleAfterMs;
 // Use vehicle travel direction while driving. A mounted phone's magnetic
 // orientation does not necessarily align with the vehicle's heading.
 if(gpsFresh&&Number.isFinite(speed)&&speed>=5&&Number.isFinite(gpsHeading))return gpsHeading;
 if(sensorFresh&&Number.isFinite(sensorHeading))return sensorHeading;
 if(gpsFresh&&Number.isFinite(gpsHeading))return gpsHeading;
 return null;
}
function compassHTML(){return '<div class="tn-compass-band" role="img" aria-label="Kompass wartet auf Sensordaten"><div class="tn-compass-track" id="tn-compass-track"></div><div class="tn-compass-pointer" aria-hidden="true"></div></div>';}
function paintCompass(){
 if(!host)return;
 const track=host.querySelector('#tn-compass-track');if(!track)return;
 const heading=compassHeading(),tape=track.closest('.tn-compass-band');
 if(!Number.isFinite(heading)){
  track.innerHTML='<span class="tn-compass-empty">—</span>';
  tape?.setAttribute('aria-label','Kompass: keine Daten');
  return;
 }
 const center=Math.round(heading/15)*15,pxPerDegree=1.2;
 let out='';
 for(let deg=center-105;deg<=center+105;deg+=15){
  const normalized=normalize(deg),major=normalized%45===0;
  const offset=(deg-heading)*pxPerDegree;
  out+='<span class="tn-compass-mark'+(major?' tn-cardinal':' tn-minor')+
   '" style="left:calc(50% + '+offset.toFixed(2)+'px)" aria-hidden="true"><i></i>'+
   (major?'<b>'+headings[normalized/45]+'</b>':'')+'</span>';
 }
 track.innerHTML=out;
 tape?.setAttribute('aria-label','Kompass: '+Math.round(heading)+' Grad');
}
function markup(){return '<div class="tn-root"><div class="tn-gauges"><div class="tn-gauge">'+speedSvg+
 '<span class="tn-gps-status" id="tn-gps-status" role="status">GPS wird verbunden …</span>'+
 '<button class="tn-sensor-button tn-gps-retry" id="tn-gps-retry" type="button" hidden>GPS erneut starten</button>'+
 '<button class="tn-sensor-button tn-compass-permission" id="tn-compass-permission" type="button" hidden>Kompass freigeben</button>'+
 '<div class="tn-readout"><span class="tn-number" id="tn-speed">—</span><span class="tn-unit">KM/H · GPS</span>'+compassHTML()+'</div></div>'+
 '<div class="tn-gauge">'+rpmSvg+'<div class="tn-readout"><span class="tn-number tn-rpm-number" id="tn-rpm">—</span><span class="tn-unit">U/MIN X1000</span><span class="tn-source-label">OBD nicht verbunden</span></div></div></div>'+
 '<div class="tn-stats"><div class="tn-stat"><span class="tn-stat-label">GESAMTLAUFLEISTUNG · OBD</span><span class="tn-stat-value" id="tn-odometer">— km</span></div>'+
 '<div class="tn-stat"><span class="tn-stat-label">TRIP · GPS</span><span class="tn-stat-value" id="tn-trip">0,0 km</span></div></div></div>';}
function ticks(svg,max,step,labelStep){const group=document.createElementNS('http://www.w3.org/2000/svg','g');group.setAttribute('class','gauge-ticks-dynamic');for(let n=0;n<=Math.round(max/step);n++){const value=n*step,angle=(135+value/max*270)*Math.PI/180,major=Math.abs(value/labelStep-Math.round(value/labelStep))<.0001;const el=document.createElementNS('http://www.w3.org/2000/svg','line');for(const [k,v] of Object.entries({x1:150+120*Math.cos(angle),y1:150+120*Math.sin(angle),x2:150+(major?108:114)*Math.cos(angle),y2:150+(major?108:114)*Math.sin(angle)}))el.setAttribute(k,v);el.setAttribute('class',(major?'gauge-tick-major':'gauge-tick-minor')+(max===8&&value>=6.5?' gauge-tick-redline':''));group.appendChild(el);if(major){const text=document.createElementNS('http://www.w3.org/2000/svg','text');text.setAttribute('x',150+97*Math.cos(angle));text.setAttribute('y',154+97*Math.sin(angle));text.setAttribute('class','gauge-text'+(max===8&&value>=7?' gauge-text-redline':''));text.textContent=value;group.appendChild(text)}}svg.insertBefore(group,svg.querySelector('.gauge-center-cap'))}
function paint(){
 if(!host||!host.isConnected)return;
 const el=id=>host.querySelector('#'+id);
 const fresh=lastFixAt&&Date.now()-lastFixAt<=staleAfterMs;
 const actualSpeed=fresh&&Number.isFinite(speed)?speed:null;
 el('tn-speed').textContent=Number.isFinite(actualSpeed)?String(Math.round(actualSpeed)):'—';
 el('tn-rpm').textContent=Number.isFinite(rpm)?(rpm/1000).toFixed(1):'—';
 el('tn-odometer').textContent=Number.isFinite(odometerKm)?Math.round(odometerKm).toLocaleString('de-DE')+' km':'— km';
 el('tn-trip').textContent=trip.toFixed(1).replace('.',',')+' km';
 el('tn-gps-status').textContent=fresh?('GPS aktiv'+(Number.isFinite(gpsAccuracy)?' · ±'+Math.round(gpsAccuracy)+' m':'')):gpsStatus;
 paintCompass();
 for(const [fill,needle,val,max] of [['speedFill','speedNeedle',actualSpeed,220],['rpmFill','rpmNeedle',rpm,8000]]){
  const fraction=Number.isFinite(val)?Math.max(0,Math.min(1,val/max)):0;
  const path=el(fill),length=path.getTotalLength();
  path.style.strokeDasharray=String(length);
  path.style.strokeDashoffset=String(length*(1-fraction));
  el(needle).style.transform='rotate('+(-135+270*fraction)+'deg)';
  el(needle).style.transformOrigin='150px 150px';
 }
}
function applyFix(pos,token){
 if(!host||token!==generation)return;
 const coords=pos?.coords||{},now=Date.now(),time=Number.isFinite(pos.timestamp)&&pos.timestamp>0?pos.timestamp:now;
 if(time<now-staleAfterMs||time>now+5000)return;
 const point={lat:coords.latitude,lon:coords.longitude,accuracy:coords.accuracy,time};
 const verdict=trackVerdict(lastPoint,point);
 if(!verdict.ok){gpsStatus='GPS ungenau · warte auf besseren Empfang';paint();return;}
 gpsAccuracy=point.accuracy;
 let currentSpeed=null;
 const deltaHours=lastPoint?(point.time-lastPoint.time)/3600000:0;
 const movementKm=lastPoint?distanceKm(lastPoint,point):0;
 const driftThresholdKm=Math.max(.006,Math.min(.025,point.accuracy*.001));
 if(Number.isFinite(coords.speed)&&coords.speed>=0&&coords.speed<112){
  currentSpeed=coords.speed*3.6;
 }else if(lastPoint&&deltaHours>0){
  currentSpeed=movementKm>=driftThresholdKm?Math.min(400,movementKm/deltaHours):0;
 }
 speed=currentSpeed;
 lastFixAt=now;
 gpsStatus='GPS aktiv';
 if(Number.isFinite(coords.heading)&&coords.heading>=0&&coords.heading<=360&&
    Number.isFinite(currentSpeed)&&currentSpeed>=5)gpsHeading=normalize(coords.heading);
 // Track position only after meaningful movement. This preserves small distances
 // between successive fixes without accumulating idle GPS jitter as trip.
 if(!lastPoint)lastPoint=point;
 else if(movementKm>=driftThresholdKm&&Number.isFinite(currentSpeed)&&currentSpeed>=3){
  trip+=movementKm;saveTrip();lastPoint=point;
 }else if(point.time-lastPoint.time>30000){lastPoint=point;}
 paint();
}
function onGpsError(error,token){
 if(token!==generation||!host)return;
 gpsWatch=null;lastFixAt=0;speed=null;gpsHeading=null;
 const code=error?.code;
 gpsStatus=code===1?'Standortfreigabe fehlt':code===2?'GPS-Signal nicht verfügbar':code===3?'GPS-Zeitüberschreitung':'GPS nicht verfügbar';
 const retry=host.querySelector('#tn-gps-retry');if(retry)retry.hidden=false;
 paint();
}
function startGps(){
 if(!host||gpsWatch!==null)return;
 const token=generation,geo=navigator?.geolocation;
 if(!geo||typeof geo.watchPosition!=='function'){onGpsError(null,token);return;}
 gpsStatus='GPS wird verbunden …';
 const retry=host.querySelector('#tn-gps-retry');if(retry)retry.hidden=true;
 try{gpsWatch=geo.watchPosition(pos=>applyFix(pos,token),err=>{
   if(gpsWatch!==null){try{geo.clearWatch(gpsWatch);}catch{}}
   onGpsError(err,token);
  },{enableHighAccuracy:true,maximumAge:1000,timeout:15000});}
 catch(err){onGpsError(err,token);}
 paint();
}
function onOrientation(event){
 if(!host||document.hidden)return;
 let heading=null;
 if(Number.isFinite(event.webkitCompassHeading))heading=event.webkitCompassHeading;
 else if(event.absolute&&Number.isFinite(event.alpha))heading=360-event.alpha;
 if(!Number.isFinite(heading))return;
 sensorHeading=normalize(heading);lastSensorAt=Date.now();
 paintCompass();
}
function attachCompass(){
 if(orientationOn||!window.addEventListener)return;
 window.addEventListener('deviceorientation',onOrientation,true);
 window.addEventListener('deviceorientationabsolute',onOrientation,true);
 orientationOn=true;
}
function setupCompass(){
 const event=window.DeviceOrientationEvent;
 const btn=host?.querySelector('#tn-compass-permission');
 if(!event)return;
 // On iPhone the permission must be requested synchronously from a tap.
 if(typeof event.requestPermission==='function'){if(btn)btn.hidden=false;}
 else attachCompass();
}
async function requestCompassPermission(){
 const btn=host?.querySelector('#tn-compass-permission');
 try{
  const permission=await window.DeviceOrientationEvent.requestPermission();
  if(permission==='granted'){attachCompass();if(btn)btn.hidden=true;}
  else if(btn)btn.textContent='Kompass nicht erlaubt';
 }catch{if(btn)btn.textContent='Kompass nicht verfügbar';}
}
function onClick(event){
 if(event.target.closest('#tn-gps-retry'))startGps();
 if(event.target.closest('#tn-compass-permission'))void requestCompassPermission();
}
function onVisibility(){
 if(!host)return;
 if(document.hidden){
  if(gpsWatch!==null){try{navigator.geolocation?.clearWatch(gpsWatch);}catch{}gpsWatch=null;}
  if(orientationOn){
   window.removeEventListener('deviceorientation',onOrientation,true);
   window.removeEventListener('deviceorientationabsolute',onOrientation,true);
   orientationOn=false;
  }
  lastFixAt=0;speed=null;gpsHeading=null;gpsStatus='GPS pausiert';paint();
 }else{
  startGps();
  setupCompass();
 }
}
function mount(){
 const next=document.querySelector('.tacho-next-host');
 if(!next){unmount();return;}
 unmount();
 host=next;host.innerHTML=markup();
 ticks(host.querySelector('#speedScreen'),220,10,20);
 ticks(host.querySelector('#rpmScreen'),8,.5,1);
 host.addEventListener('click',onClick);
 document.addEventListener('visibilitychange',onVisibility);
 visibilityOn=true;
 lastFixAt=0;lastSensorAt=0;lastPoint=null;speed=null;gpsHeading=null;sensorHeading=null;
 gpsStatus='GPS wird verbunden …';
 paint();
 if(!document.hidden){startGps();setupCompass();}
 healthTimer=setInterval(()=>{
  if(lastFixAt&&Date.now()-lastFixAt>staleAfterMs){lastFixAt=0;speed=null;gpsHeading=null;gpsStatus='GPS-Signal veraltet';}
  paint();
 },2500);
}
function unmount(){
 generation++;
 if(gpsWatch!==null){try{navigator.geolocation?.clearWatch(gpsWatch);}catch{}gpsWatch=null;}
 if(orientationOn){
  window.removeEventListener('deviceorientation',onOrientation,true);
  window.removeEventListener('deviceorientationabsolute',onOrientation,true);
  orientationOn=false;
 }
 if(visibilityOn){document.removeEventListener('visibilitychange',onVisibility);visibilityOn=false;}
 if(healthTimer!==null){clearInterval(healthTimer);healthTimer=null;}
 if(host)host.removeEventListener('click',onClick);
 host=null;
}
window.meviTachoNextHTML=()=>'<div class="tn-root" aria-label="Tacho Next lädt"></div>';
window.meviTachoNextMount=mount;
window.meviTachoNextUnmount=unmount;
window.meviTachoNextDebug=()=>({mounted:!!host,gpsWatch,orientationOn,speedKmh:speed,rpm,odometerKm,tripKm:trip,heading:compassHeading(),lastFixAt,gpsStatus});
})();