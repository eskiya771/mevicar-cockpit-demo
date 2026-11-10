/* MeviTV Xtream: session-only credentials. Provider must support HTTPS and browser CORS. */
(function(global){
'use strict';
const MAX_CATALOG_BYTES=64*1024*1024;
function origin(value){try{const u=new URL(String(value).trim());if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)return null;return u.origin;}catch{return null;}}
function credentials(base,user,password){const host=origin(base),u=String(user||'').trim(),p=String(password||'');if(!host||!u||!p||u.length>180||p.length>180||/[\/\\?#&]/.test(u)||/[\/\\?#&]/.test(p))throw Error('HTTPS-Server und gültige Zugangsdaten erforderlich.');return {host,user:u,password:p};}
const FIXED_BRIDGE='https://mevitv.mtankurt.synology.me';
async function pinCredentials(pin){
 if(!/^\d{4}$/.test(String(pin||'')))throw Error('Bitte einen vierstelligen Zugangscode eingeben.');
 const response=await fetch(FIXED_BRIDGE+'/session',{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:String(pin)})});
 if(!response.ok){let error='HTTP '+response.status;try{const data=await response.json();if(data.error)error=String(data.error);}catch{}throw Error(error);}
 const data=await response.json();
 if(typeof data.session!=='string'||!data.session.includes('.'))throw Error('Ungültige Bridge-Sitzung.');
 return {host:FIXED_BRIDGE,token:data.session,bridge:true};
}
function bridgeCredentials(base,accessToken){const host=origin(base),token=String(accessToken||'').trim();if(!host||token.length<32)throw Error('HTTPS-Bridge und Zugangs-Token (mindestens 32 Zeichen) erforderlich.');return {host,token,bridge:true};}
function apiURL(c,action,extra={}){if(c.bridge){const url=new URL('/api',c.host);url.searchParams.set('action',action);for(const [k,v] of Object.entries(extra))url.searchParams.set(k,String(v));return url.href;}const url=new URL('/player_api.php',c.host);url.searchParams.set('username',c.user);url.searchParams.set('password',c.password);if(action)url.searchParams.set('action',action);for(const [k,v] of Object.entries(extra))url.searchParams.set(k,String(v));return url.href;}
function mediaURL(c,type,id,ext){if(!['live','movie','series'].includes(type)||!/^\d+$/.test(String(id)))throw Error('Ungültige Medien-ID');const e=String(ext|| (type==='live'?'m3u8':'mp4')).replace(/^\./,'').toLowerCase();if(!/^[a-z0-9]{2,5}$/.test(e))throw Error('Ungültiges Medienformat');return c.host+'/'+type+'/'+encodeURIComponent(c.user)+'/'+encodeURIComponent(c.password)+'/'+id+'.'+e;}
function normalizeCategories(raw){return (Array.isArray(raw)?raw:[]).slice(0,3000).map(x=>({id:String(x.category_id||''),name:String(x.category_name||'Andere').slice(0,100)})).filter(x=>x.id);}
function normalizeItems(raw,type){return (Array.isArray(raw)?raw:[]).slice(0,15000).map(x=>({id:String(type==='series'?x.series_id:x.stream_id||''),name:String(x.name||x.title||'Ohne Titel').slice(0,140),category:String(x.category_id||''),poster:String(x.stream_icon||x.cover||'').slice(0,1000),extension:String(x.container_extension|| (type==='live'?'m3u8':'mp4')),rating:String(x.rating||''),plot:String(x.plot||'').slice(0,900)})).filter(x=>/^\d+$/.test(x.id));}
async function readJSON(url,c,{signal,timeoutMs=90000}={}){const controller=new AbortController(),abort=()=>controller.abort(),t=setTimeout(abort,timeoutMs);if(signal?.aborted)abort();signal?.addEventListener("abort",abort,{once:true});try{const bridge=!!c?.bridge;const dest=bridge?new URL(url):null;const params=bridge?Object.fromEntries(dest.searchParams.entries()):null;const res=await fetch(bridge?c.host+'/api':url,{method:bridge?'POST':'GET',headers:bridge?{'Authorization':'Bearer '+c.token,'Content-Type':'application/json'}:{},body:bridge?JSON.stringify(params):undefined,signal:controller.signal,credentials:'omit',cache:'no-store'});if(!res.ok)throw Error('HTTP '+res.status);const len=Number(res.headers.get('content-length')||0);if(len>MAX_CATALOG_BYTES)throw Error('Katalog größer als 64 MiB');const reader=res.body?.getReader();if(!reader){const content=await res.text();if(content.length>MAX_CATALOG_BYTES)throw Error('Katalog größer als 64 MiB');return JSON.parse(content);}let size=0,parts=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_CATALOG_BYTES){await reader.cancel();throw Error('Katalog größer als 64 MiB');}parts.push(value);}const all=new Uint8Array(size);let offset=0;for(const p of parts){all.set(p,offset);offset+=p.length;}return JSON.parse(new TextDecoder().decode(all));}finally{clearTimeout(t);signal?.removeEventListener("abort",abort);}}
// Xtream EPG uses base64 UTF-8 text and Unix timestamps. Do not interpret
// timezone-less provider dates in the viewer's timezone.
function epgText(value,max=4000){
 const text=String(value??'').trim().slice(0,12000);
 if(text&&text.length%4!==1&&/^[A-Za-z0-9+/]+={0,2}$/.test(text)){
  try{const bytes=Uint8Array.from(atob(text),c=>c.charCodeAt(0));const decoded=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(decoded))return decoded.slice(0,max);}catch{}
 }
 return text.slice(0,max);
}
function epgTime(value,date){
 const n=Number(value);if(Number.isFinite(n)&&n>0){const ms=n<1e12?n*1000:n;return Number.isFinite(new Date(ms).getTime())?ms:null;}
 if(typeof date==='string'&&/(?:Z|[+-]\d{2}:?\d{2})$/i.test(date)){const ms=Date.parse(date);if(Number.isFinite(ms))return ms;}
 return null;
}
function epgRows(raw){
 const value=Array.isArray(raw)?raw:raw?.epg_listings??raw?.data?.epg_listings;
 if(Array.isArray(value))return value;
 if(value&&typeof value==='object')return Object.values(value);
 return [];
}
function providerDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(value)?value:null;}
function normalizeEPG(raw){
 const rows=epgRows(raw),seen=new Set(),items=[];
 for(const x of rows.slice(0,200)){
  if(!x||typeof x!=='object'||(!x.title&&!x.name))continue;
  const entry={title:epgText(x.title??x.name,300)||'Sendung ohne Titel',description:epgText(x.description),
   start:epgTime(x.start_timestamp,x.start)??epgTime(x.start,x.start),
   end:epgTime(x.stop_timestamp,x.end)??epgTime(x.end_timestamp,x.end)??epgTime(x.end??x.stop,x.end??x.stop)};
  if(entry.start===null||entry.end===null){
   const start=providerDate(x.start),end=providerDate(x.end??x.stop);
   if(!start||!end||end<=start)continue;
   // Preserve provider wall-clock times visibly, without claiming a timezone
   // conversion or guessing which programme is currently on air.
   entry.start=null;entry.end=null;entry.providerStart=start;entry.providerEnd=end;
  }else if(entry.end<=entry.start)continue;
  const key=(entry.start??entry.providerStart)+'|'+(entry.end??entry.providerEnd)+'|'+entry.title;
  if(seen.has(key))continue;seen.add(key);items.push(entry);
 }
 items.sort((a,b)=>a.start!==null&&b.start!==null?a.start-b.start:String(a.providerStart??'').localeCompare(String(b.providerStart??'')));
 Object.defineProperty(items,'diagnostics',{value:{format:Array.isArray(raw)||raw?.epg_listings!==undefined||raw?.data?.epg_listings!==undefined?'list':'unrecognized',received:rows.length,usable:items.length,providerTimes:items.filter(x=>x.start===null).length},configurable:true});
 return items;
}
const epgCache=new WeakMap();
async function epg(account,id,{signal,force=false}={}){
 if(!account||!/^\d{1,15}$/.test(String(id)))throw Error('Ungültiger EPG-Sender');
 if(signal?.aborted)throw new DOMException('Abgebrochen','AbortError');
 let cache=epgCache.get(account);if(!cache){cache=new Map();epgCache.set(account,cache);}
 const key=String(id),saved=cache.get(key);
 if(!force&&saved&&saved.until>Date.now())return saved.items;
 let items=[],diagnostics={received:0,usable:0,providerTimes:0,source:'get_short_epg'};
 try{
  const raw=await readJSON(apiURL(account.credentials,'get_short_epg',{stream_id:key,limit:12}),account.credentials,{signal,timeoutMs:12000});
  items=normalizeEPG(raw);Object.assign(diagnostics,items.diagnostics);
 }catch(e){if(signal?.aborted)throw e;diagnostics.shortError=/HTTP \d+/.exec(e.message)?.[0]||'Abruf fehlgeschlagen';}
 if(!items.some(x=>x.end===null||x.end>Date.now())){
  try{
   const raw=await readJSON(apiURL(account.credentials,'get_simple_data_table',{stream_id:key}),account.credentials,{signal,timeoutMs:12000});
   const full=normalizeEPG(raw);
   diagnostics.fullReceived=full.diagnostics.received;
   if(full.length){items=full;Object.assign(diagnostics,full.diagnostics,{source:'get_simple_data_table'});}
  }catch(e){if(signal?.aborted)throw e;diagnostics.fullError=/HTTP \d+/.exec(e.message)?.[0]||'Abruf fehlgeschlagen';}
 }
 Object.defineProperty(items,'diagnostics',{value:diagnostics,configurable:true});
 cache.delete(key);cache.set(key,{items,until:Date.now()+120000});
 if(cache.size>30)cache.delete(cache.keys().next().value);
 return items;
}

