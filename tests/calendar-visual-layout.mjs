/* Calendar browser QA with a deterministic user-owned ICS fixture.
   Checks cockpit sizing in all five target landscapes and two split profiles.
   Uses no OAuth, no real accounts and no network. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const output=resolve('visual-results/calendar');mkdirSync(output,{recursive:true});
const profiles=[
 {id:'iphone17',width:874,height:402,split:false},
 {id:'samsung-s20fe',width:915,height:412,split:false},
 {id:'dex-1200',width:1920,height:1200,split:false},
 {id:'fullhd-1080',width:1920,height:1080,split:false},
 {id:'panorama-720',width:1920,height:720,split:false},
 {id:'iphone17-split',width:874,height:402,split:true},
 {id:'dex-split',width:1920,height:1200,split:true}
];
const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
const formatted=[tomorrow.getFullYear(),String(tomorrow.getMonth()+1).padStart(2,'0'),String(tomorrow.getDate()).padStart(2,'0')].join('');
const ics=[
 'BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT','UID:mevicar-calendar-qa',
 'DTSTART;VALUE=DATE:'+formatted,'DTEND;VALUE=DATE:'+formatted,
 'SUMMARY:Beispieltermin nur im automatischen Layouttest','LOCATION:Erlangen','END:VEVENT','END:VCALENDAR'
].join('\r\n');
const logs=[],errors=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined});
try{
 for(const p of profiles){
  const page=await browser.newPage({viewport:{width:p.width,height:p.height},deviceScaleFactor:1});
  const failures=[];page.on('pageerror',e=>failures.push(e.message));
  const width=p.split?p.width<1000?330:730:p.width-83;
  const html='<html><head><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">'+
   '<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#081423;color:#e4f7ff;font-family:system-ui,-apple-system,Segoe UI,sans-serif}'+
   '.stage{height:100%;width:100%;display:flex;align-items:stretch;gap:5px;padding:5px}'+
   '.dock{width:68px;flex:none;background:#112a3c;border-radius:12px}'+
   '.calendar-host{width:'+width+'px;max-width:calc(100% - 76px);height:100%;flex:none}</style>'+
   '</head><body><div class="stage"><aside class="dock"></aside><div id="calendar-root" class="'+
   (p.split?'side':'full')+' calendar-host"></div></div></body></html>';
  await page.route('https://calendar-mevicar.invalid/**',route=>route.fulfill({status:200,contentType:'text/html',body:html}));
  await page.goto('https://calendar-mevicar.invalid/test');
  await page.addStyleTag({path:'calendar.css'});
  await page.evaluate(()=>{window.google={accounts:{oauth2:{initTokenClient(){return{requestAccessToken(){}}}}}}});
  await page.addScriptTag({path:'calendar.js'});
  await page.evaluate(compact=>{
   const r=document.getElementById('calendar-root');
   r.innerHTML=window.MeviCalendar.html(compact);
   window.MeviCalendar.mount();
  },p.split);
  await page.evaluate(async value=>{
   await window.MeviCalendar.importFile({name:'QA.ics',size:value.length,text:async()=>value});
  },ics);
  for(const tab of ['agenda','month','sources']){
   await page.evaluate(key=>window.MeviCalendar.tab(key),tab);
   const selector=p.split&&tab!=='sources'?'.mevi-cal-compact-list':tab==='agenda'?'.mevi-cal-agenda':tab==='month'?'.mevi-cal-month-view':'.mevi-cal-sources';
   await page.locator(selector).waitFor({state:'attached',timeout:10000});
   const metrics=await page.evaluate(selector=>{
    const host=document.getElementById('calendar-root'),panel=host.querySelector('.mevi-cal-shell');
    const tabs=[...panel.querySelectorAll('.mevi-cal-tabs button')];
    const rect=host.getBoundingClientRect();
    const view=panel.querySelector(selector)?.getBoundingClientRect();
    const tabBounds=tabs.map(t=>{const b=t.getBoundingClientRect();return{left:b.left,right:b.right}});
    return{hostLeft:rect.left,hostRight:rect.right,hostTop:rect.top,hostBottom:rect.bottom,
     panelWidth:panel.clientWidth,panelScrollWidth:panel.scrollWidth,
     viewWidth:view?.width||0,viewHeight:view?.height||0,
     tabs:tabBounds,selected:tabs.filter(t=>t.getAttribute('aria-pressed')==='true').length,
     browserScrollX:document.documentElement.scrollWidth-document.documentElement.clientWidth};
   },selector);
   if(metrics.viewWidth<50||metrics.viewHeight<30)errors.push(p.id+' '+tab+': calendar view collapsed');
   if(metrics.selected!==(tab==='sources'?0:1))errors.push(p.id+' '+tab+': tab selection invalid');
   if(metrics.panelScrollWidth>metrics.panelWidth+4)errors.push(p.id+' '+tab+': panel horizontal overflow');
   if(metrics.browserScrollX>3)errors.push(p.id+' '+tab+': page horizontal scrolling');
   if(metrics.tabs.some(b=>b.left<metrics.hostLeft-1||b.right>metrics.hostRight+2))
    errors.push(p.id+' '+tab+': a calendar tab is outside host');
   await page.screenshot({path:resolve(output,p.id+'-'+tab+'.png')});
   logs.push({profile:p.id,tab,...metrics});
  }
  assert.deepEqual(failures,[],p.id+' uncaught browser JavaScript errors');
  await page.close();
 }
}finally{await browser.close()}
writeFileSync(resolve(output,'report.json'),JSON.stringify(logs,null,2));
assert.deepEqual(errors,[],'Calendar must fit its allocated full and split cockpit viewports');
console.log('Calendar browser QA passed: 5 landscape devices and 2 splits across agenda, month and source selection.');
