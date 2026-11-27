/* MeviCar Next – Kalender.
   Native CalendarContract is unavailable to a PWA. Real sources:
   Google Calendar via official Google Identity Services readonly OAuth, or local .ics.
   OAuth tokens and Google event details live ONLY in process memory. ICS imports are
   kept on the user's device in browser storage until explicitly removed.
   No backend, stored credentials, demo appointments, or fabricated event data. */
(function(){
'use strict';
const STORE='mevicar-next-calendar-settings-v1', ICS_STORE='mevicar-next-calendar-ics-v1';
const GOOGLE_SCOPE='https://www.googleapis.com/auth/calendar.readonly';
const WEEK=7*86400000,DAY=86400000,MAX_ICS_BYTES=2000000,MAX_EVENTS=8000;
const DEFAULT_TZ=Intl.DateTimeFormat().resolvedOptions().timeZone||'Europe/Berlin';
const state={tab:'agenda',month:new Date().getMonth(),year:new Date().getFullYear(),selectedDay:'',
  sources:[],hidden:[],clientId:'',googleToken:'',googleExpiry:0,googleClient:null,
  googleCalendars:[],googleEvents:[],imports:[],loading:false,message:'',error:'',
  mounted:false,timer:null,requestId:0,googlePending:false,lastRefresh:0};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const $$=id=>document.getElementById(id);
function saveSettings(){
 try{localStorage.setItem(STORE,JSON.stringify({clientId:state.clientId,hidden:state.hidden}))}catch{}
}
function saveImports(){
 try{localStorage.setItem(ICS_STORE,JSON.stringify(state.imports))}catch(e){
  state.error='Kalenderdatei konnte nicht lokal gespeichert werden (Speicherlimit).';
 }
}
try{
 const settings=JSON.parse(localStorage.getItem(STORE)||'{}');
 if(typeof settings.clientId==='string'&&/^[-.a-zA-Z0-9_]+\.apps\.googleusercontent\.com$/.test(settings.clientId))state.clientId=settings.clientId;
 if(Array.isArray(settings.hidden))state.hidden=settings.hidden.filter(x=>typeof x==='string').slice(0,300);
 const stored=JSON.parse(localStorage.getItem(ICS_STORE)||'[]');
 if(Array.isArray(stored))state.imports=stored.filter(x=>x&&typeof x.id==='string'&&Array.isArray(x.events)).slice(0,15);
}catch{}
function dayKey(date){
 return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
function dateFromKey(key){const [y,m,d]=String(key).split('-').map(Number);return new Date(y,(m||1)-1,d||1)}
function dayStart(date){return new Date(date.getFullYear(),date.getMonth(),date.getDate()).getTime()}
function fmtDate(date,options){return new Intl.DateTimeFormat('de-DE',options).format(date)}
function timestampDate(v){
 if(v===null||v===undefined)return null;
 if(typeof v==='number')return new Date(v);
 const d=new Date(v);return Number.isFinite(d.getTime())?d:null;
}
function formatTime(t,allDay){return allDay?'Ganztägig':fmtDate(new Date(t),{hour:'2-digit',minute:'2-digit'})}
function unescapeICS(s){return String(s||'').replace(/\\[Nn]/g,'\n').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\')}
function unfold(text){
 return String(text||'').replace(/\r\n?/g,'\n').replace(/\n[ \t]/g,'');
}
function fields(line){
 const idx=line.indexOf(':');if(idx<0)return null;
 const descriptor=line.slice(0,idx),name=descriptor.split(';')[0].toUpperCase();
 const params={};for(const param of descriptor.split(';').slice(1)){
  const k=param.indexOf('=');if(k>0)params[param.slice(0,k).toUpperCase()]=param.slice(k+1).replace(/^"|"$/g,'');
 }
 return{name,params,value:line.slice(idx+1)};
}
function localParts(date,zone){
 if(!zone)return{y:date.getFullYear(),m:date.getMonth()+1,d:date.getDate(),h:date.getHours(),min:date.getMinutes(),sec:date.getSeconds()};
 try{
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hourCycle:'h23',
   year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(date);
  const v={};for(const p of parts)if(p.type!=='literal')v[p.type]=Number(p.value);
  return{y:v.year,m:v.month,d:v.day,h:v.hour,min:v.minute,sec:v.second};
 }catch{return localParts(date,null)}
}
function zonedTime(y,m,d,h,min,sec,zone){
 if(!zone)return new Date(y,m-1,d,h,min,sec).getTime();
 const desired=Date.UTC(y,m-1,d,h,min,sec),target={y,m,d,h,min,sec};
 let ms=desired;
 // Two corrections cover both summer and winter DST without Intl Temporal.
 for(let k=0;k<3;k++){
  const p=localParts(new Date(ms),zone);
  const actual=Date.UTC(p.y,p.m-1,p.d,p.h,p.min,p.sec);
  ms+=desired-actual;
 }
 if(!Number.isFinite(ms))return new Date(y,m-1,d,h,min,sec).getTime();
 return ms;
}
function parseICSDate(value,params={}){
 const v=String(value||'').trim();
 const match=v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
 if(!match)return null;
 const [,ys,mos,ds,hs='0',mis='0',ss='0',z]=match;
 const y=+ys,m=+mos,d=+ds,h=+hs,min=+mis,sec=+ss;
 if(y<1900||y>2200||m<1||m>12||d<1||d>31||h>23||min>59||sec>59)return null;
 const allDay=(!match[4]||params.VALUE==='DATE');
 let zone=allDay?'':z?'UTC':params.TZID||'';
 const ts=allDay?new Date(y,m-1,d).getTime():z?Date.UTC(y,m-1,d,h,min,sec):zonedTime(y,m,d,h,min,sec,zone||null);
 return{ts,allDay,zone:zone||'',parts:{y,m,d,h,min,sec}};
}
function recurRule(value){
 const result={};for(const item of String(value||'').split(';')){
  const [k,v]=item.split('=');if(k&&v)result[k.toUpperCase()]=v.toUpperCase();
 }return result;
}
function rawEvent(properties,idx){
 const list=name=>properties.filter(p=>p.name===name);
 const field=name=>list(name)[0];
 const start=field('DTSTART');if(!start)return null;
 const begin=parseICSDate(start.value,start.params);if(!begin)return null;
 const endF=field('DTEND'),end=endF?parseICSDate(endF.value,endF.params):null;
 const dur=Math.max(1,(end?.ts??begin.ts+(begin.allDay?DAY:3600000))-begin.ts);
 const exdates=list('EXDATE').flatMap(x=>x.value.split(',').map(v=>parseICSDate(v,x.params)?.ts)).filter(Number.isFinite);
 const rdates=list('RDATE').flatMap(x=>x.value.split(',').map(v=>parseICSDate(v,x.params)?.ts)).filter(Number.isFinite);
 return{uid:unescapeICS(field('UID')?.value||'ics-'+idx).slice(0,250),
  title:unescapeICS(field('SUMMARY')?.value||'Ohne Titel').slice(0,300),
  location:unescapeICS(field('LOCATION')?.value||'').slice(0,350),
  description:unescapeICS(field('DESCRIPTION')?.value||'').slice(0,1200),
  start:begin.ts,duration:Math.min(dur,30*DAY),allDay:begin.allDay,zone:begin.zone,
  parts:begin.parts,rule:recurRule(field('RRULE')?.value),exceptions:exdates,extraDates:rdates,
  recurrenceId:parseICSDate(field('RECURRENCE-ID')?.value,field('RECURRENCE-ID')?.params)?.ts||null,
  status:String(field('STATUS')?.value||'').toUpperCase()};
}
function parseICS(input){
 const text=unfold(input);
 if(!/BEGIN:VCALENDAR\b/i.test(text))throw new Error('Keine gültige iCalendar-Datei (.ics).');
 const lines=text.split('\n');let inside=false,props=[],events=[],idx=0;
 for(const line of lines){
  if(line==='BEGIN:VEVENT'){inside=true;props=[];continue}
  if(line==='END:VEVENT'){inside=false;const e=rawEvent(props,++idx);if(e)events.push(e);if(events.length>MAX_EVENTS)throw new Error('Kalender zu groß (maximal 8.000 Termine).');continue}
  if(inside){const f=fields(line);if(f)props.push(f)}
 }
 return events;
}
function dayDelta(a,b){return Math.round((Date.UTC(a.y,a.m-1,a.d)-Date.UTC(b.y,b.m-1,b.d))/DAY)}
function weekIndex(part){
 const date=new Date(Date.UTC(part.y,part.m-1,part.d));
 const dow=(date.getUTCDay()+6)%7;return Math.floor((Date.UTC(part.y,part.m-1,part.d)-dow*DAY)/WEEK);
}
const weekdays=['MO','TU','WE','TH','FR','SA','SU'];
function matchesRecurrence(event,parts){
 const base=event.parts,rule=event.rule||{},freq=rule.FREQ;
 if(!freq)return dayDelta(parts,base)===0;
 const since=dayDelta(parts,base);if(since<0)return false;
 const interval=Math.max(1,Math.min(999,Number(rule.INTERVAL)||1));
 const dow=(new Date(Date.UTC(parts.y,parts.m-1,parts.d)).getUTCDay()+6)%7;
 const baseDow=(new Date(Date.UTC(base.y,base.m-1,base.d)).getUTCDay()+6)%7;
 const byDay=rule.BYDAY?.split(',').map(x=>x.replace(/^[-+]?\d+/,'')).filter(Boolean);
 if(byDay?.length&&!byDay.includes(weekdays[dow]))return false;
 if(rule.BYMONTH&&!rule.BYMONTH.split(',').map(Number).includes(parts.m))return false;
 if(rule.BYMONTHDAY&&!rule.BYMONTHDAY.split(',').map(Number).includes(parts.d))return false;
 if(freq==='DAILY'){if(since%interval)return false;return !rule.COUNT||Math.floor(since/interval)<Number(rule.COUNT)}
 if(freq==='WEEKLY'){
  if((weekIndex(parts)-weekIndex(base))%interval)return false;
  if(!byDay?.length&&dow!==baseDow)return false;
  if(rule.COUNT){
   const allowed=(byDay?.length?byDay:[weekdays[baseDow]]).length;
   const approx=(weekIndex(parts)-weekIndex(base))/interval*allowed+1;
   if(approx>Number(rule.COUNT)+allowed)return false;
  }
  return true;
 }
 const months=(parts.y-base.y)*12+(parts.m-base.m);
 if(freq==='MONTHLY'){
  if(months<0||months%interval)return false;
  if(!byDay?.length&&!rule.BYMONTHDAY&&parts.d!==base.d)return false;
  if(rule.COUNT&&!byDay?.length&&Math.floor(months/interval)>=Number(rule.COUNT))return false;
  return true;
 }
 if(freq==='YEARLY'){
  const years=parts.y-base.y;
  if(years<0||years%interval)return false;
  if(!rule.BYMONTH&&parts.m!==base.m)return false;
  if(!rule.BYMONTHDAY&&!byDay?.length&&parts.d!==base.d)return false;
  if(rule.COUNT&&Math.floor(years/interval)>=Number(rule.COUNT))return false;
  return true;
 }
 return false;
}
function candidateTimestamp(parts,base){
 return zonedTime(parts.y,parts.m,parts.d,base.h,base.min,base.sec,base.zone||null);
}
function expandICS(events,from,to,sourceId){
 const output=[],overrides=new Map();
 for(const e of events){
  if(e.recurrenceId!==null)overrides.set(e.uid+'|'+e.recurrenceId,e);
 }
 for(const e of events){
  if(e.recurrenceId!==null||e.status==='CANCELLED')continue;
  const push=(start)=>{
   if(!Number.isFinite(start)||e.exceptions.some(x=>Math.abs(x-start)<60000))return;
   const override=overrides.get(e.uid+'|'+start);
   if(override?.status==='CANCELLED')return;
   const item=override||e;
   const actualStart=override?.start??start;
   const end=actualStart+item.duration;
   if(end<=from||actualStart>=to)return;
   output.push({id:sourceId+'|'+e.uid+'|'+actualStart,sourceId,title:item.title,location:item.location,
    description:item.description,start:actualStart,end,allDay:item.allDay});
  };
  const hasRule=!!e.rule?.FREQ;
  if(!hasRule){push(e.start);for(const extra of e.extraDates)push(extra);continue}
  // A short visible window is expanded by calendar day, not by iterating years of history.
  // Include previous days so multi-day recurring entries overlap correctly.
  const earliest=new Date(from-Math.min(e.duration,30*DAY)),latest=new Date(to);
  const startKey=dayKey(earliest),endKey=dayKey(latest);
  let current=dateFromKey(startKey);
  for(let n=0;n<60&&dayKey(current)<=endKey;n++){
   const parts={y:current.getFullYear(),m:current.getMonth()+1,d:current.getDate()};
   if(matchesRecurrence(e,parts)){
    const candidate=zonedTime(parts.y,parts.m,parts.d,e.parts.h,e.parts.min,e.parts.sec,e.zone||null);
    if(candidate>=e.start-60000&&(!e.rule.UNTIL||candidate<=(parseICSDate(e.rule.UNTIL)?.ts??Infinity)))push(candidate);
   }
   current.setDate(current.getDate()+1);
  }
  for(const extra of e.extraDates)push(extra);
 }
 return output;
}
function normalizeGoogleEvent(item,sourceId){
 if(!item||item.status==='cancelled'||!item.start)return null;
 const allDay=!!item.start.date;
 const d=allDay?dateFromKey(item.start.date):new Date(item.start.dateTime);
 const end=allDay?dateFromKey(item.end?.date||item.start.date):new Date(item.end?.dateTime||item.start.dateTime);
 if(!Number.isFinite(d.getTime()))return null;
 const until=Number.isFinite(end.getTime())?end.getTime():d.getTime()+3600000;
 return{id:sourceId+'|'+String(item.id||d.getTime()),sourceId,
  title:String(item.summary||'Ohne Titel').slice(0,300),
  location:String(item.location||'').slice(0,350),
  description:String(item.description||'').slice(0,1200),
  start:d.getTime(),end:Math.max(d.getTime()+1,until),allDay};
}
function visible(id){return !state.hidden.includes(id)}
function toggleSource(id,checked){
 if(typeof id!=='string')return;
 if(checked)state.hidden=state.hidden.filter(x=>x!==id);
 else if(!state.hidden.includes(id))state.hidden.push(id);
 saveSettings();paint();
}
function sourceList(){
 return [...state.imports.map(i=>({id:i.id,name:i.name,type:'ics',count:i.events.length})),
 ...state.googleCalendars.map(i=>({id:'g:'+i.id,name:i.summary||i.id,type:'google',color:i.backgroundColor||'',count:null}))];
}
function eventsWindow(from,to,all=false){
 let out=[];
 for(const i of state.imports){
  if(!all&&!visible(i.id))continue;
  out.push(...expandICS(i.events,from,to,i.id));
 }
 for(const e of state.googleEvents)if((all||visible(e.sourceId))&&e.start<to&&e.end>from)out.push(e);
 out.sort((a,b)=>a.start-b.start||Number(b.allDay)-Number(a.allDay)||a.title.localeCompare(b.title,'de'));
 const uniq=new Set();
 return out.filter(e=>{if(uniq.has(e.id))return false;uniq.add(e.id);return true}).slice(0,1800);
}
function eventTile(event){
 const begin=new Date(event.start),finish=new Date(event.end);
 const allDay=event.allDay;
 let when=allDay?'Ganztägig':fmtDate(begin,{hour:'2-digit',minute:'2-digit'})+' – '+fmtDate(finish,{hour:'2-digit',minute:'2-digit'});
 const meta=sourceList().find(x=>x.id===event.sourceId);const source=meta?.name||'Kalender';
 const color=/^#[0-9a-f]{6}$/i.test(meta?.color||'')?meta.color:'#4ad5eb';
 return '<article class="mevi-cal-event" style="--cal-accent:'+color+'" aria-label="'+esc(event.title)+'">'+
 '<span class="mevi-cal-event-time">'+esc(when)+'</span>'+
 '<div class="mevi-cal-event-copy"><strong>'+esc(event.title)+'</strong>'+
 (event.location?'<span>⌖ '+esc(event.location)+'</span>':'')+
 '<small>'+esc(source)+'</small></div></article>';
}
function eventGroup(date,items){
 return '<section class="mevi-cal-day"><h3>'+esc(fmtDate(date,{weekday:'long',day:'numeric',month:'long'}))+
 '</h3>'+(items.map(eventTile).join('')||'<p class="mevi-cal-no-events">Keine Termine</p>')+'</section>';
}
function agendaHTML(){
 const today=dayStart(new Date()),end=dayStart(new Date(today+7*DAY));
 const list=eventsWindow(today,end);
 const columns=[];
 for(let d=0;d<7;d++){
  const current=new Date(today);current.setDate(current.getDate()+d);
  const after=new Date(current);after.setDate(after.getDate()+1);
  const start=current.getTime(),stop=after.getTime();
  const day=list.filter(e=>e.start<stop&&e.end>start);
  columns.push(eventGroup(current,day));
 }
 const date=fmtDate(new Date(),{weekday:'long',day:'numeric',month:'long',year:'numeric'});
 return '<div class="mevi-cal-agenda"><div class="mevi-cal-highlight">'+
 '<div><small>DEIN KALENDER</small><h2>'+esc(date)+'</h2><span>Termine der kommenden 7 Tage</span></div>'+
 '<div class="mevi-cal-count"><strong>'+list.length+'</strong><span>Termine</span></div></div>'+
 (!sourceList().length?'<div class="mevi-cal-welcome"><strong>Kalender verbinden</strong>'+
 '<p>Wähle einen Google Kalender oder importiere einen ICS-Kalender aus Outlook, iCloud oder anderen Kalenderprogrammen.</p>'+
 '<button type="button" onclick="MeviCalendar.tab(\'sources\')">Kalender hinzufügen</button></div>':
 columns.join('')||'<p class="mevi-cal-no-events">In den nächsten sieben Tagen sind keine Termine vorhanden.</p>')+
 '</div>';
}
function monthHTML(){
 const first=new Date(state.year,state.month,1),startDow=(first.getDay()+6)%7;
 const start=new Date(state.year,state.month,1-startDow),end=new Date(start);
 end.setDate(start.getDate()+42);
 const entries=eventsWindow(start.getTime(),end.getTime());
 const byDay=new Map();
 for(let d=0;d<42;d++){const dt=new Date(start);dt.setDate(start.getDate()+d);const begin=dt.getTime(),after=new Date(dt);after.setDate(dt.getDate()+1);
  byDay.set(dayKey(dt),entries.filter(e=>e.start<after.getTime()&&e.end>begin));}
 const selected=state.selectedDay||dayKey(new Date()),current=new Date();
 const cells=[];
 for(let i=0;i<42;i++){
  const dt=new Date(start);dt.setDate(start.getDate()+i);
  const key=dayKey(dt),events=byDay.get(key)||[];
  cells.push('<button type="button" class="mevi-cal-month-day'+
   (dt.getMonth()!==state.month?' outside':'')+(key===selected?' selected':'')+
   (key===dayKey(current)?' today':'')+
   '" aria-pressed="'+(key===selected)+'" onclick="MeviCalendar.day(\''+key+'\')">'+
   '<span>'+dt.getDate()+'</span>'+(events.length?'<i>'+events.length+'</i>':'')+'</button>');
 }
 const date=dateFromKey(selected);const sel=byDay.get(selected)||[];
 return '<div class="mevi-cal-month-view"><div class="mevi-cal-month-controls">'+
 '<button type="button" onclick="MeviCalendar.month(-1)" aria-label="Vorheriger Monat">‹</button>'+
 '<strong>'+esc(fmtDate(first,{month:'long',year:'numeric'}))+'</strong>'+
 '<button type="button" onclick="MeviCalendar.month(1)" aria-label="Nächster Monat">›</button>'+
 '<button type="button" onclick="MeviCalendar.today()">Heute</button></div>'+
 '<div class="mevi-cal-weekdays">'+['Mo','Di','Mi','Do','Fr','Sa','So'].map(x=>'<span>'+x+'</span>').join('')+'</div>'+
 '<div class="mevi-cal-month-grid">'+cells.join('')+'</div>'+
 '<div class="mevi-cal-selected-day">'+eventGroup(date,sel)+'</div></div>';
}
function sourcesHTML(){
 const src=sourceList();
 const cards=src.length?src.map(source=>
  '<div class="mevi-cal-source"><label><input type="checkbox" data-cid="'+esc(source.id)+'" onchange="MeviCalendar.toggleSource(this.dataset.cid,this.checked)"'+
   (visible(source.id)?' checked':'')+' /><span class="mevi-cal-source-name">'+esc(source.name)+'</span></label>'+
   '<span class="mevi-cal-source-type">'+(source.type==='ics'?'ICS-Import':'Google Kalender')+'</span>'+
   (source.type==='ics'?'<button type="button" onclick="MeviCalendar.removeImport(this.dataset.cid)" data-cid="'+esc(source.id)+'">Entfernen</button>':'')+'</div>').join(''):
  '<p class="mevi-cal-no-events">Noch keine Kalender verbunden.</p>';
 return '<div class="mevi-cal-sources"><section class="mevi-cal-panel">'+
 '<h2>Meine Kalender</h2><p>Wähle die Kalender, die in der Monats- und Terminansicht erscheinen.</p>'+
 '<div class="mevi-cal-source-list">'+cards+'</div></section>'+
 '<section class="mevi-cal-panel"><h2>ICS-Kalender importieren</h2>'+
 '<p>Einmaliger Import von Terminen aus Outlook, iCloud oder einem anderen Kalender. Die Daten bleiben ausschließlich im Browser dieses Geräts.</p>'+
 '<input id="mevi-cal-file" class="mevi-cal-hidden" type="file" accept=".ics,text/calendar" onchange="MeviCalendar.importFile(this.files?.[0])" />'+
 '<div class="mevi-cal-actions"><button type="button" onclick="MeviCalendar.chooseFile()">ICS-Datei auswählen</button>'+
 '<button type="button" onclick="MeviCalendar.clearImports()">Alle ICS-Importe entfernen</button></div>'+
 '<small>Kalenderänderungen nach dem Import werden erst durch erneuten Import übernommen.</small></section>'+
 '<section class="mevi-cal-panel"><h2>Google Kalender verbinden</h2>'+
 '<p>Lesender Zugriff auf deine Kalender mit Google OAuth. Dafür wird eine <b>OAuth 2.0 Web-Client-ID</b> benötigt; der Google-Maps-API-Key reicht nicht.</p>'+
 '<p>Die OAuth-Web-Client-ID wird jetzt zentral unter Settings → Zugänge &amp; Schlüssel eingetragen.</p>'+
 '<button type="button" onclick="meviOpenCredentialSettings()">OAuth-Client-ID in Settings öffnen</button>'+
 '<div class="mevi-cal-actions"><button type="button" onclick="MeviCalendar.connectGoogle()">'+
 (state.googleToken?'Erneut anmelden':'Mit Google verbinden')+'</button>'+
 '<button type="button" onclick="MeviCalendar.refresh()">Termine aktualisieren</button>'+
 '<button type="button" onclick="MeviCalendar.disconnectGoogle()">Google trennen</button></div>'+
 '<small>OAuth-Herkunft in Google Cloud: https://eskiya771.github.io · Kalender-API aktivieren · Scope calendar.readonly.</small>'+
 '<small>Google-Zugriffstoken und Google-Termine werden nicht dauerhaft gespeichert. Nach einem Neustart ist eine Anmeldung nötig.</small></section></div>';
}
function compactHTML(){
 const now=Date.now(),until=dayStart(new Date(now+8*DAY));
 const upcoming=eventsWindow(now,until).slice(0,7);
 return '<div class="mevi-cal-compact-list"><div class="mevi-cal-compact-title">Nächste Termine</div>'+
 (upcoming.length?upcoming.map(e=>'<div class="mevi-cal-compact-item"><span>'+esc(fmtDate(new Date(e.start),{weekday:'short',day:'2-digit',month:'2-digit'}))+' · '+esc(formatTime(e.start,e.allDay))+'</span><strong>'+esc(e.title)+'</strong></div>').join(''):
 '<p class="mevi-cal-no-events">Keine anstehenden Termine</p>')+'</div>';
}
function contentHTML(){
 return state.tab==='month'?monthHTML():state.tab==='sources'?sourcesHTML():agendaHTML();
}
function statusHTML(){
 if(state.error)return '<span class="mevi-cal-error">'+esc(state.error)+'</span>';
 if(state.loading)return 'Kalender werden aktualisiert …';
 return state.message|| (state.googleToken?'Google Kalender verbunden':state.imports.length+' lokale Kalender');
}
function html(compact=false){
 return '<section class="mevi-cal-shell'+(compact?' compact':'')+'" aria-label="Kalender">'+
 '<header class="mevi-cal-header"><div><small>MEVICAR NEXT · KALENDER</small><strong>Kalender & Termine</strong></div>'+
 '<div class="mevi-cal-header-actions"><button type="button" title="Kalender-Einstellungen" aria-label="Kalender-Einstellungen" onclick="MeviCalendar.tab(\'sources\')">⚙</button><button type="button" title="Aktualisieren" aria-label="Aktualisieren" onclick="MeviCalendar.refresh()">↻</button></div></header>'+
 '<nav class="mevi-cal-tabs" aria-label="Kalenderansichten">'+
 [['agenda','7 Tage'],['month','Monat']].map(([tab,label])=>
 '<button type="button" class="'+(state.tab===tab?'active':'')+'" aria-pressed="'+(state.tab===tab)+
 '" onclick="MeviCalendar.tab(\''+tab+'\')">'+label+'</button>').join('')+'</nav>'+
 '<div class="mevi-cal-status" id="mevi-cal-status" role="status">'+statusHTML()+'</div>'+
 '<main class="mevi-cal-main" id="mevi-cal-content">'+(compact&&state.tab!=='sources'?compactHTML():contentHTML())+'</main></section>';
}
function paint(){
 const root=document.querySelector('.mevi-cal-shell');if(!root)return;
 const content=$$('mevi-cal-content');if(content)content.innerHTML=root.classList.contains('compact')&&state.tab!=='sources'?compactHTML():contentHTML();
 const status=$$('mevi-cal-status');if(status)status.innerHTML=statusHTML();
 for(const button of root.querySelectorAll('.mevi-cal-tabs button')){
  const key=button.textContent==='7 Tage'?'agenda':button.textContent==='Monat'?'month':'sources';
  const active=key===state.tab;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
 }
}
function tab(value){if(!['agenda','month','sources'].includes(value))return;state.tab=value;paint();if(value==='sources')prepareGSI().catch(()=>{})}
function month(offset){const d=new Date(state.year,state.month+offset,1);state.month=d.getMonth();state.year=d.getFullYear();state.selectedDay=dayKey(d);paint()}
function today(){const d=new Date();state.month=d.getMonth();state.year=d.getFullYear();state.selectedDay=dayKey(d);paint()}
function day(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return;state.selectedDay=value;paint()}
function chooseFile(){$$('mevi-cal-file')?.click()}
async function importFile(file){
 if(!file)return;
 state.error='';state.message='';
 try{
  if(file.size>MAX_ICS_BYTES)throw new Error('Datei größer als 2 MB. Bitte einen kleineren Kalender exportieren.');
  const input=await file.text(),entries=parseICS(input);
  if(!entries.length)throw new Error('Keine Termine in der ICS-Datei gefunden.');
  const name=String(file.name||'Kalender').replace(/\.ics$/i,'').slice(0,80);
  // Replace same-named import so a refreshed export updates appointments.
  const existing=state.imports.find(x=>x.name===name);
  const id=existing?.id||'ics-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
  state.imports=state.imports.filter(x=>x.id!==id);
  state.imports.push({id,name,events:entries,importedAt:Date.now()});
  saveImports();
  state.message=name+': '+entries.length+' Termine importiert.';
  state.tab='agenda';
 }catch(e){state.error=e?.message||'Import fehlgeschlagen.'}
 paint();
}
function removeImport(id){state.imports=state.imports.filter(x=>x.id!==id);saveImports();paint()}
function clearImports(){state.imports=[];saveImports();state.message='Lokale ICS-Importe entfernt.';paint()}
function setClientId(id){
 const value=String(id||'').trim();
 if(value&&!/^[-.a-zA-Z0-9_]+\.apps\.googleusercontent\.com$/.test(value)){
  state.error='Ungültige Google OAuth-Web-Client-ID.';paint();return false;
 }
 if(value!==state.clientId)disconnectGoogle(false);
 state.clientId=value;saveSettings();state.error='';state.message='Client-ID gespeichert.';paint();return true;
}
async function prepareGSI(){
 if(window.google?.accounts?.oauth2?.initTokenClient)return true;
 if(state.googlePending)return false;
 state.googlePending=true;
 return new Promise((resolve,reject)=>{
  const existing=document.querySelector('script[data-mevi-calendar-gsi]');
  if(existing){state.googlePending=false;resolve(false);return}
  const el=document.createElement('script');
  el.src='https://accounts.google.com/gsi/client';el.async=true;el.defer=true;
  el.dataset.meviCalendarGsi='1';
  el.onload=()=>{state.googlePending=false;resolve(!!window.google?.accounts?.oauth2?.initTokenClient)};
  el.onerror=()=>{state.googlePending=false;reject(new Error('Google-Anmeldeskript nicht erreichbar.'))};
  document.head.appendChild(el);
 });
}
function connectGoogle(){
 const value=String(state.clientId||'').trim();
 if(!state.clientId||value!==state.clientId){
  if(!setClientId(value))return false;
 }
 if(!state.clientId){state.error='Bitte zuerst eine OAuth-Web-Client-ID eintragen.';paint();return false}
 if(!window.google?.accounts?.oauth2?.initTokenClient){
  state.message='Google-Anmeldung wird geladen. Bitte danach erneut auf „Mit Google verbinden“ tippen.';
  paint();prepareGSI().catch(e=>{state.error=e.message;paint()});return false;
 }
 try{
  state.googleClient=window.google.accounts.oauth2.initTokenClient({
   client_id:state.clientId,scope:GOOGLE_SCOPE,
   callback:async response=>{
    if(response?.error||!response?.access_token){state.error='Google-Anmeldung abgelehnt oder fehlgeschlagen.';paint();return}
    state.googleToken=response.access_token;state.googleExpiry=Date.now()+Number(response.expires_in||3500)*1000;
    state.error='';await refreshGoogle();
   }
  });
  state.googleClient.requestAccessToken({prompt:state.googleToken?'':'consent'});
  return true;
 }catch(e){state.error='Google-Anmeldung nicht möglich: '+(e.message||e);paint();return false}
}
async function googleGET(endpoint){
 if(!state.googleToken||Date.now()>state.googleExpiry-30000)throw new Error('Google-Zugriff abgelaufen. Bitte erneut anmelden.');
 const url=new URL(endpoint,'https://www.googleapis.com');
 if(url.origin!=='https://www.googleapis.com'||!url.pathname.startsWith('/calendar/v3/'))throw new Error('Ungültiges Kalender-Ziel.');
 const res=await fetch(url.href,{headers:{Authorization:'Bearer '+state.googleToken,Accept:'application/json'},
  credentials:'omit',redirect:'error',cache:'no-store'});
 if(res.status===401)throw new Error('Google-Sitzung abgelaufen. Bitte erneut anmelden.');
 if(!res.ok)throw new Error('Google Kalender HTTP '+res.status);
 return res.json();
}
async function googlePages(path,max=6){
 const items=[];let token='';
 for(let page=0;page<max;page++){
  const u=new URL(path,'https://www.googleapis.com');
  if(token)u.searchParams.set('pageToken',token);
  const data=await googleGET(u.href);
  if(Array.isArray(data.items))items.push(...data.items);
  token=data.nextPageToken||'';if(!token)break;
 }
 return items;
}
async function refreshGoogle(){
 if(!state.googleToken){state.message='Bitte mit Google verbinden.';paint();return}
 const serial=++state.requestId;state.loading=true;state.error='';paint();
 try{
  const calendars=await googlePages('/calendar/v3/users/me/calendarList?maxResults=200',3);
  if(serial!==state.requestId)return;
  state.googleCalendars=calendars.filter(x=>x&&typeof x.id==='string'&&!x.deleted);
  const start=dayStart(new Date())-DAY;
  const endDate=new Date();endDate.setDate(endDate.getDate()+45);
  const stop=dayStart(endDate)+DAY;
  const all=[];
  for(const cal of state.googleCalendars.slice(0,35)){
   const path='/calendar/v3/calendars/'+encodeURIComponent(cal.id)+'/events?'+
    new URLSearchParams({singleEvents:'true',orderBy:'startTime',timeMin:new Date(start).toISOString(),
     timeMax:new Date(stop).toISOString(),maxResults:'250'}).toString();
   const events=await googlePages(path,4);
   if(serial!==state.requestId)return;
   for(const event of events){const normalized=normalizeGoogleEvent(event,'g:'+cal.id);if(normalized)all.push(normalized)}
  }
  if(serial!==state.requestId)return;
  state.googleEvents=all;state.lastRefresh=Date.now();state.message='Google Kalender: '+all.length+' Termine aktualisiert.';
 }catch(e){if(serial===state.requestId)state.error=e.message||'Google Kalender nicht verfügbar.'}
 finally{if(serial===state.requestId){state.loading=false;paint()}}
}
function disconnectGoogle(redraw=true){
 state.requestId++;state.googleToken='';state.googleExpiry=0;state.googleClient=null;
 state.googleEvents=[];state.googleCalendars=[];state.loading=false;
 state.lastRefresh=0;
  if(redraw){state.message='Google-Zugriff für diese Sitzung getrennt.';paint()}
}
function refresh(){
 state.error='';if(state.googleToken)return refreshGoogle();
 state.message='Lokale ICS-Kalender sind auf dem aktuellen Stand. Google benötigt eine Anmeldung.';
 paint();
}
function mount(){
 state.mounted=!!document.querySelector('.mevi-cal-shell');
 if(!state.mounted)return;
 if(state.timer!==null)clearInterval(state.timer);
 state.timer=setInterval(()=>{
  if(state.mounted&&state.googleToken&&Date.now()<state.googleExpiry-45000&&state.tab!=='sources'&&Date.now()-state.lastRefresh>=5*60000)refreshGoogle();
  else if(state.mounted)paint();
 },5*60000);
 if(state.tab==='sources')prepareGSI().catch(()=>{});
 if(state.googleToken&&!state.loading&&Date.now()-state.lastRefresh>60000)refreshGoogle();
}
function unmount(){
 state.mounted=false;if(state.timer!==null){clearInterval(state.timer);state.timer=null}
}
window.MeviCalendar={html,mount,unmount,tab,month,day,today,toggleSource,chooseFile,importFile,removeImport,clearImports,
 setClientId,connectGoogle,disconnectGoogle,refresh,parseICS,parseICSDate,expandICS,normalizeGoogleEvent,eventsWindow,
 debug:()=>({imports:state.imports.length,google:!!state.googleToken,calendars:sourceList().length,
   googleEvents:state.googleEvents.length,storedGoogleEvents:false,tab:state.tab})};
})();