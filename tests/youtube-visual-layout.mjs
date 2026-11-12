/* MeviCar Next YouTube visual regression: 5 car landscapes + 2 compact splits.
   The YouTube iframe is a deterministic local fixture; no video is streamed. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const output=resolve('visual-results/youtube');mkdirSync(output,{recursive:true});
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
  await page.route('https://mevi-yt-qa.invalid/**',route=>route.fulfill({
   contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'+
    '<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#071828;color:#e8f8ff;font-family:system-ui,sans-serif}'+
    '.frame{width:100%;height:100%;padding:6px;display:flex;gap:8px}.dock{width:70px;flex:none;background:#132b40;border-radius:10px}'+
    '.youtube-host{width:'+hostWidth+'px;max-width:calc(100% - 78px);height:100%;flex:none}</style>'+
    '</head><body><div class="frame"><aside class="dock"></aside><div class="'+
     (compact?'side':'full')+' youtube-host" id="host"></div></div></body></html>'
  }));
  await page.route('https://www.youtube-nocookie.com/**',route=>route.fulfill({
   status:200,contentType:'text/html',body:'<html><body style="background:#080d19;color:#fff">YouTube iframe fixture</body></html>'
  }));
  await page.goto('https://mevi-yt-qa.invalid/test');
  await page.evaluate(()=>{
   Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
    watchPosition(success,error){window.__gpsSuccess=success;window.__gpsError=error;return 9},
    clearWatch(){}
   }});
   window.meviSpotifyPauseForSource=()=>{};
   window.meviMediaStopForSource=()=>{};
  });
  await page.addStyleTag({path:'youtube.css'});
  await page.addScriptTag({path:'youtube.js'});
  await page.evaluate(isCompact=>{
   document.getElementById('host').innerHTML=window.MeviYouTube.html(isCompact);
   window.MeviYouTube.mount();
  },compact);
  const input=page.locator('#mevi-youtube-input');
  await input.fill('https://youtu.be/dQw4w9WgXcQ');
  await page.screenshot({path:resolve(output,name+'-idle.png')});
  await page.evaluate(()=>window.__gpsSuccess({
   timestamp:Date.now(),coords:{latitude:49.7,longitude:10.9,accuracy:5,speed:0}
  }));
  const accepted=await page.evaluate(()=>window.MeviYouTube.load());
  if(!accepted)issues.push(name+': GPS stand was valid but YouTube could not load');
  if(accepted){
   await page.locator('.mevi-youtube-iframe').waitFor({timeout:6000});
   const sizes=await page.evaluate(()=>{
    const host=document.getElementById('host'),frame=document.querySelector('.mevi-youtube-iframe');
    const body=document.documentElement,rect=host.getBoundingClientRect(),player=frame.getBoundingClientRect();
    return{playerWidth:player.width,playerHeight:player.height,hostWidth:rect.width,hostHeight:rect.height,
      hostRight:rect.right,horizontalOverflow:body.scrollWidth-body.clientWidth};
   });
   if(sizes.playerWidth<200||sizes.playerHeight<200)
    issues.push(name+': official YouTube player below 200x200 ('+sizes.playerWidth+'x'+sizes.playerHeight+')');
   if(sizes.hostRight>width+3||sizes.horizontalOverflow>3)
    issues.push(name+': overflow');
   report.push({name,compact,...sizes});
   await page.screenshot({path:resolve(output,name+'-player.png')});
   await page.locator('#mevi-youtube-stop').click();
   await page.locator('.mevi-youtube-idle').waitFor({timeout:5000});
   if(await page.locator('.mevi-youtube-iframe').count())issues.push(name+': stopped iframe survived');
  }
  if(errors.length)issues.push(name+': '+errors.join(' / '));
  await page.close();
 }
}finally{await browser.close()}
writeFileSync(resolve(output,'report.json'),JSON.stringify(report,null,2));
assert.deepEqual(issues,[],'YouTube player layout and lifecycle must fit all cockpit target profiles');
console.log('YouTube visual QA passed: 5 full landscapes, 2 split profiles, official 200x200 size, GPS and Stop.');
