import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {once}=await import('node:events');
process.env.XTREAM_UPSTREAM='http://127.0.0.1:8080';
process.env.XTREAM_USER='test-user';
process.env.XTREAM_PASSWORD='test-pass';
process.env.MEVITV_BRIDGE_TOKEN='test-token-which-is-at-least-32-characters-long';
process.env.MEVITV_ORIGIN='https://example.github.io';
const originalFetch=globalThis.fetch;
globalThis.fetch=async (url,options={})=>{
  const u=new URL(url);
  assert.equal(u.hostname,'127.0.0.1');
  if(u.pathname==='/player_api.php'){
    assert.equal(u.searchParams.get('username'),'test-user');
    assert.equal(u.searchParams.get('password'),'test-pass');
    return new Response(JSON.stringify([{category_id:1,category_name:'News'}]),{headers:{'Content-Type':'application/json'}});
  }
  if(u.pathname.startsWith('/live/'))return new Response('mock transport stream',{headers:{'Content-Type':'video/mp2t'}});
  throw Error('Unexpected upstream path');
};
const {server}=require('../bridge/server.cjs');
server.listen(0,'127.0.0.1');await once(server,'listening');
const base='http://127.0.0.1:'+server.address().port;
const token=process.env.MEVITV_BRIDGE_TOKEN;
try{
 let response=await originalFetch(base+'/health');
 assert.equal(response.status,200);
 response=await originalFetch(base+'/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'get_live_categories'})});
 assert.equal(response.status,401);
 response=await originalFetch(base+'/api',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:'https://example.github.io'},body:JSON.stringify({action:'get_live_categories'})});
 assert.equal(response.status,200);
 assert.equal(response.headers.get('access-control-allow-origin'),'https://example.github.io');
 assert.equal((await response.json())[0].category_name,'News');
 response=await originalFetch(base+'/api',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action:'delete_everything'})});
 assert.equal(response.status,400);
 response=await originalFetch(base+'/ticket',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({type:'live',id:'42',ext:'ts'})});
 assert.equal(response.status,200);
 const ticket=await response.json();
 assert(ticket.url.startsWith('/stream/live/42.ts?'));
 response=await originalFetch(base+ticket.url);assert.equal(response.status,200);assert.equal(await response.text(),'mock transport stream');
 response=await originalFetch(base+'/stream/live/42.ts?exp=123&sig='+'0'.repeat(64));assert.equal(response.status,401);
 console.log('Xtream bridge OK: auth, CORS, allowlists, catalog response, signed media tickets.');
}finally{await new Promise(resolve=>server.close(resolve));globalThis.fetch=originalFetch;}
