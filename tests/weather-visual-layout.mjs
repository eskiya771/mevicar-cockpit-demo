/* Browser visual weather regression – deterministic Open-Meteo fixture, no live account. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url);
const rain=require('../weather/js/weather-rain.js');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const report=path.resolve('visual-results/weather');
mkdirSync(report,{recursive:true});
const now=Math.floor(Date.now()/1000);
let day=rain.key(now),dailyTime=[];
for(let i=0;i<7;i++){dailyTime.push(rain.midnight(day));day=rain.nextDate(day)}
const hourlyTime=Array.from({length:168},(_,i)=>dailyTime[0]+(i+1)*3600);
const fixture={
 current:{time:now,temperature_2m:17,apparent_temperature:15,is_day:1,weather_code:2,
  wind_speed_10m:12,wind_direction_10m:220,wind_gusts_10m:24},
 daily:{time:dailyTime,temperature_2m_max:[19,18,16,15,17,18,20],temperature_2m_min:[9,8,7,6,8,10,11],
  weather_code:[2,61,3,0,95,71,45],sunrise:dailyTime.map(t=>t+7*3600),
  sunset:dailyTime.map(t=>t+18*3600),precipitation_probability_max:[40,80,65,10,70,60,20]},
 hourly:{time:hourlyTime,temperature_2m:hourlyTime.map(()=>17),
  precipitation_probability:hourlyTime.map((_,i)=>i%6===0?80:0),
  precipitation:hourlyTime.map((_,i)=>i%6===0?1:0),
  weather_code:hourlyTime.map(()=>61),is_day:hourlyTime.map(()=>1)}
};
const profiles=[
 ['iphone17',874,340],['s20fe',915,350],['dex',1920,1110],
 ['fullhd',1920,990],['panorama',1920,650],
 ['split-phone',345,315],['split-dex',760,1070]
];
const errors=[],results=[];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined});
try{
 for(const [name,width,height] of profiles){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  const crashes=[];page.on('pageerror',e=>crashes.push(e.message));
  await page.route('https://mevicar.invalid/**',async route=>{
   const target=new URL(route.request().url());
   const rel=target.pathname.replace(/^\/+/,'');
   const file=path.resolve(root,rel);
   if(!file.startsWith(root+path.sep)||!existsSync(file))return route.fulfill({status:404,body:'Missing asset '+rel});
   const type=file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html';
   return route.fulfill({body:readFileSync(file),contentType:type});
  });
  await page.route('https://api.open-meteo.com/**',route=>route.fulfill({json:fixture}));
  await page.route('https://embed.windy.com/**',route=>route.fulfill({
   contentType:'text/html',body:'<html><body style="background:#0d1428;color:#dfedfc">Windy Karten-Test</body></html>'
  }));
  await page.setContent('<html><head><style>*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#08111b}iframe{border:0;display:block;width:100%;height:100%}</style></head><body><iframe title="Classic weather embedded in Next" src="https://mevicar.invalid/weather/weather.html"></iframe></body></html>');
  const frame=page.frameLocator('iframe[title="Classic weather embedded in Next"]');
  await frame.locator('#temperature').getByText('17°').waitFor({timeout:16000});
  for(const tab of ['overview','week','map']){
   await frame.locator('button[data-view="'+tab+'"]').click();
   if(tab==='map'){
    await frame.locator('#weather-map[src*="embed.windy.com"]').waitFor({timeout:6000});
   }
   await page.screenshot({path:path.join(report,name+'-'+tab+'.png')});
   const metrics=await frame.locator('body').evaluate(body=>{
    const top=body.querySelector('.topbar').getBoundingClientRect();
    const main=body.querySelector('main').getBoundingClientRect();
    const nav=body.querySelector('.topbar nav').getBoundingClientRect();
    const footer=body.querySelector('footer').getBoundingClientRect();
    return {view:body.querySelector('main').dataset.view,width:window.innerWidth,height:window.innerHeight,
      top:top.bottom,navRight:nav.right,mainTop:main.top,footerBottom:footer.bottom,
      activeTabs:[...body.querySelectorAll('button[data-view][aria-pressed="true"]')].length};
   });
   const issues=[];
   if(metrics.navRight>metrics.width+4)issues.push('Header buttons offscreen');
   if(metrics.activeTabs!==1)issues.push('No exactly one selected weather tab');
   if(metrics.mainTop+4<metrics.top)issues.push('Weather header overlaps content');
   if(metrics.footerBottom>metrics.height+4)issues.push('Weather attribution clipped');
   results.push({name,tab,metrics,issues});
   if(issues.length)errors.push(name+' '+tab+': '+issues.join(', '));
  }
  await frame.locator('button[data-layer="rain"]').click();
  assert.match(await frame.locator('#weather-map').getAttribute('src'),/overlay=rain/,'Windy layer switch');
  assert.deepEqual(crashes,[],name+' uncaught errors');
  await page.close();
 }
} finally {await browser.close()}
const fs=await import('node:fs');fs.writeFileSync(path.join(report,'report.json'),JSON.stringify(results,null,2));
assert.deepEqual(errors,[],'Weather responsive layout');
console.log('Classic weather browser QA: '+profiles.length+' viewport profiles × 3 tabs, Windy switching, live fixture passed');
