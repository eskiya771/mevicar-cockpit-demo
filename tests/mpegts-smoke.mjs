import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const xtream=require('../xtream.js');
const tv=readFileSync(new URL('../tv.js',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../bridge/server.cjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
new Function(tv);
assert.match(tv,/engine\.createPlayer\(\{type:'mpegts',isLive:true,url/);
assert.match(tv,/mpegtsPlayer\.unload\(\)/);
assert.match(tv,/mpegtsFallback=null/);
assert.match(tv,/Wechsle zu HLS\/FFmpeg/);
assert.match(tv,/enableStashBuffer:true/);
assert.match(workflow,/mpegts\.js@1\.8\.2/);
assert.match(workflow,/dist\/vendor\/mpegts-1\.8\.2\.min\.js/);
assert.match(bridge,/d\.transport!=='raw'/);
const saved=globalThis.fetch;
const requests=[];
try{
 globalThis.fetch=async(url,options)=>{
  const req=JSON.parse(options.body);
  requests.push({url,req});
  const media=req.type==='live'&&req.ext==='ts'&&req.transport==='raw'
   ?'/stream/live/42.ts'
   :'/remux/live/42/index.m3u8';
  return new Response(JSON.stringify({url:media+'?exp=1950000000&sig='+'a'.repeat(64)}),{
   status:200,headers:{'Content-Type':'application/json'}
  });
 };
 const account={host:'https://mevitv.mtankurt.synology.me',bridge:true,token:'temporary-test-session'};
 const direct=await xtream.playbackURL(account,'live','42','ts','raw');
 assert.equal(new URL(direct).pathname,'/stream/live/42.ts');
 const hls=await xtream.playbackURL(account,'live','42','ts');
 assert.equal(new URL(hls).pathname,'/remux/live/42/index.m3u8');
 assert.equal(requests[0].req.transport,'raw');
 assert.equal(requests[1].req.transport,'default');
 assert(requests.every(x=>x.url.endsWith('/ticket')));
 console.log('MPEGTS routing OK: direct signed TS, HLS fallback, shutdown, pinned build dependency.');
}finally{globalThis.fetch=saved;}
