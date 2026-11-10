'use strict';
// On-demand TS -> HLS remux. Does not transcode video/audio; one FFmpeg job per active station.
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const ROOT='/tmp/mevitv-remux';
const MAX_ACTIVE=2;
const IDLE_MS=90000;
const START_TIMEOUT_MS=20000;
const sessions=new Map();
const safeId=id=>/^\d{1,15}$/.test(String(id));
const safeSegment=name=>/^seg\d{5,9}\.ts$/.test(name);
function countActive(){return sessions.size;}
function leastRecentlyUsed(map){let candidate=null;for(const [id,item] of map){if(!candidate||item.used<candidate.used)candidate={id,used:item.used};}return candidate?.id??null;}
function cleanup(id){const item=sessions.get(id);if(!item)return;sessions.delete(id);if(item.proc&&!item.proc.killed)item.proc.kill('SIGTERM');fs.rmSync(item.dir,{recursive:true,force:true});}
function sweep(){for(const [id,session] of sessions)if(Date.now()-session.used>IDLE_MS)cleanup(id);}
const timer=setInterval(sweep,15000);timer.unref();
function start(id,input){
 if(!safeId(id))throw Error('Invalid stream ID');
 let item=sessions.get(id);
 if(item&&!item.exited){item.used=Date.now();return item;}
 if(item)cleanup(id);
 if(sessions.size>=MAX_ACTIVE){const victim=leastRecentlyUsed(sessions);if(victim!==null)cleanup(victim);}
 fs.mkdirSync(ROOT,{recursive:true,mode:0o700});
 const dir=path.join(ROOT,String(id));fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const args=[
  '-hide_banner','-nostdin','-loglevel','error','-y',
  '-rw_timeout','10000000','-i',input,
  '-map','0:v:0?','-map','0:a:0?',
  '-c','copy','-f','hls','-hls_time','4','-hls_list_size','5',
  '-hls_flags','delete_segments+omit_endlist',
  '-hls_segment_filename',path.join(dir,'seg%05d.ts'),
  path.join(dir,'index.m3u8')
 ];
 const proc=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe'],env:{PATH:process.env.PATH||'/usr/bin:/bin'}});
 item={proc,dir,used:Date.now(),error:'',exited:false};
 sessions.set(id,item);
 proc.stderr.on('data',buffer=>{item.error=(item.error+buffer.toString('utf8')).slice(-500);});
 proc.on('error',e=>{item.error=e.message;item.exited=true;});
 proc.on('exit',()=>{item.exited=true;});
 return item;
}
async function ready(item){
 const target=path.join(item.dir,'index.m3u8');
 const end=Date.now()+START_TIMEOUT_MS;
 while(Date.now()<end){
  try{const value=fs.readFileSync(target,'utf8');if(value.includes('#EXTM3U')&&/seg\d+\.ts/.test(value))return value;}catch{}
  if(item.exited)throw Error('FFmpeg ended before playlist');
  await new Promise(resolve=>setTimeout(resolve,350));
 }
 throw Error('FFmpeg HLS startup timed out');
}
function playlist(item,exp,sig){
 item.used=Date.now();
 const value=fs.readFileSync(path.join(item.dir,'index.m3u8'),'utf8');
 return value.split(/\r?\n/).map(line=>safeSegment(line.trim())?line.trim()+'?exp='+exp+'&sig='+sig:line).join('\n');
}
function segment(item,name){if(!safeSegment(name))throw Error('Invalid segment');item.used=Date.now();return path.join(item.dir,name);}
module.exports={start,ready,playlist,segment,cleanup,countActive,safeSegment,leastRecentlyUsed};

