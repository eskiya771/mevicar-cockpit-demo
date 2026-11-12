/* WhatsApp visual QA for MeviCar Next. No WhatsApp account or network.
   Validates contacts, editor and composer across car landscape displays. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
const output=resolve('visual-results/whatsapp');mkdirSync(output,{recursive:true});
const profiles=[
 ['iphone17',874,402,false],['s20fe',915,412,false],
 ['dex-1200',1920,1200,false],['fullhd-1080',1920,1080,false],
 ['panorama-720',1920,720,false],['iphone17-split',874,402,true],
 ['dex-split',1920,1200,true]
];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||undefined});
const reports=[],issues=[];
try{
 for(const [name,w,h,compact] of profiles){
  const page=await browser.newPage({viewport:{width:w,height:h},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const boxWidth=compact?w<1000?335:760:w-90;
  await page.route('https://mevicar-qa.invalid/**',r=>r.fulfill({
   contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<style>*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#061521;font-family:system-ui,sans-serif;color:#e4fcfa}'+
    '.frame{height:100%;padding:5px;display:flex;gap:8px}.dock{width:76px;flex:none;background:#11283a;border-radius:12px}'+
    '.whatsapp-host{width:'+boxWidth+'px;max-width:calc(100% - 84px);height:100%;flex:none}'+
    '</style></head><body><div class="frame"><aside class="dock"></aside><div class="'+
     (compact?'side':'full')+' whatsapp-host" id="host"></div></div></body></html>'
  }));
  await page.goto('https://mevicar-qa.invalid/test');
  await page.addStyleTag({path:'whatsapp.css'});
  await page.addScriptTag({path:'whatsapp.js'});
  await page.evaluate(isCompact=>{
   const root=document.getElementById('host');
   root.innerHTML=window.MeviWhatsApp.html(isCompact);
   window.MeviWhatsApp.mount();
  },compact);
  await page.locator('.mevi-wa-list-head button').click();
  await page.locator('#mevi-wa-name').fill('Testkontakt QA');
  await page.locator('#mevi-wa-phone').fill('+49 170 1234567');
  await page.locator('.mevi-wa-editor-actions .mevi-wa-primary').click();
  await page.locator('.mevi-wa-compose-top h2').getByText('Testkontakt QA').waitFor();
  await page.locator('#mevi-wa-text').fill('Hallo, ich komme später.');
  await page.locator('.mevi-wa-compose-top h2').waitFor();
  for(const pageName of ['compose','contacts']){
   await page.evaluate(v=>window.MeviWhatsApp.view(v),pageName);
   const target=pageName==='compose'?'.mevi-wa-right':'.mevi-wa-left';
   const region=page.locator(target);
   await region.waitFor({state:'visible'});
   const metric=await page.evaluate(target=>{
    const root=document.querySelector('.mevi-wa-shell'),host=document.getElementById('host');
    const region=root.querySelector(target);
    const r=region.getBoundingClientRect(),h=host.getBoundingClientRect(),tabs=root.querySelector('.mevi-wa-mobile-tabs');
    return{screen:document.documentElement.scrollWidth-document.documentElement.clientWidth,
     host:[h.left,h.top,h.right,h.bottom],region:[r.left,r.top,r.right,r.bottom],
     rootOverflow:root.scrollWidth-root.clientWidth,regionScroll:region.scrollHeight-region.clientHeight,
     tabsVisible:tabs?.getBoundingClientRect().height||0};
   },target);
   if(metric.screen>3)issues.push(name+' '+pageName+': page horizontal scroll');
   if(metric.rootOverflow>3)issues.push(name+' '+pageName+': horizontal WhatsApp overflow');
   if(metric.region[2]>metric.host[2]+2||metric.region[0]<metric.host[0]-2)
    issues.push(name+' '+pageName+': active panel exceeds host');
   if(compact&&metric.tabsVisible<20)issues.push(name+' '+pageName+': missing split tabs');
   if(errors.length)issues.push(name+' '+pageName+': '+errors.join(' / '));
   reports.push({profile:name,page:pageName,...metric});
   await page.screenshot({path:resolve(output,name+'-'+pageName+'.png')});
  }
  await page.close();
 }
}finally{await browser.close()}
writeFileSync(resolve(output,'report.json'),JSON.stringify(reports,null,2));
assert.deepEqual(issues,[],'WhatsApp must fit all five landscape and both split profiles');
console.log('WhatsApp visual QA passed: five full landscapes, two compact split views, contact creation and message composition.');
