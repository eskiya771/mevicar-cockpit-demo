/* Browser regression against the actual versioned Pages output.
   Isolated fixture responses only: no real PIN/provider/session is used. */
import assert from 'node:assert/strict';
import { chromium, expect } from 'playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, extname } from 'node:path';

// DISPLAY_PROFILE_MATRIX.md remains the sole viewport source.
const matrix=await readFile('DISPLAY_PROFILE_MATRIX.md','utf8');
const profiles=matrix.split('\n').filter(line=>line.startsWith('| **')).map(line=>{
 const columns=line.split('|');
 const [,width,height]=columns[3].match(/(\d+) × (\d+)/);
 return {name:columns[1].replaceAll('**','').trim(),width:+width,height:+height};
});
assert.equal(profiles.length,5);
const output=process.env.TV_VISUAL_OUTPUT||'visual-results/tv';
await mkdir(output,{recursive:true});
const root=resolve('dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
 if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}
 try{const bytes=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'});res.end(bytes);}
 catch{if(!res.headersSent)res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const transport=await readFile('tests/fixtures/tv-test.ts');
const browser=await chromium.launch();
const report={build:JSON.parse(await readFile('dist/build-info.json','utf8')),browser:browser.version(),profiles:[],fixture:'Synthetic 120-channel catalog + FFmpeg test video through real mpegts.js; no provider access'};
const categories=[{category_id:'1',category_name:'Nachrichten'},{category_id:'2',category_name:'Sport'},{category_id:'3',category_name:'Kultur'}];
const items=Array.from({length:120},(_,i)=>({stream_id:i+1,name:`${i===118?'DE: ':i===119?'TR: ':''}Testsender ${String(i+1).padStart(3,'0')} · ${i===0?'Sehr langer Sendername für die Layoutprüfung':'HD'}`,category_id:String(i%3+1),container_extension:'ts',stream_icon:i===0?'https://logos.fixture.test/ok.svg':i===1?'https://logos.fixture.test/missing.svg':''}));
let failures=0;
try{
 for(const [index,profile] of profiles.entries())for(const theme of ['default','cyberpunk','liquidglass']){
  const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},deviceScaleFactor:1,hasTouch:true,reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await context.newPage();
  const errors=[],tickets=[];let epgMode="success";
  page.on('pageerror',e=>errors.push(e.message));
  const result={profile:profile.name,theme,viewport:{width:profile.width,height:profile.height},errors};
  const prefix=`${index+1}-${theme}`;
  try{
   await context.addInitScript(theme=>{localStorage.setItem('mevicar-next-theme',theme);},theme);
   await context.route('https://mevitv.mtankurt.synology.me/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(path==='/session')return route.fulfill({json:{session:'visual.fixture'}});
    if(path==='/api'){
     const {action,stream_id}=request.postDataJSON();
     if(action==='get_short_epg'||action==='get_simple_data_table'){
      if(epgMode==='error')return route.fulfill({status:503,json:{error:'EPG fixture unavailable'}});
      if(epgMode==='full'&&action==='get_short_epg')return route.fulfill({json:{epg_listings:[]}});
      if(epgMode==='provider-times')return route.fulfill({json:{epg_listings:[{title:'Anbieterprogramm',start:'2026-11-10 08:00:00',end:'2026-11-10 09:00:00'}]}});
      if(epgMode==='empty')return route.fulfill({json:{epg_listings:[]}});
      if(stream_id==='2')await new Promise(r=>setTimeout(r,350));
      const now=Math.floor(Date.now()/1000),text=value=>Buffer.from(value).toString('base64');
      return route.fulfill({json:{epg_listings:[
       {title:text('Sendung '+stream_id+' · Nachrichten'),description:text('Güncel <script>alert(1)</script> & Kultur.\nBeschreibung des Testprogramms.'),start_timestamp:now-600,stop_timestamp:now+1200},
       {title:text('Danach: Kultur'),description:text('Die nächste Sendung'),start_timestamp:now+1200,stop_timestamp:now+3000}
      ]}});
     }
     return route.fulfill({json:action.endsWith('_categories')?categories:action==='get_live_streams'?items:[]});
    }
    if(path==='/ticket'){
     const data=request.postDataJSON();tickets.push(data);
     return route.fulfill({json:{url:`/stream/live/${data.id}.ts?exp=1950000000&sig=${'a'.repeat(64)}`}});
    }
    if(path.endsWith('.ts'))return route.fulfill({status:200,contentType:'video/mp2t',body:transport});
    return route.abort();
   });
   await context.route('https://logos.fixture.test/**',route=>{
    if(route.request().url().endsWith('/missing.svg'))return route.fulfill({status:404,body:'Not found'});
    return route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="16" fill="#33badd"/></svg>'});
   });
   await page.goto(base,{waitUntil:'load'});
   await page.getByRole('button',{name:'Apps öffnen',exact:true}).click();
   const dockBefore=await page.locator('#dock').boundingBox();
   // Every app, including Settings, must have a distinct icon and caption row.
   for(const tile of await page.locator('.app-home-surface .app-home-tile').all()){
    await tile.scrollIntoViewIfNeeded();
    const icon=await tile.locator('.app-home-icon').boundingBox();
    const label=await tile.locator('.app-home-label').boundingBox();
    assert(icon&&label&&label.y>=icon.y+icon.height+1,
      'launcher caption must sit below illustration: '+await tile.getAttribute('aria-label'));
   }
   // PIN entry lives in global Settings, never inside the IPTV dialog.
   await page.evaluate(()=>window.meviOpenCredentialSettings());
   await page.locator('#mevi-cred-tv').fill('0000');
   await page.locator('#mevi-cred-tv').locator('xpath=..').getByRole('button',{name:'Speichern'}).click();
   await page.evaluate(()=>window.openApp('tv'));
   await page.locator('.tv-root').waitFor();
   assert.deepEqual(await page.locator('#dock').boundingBox(),dockBefore,'TV must preserve shared dock geometry');
   await page.getByRole('button',{name:'IPTV-Einstellungen',exact:true}).click();
   await page.getByRole('button',{name:'Katalog verbinden'}).click();
   await page.locator('.tv-xtream-item').first().waitFor();
   await page.locator('.tv-xtream-dialog').getByRole('button',{name:'Schließen',exact:true}).click();
   assert.equal(await page.locator('.tv-xtream-item').count(),120);
   assert.equal(await page.locator('.tv-xtream-row').first().locator('img').getAttribute('loading'),'lazy','logos use lazy loading');
   await expect(page.locator('.tv-xtream-row').nth(1).locator('.tv-channel-fallback')).toBeVisible();
   await expect(page.locator('.tv-xtream-row').first().locator('img')).toBeVisible();
   await page.getByLabel('Kategorie',{exact:true}).selectOption('2');
   assert.equal(await page.locator('.tv-xtream-item').count(),40);
   await page.getByLabel('Katalog durchsuchen').fill('002');
   assert.equal(await page.locator('.tv-xtream-item').count(),1);
   assert(await page.getByLabel('Katalog durchsuchen').evaluate(e=>document.activeElement===e),'search keeps focus');
   await page.getByLabel('Katalog durchsuchen').fill('kein-treffer');
   assert.equal(await page.locator('.tv-xtream-list').innerText(),'Keine Einträge gefunden.');
   await page.getByLabel('Katalog durchsuchen').fill('');
   await page.getByLabel('Kategorie',{exact:true}).selectOption('ALL');
   // Independent country filter and persistent favorite selection.
   assert((await page.getByLabel('IPTV-Land').locator('option[value="DE"]').textContent()).includes('🇩🇪'),'country option includes German flag');
   await page.getByLabel('IPTV-Land').selectOption('DE');
   assert.deepEqual(await page.getByLabel('Kategorie',{exact:true}).locator('option').allTextContents(),['Alle Kategorien','Sport'],'German categories only');
   assert.equal(await page.locator('.tv-xtream-item').count(),1,'Germany only');
   await page.locator('.tv-xtream-star').first().click();
   await page.getByRole('button',{name:'Nur IPTV-Favoriten'}).click();
   assert.equal(await page.locator('.tv-xtream-item').count(),1,'favorites independent of country');
   assert(await page.getByLabel('IPTV-Land').isDisabled(),'country disabled while favorites active');
   await page.getByRole('button',{name:'Nur IPTV-Favoriten'}).click();
   await page.getByLabel('IPTV-Land').selectOption('TR');
   assert.deepEqual(await page.getByLabel('Kategorie',{exact:true}).locator('option').allTextContents(),['Alle Kategorien','Kultur'],'Turkish categories only');
   assert.equal(await page.locator('.tv-xtream-item').count(),1,'Turkey only');
   await page.getByLabel('IPTV-Land').selectOption('ALL');
   assert.equal(await page.locator('.tv-xtream-item').count(),120,'all countries restored');
   await page.locator('.tv-xtream-item').last().scrollIntoViewIfNeeded();
   assert(await page.locator('.tv-xtream-list').evaluate(e=>e.scrollTop>0),'long catalog scrolls');
   await page.locator('.tv-xtream-item').first().scrollIntoViewIfNeeded();
   // Real pinned mpegts.js and browser media decoder; only the incoming TS is synthetic.
   await page.locator('.tv-xtream-item').first().click();
   await expect(page.locator('.tv-playing-logo')).toBeVisible();
   await page.waitForFunction(()=>{const v=document.querySelector('.tv-stage video');return v.videoWidth>0&&v.currentTime>0.1;},null,{timeout:20000});
   assert.equal(tickets.length,1,'one media ticket');
   assert.equal(tickets[0].transport,'raw','healthy mpegts.js must not fall back');
   result.media=await page.locator('video').evaluate(v=>({width:v.videoWidth,height:v.videoHeight,time:v.currentTime}));
   await expect(page.locator('.tv-epg-now')).toContainText('Jetzt: Sendung 1');
   assert.equal(await page.locator('.tv-library .tv-xtream-tabs').count(),0,'tabs moved out of catalogue');
   assert.equal(await page.locator('.tv-player [data-kind]').count(),3,'content tabs in player column');
   result.geometry=await measure(page);
   validate(result.geometry);
   await page.screenshot({path:`${output}/${prefix}.png`});
   await page.getByRole('button',{name:'TV-Programm öffnen'}).click();
   await expect(page.locator('.tv-epg-content')).toContainText('Güncel <script>alert(1)</script> & Kultur.');
   assert.equal(await page.locator('.tv-epg-content script').count(),0,'provider text is escaped');
   await page.screenshot({path:`${output}/${prefix}-epg.png`});
   epgMode='empty';
   await page.locator('.tv-epg-dialog').getByRole('button',{name:'Aktualisieren'}).click();
   await expect(page.locator('.tv-epg-content')).toContainText('Die EPG-Abfragen liefern für diesen Sender keine Einträge.');
   epgMode='error';
   await page.locator('.tv-epg-dialog').getByRole('button',{name:'Aktualisieren'}).click();
   await expect(page.locator('.tv-epg-content')).toContainText('EPG derzeit nicht verfügbar.');
   assert.equal(tickets.length,1,'EPG errors do not restart video');
   epgMode='full';
   await page.locator('.tv-epg-dialog').getByRole('button',{name:'Aktualisieren'}).click();
   await expect(page.locator('.tv-epg-now')).toContainText('Jetzt: Sendung 1');
   await expect(page.locator('.tv-epg-diagnostic-text')).toContainText('get_simple_data_table');
   epgMode='provider-times';
   await page.locator('.tv-epg-dialog').getByRole('button',{name:'Aktualisieren'}).click();
   await expect(page.locator('.tv-epg-content')).toContainText('Anbieterprogramm');
   await expect(page.locator('.tv-epg-channel')).toContainText('Anbieterzeiten ohne Zeitzonenangabe');
   epgMode='success';
   await page.locator('.tv-epg-dialog').getByRole('button',{name:'Aktualisieren'}).click();
   await expect(page.locator('.tv-epg-now')).toContainText('Jetzt: Sendung 1');
   await page.locator('.tv-epg-dialog').getByRole('button',{name:'Schließen',exact:true}).click();
   await page.locator('[data-xt-item="2"]').click();
   await page.locator('[data-xt-item="3"]').click();
   await expect(page.locator('.tv-epg-now')).toContainText('Jetzt: Sendung 3');
   await page.waitForTimeout(400); // delayed response from previous channel must never replace current EPG
   await expect(page.locator('.tv-epg-now')).toContainText('Jetzt: Sendung 3');
   // Simulated asymmetric safe areas for both iPhone landscape directions.
   // This checks CSS only, not physical iOS/Safari behavior.
   if(profile.name==='iPhone 17'){
    await page.evaluate(()=>window.meviTVStopForSource?.('layout-test'));
    for(const side of ['left','right']){
     const css=await page.locator('style').allTextContents();
     const values={left:side==='left'?62:0,right:side==='right'?62:0,top:0,bottom:21};
     const override=await page.addStyleTag({content:css.join('\n').replace(/env\(safe-area-inset-(left|right|top|bottom)(?:\s*,\s*[^)]+)?\)/g,(_,s)=>values[s]+'px')});
     const geometry=await measure(page);validate(geometry);
     assert(geometry.player.right<=profile.width-values.right+1,'player must clear notch');
     assert(geometry.player.bottom<=profile.height-values.bottom+1,'player must clear home indicator');
     (result.safeAreas??=[]).push({side,values,geometry});
     await page.screenshot({path:`${output}/${prefix}-safe-${side}.png`});
     await override.evaluate(e=>e.remove());
    }
   }else await page.evaluate(()=>window.meviTVStopForSource?.('layout-test'));
   await page.getByRole('button',{name:'Filme',exact:true}).click();
   assert.equal(await page.locator('.tv-xtream-list').innerText(),'Keine Einträge gefunden.');
   await page.getByRole('button',{name:'Live',exact:true}).click();
   assert.equal(await page.locator('.tv-xtream-item').count(),120);
   // The pre-existing split interaction stays usable: list -> player -> list.
   await page.locator('#dock').getByRole('button',{name:'TV öffnen',exact:true}).click();
   await page.locator('.side .tv-root').waitFor();
   assert(await page.locator('.tv-library').isVisible());
   assert(!await page.locator('.tv-player').isVisible(),'split starts with list');
   await page.locator('.tv-xtream-item').first().click();
   await page.locator('.tv-player').waitFor({state:'visible'});
   await page.getByRole('button',{name:'Senderliste umschalten'}).click();
   assert(await page.locator('.tv-library').isVisible());
   assert.equal(errors.length,0,'no JavaScript errors');
   result.status='passed';
  }catch(e){failures++;result.status='failed';result.failure=String(e.stack||e);await page.screenshot({path:`${output}/${prefix}-failure.png`}).catch(()=>{});}
  finally{report.profiles.push(result);await context.close();}
 }
}finally{
 await browser.close();await new Promise(r=>server.close(r));
 await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));
}
console.log(JSON.stringify({build:report.build,browser:report.browser,results:report.profiles.map(({profile,theme,status,failure})=>({profile,theme,status,failure}))},null,2));
if(failures)process.exitCode=1;

