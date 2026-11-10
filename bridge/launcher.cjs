'use strict';
// Immutable launcher supervises the selected release. No automatic rollback.
// Recovery of a non-starting release is an explicit administrator action.
const fs=require('node:fs'),path=require('node:path'),{spawn,execFileSync}=require('node:child_process');
const stateFile='/runtime/state.json';
function read(){try{return JSON.parse(fs.readFileSync(stateFile,'utf8'));}catch{return {};}}
function save(s){const temp=stateFile+'.boot';fs.writeFileSync(temp,JSON.stringify(s),{mode:0o600});fs.renameSync(temp,stateFile);}
function entry(sha){
 if(!/^[a-f0-9]{40}$/.test(sha||''))return null;
 const folder=path.join('/runtime/releases',sha);
 try{for(const n of ['server.cjs','hls.cjs','remux.cjs'])execFileSync(process.execPath,['--check',path.join(folder,n)],{timeout:5000});return path.join(folder,'server.cjs');}catch{return null;}
}
const state=read();
const app=state.installed?entry(state.installed):'/app/server.cjs';
if(!app){
 console.error('[MeviTV] Selected release missing or invalid. No automatic rollback. Restore previous version manually.');
 process.exit(1);
}
const child=spawn(process.execPath,[app],{stdio:'inherit',env:process.env});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
child.on('error',e=>{console.error('[MeviTV] Failed to start selected release:',e.message);process.exit(1);});
// Mark startup completion without modifying the release selection or triggering rollback.
setTimeout(()=>{
 if(child.exitCode===null&&!child.killed){
  const s=read();
  if(s.state==='restarting'&&s.installed===state.installed){
   s.state='ready';s.message='Selected version started';save(s);
  }
 }
},2000).unref();
child.on('exit',(code,signal)=>{
 if(code!==78)console.error('[MeviTV] Process exited:',code??signal);
 process.exit(code===78?1:(code|| (signal?1:0)));
});
