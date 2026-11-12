/* MeviCar Next Calendar – actual ICS, DST and Google readonly API regression.
   Zero personal data, no live credentials or network needed. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../calendar.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../calendar.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
new Function(source);
function fixture(extra={}){
 const writes=[],elements=new Map(),requests=[],pending={promise:null};
 const storage={getItem:()=>null,setItem:(k,v)=>writes.push({key:k,value:v})};
 const document={getElementById:id=>elements.get(id)||null,
  querySelector:()=>null,head:{appendChild(el){if(el.onload)el.onload()}},
  createElement:()=>({dataset:{}})};
 const oauth={
  initTokenClient(config){
   pending.config=config;
   return{requestAccessToken(){
    pending.promise=Promise.resolve(config.callback({access_token:'SIMULATED_PRIVATE_TOKEN',expires_in:3600}));
   }};
  }
 };
 const now=new Date();
 const tomorrow=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,10);
 const calendarResponse={items:[{id:'personal@example.test',summary:'Mein Kalender',backgroundColor:'#245678'}]};
 const eventsResponse={items:[{id:'event-1',summary:'Zahnarzt',start:{dateTime:tomorrow.toISOString()},
  end:{dateTime:new Date(tomorrow.getTime()+1800000).toISOString()},location:'Musterstraße'}]};
 const fetch=async(url,options)=>{
  requests.push({url:String(url),options});
  return{ok:true,status:200,json:async()=>String(url).includes('calendarList')?calendarResponse:eventsResponse};
 };
 const window={google:{accounts:{oauth2:oauth}},addEventListener(){}};
 const ctx={window,document,localStorage:storage,URL,URLSearchParams,Intl,Date,Math,Number,JSON,
  setInterval:()=>9,clearInterval(){},setTimeout:fn=>{fn();return 1},clearTimeout(){},
  fetch,console};
 Object.assign(ctx,extra);
 runInNewContext(source,ctx);
 return {api:window.MeviCalendar,document,elements,writes,requests,pending};
}
function t(text){return 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'+text+'\r\nEND:VCALENDAR\r\n'}
const day=(s)=>new Date(s).getTime();
{
 const {api}=fixture();
 const input=t('BEGIN:VEVENT\r\nUID:weekly\r\nDTSTART;TZID=Europe/Berlin:20261109T090000\r\n'+
  'DTEND;TZID=Europe/Berlin:20261109T100000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR\r\n'+
  'SUMMARY:Sport und\r\n  Schule\r\nLOCATION:Halle\\, Erlangen\r\nEND:VEVENT');
 const parsed=api.parseICS(input);
 assert.equal(parsed.length,1);
 assert.equal(parsed[0].title,'Sport und Schule','Folded ICS lines preserve literal whitespace');
 assert.equal(parsed[0].location,'Halle, Erlangen');
 const expanded=api.expandICS(parsed,day('2026-11-09T00:00:00Z'),day('2026-11-16T00:00:00Z'),'ics-a');
 assert.equal(expanded.length,3,'Weekly recurring events on Monday, Wednesday, Friday');
 assert.deepEqual(expanded.map(e=>new Date(e.start).toISOString().slice(0,10)),['2026-11-09','2026-11-11','2026-11-13']);
}
{
 const {api}=fixture();
 const parsed=api.parseICS(t('BEGIN:VEVENT\r\nUID:dst\r\n'+
  'DTSTART;TZID=Europe/Berlin:20260328T100000\r\nDTEND;TZID=Europe/Berlin:20260328T110000\r\n'+
  'RRULE:FREQ=DAILY;COUNT=3\r\nSUMMARY:Frühstück\r\nEND:VEVENT'));
 const events=api.expandICS(parsed,day('2026-03-28T00:00:00Z'),day('2026-04-01T00:00:00Z'),'ics-b');
 assert.equal(events.length,3);
 assert.deepEqual(events.map(e=>new Date(e.start).toISOString()),[
  '2026-03-28T09:00:00.000Z','2026-03-29T08:00:00.000Z','2026-03-30T08:00:00.000Z'
 ],'A weekly or daily event must remain at 10:00 during Berlin DST switch');
}
{
 const {api}=fixture();
 const parsed=api.parseICS(t('BEGIN:VEVENT\r\nUID:holiday\r\n'+
  'DTSTART;VALUE=DATE:20261224\r\nDTEND;VALUE=DATE:20261226\r\n'+
  'SUMMARY:Weihnachten\r\nEND:VEVENT'));
 const events=api.expandICS(parsed,day('2026-12-22T00:00:00Z'),day('2026-12-27T00:00:00Z'),'ics-c');
 assert.equal(events.length,1);
 assert.equal(events[0].allDay,true);
 assert.equal(events[0].end-events[0].start,2*86400000,'ICS all-day DTEND is exclusive');
 const page=api.html(false);
 assert.match(page,/Kalender &amp; Termine|Kalender & Termine/);
 assert.match(page,/7 Tage/);
 assert.match(page,/Monat/);
 assert.match(page,/Kalender/);
 assert.doesNotMatch(page,/Teammeeting|Simulierte Termine/,'No fake sample appointments');
}
{
 const {api,writes}=fixture();
 const file={name:'Familie.ics',size:570,text:async()=>t('BEGIN:VEVENT\r\nUID:person\r\n'+
  'DTSTART:20261113T173000Z\r\nDTEND:20261113T183000Z\r\n'+
  'SUMMARY:Privater Termin\r\nEND:VEVENT')};
 await api.importFile(file);
 assert.equal(api.debug().imports,1);
 const row=writes.find(x=>x.key==='mevicar-next-calendar-ics-v1');
 assert.ok(row,'ICS data saved locally for offline use');
 assert.ok(row.value.includes('Privater Termin'));
 api.removeImport(JSON.parse(row.value)[0].id);
 assert.equal(api.debug().imports,0,'ICS imports can be deleted');
}
{
 const {api,elements,writes,requests,pending}=fixture();
 elements.set('mevi-cal-clientid',{value:'12345.apps.googleusercontent.com'});
 assert.equal(api.setClientId('12345.apps.googleusercontent.com'),true);
 assert.equal(api.connectGoogle(),true);
 await pending.promise;
 assert.equal(api.debug().google,true);
 assert.equal(api.debug().googleEvents,1);
 assert.equal(api.debug().storedGoogleEvents,false);
 assert.match(pending.config.scope,/calendar\.readonly/);
 assert.equal(requests.length,2);
 assert.ok(requests.every(x=>x.url.startsWith('https://www.googleapis.com/calendar/v3/')));
 assert.ok(requests.every(x=>x.options.headers.Authorization==='Bearer SIMULATED_PRIVATE_TOKEN'));
 assert.ok(requests.every(x=>x.options.credentials==='omit'));
 assert.ok(!writes.some(x=>x.value.includes('SIMULATED_PRIVATE_TOKEN')||x.value.includes('Zahnarzt')),
  'Google auth credentials and events must NEVER be saved to browser storage');
 api.disconnectGoogle();
 assert.equal(api.debug().google,false);
 assert.equal(api.debug().googleEvents,0);
}
assert.match(css,/\.mevi-cal-shell/);
assert.match(css,/\.mevi-cal-month-grid/);
assert.match(css,/\.mevi-cal-event/);
assert.match(css,/\.mevi-cal-shell\.compact/);
assert.match(html,/calendar\.js/);
assert.match(html,/calendar\.css/);
assert.match(html,/s\.app==='calendar'\)return window\.MeviCalendar/);
assert.match(html,/class="full calendar-host"/);
assert.match(pages,/mevicar-calendar-script/);
assert.match(pages,/calendar\.js calendar\.css/);
console.log('MeviCar Calendar: 7-day and month UI, DST-aware ICS recurrences, file import, source selection, Google read-only OAuth and token isolation passed.');