async function measure(page){return page.evaluate(()=>{
 const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
 const get=s=>rect(document.querySelector(s));
 const root=document.querySelector('.tv-root');
 const controls=[...root.querySelectorAll('button,input,select')].filter(e=>e.checkVisibility()&&!e.closest('dialog')&&!e.closest('.tv-list,.tv-xtream-list'));
 return {viewport:{width:innerWidth,height:innerHeight},document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},dock:get('#dock'),library:get('.tv-library'),player:get('.tv-player'),stage:get('.tv-stage'),actions:get('.tv-actions'),list:get('.tv-xtream-list'),controls:controls.map(e=>({label:e.getAttribute('aria-label')||e.textContent,compact:!!e.closest('.tv-xtream-tools,.tv-xtream-tabs,.tv-player>header,.tv-program'), ...rect(e)}))};
});}
function validate(m){
 assert(m.document.width<=m.viewport.width+1&&m.document.height<=m.viewport.height+1,'no document overflow');
 assert(m.dock.right<=m.library.x&&m.library.right<=m.player.x,'three non-overlapping columns');
 assert(m.list.height>=96,'at least two channels visible');
 assert(m.actions.bottom<=m.stage.y,'controls above the TV image');
 assert(m.stage.width>=250&&m.stage.height>=140,'usable player area');
 for(const c of m.controls){const minimum=c.compact?30:43.5;assert(c.width>=43.5&&c.height>=minimum,`${c.label}: ${c.compact?'compact 30px':'44px'} touch target`);assert(c.x>=0&&c.y>=0&&c.right<=m.viewport.width+1&&c.bottom<=m.viewport.height+1,`${c.label}: within viewport`);}
}
