/* TradingView Stocks 2.0 – five target landscapes and two split-screen fixtures.
   The third-party widget is replaced with a deterministic local test chart. */
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
const fakeWidget=String.raw`(function(){
const script=document.currentScript,config=JSON.parse(script.textContent);
const target=script.parentElement.querySelector('.tradingview-widget-container__widget');
target.innerHTML='<div class="qa-tradingview" style="height:100%;width:100%;background:#0c1b2a;display:flex;flex-direction:column">'+
'<div style="font:14px system-ui;padding:8px;color:#d4ecf9">'+config.symbol+' · '+config.range+' (Testchart)</div>'+
'<svg style="width:100%;flex:1;min-height:0" viewBox="0 0 600 180" preserveAspectRatio="none"><path d="M0 132 L50 112 L100 124 L150 78 L200 105 L250 92 L300 115 L350 64 L400 88 L450 51 L500 62 L550 25 L600 35" stroke="#55dfae" stroke-width="3" fill="none"/></svg></div>';
})();`;
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
  await page.route('https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js',route=>
   route.fulfill({status:200,contentType:'application/javascript',body:fakeWidget}));
  await page.goto('https://mevi-stocks-qa.invalid/test');
  await page.addStyleTag({path:'stocks.css'});
  await page.addScriptTag({path:'stocks.js'});
  await page.evaluate(isCompact=>{
   document.getElementById('host').innerHTML=window.MeviStocks.html(isCompact);
   window.MeviStocks.mount();
  },compact);
  await page.locator('.qa-tradingview').waitFor({timeout:8000});
  const measure=async()=>page.evaluate(()=>{
   const host=document.getElementById('host'),panel=host.querySelector('.mevi-tv'),r=host.getBoundingClientRect();
   const layout=panel.querySelector('.mevi-tv-layout').getBoundingClientRect();
   const chart=panel.querySelector('.mevi-tv-chart').getBoundingClientRect();
   return {hostWidth:r.width,hostRight:r.right,hostBottom:r.bottom,layoutWidth:layout.width,chartWidth:chart.width,chartHeight:chart.height,
    panelScrollWidth:panel.scrollWidth,panelClientWidth:panel.clientWidth,pageOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    items:panel.querySelectorAll('.mevi-tv-item').length};
  });
  const metrics=await measure();
  if(metrics.items!==5)issues.push(name+': default watchlist count should be 5');
  if(metrics.chartWidth<100||metrics.chartHeight<100)issues.push(name+': chart is too small');
  if(metrics.panelScrollWidth>metrics.panelClientWidth+4||metrics.pageOverflow>3||metrics.hostRight>width+3)issues.push(name+': horizontal overflow');
  await page.screenshot({path:resolve(output,name+'-watchlist.png')});
  await page.evaluate(()=>window.MeviStocks.select('NASDAQ:NVDA'));
  await page.waitForFunction(()=>document.querySelector('.qa-tradingview')?.textContent.includes('NASDAQ:NVDA'),{timeout:8000});
  await page.evaluate(()=>window.MeviStocks.period('60M'));
  await page.waitForFunction(()=>document.querySelector('.qa-tradingview')?.textContent.includes('60M'),{timeout:8000});
  await page.screenshot({path:resolve(output,name+'-five-years.png')});
  if(errors.length)issues.push(name+': '+errors.join(' / '));
  report.push({name,compact,...metrics});
  await page.evaluate(()=>window.MeviStocks.unmount());
  await page.close();
 }
}finally{await browser.close()}
writeFileSync(resolve(output,'report.json'),JSON.stringify(report,null,2));
assert.deepEqual(issues,[],'TradingView Stocks should fit all full/split target viewports');
console.log('TradingView Stocks browser QA passed: five landscape sizes, two splits, symbol and period switching.');
