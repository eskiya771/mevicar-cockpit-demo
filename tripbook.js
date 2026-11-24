/* Fahrtenbuch GUI — shared by iPhone Web App, DeX and the hybrid APK. */
(function(root){
'use strict';
const C=()=>root.MeviTripBookCore;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d=1)=>Number(v||0).toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
const day=t=>new Date(t).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'});
const clock=ms=>{
 const m=Math.max(0,Math.floor(ms/60000)),h=Math.floor(m/60);
 return h?h+' h '+String(m%60).padStart(2,'0')+' min':m+' min';
};
const tile=(name,value)=>'<div class="tb-tile"><span>'+esc(name)+'</span><strong>'+value+'</strong></div>';
let host=null,unsubscribe=null,selectedId=null,message='',lastPaint=0;
function pointsChart(points,field){
 const data=(points||[]).filter(p=>Number.isFinite(p[field]));
 if(data.length<2)return '<div class="tb-placeholder">Keine '+(field==='v'?'Geschwindigkeits':'Höhen')+'werte aufgezeichnet</div>';
 const values=data.map(p=>p[field]),min=Math.min(...values),max=Math.max(...values);
 const low=field==='v'?0:Math.floor((min-5)/10)*10;
 const high=field==='v'?Math.max(20,Math.ceil(max/10)*10):
  Math.max(low+20,Math.ceil((max+5)/10)*10);
 const first=data[0].t,last=data.at(-1).t;
 const x=t=>35+530*(t-first)/Math.max(1,last-first);
 const y=v=>127-104*(v-low)/(high-low);
 const path=data.map((p,i)=>(i?'L':'M')+x(p.t).toFixed(2)+' '+y(p[field]).toFixed(2)).join(' ');
 const lines=[0,1,2,3].map(i=>{
  const v=low+(high-low)*i/3,Y=y(v);
  return '<line x1="35" x2="565" y1="'+Y+'" y2="'+Y+'" class="tb-gridline"/>'+
   '<text x="29" y="'+(Y+4)+'" text-anchor="end">'+Math.round(v)+'</text>';
 }).join('');
 return '<svg class="tb-chart" viewBox="0 0 580 155" preserveAspectRatio="none" role="img" aria-label="'+
  (field==='v'?'Geschwindigkeit in km/h':'GPS-Höhe in m')+'">'+lines+
  '<path d="'+path+'" class="tb-graph"/>'+
  '<text x="35" y="150">'+new Date(first).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})+'</text>'+
  '<text x="565" y="150" text-anchor="end">'+new Date(last).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})+'</text></svg>';
}
function routeChart(points){
 const pts=(points||[]).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));
 if(pts.length<2)return '<div class="tb-placeholder">Noch keine GPS-Strecke vorhanden</div>';
 const lat0=Math.min(...pts.map(p=>p.lat)),lat1=Math.max(...pts.map(p=>p.lat));
 const lon0=Math.min(...pts.map(p=>p.lon)),lon1=Math.max(...pts.map(p=>p.lon));
 const cos=Math.max(.1,Math.cos((lat0+lat1)/2*Math.PI/180));
 const rangeLon=Math.max(.00002,(lon1-lon0)*cos),rangeLat=Math.max(.00002,lat1-lat0);
 const X=p=>18+544*(p.lon-lon0)*cos/rangeLon,Y=p=>157-138*(p.lat-lat0)/rangeLat;
 const line=pts.map(p=>X(p).toFixed(1)+','+Y(p).toFixed(1)).join(' ');
 return '<svg class="tb-route" viewBox="0 0 580 175" role="img" aria-label="GPS-Streckenverlauf (ohne Straßenkarte)">'+
  '<polyline class="tb-route-line" points="'+line+'" fill="none"/>'+
  '<circle class="tb-start" cx="'+X(pts[0])+'" cy="'+Y(pts[0])+'" r="6"/>'+
  '<circle class="tb-end" cx="'+X(pts.at(-1))+'" cy="'+Y(pts.at(-1))+'" r="6"/></svg>';
}
function historyRow(ride){
 const s=C().statistics(ride);
 return '<button type="button" data-tb-open="'+esc(ride.id)+'" class="tb-history-row'+
  (ride.id===selectedId?' selected':'')+'"><strong>'+esc(ride.title||'Fahrt')+'</strong>'+
  '<small>'+day(ride.startAt)+' · '+clock(s.elapsedMs)+'</small>'+
  '<span class="tb-history-meta"><b>'+fmt(s.distanceKm)+' km</b>'+
  '<span>Ø '+fmt(s.avgKmh,0)+' km/h</span><em>'+esc(ride.purpose==='dienstlich'?'Dienstlich':'Privat')+'</em></span></button>';
}
function detail(ride){
 if(!ride)return '<div class="tb-empty">Wähle eine gespeicherte Fahrt aus der Liste aus, um Zeitdaten und Profile zu sehen.</div>';
 const s=C().statistics(ride),start=ride.points?.[0],end=ride.points?.at(-1);
 const gps=p=>p?fmt(p.lat,5)+' / '+fmt(p.lon,5):'Noch keine GPS-Koordinaten';
 return '<div class="tb-detail-title"><div><h3>'+esc(ride.title||'Fahrt')+'</h3>'+
  '<small>'+day(ride.startAt)+' – '+day(ride.endAt)+'</small></div>'+
  '<div class="tb-detail-buttons"><button data-tb-action="gpx" type="button">GPX</button>'+
  '<button class="tb-danger" data-tb-action="delete" type="button">Löschen</button></div></div>'+
  '<div class="tb-metrics">'+tile('Strecke',fmt(s.distanceKm)+' km')+
  tile('Fahrtdauer',clock(s.elapsedMs))+tile('Ø Gesamt',fmt(s.avgKmh)+' km/h')+
  tile('Ø in Fahrt',fmt(s.movingAvgKmh)+' km/h')+
  tile('Max. Tempo',fmt(s.maxKmh)+' km/h')+
  tile('Standzeit',clock(s.stoppedMs))+
  tile('Anstieg',fmt(s.ascentM,0)+' m')+tile('Abstieg',fmt(s.descentM,0)+' m')+'</div>'+
  '<div class="tb-time"><span><b>Start</b>'+day(ride.startAt)+'</span>'+
  '<span><b>Ende</b>'+day(ride.endAt)+'</span></div>'+
  '<div class="tb-edit"><label>Fahrtname<input name="title" maxlength="110" value="'+esc(ride.title||'')+'"></label>'+
  '<label>Fahrtart<select name="purpose"><option value="privat"'+(ride.purpose!=='dienstlich'?' selected':'')+'>Privat</option>'+
  '<option value="dienstlich"'+(ride.purpose==='dienstlich'?' selected':'')+'>Dienstlich</option></select></label>'+
  '<label>Startort<input name="startPlace" maxlength="130" placeholder="Startort" value="'+esc(ride.startPlace||'')+'"></label>'+
  '<label>Zielort<input name="endPlace" maxlength="130" placeholder="Zielort" value="'+esc(ride.endPlace||'')+'"></label>'+
  '<label class="tb-wide">Notiz / Fahrtzweck<textarea rows="2" name="notes" maxlength="1600">'+esc(ride.notes||'')+'</textarea></label>'+
  '<button type="button" data-tb-action="save" class="tb-primary">Angaben speichern</button></div>'+
  '<div class="tb-charts"><section><h4>Geschwindigkeitsprofil <small>km/h</small></h4>'+
  pointsChart(ride.points,'v')+'</section><section><h4>Höhenprofil <small>Meter über NN (GPS)</small></h4>'+
  pointsChart(ride.points,'e')+'</section><section class="tb-route-section"><h4>Fahrtstrecke <small>GPS-Verlauf</small></h4>'+
  routeChart(ride.points)+'<div class="tb-gps-ends"><span>Start: '+esc(gps(start))+'</span>'+
  '<span>Ende: '+esc(gps(end))+'</span></div></section></div>'+
  '<p class="tb-footnote">GPS-Höhenwerte sind Näherungen. Höhenunterschiede unter 3 m werden gefiltert; schwacher Empfang kann die Messung beeinflussen.</p>';
}
function html(compact=false){
 const data=C()?.state?.();
 if(!data?.ready)return '<div class="tb-root"><div class="tb-empty">'+
  esc(data?.error||'Fahrtenbuch wird vorbereitet …')+'</div></div>';
 const rides=data.rides,chosen=rides.find(x=>x.id===selectedId)||rides[0]||null;
 if(chosen&&!selectedId)selectedId=chosen.id;
 const allKm=rides.reduce((sum,r)=>sum+(r.distanceM||0),0)/1000;
 const businessKm=rides.filter(r=>r.purpose==='dienstlich').reduce((sum,r)=>sum+(r.distanceM||0),0)/1000;
 const top='<div class="tb-overview">'+tile('Fahrten',String(rides.length))+
  tile('Gesamtstrecke',fmt(allKm)+' km')+
  tile('Fahrzeit',clock(rides.reduce((sum,r)=>sum+C().statistics(r).elapsedMs,0)))+
  tile('Dienstlich',fmt(businessKm)+' km')+'</div>';
 const a=data.active,live=a?C().statistics(a):null;
 const recorder='<section class="tb-recorder"><div class="tb-recorder-top"><div>'+
  '<strong>'+(a?(a.paused?'Fahrt pausiert':'Fahrt wird aufgezeichnet'):'Bereit für die nächste Fahrt')+'</strong>'+
  '<small>'+esc(data.notice)+'</small></div>'+
  '<span class="tb-state">'+(a?(a.paused?'PAUSE':'GPS · REC'):data.auto?'AUTOMATIK':'MANUELL')+'</span></div>'+
  (live?'<div class="tb-live">'+tile('Strecke',fmt(live.distanceKm)+' km')+
   tile('Dauer',clock(live.elapsedMs))+tile('Ø Tempo',fmt(live.avgKmh)+' km/h')+
   tile('Höchsttempo',fmt(live.maxKmh)+' km/h')+'</div>':'')+
  '<div class="tb-actions">'+(a?
  '<button type="button" data-tb-action="pause">'+(a.paused?'Fortsetzen':'Pausieren')+'</button>'+
  '<button type="button" class="tb-primary" data-tb-action="finish">Beenden & speichern</button>':
  '<button type="button" class="tb-primary" data-tb-action="start">Fahrt starten</button>')+
  '<label class="tb-auto"><input type="checkbox" data-tb-auto'+(data.auto?' checked':'')+
  '> Automatische Fahrterkennung</label></div>'+
  '<p class="tb-footnote">Automatik: ab 10 km/h für 12 Sekunden starten, nach 4 Minuten Stillstand beenden. '+
  'Auf dem iPhone zeichnet die Web-App bei gesperrtem Bildschirm unter Umständen nicht weiter auf.</p></section>';
 const history='<section class="tb-history"><div class="tb-section-heading"><h3>Vergangene Fahrten</h3>'+
  '<div><button type="button" data-tb-action="json">JSON</button>'+
  '<button type="button" data-tb-action="csv">CSV</button>'+
  '<button type="button" data-tb-action="import">Import</button></div></div>'+
  '<input type="file" id="tb-file" hidden accept=".json,application/json">'+
  '<div class="tb-history-scroll">'+(rides.length?rides.map(historyRow).join(''):
   '<div class="tb-empty">Noch keine gespeicherten Fahrten</div>')+'</div></section>';
 return '<section class="tb-root'+(compact?' tb-compact':'')+'">'+
  '<header class="tb-header"><div><small>MEVICAR NEXT</small><h2>Fahrtenbuch</h2></div>'+
  '<span class="tb-local">Lokal auf diesem Gerät</span></header>'+
  (data.error?'<div role="alert" class="tb-error">'+esc(data.error)+'</div>':'')+
  (message?'<div role="status" class="tb-message">'+esc(message)+'</div>':'')+
  top+recorder+'<div class="tb-columns">'+history+
  '<section class="tb-details">'+detail(chosen)+'</section></div></section>';
}
function redraw(){
 if(!host)return;
 const focus=root.document?.activeElement;
 if(focus&&host.contains(focus)&&/INPUT|TEXTAREA|SELECT/.test(focus.tagName||''))return;
 const scroll=host.querySelector('.tb-history-scroll')?.scrollTop||0;
 host.innerHTML=html(host.dataset?.compact==='true');
 const updated=host.querySelector('.tb-history-scroll');
 if(updated)updated.scrollTop=scroll;
 lastPaint=Date.now();
}
function download(name,data,mime){
 const url=URL.createObjectURL(new Blob([data],{type:mime}));
 const a=root.document.createElement('a');a.href=url;a.download=name;
 root.document.body.appendChild(a);a.click();a.remove();
 root.setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function saveExport(kind){
 const data=C().state(),rides=data.rides;
 if(kind==='json'){
  download('mevicar-fahrtenbuch.json',JSON.stringify({format:'MeviCar-Fahrtenbuch',
   version:1,exportedAt:new Date().toISOString(),rides},null,2),'application/json');
 }else if(kind==='csv'){
  const heading=['Start','Ende','Fahrt','Typ','Startort','Zielort','km','Minuten','Ø km/h','Max km/h','Aufstieg m','Abstieg m','Notiz'];
  const rows=rides.map(r=>[day(r.startAt),day(r.endAt),r.title,r.purpose,r.startPlace,r.endPlace,
   fmt(C().statistics(r).distanceKm,2),Math.round(C().statistics(r).elapsedMs/60000),
   fmt(C().statistics(r).avgKmh),fmt(r.maxKmh),fmt(r.ascentM,0),fmt(r.descentM,0),r.notes]);
  download('mevicar-fahrtenbuch.csv','\ufeff'+[heading,...rows].map(row=>
   row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n'),'text/csv;charset=utf-8');
 }else if(kind==='gpx'){
  const ride=rides.find(r=>r.id===selectedId);if(!ride)return;
  const xml=v=>esc(v);
  const p=ride.points.map(p=>'<trkpt lat="'+p.lat+'" lon="'+p.lon+'">'+
   (Number.isFinite(p.e)?'<ele>'+p.e+'</ele>':'')+
   '<time>'+new Date(p.t).toISOString()+'</time>'+
   (Number.isFinite(p.v)?'<speed>'+(p.v/3.6).toFixed(2)+'</speed>':'')+'</trkpt>').join('');
  download('mevicar-fahrt-'+ride.startAt+'.gpx','<?xml version="1.0" encoding="UTF-8"?>'+
   '<gpx version="1.1" creator="MeviCar Next" xmlns="http://www.topografix.com/GPX/1/1">'+
   '<trk><name>'+xml(ride.title)+'</name><trkseg>'+p+'</trkseg></trk></gpx>','application/gpx+xml');
 }
}
async function edit(){
 const values={};
 for(const name of ['title','purpose','startPlace','endPlace','notes'])
  values[name]=host?.querySelector('[name="'+name+'"]')?.value||'';
 if(await C().update(selectedId,values))message='Fahrt aktualisiert';
 redraw();
}
async function remove(){
 if(!root.confirm?.('Diese gespeicherte Fahrt endgültig löschen?'))return;
 if(await C().remove(selectedId)){
  selectedId=C().state().rides[0]?.id||null;message='Fahrt gelöscht';redraw();
 }
}
async function importData(file){
 if(!file)return;
 try{
  if(file.size>25*1024*1024)throw Error('Datei zu groß (max. 25 MB)');
  const parsed=JSON.parse(await file.text());
  const total=await C().importRides(parsed);
  selectedId=C().state().rides[0]?.id||null;message=total+' Fahrten importiert';
 }catch(e){message='Import fehlgeschlagen: '+e.message}
 redraw();
}
function onClick(e){
 const entry=e.target.closest?.('[data-tb-open]');
 if(entry){selectedId=entry.getAttribute('data-tb-open');message='';redraw();return}
 const button=e.target.closest?.('[data-tb-action]');
 if(!button)return;
 const action=button.dataset.tbAction;
 if(action==='start')C().start(false);
 else if(action==='pause')C().pause();
 else if(action==='finish')void C().finish(false).then(()=>{selectedId=null;redraw()});
 else if(action==='save')void edit();
 else if(action==='delete')void remove();
 else if(action==='json'||action==='csv'||action==='gpx')saveExport(action);
 else if(action==='import')host.querySelector('#tb-file')?.click();
 redraw();
}
function onChange(e){
 if(e.target?.matches?.('[data-tb-auto]'))C().setAuto(e.target.checked);
 if(e.target?.id==='tb-file')void importData(e.target.files?.[0]);
}
function mount(){
 const next=root.document?.querySelector?.('.tb-host');
 if(next===host)return;
 unmount();if(!next)return;
 host=next;host.dataset.compact=String(!!host.closest('aside'));
 host.addEventListener('click',onClick);
 host.addEventListener('change',onChange);
 unsubscribe=C().subscribe(()=>{if(Date.now()-lastPaint>1600)redraw()});
 void C().init().then(redraw);
 redraw();
}
function unmount(){
 if(unsubscribe){unsubscribe();unsubscribe=null}
 if(host){host.removeEventListener('click',onClick);host.removeEventListener('change',onChange);host=null}
}
root.MeviTripBook=Object.freeze({html,mount,unmount,pointsChart,routeChart});
})(window);
