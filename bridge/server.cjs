// MeviTV self-hosted HTTPS bridge. Configure one trusted IPTV account via environment.
// Run behind an HTTPS reverse proxy (e.g. Synology). Never expose this service without TLS.
'use strict';
const http=require('node:http');
const crypto=require('node:crypto');
const {Readable}=require('node:stream');
const fs=require('node:fs');
const remux=require('./remux.cjs');
const {createRelay,MAX_MANIFEST}=require('./hls.cjs');
const upstream=process.env.XTREAM_UPSTREAM||'';
const username=process.env.XTREAM_USER||'';
const password=process.env.XTREAM_PASSWORD||'';
const token=process.env.MEVITV_BRIDGE_TOKEN||'';
const accessPin=process.env.MEVITV_PIN||'';
const origin=process.env.MEVITV_ORIGIN||'';
const port=Number(process.env.PORT||8787);
const host=process.env.HOST||'127.0.0.1';
const MAX_CATALOG_BYTES=64*1024*1024;
const allowedActions=new Set(['get_live_categories','get_live_streams','get_vod_categories','get_vod_streams','get_series_categories','get_series','get_series_info','get_vod_info','get_short_epg','get_simple_data_table']);
const safeId=id=>/^\d{1,15}$/.test(String(id));
const safeExt=ext=>/^(m3u8|ts|mp4|mkv|avi|mov)$/.test(String(ext));
const vodRedirectHosts=new Set((process.env.MEVITV_VOD_REDIRECT_HOSTS||'').split(',').map(s=>s.trim().toLowerCase()).filter(s=>/^[a-z0-9.-]+$/.test(s)));
function checkedMediaRedirect(location,previous){
 if(!location)throw Error('MISSING_LOCATION');
 let next;
 try{next=new URL(location,previous);}catch{throw Error('BAD_LOCATION');}
 if(!['http:','https:'].includes(next.protocol)||next.username||next.password||next.hash)throw Error('UNSAFE_URL');
 // Only the configured provider and explicitly trusted CDN hostnames are permitted.
 // Never follow redirects to untrusted or private destinations via arbitrary URLs.
 const sameProvider=next.hostname.toLowerCase()===base.hostname.toLowerCase()&&next.port===base.port;
 if(!sameProvider&&!vodRedirectHosts.has(next.hostname.toLowerCase()))throw Error('CDN_HOST_NOT_ALLOWED:'+next.hostname.toLowerCase());
 return next;
}

