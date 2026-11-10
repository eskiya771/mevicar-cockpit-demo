'use strict';
// Self-contained, application-only updater. Never mounts docker.sock or overwrites .env.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const RUNTIME='/runtime',STATE=path.join(RUNTIME,'state.json');
const REPO='eskiya771/mevicar-cockpit-demo',FILES=['server.cjs','hls.cjs','remux.cjs'];
const isSha=s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
let checking=null,installing=false;
const base=()=>({installed:null,previous:null,latest:null,installed_build:null,latest_build:null,previous_build:null,installed_version:null,latest_version:null,previous_version:null,checked_at:null,checked_ms:0,state:'ready',message:''});
function read(){try{return {...base(),...JSON.parse(fs.readFileSync(STATE,'utf8'))};}catch{return base();}}
function save(s){fs.mkdirSync(RUNTIME,{recursive:true});const tmp=STATE+'.tmp-'+process.pid;fs.writeFileSync(tmp,JSON.stringify(s),{mode:0o600});fs.renameSync(tmp,STATE);}
function publicStatus(s){return {installed:s.installed,latest:s.latest,installed_build:s.installed_build,latest_build:s.latest_build,installed_version:s.installed_version,latest_version:s.latest_version,available:!!(isSha(s.latest)&&s.latest!==s.installed&&(!Number.isSafeInteger(s.installed_build)||s.latest_build>s.installed_build)),state:s.state,message:s.message};}
async function get(url,cap=400000){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{const resp=await fetch(url,{headers:{'User-Agent':'MeviTV-bridge-version/1','Accept':'application/vnd.github+json'},signal:controller.signal});
  if(!resp.ok)throw Error('GitHub HTTP '+resp.status);
  const length=Number(resp.headers.get('content-length')||0);if(length>cap)throw Error('GitHub response too large');
  const chunks=[];let total=0;for await(const c of resp.body){total+=c.length;if(total>cap)throw Error('GitHub response too large');chunks.push(Buffer.from(c));}
  return Buffer.concat(chunks);
 }finally{clearTimeout(timer);}
}
async function refresh(force=false){
 if(checking)return checking;
 const old=read();if(!force&&Date.now()-(Number(old.checked_ms)||0)<15000)return publicStatus(old);
 checking=(async()=>{
  const s=read();
  try{
   // GitHub Pages publishes a manifest only after deployment succeeds.
   // No GitHub REST API call: anonymous Synology addresses otherwise hit HTTP 403.
   const release=JSON.parse((await get('https://eskiya771.github.io/mevicar-cockpit-demo/proxy-release.json?t='+Date.now(),20000)).toString());
   const sha=release.sha;
   if(!isSha(sha)||!Number.isSafeInteger(release.build)||release.build<1||!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(release.version||''))throw Error('Invalid proxy release metadata');
   s.latest=sha;s.latest_build=release.build;s.latest_version=release.version;s.checked_ms=Date.now();s.checked_at=new Date().toISOString();
   if(s.state!=='installing'&&s.state!=='restarting')s.state='ready';
   s.message='';
  }catch(e){s.state='check_failed';s.message=String(e.message).slice(0,140);s.checked_ms=Date.now();s.checked_at=new Date().toISOString();}
  save(s);return publicStatus(s);
 })().finally(()=>{checking=null;});
 return checking;
}
async function apply(){
 if(installing)return {code:409,error:'Update already running'};
 const s=read();
 if(!isSha(s.latest)||s.latest===s.installed||!Number.isSafeInteger(s.latest_build)||s.latest_build<1||Number.isSafeInteger(s.installed_build)&&s.latest_build<=s.installed_build)return {code:409,error:'No new checked release'};
 if(s.state==='check_failed'||Date.now()-(Number(s.checked_ms)||0)>120000)return {code:409,error:'Version check is stale; refresh first'};
 installing=true;
 const target=s.latest,build=s.latest_build,release=path.join(RUNTIME,'releases',target),stage=release+'.partial-'+process.pid;
 try{
  fs.mkdirSync(path.dirname(release),{recursive:true});
  fs.mkdirSync(stage,{recursive:true});
  for(const file of FILES){
   const data=await get('https://raw.githubusercontent.com/'+REPO+'/'+target+'/bridge/'+file,300000);
   if(!data.length)throw Error('Empty update file '+file);
   fs.writeFileSync(path.join(stage,file),data,{mode:0o600});
   execFileSync(process.execPath,['--check',path.join(stage,file)],{timeout:5000,stdio:'pipe'});
  }
  // Pin all 3 files to the same immutable GitHub revision before activation.
  if(!fs.existsSync(release))fs.renameSync(stage,release);
  else fs.rmSync(stage,{recursive:true,force:true});
  const current=read();
  current.previous=isSha(current.installed)?current.installed:null;
  current.previous_build=current.installed_build;current.previous_version=current.installed_version;
  current.installed=target;current.installed_build=build;current.installed_version=current.latest_version;current.state='restarting';current.message='Installing application files; container restarting';
  save(current);
  // Send success before intentionally terminating the container's main child.
  setTimeout(()=>process.exit(78),750).unref();
  return {code:202,state:'restarting',target};
 }catch(e){fs.rmSync(stage,{recursive:true,force:true});const state=read();state.state='update_failed';state.message=String(e.message).slice(0,160);save(state);return {code:503,error:state.message};}
 finally{installing=false;}
}
module.exports={refresh,apply,readStatus:()=>publicStatus(read())};