// MKV/AVI VOD -> browser-compatible HLS. Separate from live sessions.
// The signed loopback /stream endpoint enforces the same trusted CDN redirect policy.
const vodSessions=new Map(),VOD_ROOT='/tmp/mevitv-vod',VOD_IDLE=90000;
function vodKey(type,id){if(!['movie','series'].includes(type)||!safeId(id))throw Error('Invalid VOD');return type+'-'+id;}
function vodCleanup(key){
 const item=vodSessions.get(key);if(!item)return;
 vodSessions.delete(key);
 if(item.proc&&!item.proc.killed)item.proc.kill('SIGTERM');
 try{fs.rmSync(item.dir,{recursive:true,force:true});}catch{}
}
function vodSweep(){for(const [key,item] of vodSessions)if(Date.now()-item.used>VOD_IDLE)vodCleanup(key);}
const vodTimer=setInterval(vodSweep,15000);vodTimer.unref();
function vodStart(type,id,input){
 const key=vodKey(type,id),old=vodSessions.get(key);
 if(old&&!old.exited){old.used=Date.now();return old;}
 if(old)vodCleanup(key);
 // A single conversion can be CPU-intensive; do not spawn one per tab.
 for(const other of [...vodSessions.keys()])vodCleanup(other);
 fs.mkdirSync(VOD_ROOT,{recursive:true,mode:0o700});
 const dir=path.join(VOD_ROOT,key);
 fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const args=[
  '-hide_banner','-nostdin','-loglevel','error','-y',
  '-rw_timeout','10000000','-re','-i',input,
  '-map','0:v:0','-map','0:a:0?',
  // H.264/AAC output works in hls.js and in iOS native HLS.
  // Cap resolution and CPU use for resource-constrained Synology NAS hosts.
  '-vf','scale=w=1280:h=720:force_original_aspect_ratio=decrease:force_divisible_by=2',
  '-c:v','libx264','-preset','ultrafast','-tune','zerolatency',
  '-threads','2','-pix_fmt','yuv420p','-profile:v','main','-level','3.1',
  '-crf','27','-maxrate','1800k','-bufsize','3600k',
  '-c:a','aac','-b:a','128k','-ac','2',
  '-f','hls','-hls_time','4','-hls_list_size','6',
  '-hls_flags','delete_segments+omit_endlist+temp_file',
  '-hls_segment_filename',path.join(dir,'seg%05d.ts'),
  path.join(dir,'index.m3u8')
 ];
 const proc=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe'],env:{PATH:process.env.PATH||'/usr/bin:/bin'}});
 const item={proc,dir,used:Date.now(),error:'',exited:false};
 vodSessions.set(key,item);
 proc.stderr.on('data',data=>{item.error=(item.error+data.toString('utf8')).slice(-250);});
 proc.on('error',e=>{item.error=e.message;item.exited=true;});
 proc.on('exit',()=>{item.exited=true;});
 return item;
}
async function vodReady(item){
 const target=path.join(item.dir,'index.m3u8'),until=Date.now()+45000;
 while(Date.now()<until){
  try{const list=fs.readFileSync(target,'utf8');if(list.includes('#EXTM3U')&&/seg\\d+\\.ts/.test(list))return list;}catch{}
  if(item.exited)throw Error('FFmpeg exited before first HLS segment'+(item.error?': '+item.error:''));
  await new Promise(done=>setTimeout(done,500));
 }
 throw Error('Filmumwandlung dauert zu lange; Synology-CPU oder Quellstream prüfen');
}
function vodPlaylist(item,exp,sig){
 item.used=Date.now();
 return fs.readFileSync(path.join(item.dir,'index.m3u8'),'utf8')
  .split(/\\r?\\n/).map(l=>safeSegment(l.trim())?l.trim()+'?exp='+exp+'&sig='+sig:l).join('\\n');
}
function vodSegment(type,id,name){
 if(!safeSegment(name))throw Error('Invalid VOD segment');
 const item=vodSessions.get(vodKey(type,id));
 if(!item)throw Error('Film-Session abgelaufen');
 item.used=Date.now();
 return path.join(item.dir,name);
}
module.exports.vodStart=vodStart;
module.exports.vodReady=vodReady;
module.exports.vodPlaylist=vodPlaylist;
module.exports.vodSegment=vodSegment;
module.exports.vodCleanup=vodCleanup;