const state={accounts:[],active:null,kind:'live',group:'ALL',query:'',busy:false};
const kindActions={live:['get_live_categories','get_live_streams'],movie:['get_vod_categories','get_vod_streams'],series:['get_series_categories','get_series']};
const api={origin,credentials,bridgeCredentials,pinCredentials,FIXED_BRIDGE,apiURL,mediaURL,normalizeCategories,normalizeItems,state};
async function connect(name,c,onProgress){if(state.busy)throw Error('Import läuft bereits');state.busy=true;const a={id:'xt-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),name:String(name||'Xtream').slice(0,80),credentials:c,categories:{},items:{},episodes:{}};try{
 for(const kind of ['live','movie','series']){const [catAct,itemAct]=kindActions[kind];onProgress?.('Lade '+kind+' Kategorien …');a.categories[kind]=normalizeCategories(await readJSON(apiURL(c,catAct),c));onProgress?.('Lade '+kind+' Katalog …');a.items[kind]=normalizeItems(await readJSON(apiURL(c,itemAct),c),kind);onProgress?.(kind+': '+a.items[kind].length+' Einträge');}
 state.accounts.push(a);state.active=a.id;return a;
}finally{state.busy=false;}}
function active(){return state.accounts.find(x=>x.id===state.active)||null;}
function remove(id){state.accounts=state.accounts.filter(x=>x.id!==id);if(state.active===id)state.active=state.accounts[0]?.id||null;}
function view(kind=state.kind,group=state.group,q=state.query){const a=active();if(!a)return[];const needle=q.toLocaleLowerCase('de');return(a.items[kind]||[]).filter(x=>(group==='ALL'||x.category===group)&&x.name.toLocaleLowerCase('de').includes(needle)).slice(0,500);}
async function episodes(a,item){if(!a||!item)return[];if(a.episodes[item.id])return a.episodes[item.id];const info=await readJSON(apiURL(a.credentials,'get_series_info',{series_id:item.id}),a.credentials);const result=[];for(const [season,episodes] of Object.entries(info.episodes||{})){if(!Array.isArray(episodes))continue;for(const ep of episodes.slice(0,100)){if(!/^\d+$/.test(String(ep.id)))continue;result.push({id:String(ep.id),season,number:String(ep.episode_num||''),name:String(ep.title||ep.name||'Folge').slice(0,140),extension:String(ep.container_extension||'mp4')});}}a.episodes[item.id]=result.slice(0,2000);return a.episodes[item.id];}
async function playbackURL(c,type,id,ext,transport='default'){if(!c.bridge)return mediaURL(c,type,id,ext);const res=await fetch(c.host+'/ticket',{method:'POST',credentials:'omit',headers:{'Authorization':'Bearer '+c.token,'Content-Type':'application/json'},body:JSON.stringify({type,id,ext,transport:['raw','hls'].includes(transport)?transport:'default'})});if(!res.ok)throw Error('Medienzugriff fehlgeschlagen (HTTP '+res.status+')');const data=await res.json();if(typeof data.url!=='string'||!/^\/(?:stream\/(?:live|movie|series)\/\d{1,15}\.(?:m3u8|ts|mp4|mkv|avi|mov)|remux\/live\/\d{1,15}\/index\.m3u8|vodhls\/(?:movie|series)\/\d{1,15}\.(?:mkv|avi)\/index\.m3u8)\?exp=\d+&sig=[0-9a-f]{64}$/.test(data.url))throw Error('Ungültige Wiedergabeadresse');return c.host+data.url;}
Object.assign(api,{connect,active,remove,view,episodes,playbackURL,epg,normalizeEPG});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
global.meviXtream=api;
})(typeof window==='undefined'?globalThis:window);
