import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../tv.js',import.meta.url),'utf8');
const instrumented=source.replace('global.meviTVHTML=html;',
 'global.testBridge={playMoviVod,moviLogText,moviReport,setRoot:(r,v)=>{root=r;video=v;}};global.meviTVHTML=html;');

function harness(fetcher){
 const nodes=new Map(),elements=[];
 let requests=0,plays=0,loads=0,current=true;
 const nativeVideo={pause(){},load(){},removeAttribute(){}};
 const root={classList:{add(){}},querySelector(selector){
  if(!nodes.has(selector))nodes.set(selector,{textContent:'',appendChild(){}});
  return nodes.get(selector);
 }};
 const doc={baseURI:'https://example.github.io/mevicar/',createElement(tag){
  assert.equal(tag,'movi-player');
  const element={build:'slim',setAttribute(){},addEventListener(){},play(){plays++;return Promise.resolve();},set src(value){loads++;}};
  elements.push(element);return element;
 }};
 const win={document:doc};
 runInNewContext(instrumented,{
  window:win,document:doc,URL,URLSearchParams,TextDecoder,AbortController,
  location:{search:'?moviExperimental=1'},customElements:{get:()=>true},
  localStorage:{getItem:()=>null},console:{info(){},error(){}},
  setTimeout,clearTimeout,setInterval,clearInterval,
  fetch:async(...args)=>{requests++;return fetcher(...args);}
 });
 const api=win.testBridge;api.setRoot(root,nativeVideo);
 return {api,nodes,elements,start:()=>api.playMoviVod('https://bridge.invalid/stream/movie/1.mkv?sig=private-ticket','Nightborn',()=>current),
  expire:()=>{current=false;},stats:()=>({requests,plays,loads})};
}
const json=(error,status=502)=>new Response(JSON.stringify({error}),{status,headers:{'Content-Type':'application/json'}});
const blocked='Medienserver cdn.example ist nicht freigegeben. In MEVITV_VOD_REDIRECT_HOSTS eintragen.';

// Regression: an actionable bridge error must survive, and must not launch
// a decoder that retries size discovery and replaces it with "Content-Length missing".
{
 const h=harness(()=>json(blocked));await h.start();
 assert.deepEqual(h.stats(),{requests:1,plays:0,loads:0});
 assert.equal(h.elements.length,0);
 assert.match(h.api.moviLogText(),/Bridge-Fehler: HTTP 502.*cdn\.example.*MEVITV_VOD_REDIRECT_HOSTS/);
 assert.match(h.nodes.get('.tv-status').textContent,/MKV nicht erreichbar: HTTP 502.*cdn\.example/);
 for(let i=0;i<80;i++)h.api.moviReport('Other diagnostic '+i);
 assert.match(h.api.moviLogText(),/cdn\.example/);
}
{
 let cancelled=false;
 const h=harness(()=>new Response(new ReadableStream({cancel(){cancelled=true;}}),{
  status:206,headers:{'Content-Range':'bytes 0-1/1570800962'}
 }));
 await h.start();
 assert.deepEqual(h.stats(),{requests:1,plays:1,loads:1});
 assert.equal(cancelled,true);
}
for(const status of [401,403,502]){
 const h=harness(()=>json('Provider media HTTP 503',status));await h.start();
 assert.equal(h.stats().loads,0);
 assert.match(h.api.moviLogText(),new RegExp('Bridge-Fehler: HTTP '+status));
}
{
 const h=harness(()=>json('Expired media ticket',401));await h.start();
 assert.match(h.api.moviLogText(),/Wiedergabe-Link abgelaufen/);
}
for(const body of ['{"error":"raw secret-token https://provider.invalid/user/password"}','{not JSON}']){
 const h=harness(()=>new Response(body,{status:502,headers:{'Content-Type':'application/json'}}));
 await h.start();assert.equal(h.stats().loads,0);
 assert.doesNotMatch(h.api.moviLogText(),/secret-token|provider\.invalid|password/);
}
{
 let cancelled=false;
 const h=harness(()=>new Response(new ReadableStream({
  start(controller){controller.enqueue(new TextEncoder().encode('x'.repeat(4097)));},
  cancel(){cancelled=true;}
 }),{status:502,headers:{'Content-Type':'application/json'}}));
 await h.start();assert.equal(h.stats().loads,0);assert.equal(cancelled,true);
}
{
 const h=harness(()=>new Response('<html>secret-token</html>',{status:502,headers:{'Content-Type':'text/html'}}));
 await h.start();assert.equal(h.stats().loads,0);assert.doesNotMatch(h.api.moviLogText(),/secret-token/);
}
{
 let resolveFetch;
 const response=new Promise(resolve=>{resolveFetch=resolve;});
 const h=harness(()=>response),pending=h.start();
 h.expire();resolveFetch(json(blocked));await pending;
 assert.equal(h.stats().loads,0);assert.doesNotMatch(h.api.moviLogText(),/cdn\.example/);
}
// An inconclusive fetch failure keeps Movi's own recovery available.
{
 const h=harness(()=>{throw new TypeError('Failed to fetch');});await h.start();
 assert.equal(h.stats().loads,1);
 assert.match(h.api.moviLogText(),/Range\/CORS-Test/);
}
console.log('TV bridge errors OK: 502 reason, one request/no decoder on HTTP errors, success, stale source, bounded bodies and private-data filtering.');
