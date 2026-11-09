// MeviTV self-hosted HTTPS bridge. Configure one trusted IPTV account via environment.
// Run behind an HTTPS reverse proxy (e.g. Synology). Never expose this service without TLS.
'use strict';
const http=require('node:http');
const crypto=require('node:crypto');
const {Readable}=require('node:stream');
const {createRelay,MAX_MANIFEST}=require('./hls.cjs');
const upstream=process.env.XTREAM_UPSTREAM||'';
const username=process.env.XTREAM_USER||'';
const password=process.env.XTREAM_PASSWORD||'';
const token=process.env.MEVITV_BRIDGE_TOKEN||'';
const origin=process.env.MEVITV_ORIGIN||'';
const port=Number(process.env.PORT||8787);
const host=process.env.HOST||'127.0.0.1';
const MAX_CATALOG_BYTES=64*1024*1024;
const allowedActions=new Set(['get_live_categories','get_live_streams','get_vod_categories','get_vod_streams','get_series_categories','get_series','get_series_info','get_vod_info','get_short_epg']);
const safeId=id=>/^\d{1,15}$/.test(String(id));
const safeExt=ext=>/^(m3u8|ts|mp4|mkv|avi|mov)$/.test(String(ext));
function provider(){const u=new URL(upstream);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('Invalid upstream');if(!username||!password||token.length<32||!origin.startsWith('https://'))throw Error('Missing secure environment');return u;}
const base=provider(),secret=crypto.createHmac('sha256',token).update('mevitv-playback-v1').digest();
const relay=createRelay(secret,base.origin);
function mac(value){return crypto.createHmac('sha256',secret).update(value).digest('hex');}
function validToken(value){const a=Buffer.from(value||''),b=Buffer.from(token);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
function cors(req,res){if(req.headers.origin===origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');}}
function reply(res,code,data){res.statusCode=code;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));}
async function body(req){let total=0,chunks=[];for await(const p of req){total+=p.length;if(total>4096)throw Error('Request too large');chunks.push(p);}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}
function upstreamURL(path,params={}){const u=new URL(path,base.origin);for(const[k,v]of Object.entries(params))u.searchParams.set(k,String(v));return u;}
function authorize(req){return validToken((req.headers.authorization||'').replace(/^Bearer /i,''));}
async function hlsResponse(req,res,target){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
 res.once('close',()=>controller.abort());
 try{
  const headers={};if(req.headers.range)headers.Range=req.headers.range;
  let current=target,remote;
  for(let i=0;i<4;i++){
   remote=await fetch(current,{headers,signal:controller.signal,redirect:'manual'});
   if(remote.status<300||remote.status>=400)break;
   if(![301,302,303,307,308].includes(remote.status))return reply(res,502,{error:'Unsupported HLS redirect'});
   const location=remote.headers.get('location');
   if(!location)return reply(res,502,{error:'Missing HLS redirect location'});
   try{current=relay.check(location,current);}catch{return reply(res,502,{error:'HLS CDN host not allowlisted'});}
   await remote.body?.cancel?.();
   if(i===3)return reply(res,502,{error:'Too many HLS redirects'});
  }
  if(!remote.ok&&remote.status!==206)return reply(res,502,{error:'Provider HLS HTTP '+remote.status});
  const contentType=remote.headers.get('content-type')||'';
  const manifest=/\.m3u8(?:$|[?#])/i.test(target.href)||/mpegurl/i.test(contentType);
  if(manifest){
   const len=Number(remote.headers.get('content-length')||0);
   if(len>MAX_MANIFEST)return reply(res,413,{error:'HLS manifest too large'});
   const reader=remote.body.getReader();let total=0,chunks=[];
   for(;;){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_MANIFEST){await reader.cancel();return reply(res,413,{error:'HLS manifest too large'});}chunks.push(Buffer.from(value));}
   const rewritten=relay.rewrite(Buffer.concat(chunks).toString('utf8'),current,new URL('http://localhost').origin);
   // Rewrite to relative URLs so the reverse proxy keeps its external HTTPS host.
   const output=rewritten.replaceAll('http://localhost/hls/','/hls/');
   res.setHeader('Content-Type','application/vnd.apple.mpegurl; charset=utf-8');res.statusCode=200;res.end(output);return;
  }
  res.statusCode=remote.status;
  for(const k of ['content-type','content-length','content-range','accept-ranges']){const v=remote.headers.get(k);if(v)res.setHeader(k,v);}
  if(!remote.headers.get('content-type'))res.setHeader('Content-Type','application/octet-stream');
  Readable.fromWeb(remote.body).pipe(res);
 }finally{clearTimeout(timeout);}
}
async function handler(req,res){res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');cors(req,res);
 if(req.method==='OPTIONS'){if(req.headers.origin!==origin)return reply(res,403,{error:'Origin denied'});res.statusCode=204;return res.end();}
 const url=new URL(req.url,'http://localhost');
 if(req.method==='GET'&&url.pathname==='/health')return reply(res,200,{status:'ready'});
 if(req.method==='POST'&&url.pathname==='/api'){if(!authorize(req))return reply(res,401,{error:'Unauthorized'});const data=await body(req);if(!allowedActions.has(data.action))return reply(res,400,{error:'Unsupported action'});const params={username,password,action:data.action};if(data.series_id!==undefined){if(!safeId(data.series_id))return reply(res,400,{error:'Invalid id'});params.series_id=data.series_id;}if(data.vod_id!==undefined){if(!safeId(data.vod_id))return reply(res,400,{error:'Invalid id'});params.vod_id=data.vod_id;}if(data.stream_id!==undefined){if(!safeId(data.stream_id))return reply(res,400,{error:'Invalid id'});params.stream_id=data.stream_id;}
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),90000);
 try{const remote=await fetch(upstreamURL('/player_api.php',params),{redirect:'error',signal:controller.signal});if(!remote.ok)return reply(res,502,{error:'Upstream HTTP '+remote.status});const length=Number(remote.headers.get('content-length')||0);if(length>MAX_CATALOG_BYTES)return reply(res,413,{error:'Catalog too large'});const reader=remote.body.getReader();let total=0,chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>MAX_CATALOG_BYTES){await reader.cancel();return reply(res,413,{error:'Catalog too large'});}chunks.push(Buffer.from(value));}res.statusCode=200;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(Buffer.concat(chunks));}finally{clearTimeout(timeout);}return;}
 if(req.method==='GET'&&url.pathname.startsWith('/hls/')){
  const match=url.pathname.match(/^\/hls\/([a-zA-Z0-9_-]{32,8192})$/);
  if(!match)return reply(res,400,{error:'Invalid HLS URL'});
  let target;try{target=relay.open(match[1]);}catch{return reply(res,401,{error:'Expired or invalid HLS URL'});}
  return hlsResponse(req,res,target);
 }
 if(req.method==='POST'&&url.pathname==='/ticket'){if(!authorize(req))return reply(res,401,{error:'Unauthorized'});const d=await body(req);if(!['live','movie','series'].includes(d.type)||!safeId(d.id)||!safeExt(d.ext))return reply(res,400,{error:'Invalid media'});const exp=Math.floor(Date.now()/1000)+14400;const path='/stream/'+d.type+'/'+d.id+'.'+d.ext;const signature=mac(path+'|'+exp);return reply(res,200,{url:path+'?exp='+exp+'&sig='+signature,expires:exp});}
 if(req.method==='GET'&&url.pathname.startsWith('/stream/')){const match=url.pathname.match(/^\/stream\/(live|movie|series)\/(\d{1,15})\.(m3u8|ts|mp4|mkv|avi|mov)$/);if(!match)return reply(res,400,{error:'Invalid media'});const exp=Number(url.searchParams.get('exp')),sig=url.searchParams.get('sig')||'';if(!Number.isSafeInteger(exp)||exp<Math.floor(Date.now()/1000)||exp>Math.floor(Date.now()/1000)+14400||!(/^[0-9a-f]{64}$/.test(sig))||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(mac(url.pathname+'|'+exp))))return reply(res,401,{error:'Expired media ticket'});
 const [,type,id,ext]=match;const path='/'+type+'/'+encodeURIComponent(username)+'/'+encodeURIComponent(password)+'/'+id+'.'+ext;if(ext==='m3u8')return hlsResponse(req,res,upstreamURL(path));const headers={};if(req.headers.range)headers.Range=req.headers.range;const remote=await fetch(upstreamURL(path),{headers,redirect:'error'});if(!remote.ok&&remote.status!==206)return reply(res,502,{error:'Stream unavailable'});res.statusCode=remote.status;for(const key of ['content-type','content-length','content-range','accept-ranges']){const value=remote.headers.get(key);if(value)res.setHeader(key,value);}Readable.fromWeb(remote.body).pipe(res);return;}
 reply(res,404,{error:'Not found'});
}
const server=http.createServer((req,res)=>handler(req,res).catch(()=>{if(!res.headersSent)reply(res,502,{error:'Bridge request failed'});else res.destroy();}));
if(require.main===module)server.listen(port,host,()=>console.log('MeviTV bridge listening on '+host+':'+port));
module.exports={handler,server,mac,safeExt,safeId};
