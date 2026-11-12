/* MeviCar Stocks 2.0 browser QA: seven target full/split profiles, deterministic HA fixture.
   Realistic simulated HA sensor/history data is for tests only, never shown to users. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const output=resolve('visual-results/stocks');mkdirSync(output,{recursive:true});
const profiles=[
 ['iphone17',874,402,false],['s20fe',915,412,false],
 ['dex1200',1920,1200,false],['fullhd',1920,1080,false],
 ['panorama720',1920,720,false],['iphone17-split',874,402,true],['dex-split',1920,1200,true]
];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined});
const report=[],issues=[];
try{
 for(const [name,width,height,compact] of profiles){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const hostWidth=compact?(width<1000?340:730):width-86;
  await page.route('https://mevi-stocks-qa.invalid/**',route=>route.fulfill({
   contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
    '<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#071828;color:#e8f8ff;font-family:system-ui,sans-serif}'+
    '.frame{width:100%;height:100%;padding:6px;display:flex;gap:8px}.dock{width:70px;flex:none;background:#132b40;border-radius:10px}'+
    '.stocks-host{width:'+hostWidth+'px;max-width:calc(100% - 78px);height:100%;flex:none}</style>'+
    '</head><body><div class="frame"><aside class="dock"></aside><div class="'+(compact?'side':'full')+' stocks-host" id="host"></div></div></body></html>'
  }));
  await page.goto('https://mevi-stocks-qa.invalid/test');
  await page.addStyleTag({path:'stocks.css'});
  await page.evaluate(()=>{
   const now=Date.now();
   const items=[
    ['siemens','Siemens Aktiengesellschaft','SIE.DE','EUR',281.7,4.7,1.7],
    ['tesla','Tesla','TSLA','USD',297.5,-2.7,-0.9],
    ['nvidia','NVIDIA','NVDA','USD',186.2,0.7,0.4],
    ['apple','Apple','AAPL','USD',210.5,1.8,0.9]
   ];
   window.MeviHA={
    stockSnapshot:()=>({connected:true,updatedAt:now,sensors:items.map(([id,name,symbol,currency,price,change,pct])=>({
     entity_id:'sensor.'+id,name,symbol,currency,state:String(price),change,change_pct:pct,market_state:'CLOSED',updated:new Date(now).toISOString()
    }))}),
    refresh:async()=>{},
    stockHistory:async(ids,days)=>Object.fromEntries(ids.map((id,i)=>[id,Array.from({length:19},(_,index)=>({
     time:now-(18-index)*days*3600000,value:260+i*8+index*.9+Math.sin(index+i)*3
    }))]))
   };
  });
  await page.addScriptTag({path:'stocks.js'});
  await page.evaluate(isCompact=>{
   document.getElementById('host').innerHTML=window.MeviStocks.html(isCompact);
   window.MeviStocks.mount();
  },compact);
  await page.waitForFunction(()=>!!document.querySelector('.mevi-fin-chart.spark'),{timeout:8000});
  const measure=async()=>page.evaluate(()=>{
   const host=document.getElementById('host'),panel=host.querySelector('.mevi-fin'),r=host.getBoundingClientRect();
   const children=[...panel.querySelectorAll('.mevi-fin-header,.mevi-fin-toolbar,.mevi-fin-row,.mevi-fin-detail')].map(el=>{
    const b=el.getBoundingClientRect();return{left:b.left,right:b.right,top:b.top,bottom:b.bottom}
   });
   return{hostWidth:r.width,hostRight:r.right,hostBottom:r.bottom,scrollWidth:panel.scrollWidth,clientWidth:panel.clientWidth,
    childrenOverflow:children.some(b=>b.left<r.left-2||b.right>r.right+2),pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    stocks:panel.querySelectorAll('.mevi-fin-row').length,charts:panel.querySelectorAll('.mevi-fin-chart.spark').length};
  });
  let m=await measure();
  if(m.stocks!==4||m.charts!==4)issues.push(name+': automatic watchlist or sparkline missing');
  if(m.pageOverflow>3||m.scrollWidth>m.clientWidth+4||m.childrenOverflow)issues.push(name+': horizontal overflow');
  await page.screenshot({path:resolve(output,name+'-watchlist.png')});
  await page.evaluate(()=>window.MeviStocks.open('sensor.siemens'));
  await page.locator('.mevi-fin-detail .mevi-fin-chart.big').waitFor({timeout:8000});
  await page.screenshot({path:resolve(output,name+'-detail.png')});
  const detailCount=await page.locator('.mevi-fin-period button').count();
  if(detailCount!==3)issues.push(name+': 1T/7T/30T buttons missing');
  if(errors.length)issues.push(name+': '+errors.join(' / '));
  report.push({name,compact,...m,detailButtons:detailCount});
  await page.evaluate(()=>window.MeviStocks.unmount());
  await page.close();
 }
}finally{await browser.close()}
writeFileSync(resolve(output,'report.json'),JSON.stringify(report,null,2));
assert.deepEqual(issues,[],'Stocks UI should fit all full/split landscape viewports');
console.log('Stocks 2.0 browser QA passed: automatic HA watchlist, charts and detail in 5 landscapes + 2 splits.');
