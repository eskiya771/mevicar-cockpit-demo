import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {once} from 'node:events';
const require=createRequire(import.meta.url);
process.env.XTREAM_UPSTREAM='https://provider.example:8443';
process.env.XTREAM_USER='fixture-user';
process.env.XTREAM_PASSWORD='fixture-pass';
process.env.MEVITV_BRIDGE_TOKEN='fixture-token-at-least-32-characters-long';
process.env.MEVITV_ORIGIN='https://example.github.io';
delete process.env.MEVITV_VOD_REDIRECT_MODE; // Public is the new default.
process.env.MEVITV_VOD_REDIRECT_HOSTS='127.0.0.1'; // Public mode must still reject it.
const {isPublicMediaAddress,checkedMediaRedirect,fetchPinnedMedia,server,mac}=require('../bridge/server.cjs');
const base=new URL('https://provider.example:8443/movie.mkv');

for(const address of ['103.211.103.199','185.188.31.27','8.8.8.8','1.1.1.1','2001:4860:4860::8888','2606:4700:4700::1111']){
 assert.equal(isPublicMediaAddress(address),true,address);
}
for(const address of [
 '0.0.0.0','10.0.0.1','100.64.0.1','100.127.255.254','127.0.0.1',
 '169.254.169.254','168.63.129.16','172.16.0.1','172.31.255.254','192.168.1.1',
 '192.0.0.1','192.0.2.1','192.88.99.1','198.18.0.1','198.19.0.1',
 '198.51.100.1','203.0.113.1','224.0.0.1','255.255.255.255',
 '::','::1','::ffff:127.0.0.1','::ffff:8.8.8.8','64:ff9b::a00:1',
 'fc00::1','fd00:ec2::254','fe80::1','ff02::1','2001:db8::1',
 '2001::1','2001:2::1','2002:7f00:1::1','3fff::1','not-an-ip'
])assert.equal(isPublicMediaAddress(address),false,address);

assert.equal((await checkedMediaRedirect('/next.mkv',base)).lookup,null);
assert.equal((await checkedMediaRedirect('https://103.211.103.199/film.mkv',base)).url.hostname,'103.211.103.199');
for(const url of ['http://127.0.0.1/','http://2130706433/','http://0177.0.0.1/','http://0x7f000001/',
 'http://10.0.0.1/','http://169.254.169.254/','http://[::1]/','http://[::ffff:127.0.0.1]/']){
 await assert.rejects(checkedMediaRedirect(url,base),/NON_PUBLIC_ADDRESS/,url);
}
for(const url of ['file:///etc/passwd','ftp://public.example/file','https://user:pass@public.example/file','https://public.example/file#fragment']){
 await assert.rejects(checkedMediaRedirect(url,base),/UNSAFE_URL/,url);
}
await assert.rejects(checkedMediaRedirect(null,base),/MISSING_LOCATION/);
let resolutions=0;
const approved=await checkedMediaRedirect('https://rotating-cdn.example/film.mkv',base,undefined,async hostname=>{
 assert.equal(hostname,'rotating-cdn.example');resolutions++;
 return [{address:'8.8.8.8',family:4},{address:'2001:4860:4860::8888',family:6}];
});
const pinned=await new Promise((resolve,reject)=>approved.lookup('rotating-cdn.example',{all:true},
 (error,addresses)=>error?reject(error):resolve(addresses)));
assert.deepEqual(pinned,[{address:'8.8.8.8',family:4},{address:'2001:4860:4860::8888',family:6}]);
assert.equal(resolutions,1,'Connection lookup must never resolve DNS again');
await assert.rejects(new Promise((resolve,reject)=>approved.lookup('different.example',{},error=>error?reject(error):resolve())),/Unexpected/);
await assert.rejects(checkedMediaRedirect('https://mixed.example/',base,undefined,async()=>[
 {address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}
]),/NON_PUBLIC_ADDRESS/);
await assert.rejects(checkedMediaRedirect('https://empty.example/',base,undefined,async()=>[]),/NON_PUBLIC_ADDRESS/);
await assert.rejects(checkedMediaRedirect('https://failed.example/',base,undefined,async()=>{throw Error('private resolver detail');}),/DNS_LOOKUP_FAILED/);
const abort=new AbortController();
const aborted=checkedMediaRedirect('https://slow.example/',base,abort.signal,()=>new Promise(()=>{}));
abort.abort();await assert.rejects(aborted,/REQUEST_ABORTED/);

