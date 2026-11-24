/* MeviCar Next Fahrtenbuch data and GPS engine. Same Web code in APK. */
(function(root){
'use strict';
const DB_NAME='mevicar-fahrtenbuch-v1', AUTO_KEY='mevicar-fahrtenbuch-auto-v1';
const MAX_POINTS=12000, MAX_ACCURACY=70, MAX_FIX_AGE=15000;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const copy=o=>JSON.parse(JSON.stringify(o));
const newId=()=>String(Date.now())+'-'+Math.random().toString(36).slice(2,9);
const distance=(a,b)=>{
 const r=Math.PI/180,dl=(b.lat-a.lat)*r,dn=(b.lon-a.lon)*r;
 const h=Math.sin(dl/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dn/2)**2;
 return 12742000*Math.asin(Math.min(1,Math.sqrt(h)));
};
function normalize(position,now=Date.now()){
 const c=position?.coords||position||{};
 const lat=Number(c.latitude??c.lat),lon=Number(c.longitude??c.lng??c.lon);
 const t=Number(position?.timestamp||c.t||now),a=Number(c.accuracy??c.a);
 if(!finite(lat)||!finite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||
 !finite(a)||a<0||a>MAX_ACCURACY||t>now+5000||now-t>MAX_FIX_AGE)return null;
 const v=finite(c.speed)&&c.speed>=0&&c.speed<=72?c.speed*3.6:
  finite(c.v)&&c.v>=0&&c.v<=260?c.v:null;
 const e=finite(c.altitude)&&(!finite(c.altitudeAccuracy)||c.altitudeAccuracy<=50)&&
 c.altitude>-500&&c.altitude<9000?c.altitude:
 finite(c.e)&&c.e>-500&&c.e<9000?c.e:null;
 return {t:Math.round(t),lat,lon,a:Math.round(a),v,e:e===null?null:Math.round(e*10)/10};
}
function statistics(ride,now=Date.now()){
 if(!ride)return null;
 const ms=Math.max(0,(ride.endAt||now)-ride.startAt),d=ride.distanceM||0;
 return {elapsedMs:ms,distanceKm:d/1000,
 avgKmh:ms?d/ms*3600:0,
 movingAvgKmh:ride.movingMs?d/ride.movingMs*3600:0,
 maxKmh:ride.maxKmh||0,movingMs:ride.movingMs||0,
 stoppedMs:Math.max(0,ms-(ride.movingMs||0)),
 ascentM:ride.ascentM||0,descentM:ride.descentM||0,
 minAltitude:ride.minAltitude??null,maxAltitude:ride.maxAltitude??null};
}
let dbp=null;
function db(){
 if(dbp)return dbp;
 dbp=new Promise((resolve,reject)=>{
  if(!root.indexedDB){reject(new Error('IndexedDB nicht verfügbar'));return}
  const req=root.indexedDB.open(DB_NAME,1);
  req.onupgradeneeded=()=>{
   const d=req.result;
   if(!d.objectStoreNames.contains('rides'))d.createObjectStore('rides',{keyPath:'id'});
   if(!d.objectStoreNames.contains('state'))d.createObjectStore('state',{keyPath:'id'});
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error||new Error('Datenbank konnte nicht geöffnet werden'));
  req.onblocked=()=>reject(new Error('Anderer Tab blockiert die Datenbank'));
 }).catch(err=>{dbp=null;throw err});
 return dbp;
}
async function op(table,method,value){
 const database=await db();
 return new Promise((resolve,reject)=>{
  const tx=database.transaction(table,method==='get'||method==='getAll'?'readonly':'readwrite');
  const s=tx.objectStore(table);
  const request=method==='getAll'?s.getAll():s[method](value);
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||new Error('Datenbankfehler'));
  tx.onabort=()=>reject(tx.error||new Error('Transaktion abgebrochen'));
 });
}
let rides=[],active=null,ready=false,auto=false,watch=null,feedAt=0,fixAt=0,accuracy=null;
let notice='GPS bereit',error='',lastPersist=0,pending=Promise.resolve(),motionSince=0,lastMoving=0;
let tick=null,initialized=null;
const listeners=new Set();
function publish(){for(const fn of listeners){try{fn()}catch{}}}
function state(){
 return {ready,auto,active,rides,notice,error,accuracy,fixAt,recording:!!active};
}
function persisted(){
 if(!active)return pending;
 const value={id:'current',ride:copy(active)};
 pending=pending.catch(()=>{}).then(()=>op('state','put',value)).catch(e=>{error='Speichern fehlgeschlagen: '+e.message;publish()});
 lastPersist=Date.now();
 return pending;
}
function setAuto(value){
 auto=!!value;motionSince=0;
 try{root.localStorage?.setItem(AUTO_KEY,String(auto))}catch{}
 notice=auto?'Fahrterkennung aktiviert':'Fahrterkennung ausgeschaltet';
 ensureWatch();publish();
}
function freshPositionNeeded(){return !!active||auto}
function stopWatch(){
 if(watch!==null){try{root.navigator?.geolocation?.clearWatch(watch)}catch{}watch=null}
}
function ensureWatch(){
 if(!ready||!freshPositionNeeded()||root.document?.hidden){stopWatch();return}
 // Reuse existing navigation and tacho GPS fixes; own watch is a fallback.
 if(feedAt&&Date.now()-feedAt<15000){stopWatch();return}
 if(watch!==null)return;
 const geo=root.navigator?.geolocation;
 if(!geo?.watchPosition){notice='GPS nicht verfügbar';publish();return}
 try{watch=geo.watchPosition(pos=>feed(pos,'fahrtenbuch'),err=>{
  notice=err?.code===1?'Standortfreigabe fehlt':'GPS-Signal fehlt';
  stopWatch();publish();
 },{enableHighAccuracy:true,maximumAge:1000,timeout:15000})}
 catch(e){notice='GPS nicht gestartet';publish()}
}
function makeRide(automatic=false){
 return {id:newId(),startAt:Date.now(),endAt:null,title:'',
  startPlace:'',endPlace:'',notes:'',purpose:'privat',automatic:!!automatic,
  paused:false,distanceM:0,movingMs:0,maxKmh:0,
  ascentM:0,descentM:0,minAltitude:null,maxAltitude:null,points:[],
  last:null};
}
function start(automatic=false){
 if(!ready||active)return false;
 active=makeRide(automatic);motionSince=0;lastMoving=Date.now();notice='Fahrt läuft · GPS wird gesucht';error='';
 void persisted();ensureWatch();publish();return true;
}
function pause(){
 if(!active)return false;
 active.paused=!active.paused;
 if(!active.paused){active.last=null;lastMoving=Date.now()}
 notice=active.paused?'Fahrt pausiert':'Fahrt fortgesetzt';
 void persisted();publish();return true;
}
function append(p){
 if(!active||active.paused)return;
 const previous=active.last;
 if(previous&&p.t<=previous.t)return;
 const sec=previous?(p.t-previous.t)/1000:0;
 const metres=previous?distance(previous,p):0;
 if(previous&&sec>0&&sec<=90&&metres/sec>62)return; // reject teleport
 const threshold=previous?Math.max(8,Math.min(38,1.5*Math.max(previous.a,p.a))):0;
 const moved=!!previous&&sec<=90&&metres>threshold;
 let v=p.v;
 if(v===null&&previous&&sec>1&&sec<60)v=moved?Math.min(220,metres/sec*3.6):0;
 p.v=v===null?null:Math.round(v*10)/10;
 if(moved)active.distanceM+=metres;
 if(previous&&sec<=90&&p.v!==null&&p.v>=3)active.movingMs+=sec*1000;
 if(p.v!==null){active.maxKmh=Math.max(active.maxKmh,p.v);if(p.v>=5)lastMoving=Date.now()}
 if(p.e!==null){
  active.minAltitude=active.minAltitude===null?p.e:Math.min(active.minAltitude,p.e);
  active.maxAltitude=active.maxAltitude===null?p.e:Math.max(active.maxAltitude,p.e);
  if(previous?.e!=null&&moved){
   const delta=p.e-previous.e;
   if(delta>3)active.ascentM+=delta;
   if(delta< -3)active.descentM-=delta;
  }
 }
 if(!active.points.length||p.t-active.points.at(-1).t>=2800){
  active.points.push(p);
  if(active.points.length>MAX_POINTS)active.points=active.points.filter((_,i)=>i%2===0);
 }
 active.last=p;
 if(Date.now()-lastPersist>6000)void persisted();
}
function feed(input,source='gps'){
 if(!ready||!freshPositionNeeded())return false;
 const p=normalize(input);if(!p){notice='GPS zu ungenau oder veraltet';return false}
 if(source!=='fahrtenbuch'){feedAt=Date.now();stopWatch()}
 if(p.t===fixAt)return false;
 fixAt=p.t;accuracy=p.a;notice='GPS aktiv · ±'+p.a+' m';
 if(!active&&auto){
  if(p.v!==null&&p.v>=10){
   if(!motionSince)motionSince=p.t;
   if(p.t-motionSince>=12000){start(true);append(p)}
  }else motionSince=0;
 }else if(active)append(p);
 publish();return true;
}
async function finish(automatically=false){
 if(!active)return false;
 if(!active.points.length){error='Noch kein GPS-Punkt vorhanden. Bitte auf GPS warten.';publish();return false}
 const finished=copy(active);
 finished.endAt=Date.now();finished.paused=false;
 if(!finished.title)finished.title='Fahrt '+new Date(finished.startAt).toLocaleDateString('de-DE');
 delete finished.last;
 try{
  await pending.catch(()=>{});
  await op('rides','put',finished);
  await op('state','delete','current');
  rides.unshift(finished);rides.sort((a,b)=>b.startAt-a.startAt);
  active=null;motionSince=0;lastMoving=0;error='';
  notice=automatically?'Fahrt automatisch gespeichert':'Fahrt gespeichert';
  ensureWatch();publish();return finished;
 }catch(e){error='Fahrt nicht gespeichert: '+e.message;publish();return false}
}
async function update(id,details){
 const item=rides.find(x=>x.id===id);if(!item)return false;
 for(const key of ['title','startPlace','endPlace','notes']){
  if(Object.hasOwn(details,key))item[key]=String(details[key]||'').trim().slice(0,key==='notes'?1600:130);
 }
 if(Object.hasOwn(details,'purpose'))item.purpose=details.purpose==='dienstlich'?'dienstlich':'privat';
 try{await op('rides','put',copy(item));error='';publish();return true}
 catch(e){error=e.message;publish();return false}
}
async function remove(id){
 try{await op('rides','delete',id);rides=rides.filter(r=>r.id!==id);error='';publish();return true}
 catch(e){error=e.message;publish();return false}
}
function cleanImport(data){
 if(data?.format!=='MeviCar-Fahrtenbuch'||!Array.isArray(data.rides)||data.rides.length>5000)throw Error('Ungültige Sicherung');
 return data.rides.map(r=>{
  if(!r||!finite(r.startAt)||!finite(r.endAt)||r.endAt<r.startAt||
   !Array.isArray(r.points)||r.points.length>MAX_POINTS)throw Error('Ungültige Fahrt');
  const points=r.points.map(p=>{
   if(!finite(p.t)||!finite(p.lat)||!finite(p.lon)||Math.abs(p.lat)>90||Math.abs(p.lon)>180)throw Error('GPS-Werte ungültig');
   return {t:p.t,lat:p.lat,lon:p.lon,a:finite(p.a)?p.a:50,
    v:finite(p.v)?p.v:null,e:finite(p.e)?p.e:null};
  });
  return {id:String(r.id||newId()).slice(0,80),startAt:r.startAt,endAt:r.endAt,
   title:String(r.title||'Fahrt').slice(0,110),
   startPlace:String(r.startPlace||'').slice(0,130),endPlace:String(r.endPlace||'').slice(0,130),
   notes:String(r.notes||'').slice(0,1600),purpose:r.purpose==='dienstlich'?'dienstlich':'privat',
   automatic:!!r.automatic,paused:false,
   distanceM:finite(r.distanceM)?Math.max(0,r.distanceM):0,
   movingMs:finite(r.movingMs)?Math.max(0,r.movingMs):0,
   maxKmh:finite(r.maxKmh)?Math.max(0,r.maxKmh):0,
   ascentM:finite(r.ascentM)?Math.max(0,r.ascentM):0,
   descentM:finite(r.descentM)?Math.max(0,r.descentM):0,
   minAltitude:finite(r.minAltitude)?r.minAltitude:null,
   maxAltitude:finite(r.maxAltitude)?r.maxAltitude:null,points};
 });
}
async function importRides(payload){
 const imported=cleanImport(payload),known=new Set(rides.map(x=>x.id));
 for(const r of imported){
  if(known.has(r.id))r.id=newId();
  await op('rides','put',r);rides.push(r);known.add(r.id);
 }
 rides.sort((a,b)=>b.startAt-a.startAt);publish();return imported.length;
}
async function init(){
 if(initialized)return initialized;
 initialized=(async()=>{
  try{
   const [list,saved]=await Promise.all([op('rides','getAll'),op('state','get','current')]);
   rides=list.sort((a,b)=>b.startAt-a.startAt);
   active=saved?.ride||null;
   if(active){active.last=active.points.at(-1)||null;lastMoving=Date.now();
    notice=active.paused?'Pausierte Fahrt wiederhergestellt':'Unterbrochene Fahrt wird fortgesetzt'}
   try{auto=root.localStorage?.getItem(AUTO_KEY)==='true'}catch{auto=false}
   ready=true;error='';publish();ensureWatch();
   if(tick===null){
    tick=root.setInterval?.(()=>{
     ensureWatch();
     if(active&&!active.paused&&active.automatic&&lastMoving&&Date.now()-lastMoving>240000&&Date.now()-fixAt<16000)
      void finish(true);
     publish();
    },4000)??null;
   }
   return true;
  }catch(e){error='Lokale Speicherung nicht verfügbar: '+e.message;ready=false;publish();return false}
 })();
 return initialized;
}
root.document?.addEventListener?.('visibilitychange',()=>{
 if(root.document.hidden){void persisted();stopWatch()}else ensureWatch();
});
root.addEventListener?.('pagehide',()=>{void persisted();stopWatch()});
root.MeviTripBookCore=Object.freeze({
 init,state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},
 start,pause,finish,setAuto,feed,update,remove,importRides,
 statistics,normalize,distance,cleanImport
});
void init();
})(window);
