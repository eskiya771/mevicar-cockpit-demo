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
function cleanup(id){const item=sessions.get(id);if(!item)return;sessions.delete(id);if(item.proc&&!item.proc.killed)item.proc.kill('SIGTERM');fs.rm(item.dir,{recursive:true,force:true},()=>{});}
function sweep(){for(const [id,session] of sessions)if(Date.now()-session.used>IDLE_MS)cleanup(id);}
const timer=setInterval(sweep,15000);timer.unref();
function start(id,input){
 if(!safeId(id))throw Error('Invalid stream ID');
 let item=sessions.get(id);
 if(item){item.used=Date.now();return item;}
 if(sessions.size>=MAX_ACTIVE)throw Error('Max active streams reached');
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
module.exports={start,ready,playlist,segment,cleanup,countActive,safeSegment};