function provider(){const u=new URL(upstream);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('Invalid upstream');if(!username||!password||token.length<32||!origin.startsWith('https://'))throw Error('Missing secure environment');return u;}
const base=provider(),secret=crypto.createHmac('sha256',token).update('mevitv-playback-v1').digest();
const relay=createRelay(secret,base.origin);
const loginFailures=[];
const LOGIN_WINDOW=15*60*1000,LOGIN_MAX_FAILURES=5,SESSION_SECONDS=2*60*60;
function mac(value){return crypto.createHmac('sha256',secret).update(value).digest('hex');}
function validToken(value){const a=Buffer.from(value||''),b=Buffer.from(token);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
function cors(req,res){if(req.headers.origin===origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type, Range');res.setHeader('Access-Control-Expose-Headers','Content-Range, Accept-Ranges, Content-Length, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, HEAD, POST, OPTIONS');}}
function reply(res,code,data){res.statusCode=code;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));}
async function body(req){let total=0,chunks=[];for await(const p of req){total+=p.length;if(total>4096)throw Error('Request too large');chunks.push(p);}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}
function upstreamURL(path,params={}){const u=new URL(path,base.origin);for(const[k,v]of Object.entries(params))u.searchParams.set(k,String(v));return u;}
function sessionSignature(payload){return crypto.createHmac('sha256',secret).update('mevitv-session-v1|'+payload).digest('base64url');}
function issueSession(){const payload=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+SESSION_SECONDS,nonce:crypto.randomBytes(16).toString('hex')})).toString('base64url');return payload+'.'+sessionSignature(payload);}
function validateSession(value){
 if(typeof value!=='string'||value.length>1024)return false;
 const parts=value.split('.');if(parts.length!==2||!/^[a-zA-Z0-9_-]+$/.test(parts[0])||!/^[a-zA-Z0-9_-]+$/.test(parts[1]))return false;
 const expected=Buffer.from(sessionSignature(parts[0]));const actual=Buffer.from(parts[1]);if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))return false;
 try{const data=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));const now=Math.floor(Date.now()/1000);return Number.isSafeInteger(data.exp)&&data.exp>now&&data.exp<=now+SESSION_SECONDS;}catch{return false;}
}
function authorize(req){const bearer=(req.headers.authorization||'').replace(/^Bearer /i,'');return validToken(bearer)||validateSession(bearer);}
function validPin(value){if(typeof value!=='string'||!/^\d{4}$/.test(value)||!/^\d{4}$/.test(accessPin))return false;const a=Buffer.from(value),b=Buffer.from(accessPin);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
function pinAllowed(){const since=Date.now()-LOGIN_WINDOW;while(loginFailures.length&&loginFailures[0]<since)loginFailures.shift();return loginFailures.length<LOGIN_MAX_FAILURES;}
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
// Rolling media egress: bytes written by Node to the HTTP response, not ISP uplink capacity.
const mediaEgress=new Map();
let activeMediaResponses=0;
function mediaBytes(n){if(!n)return;const second=Math.floor(Date.now()/1000);mediaEgress.set(second,(mediaEgress.get(second)||0)+n);for(const key of mediaEgress.keys())if(key<second-60)mediaEgress.delete(key);}
function mediaMetrics(){const now=Math.floor(Date.now()/1000);let bytes10=0,bytes60=0,peak=0;for(const [second,bytes] of mediaEgress){if(second>now-10)bytes10+=bytes;if(second>now-60)bytes60+=bytes;if(second>now-10)peak=Math.max(peak,bytes*8/1000000);}return {window_seconds:10,mbps:Number((bytes10*8/10000000).toFixed(2)),mbps_60s:Number((bytes60*8/60000000).toFixed(2)),peak_mbps:Number(peak.toFixed(2)),active_stream_requests:activeMediaResponses,scope:'bridge_media_egress_all_clients',note:'Bytes written by bridge HTTP server; not measured ISP uplink capacity'};}
function trackMediaResponse(res){activeMediaResponses++;let closed=false;res.once('close',()=>{if(!closed){closed=true;activeMediaResponses=Math.max(0,activeMediaResponses-1);}});const write=res.write.bind(res),end=res.end.bind(res);res.write=function(chunk,...args){if(chunk)mediaBytes(Buffer.byteLength(chunk));return write(chunk,...args);};res.end=function(chunk,...args){if(chunk)mediaBytes(Buffer.byteLength(chunk));return end(chunk,...args);};}
// Bounded, credential-free diagnostic telemetry for MKV seek Range requests.
// Header TTFB and first payload-byte latency are measured separately.
const mkvRanges=[];let mkvRangeSeq=0;
function mkvRangeStart(req,id){
 const value=String(req.headers.range||'').match(/^bytes=(\\d+)-(\\d*)$/i);
 const item={seq:++mkvRangeSeq,id,range:value?value[1]+'-'+(value[2]||''):req.headers.range?'other':'none',at:Date.now(),redirects:0,status:0,header_ms:null,first_byte_ms:null,duration_ms:null,bytes:0,state:'opening'};
 mkvRanges.push(item);if(mkvRanges.length>100)mkvRanges.shift();
 return item;
}
function mkvRangeSnapshot(id){
 const now=Date.now();
 return mkvRanges.filter(x=>x.id===id&&now-x.at<120000).slice(-45).map(x=>({
  seq:x.seq,at:x.at,range:x.range,redirects:x.redirects,status:x.status,
  header_ms:x.header_ms,first_byte_ms:x.first_byte_ms,duration_ms:x.duration_ms,
  bytes:x.bytes,state:x.state
 }));
}
// Immutable updater controller in the container image; downloads only JS releases to /runtime.
const proxyUpdater=require(fs.existsSync('/app/self-update.cjs')?'/app/self-update.cjs':'./self-update.cjs');
async function handler(req,res){res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');cors(req,res);
 if(req.method==='OPTIONS'){if(req.headers.origin!==origin)return reply(res,403,{error:'Origin denied'});res.statusCode=204;return res.end();}
 const url=new URL(req.url,'http://localhost');
 if(req.method==='GET'&&url.pathname==='/update/status'){
  if(!authorize(req))return reply(res,401,{error:'Unauthorized'});
  return reply(res,200,await proxyUpdater.refresh(url.searchParams.get('force')==='1'));
 }
 if(req.method==='POST'&&url.pathname==='/update/apply'){
  // Unlike playback tickets, update commands require a matching browser Origin.
  if(req.headers.origin!==origin)return reply(res,403,{error:'Origin denied'});
  if(!authorize(req))return reply(res,401,{error:'Unauthorized'});
  const result=await proxyUpdater.apply();return reply(res,result.code,result);
 }
 if(req.method==='POST'&&url.pathname==='/update/rollback'){
  if(req.headers.origin!==origin)return reply(res,403,{error:'Origin denied'});
  if(!authorize(req))return reply(res,401,{error:'Unauthorized'});
  if(typeof proxyUpdater.rollback!=='function')return reply(res,503,{error:'Updater requires a one-time Docker rebuild'});
  const result=await proxyUpdater.rollback();return reply(res,result.code,result);
 }
 if(req.method==='GET'&&url.pathname==='/metrics'){if(!authorize(req))return reply(res,401,{error:'Unauthorized'});return reply(res,200,mediaMetrics());}
 if(req.method==='GET'&&url.pathname==='/diagnostics/mkv-ranges'){if(!authorize(req))return reply(res,401,{error:'Unauthorized'});const id=url.searchParams.get('id')||'';if(!safeId(id))return reply(res,400,{error:'Invalid media'});return reply(res,200,{requests:mkvRangeSnapshot(id)});}
 if(req.method==='GET'&&/^\/(stream|hls|remux)\//.test(url.pathname))trackMediaResponse(res);
 if(req.method==='GET'&&url.pathname==='/health')return reply(res,200,{status:'ready'});
 if(req.method==='POST'&&url.pathname==='/session'){
  // Require browser Origin, no PIN embedded in public PWA. Single global limiter
  // prevents trivial per-IP bypass even if behind a reverse proxy.
  if(req.headers.origin!==origin)return reply(res,403,{error:'Origin denied'});
  if(!/^\d{4}$/.test(accessPin))return reply(res,503,{error:'PIN login not configured on NAS'});
  if(!pinAllowed()){res.setHeader('Retry-After','900');return reply(res,429,{error:'Too many PIN attempts. Retry later.'});}
  const data=await body(req);
  if(!validPin(data.pin)){loginFailures.push(Date.now());return reply(res,401,{error:'PIN incorrect'});}
  loginFailures.length=0;
  return reply(res,200,{session:issueSession(),expires_in:SESSION_SECONDS});
 }
 if(req.method==='POST'&&url.pathname==='/api'){if(!authorize(req))return reply(res,401,{error:'Unauthorized'});const data=await body(req);if(!allowedActions.has(data.action))return reply(res,400,{error:'Unsupported action'});const params={username,password,action:data.action};if(data.series_id!==undefined){if(!safeId(data.series_id))return reply(res,400,{error:'Invalid id'});params.series_id=data.series_id;}if(data.vod_id!==undefined){if(!safeId(data.vod_id))return reply(res,400,{error:'Invalid id'});params.vod_id=data.vod_id;}if(data.stream_id!==undefined){if(!safeId(data.stream_id))return reply(res,400,{error:'Invalid id'});params.stream_id=data.stream_id;}if(data.action==='get_short_epg'){const limit=Number(data.limit??12);if(!Number.isInteger(limit)||limit<1||limit>50)return reply(res,400,{error:'Invalid EPG limit'});params.limit=limit;}
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),90000);
 try{const remote=await fetch(upstreamURL('/player_api.php',params),{redirect:'error',signal:controller.signal});if(!remote.ok)return reply(res,502,{error:'Upstream HTTP '+remote.status});const length=Number(remote.headers.get('content-length')||0);if(length>MAX_CATALOG_BYTES)return reply(res,413,{error:'Catalog too large'});const reader=remote.body.getReader();let total=0,chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>MAX_CATALOG_BYTES){await reader.cancel();return reply(res,413,{error:'Catalog too large'});}chunks.push(Buffer.from(value));}res.statusCode=200;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(Buffer.concat(chunks));}finally{clearTimeout(timeout);}return;}
 if(req.method==='GET'&&url.pathname.startsWith('/hls/')){
  const match=url.pathname.match(/^\/hls\/([a-zA-Z0-9_-]{32,8192})$/);
  if(!match)return reply(res,400,{error:'Invalid HLS URL'});
  let target;try{target=relay.open(match[1]);}catch{return reply(res,401,{error:'Expired or invalid HLS URL'});}
  return hlsResponse(req,res,target);
 }
 if(req.method==='GET'&&url.pathname.startsWith('/remux/')){
  const m=url.pathname.match(/^\/remux\/live\/(\d{1,15})\/(index\.m3u8|seg\d{5,9}\.ts)$/);
  if(!m)return reply(res,404,{error:'Remux resource not found'});
  const [,id,name]=m,exp=Number(url.searchParams.get('exp')),sig=url.searchParams.get('sig')||'';
  const now=Math.floor(Date.now()/1000);
  if(!Number.isSafeInteger(exp)||exp<now||exp>now+14400||!/^[a-f0-9]{64}$/.test(sig)||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(mac('/remux/live/'+id+'|'+exp))))return reply(res,401,{error:'Invalid remux ticket'});
  let item;
  try{
   if(name==='index.m3u8'){
    const src=upstreamURL('/live/'+encodeURIComponent(username)+'/'+encodeURIComponent(password)+'/'+id+'.ts');
    item=remux.start(id,src.href);
    await remux.ready(item);
    const text=remux.playlist(item,exp,sig);
    res.setHeader('Content-Type','application/vnd.apple.mpegurl; charset=utf-8');
    res.end(text);return;
   }
   // Segment endpoint cannot start FFmpeg by itself.
   const sessionPath='/tmp/mevitv-remux/'+id+'/'+name;
   if(!fs.existsSync(sessionPath))return reply(res,404,{error:'HLS segment expired'});
   const stat=fs.statSync(sessionPath);
   res.setHeader('Content-Type','video/mp2t');
   res.setHeader('Content-Length',stat.size);
   fs.createReadStream(sessionPath).pipe(res);return;
  }catch(e){return reply(res,503,{error:'Remux unavailable: '+String(e.message).slice(0,100)});}
 }
 if(req.method==='POST'&&url.pathname==='/ticket'){if(!authorize(req))return reply(res,401,{error:'Unauthorized'});const d=await body(req);if(!['live','movie','series'].includes(d.type)||!safeId(d.id)||!safeExt(d.ext))return reply(res,400,{error:'Invalid media'});const exp=Math.floor(Date.now()/1000)+14400;const path=d.type==='live'&&d.ext==='ts'&&d.transport!=='raw'?'/remux/live/'+d.id+'/index.m3u8':'/stream/'+d.type+'/'+d.id+'.'+d.ext;const signPath=path.startsWith('/remux/')?'/remux/live/'+d.id:path;const signature=mac(signPath+'|'+exp);return reply(res,200,{url:path+'?exp='+exp+'&sig='+signature,expires:exp});}
 if((req.method==='GET'||req.method==='HEAD')&&url.pathname.startsWith('/stream/')){
  const match=url.pathname.match(/^\/stream\/(live|movie|series)\/(\d{1,15})\.(m3u8|ts|mp4|mkv|avi|mov)$/);
  if(!match)return reply(res,400,{error:'Invalid media'});
  const exp=Number(url.searchParams.get('exp')),sig=url.searchParams.get('sig')||'',now=Math.floor(Date.now()/1000);
  if(!Number.isSafeInteger(exp)||exp<now||exp>now+14400||!/^[0-9a-f]{64}$/.test(sig)||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(mac(url.pathname+'|'+exp))))return reply(res,401,{error:'Expired media ticket'});
  const [,type,id,ext]=match,path='/'+type+'/'+encodeURIComponent(username)+'/'+encodeURIComponent(password)+'/'+id+'.'+ext;
  if(ext==='m3u8'&&req.method==='GET')return hlsResponse(req,res,upstreamURL(path));
  const headers={};if(req.headers.range)headers.Range=req.headers.range;
  const trace=req.method==='GET'&&ext==='mkv'&&type!=='live'?mkvRangeStart(req,id):null;
  const controller=new AbortController();
  res.once('close',()=>{
   controller.abort();
   if(trace&&trace.duration_ms===null){trace.duration_ms=Date.now()-trace.at;trace.state=res.writableFinished?'complete':'aborted';}
  });
  let remote,current=upstreamURL(path),redirects=0;
  try{
   for(;;){
    remote=await fetch(current,{method:req.method,headers,redirect:'manual',signal:controller.signal});
    if(trace){trace.redirects=redirects;trace.status=remote.status;trace.header_ms=Date.now()-trace.at;}
    if(![301,302,303,307,308].includes(remote.status))break;
    if(++redirects>5){await remote.body?.cancel?.();return reply(res,502,{error:'Zu viele Medienserver-Weiterleitungen'});}
    const location=remote.headers.get('location');
    let next;
    try{next=checkedMediaRedirect(location,current);}
    catch(e){
     await remote.body?.cancel?.();
     const message=String(e.message);
     const host=message.startsWith('CDN_HOST_NOT_ALLOWED:')?message.slice('CDN_HOST_NOT_ALLOWED:'.length):null;
     console.warn('[MeviTV VOD] Blocked redirect',host?'host:'+host:message,'type:',type,'extension:',ext);
     return reply(res,502,{error:host?'Medienserver '+host+' ist nicht freigegeben. In MEVITV_VOD_REDIRECT_HOSTS eintragen.':'Unsichere Medienserver-Weiterleitung ('+message+')'});
    }
    await remote.body?.cancel?.();
    current=next;
   }
   if(redirects)console.info('[MeviTV VOD] Followed',redirects,'approved redirect(s)','type:',type,'extension:',ext);
  }catch(e){
   const cause=e?.cause?.code||e?.code||'NETWORK_ERROR';
   const category=/^[A-Z0-9_]{2,48}$/.test(String(cause))?String(cause):'NETWORK_ERROR';
   console.warn('[MeviTV VOD] Media upstream connection failed:',category,'type:',type,'extension:',ext);
   return reply(res,502,{error:'Provider-Verbindung fehlgeschlagen ('+category+')'});
  }
  if(!remote.ok&&remote.status!==206){
   await remote.body?.cancel?.();
   // Never expose provider URLs, authentication, or raw upstream response.
   const code=remote.status;
   console.warn('[MeviTV VOD] Provider media HTTP',code,'type:',type,'extension:',ext);
   return reply(res,502,{error:'Provider media HTTP '+code});
  }
  res.statusCode=remote.status;
  if(trace){trace.status=remote.status;trace.redirects=redirects;trace.header_ms=Date.now()-trace.at;trace.state='streaming';}
  for(const key of ['content-type','content-length','content-range','accept-ranges']){const value=remote.headers.get(key);if(value)res.setHeader(key,value);}
  const knownType={mp4:'video/mp4',mov:'video/quicktime',mkv:'video/x-matroska',avi:'video/x-msvideo',ts:'video/mp2t'};
  const mime=res.getHeader('content-type');
  if(!mime||/^(?:application\/octet-stream|binary\/octet-stream)(?:\s*;|$)/i.test(String(mime)))res.setHeader('Content-Type',knownType[ext]||'application/octet-stream');
  if(req.method==='HEAD'){await remote.body?.cancel?.();return res.end();}
  if(!remote.body)return res.end();
  const source=Readable.fromWeb(remote.body);
  source.on('data',chunk=>{if(trace){if(trace.first_byte_ms===null)trace.first_byte_ms=Date.now()-trace.at;trace.bytes+=chunk.length;}});
  source.on('error',()=>{if(trace)trace.state='upstream_error';if(!res.destroyed)res.destroy();});
  source.pipe(res);return;
 }
 reply(res,404,{error:'Not found'});
}
const server=http.createServer((req,res)=>handler(req,res).catch(()=>{if(!res.headersSent)reply(res,502,{error:'Bridge request failed'});else res.destroy();}));
if(require.main===module)server.listen(port,host,()=>console.log('MeviTV bridge listening on '+host+':'+port));
module.exports={handler,server,mac,safeExt,safeId};
