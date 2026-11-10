'use strict';
// Immutable launcher supervises the mutable application; restarts Docker on intentional update exit.
const fs=require('node:fs'),path=require('node:path'),{spawn,execFileSync}=require('node:child_process');
const dir='/runtime',file=path.join(dir,'state.json');
let state={};
function read(){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return {};}}
function save(s){fs.mkdirSync(dir,{recursive:true});const f=file+'.boot';fs.writeFileSync(f,JSON.stringify(s));fs.renameSync(f,file);}
function entry(sha){if(!/^[a-f0-9]{40}$/.test(sha||''))return null;const base=path.join(dir,'releases',sha);
 try{for(const n of ['server.cjs','hls.cjs','remux.cjs'])execFileSync(process.execPath,['--check',path.join(base,n)],{timeout:5000});return path.join(base,'server.cjs');}catch{return null;}}
state=read();
let app=entry(state.installed);
if(!app&&state.installed){state.installed=state.previous||null;state.previous=null;state.state='rollback';state.message='Invalid update files; running previous version';save(state);app=entry(state.installed);}
if(!app)app='/app/server.cjs';
const child=spawn(process.execPath,[app],{stdio:'inherit',env:process.env});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
let stable=false;
setTimeout(()=>{if(!child.exitCode&&!child.killed){stable=true;const s=read();if(s.state==='restarting'){s.state='ready';s.message='Update started';save(s);}}},12000).unref();
child.on('exit',(code,signal)=>{
 if(!stable&&app!=='/app/server.cjs'&&code!==78){const s=read();s.installed=s.previous||null;s.previous=null;s.state='rollback';s.message='Updated process exited during startup; previous version restored';save(s);}
 process.exit(code===78?1:(code|| (signal?1:0)));
});
