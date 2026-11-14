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
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
try {
 for(const profile of profiles)for(const theme of ['default','cyberpunk','liquidglass']){
 const page=await browser.newPage({viewport:{width:profile.width,height:profile.height}});
 await page.addInitScript(theme=>{
 localStorage.setItem('mevicar-next-theme',theme);
 window.MeviNativeBridge={postMessage(raw){const r=JSON.parse(raw);queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({id:r.id,ok:true,capabilities:{iptvExoplayer:true},value:''})}));}};
 },theme);
 await page.goto(base);await page.evaluate(()=>window.openApp('tv'));
 await page.locator('[data-act="xtream"]').click();
 const dialog=page.locator('.tv-xtream-dialog');await expect(dialog).toBeVisible();
 await expect(page.locator('.tv-engine')).toBeVisible();
 await expect(page.locator('.tv-engine')).toHaveValue('web');
 const box=await dialog.boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=profile.width+1&&box.y+box.height<=profile.height+1);
 await page.screenshot({path:output+'/'+profile.width+'-'+profile.height+'-'+theme+'-native.png'});
 await page.close();
 }
 console.log('Player settings fit all 5 profiles × 3 themes');
} finally {await browser.close();server.close();}