// Real HTTP fixture exercises the pinned connection path without contacting a
// public media server. Its supplied lookup is intentionally a local test seam.
let lookupCalls=0,received;
const fixture=createServer((req,res)=>{
 received={range:req.headers.range,host:req.headers.host,encoding:req.headers['accept-encoding'],method:req.method};
 res.writeHead(206,{'Content-Range':'bytes 10-13/100','Content-Length':'4'});
 res.end(req.method==='HEAD'?undefined:Buffer.from('test'));
});
fixture.listen(0,'127.0.0.1');await once(fixture,'listening');
try{
 const url=new URL('http://cdn-connection.example:'+fixture.address().port+'/film');
 const lookup=(_name,options,callback)=>{
  lookupCalls++;assert.equal(_name,'cdn-connection.example');
  if(options.all)callback(null,[{address:'127.0.0.1',family:4}]);
  else callback(null,'127.0.0.1',4);
 };
 const response=await fetchPinnedMedia(url,{method:'GET',headers:{Range:'bytes=10-13'},lookup});
 assert.equal(response.status,206);assert.equal(await response.text(),'test');
 assert.equal(response.headers.get('content-range'),'bytes 10-13/100');
 assert.equal(received.range,'bytes=10-13');assert.equal(received.host,url.host);
 assert.equal(received.encoding,'identity');assert.equal(lookupCalls,1);
 const head=await fetchPinnedMedia(url,{method:'HEAD',headers:{},lookup});
 assert.equal(head.body,null);assert.equal(head.headers.get('content-length'),'4');
 const cancelled=new AbortController();cancelled.abort();
 await assert.rejects(fetchPinnedMedia(url,{method:'GET',headers:{},lookup,signal:cancelled.signal}),/abort/i);
}finally{fixture.closeAllConnections();await new Promise(resolve=>fixture.close(resolve));}

// Full bridge route: a provider 302 to a private target never reaches the target.
const originalFetch=globalThis.fetch;let upstreamCalls=0;
globalThis.fetch=async()=>{upstreamCalls++;return new Response(null,{status:302,headers:{Location:'http://127.0.0.1/private?secret=hidden'}});};
server.listen(0,'127.0.0.1');await once(server,'listening');
try{
 const path='/stream/movie/1.mkv',exp=Math.floor(Date.now()/1000)+60;
 const response=await originalFetch('http://127.0.0.1:'+server.address().port+path+'?exp='+exp+'&sig='+mac(path+'|'+exp));
 assert.equal(response.status,502);
 const detail=await response.text();
 assert.match(detail,/NON_PUBLIC_ADDRESS/);assert.doesNotMatch(detail,/secret|private\?/);
 assert.equal(upstreamCalls,1);

 // Successful public 302 through the full bridge. The transport is routed
 // into a local fixture only by this test; address approval still sees public IP.
 const httpModule=require('node:http'),originalRequest=httpModule.request;
 let publicConnections=0,publicRange;
 const media=createServer((req,res)=>{
  publicRange=req.headers.range;
  res.writeHead(206,{'Content-Type':'video/x-matroska','Content-Range':'bytes 0-1/100','Content-Length':'2'});
  res.end(Buffer.from([0x1a,0x45]));
 });
 media.listen(0,'127.0.0.1');await once(media,'listening');
 try{
  globalThis.fetch=async()=>new Response(null,{status:302,headers:{Location:'http://103.211.103.199/film.mkv'}});
  httpModule.request=(url,options,callback)=>{
   assert.equal(url.hostname,'103.211.103.199');assert.equal(typeof options.lookup,'function');
   publicConnections++;
   const local=new URL(url);local.hostname='127.0.0.1';local.port=String(media.address().port);
   return originalRequest(local,options,callback);
  };
  const publicResponse=await originalFetch('http://127.0.0.1:'+server.address().port+path+'?exp='+exp+'&sig='+mac(path+'|'+exp),{headers:{Range:'bytes=0-1'}});
  assert.equal(publicResponse.status,206);
  assert.equal(publicResponse.headers.get('content-range'),'bytes 0-1/100');
  assert.deepEqual([...new Uint8Array(await publicResponse.arrayBuffer())],[0x1a,0x45]);
  assert.equal(publicConnections,1);assert.equal(publicRange,'bytes=0-1');
 }finally{
  httpModule.request=originalRequest;media.closeAllConnections();
  await new Promise(resolve=>media.close(resolve));
 }

}finally{globalThis.fetch=originalFetch;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
console.log('Public media redirects OK: public IPv4/IPv6, local/reserved rejection, DNS pinning, mixed DNS, abort, real HTTP transport and full bridge denial.');
