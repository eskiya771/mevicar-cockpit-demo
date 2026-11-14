import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync('credential-settings.js','utf8');
const local=new Map();
const localStorage={
 getItem:key=>local.get(key)||null,
 setItem:(key,value)=>local.set(key,String(value)),
 removeItem:key=>local.delete(key)
};
const fields={};
const document={getElementById:id=>fields[id]||null};
const key='mevicar-next-tv-pin-v1';
const credentialField=pin=>fields['mevi-cred-tv']={value:pin};
const createWindow=(vault,supported=true)=>{
 const bridge={postMessage(json){
  const {id,action,name,value}=JSON.parse(json);
  const response={id,ok:true};
  if(action==='settings.get'){
   if(!supported) {response.ok=false;response.error='Aktion unbekannt';}
   else {assert.equal(name,'tvPin');response.value=vault.pin||'';}
  }else if(action==='settings.set'){
   if(name!=='tvPin' || !/^\d{4}$/.test(value))throw Error('Only a four-digit PIN is supported here');
   vault.pin=value;
  }else if(action==='settings.clear'){
   assert.equal(name,'tvPin');vault.pin='';
  }else throw Error('Unexpected action: '+action);
  queueMicrotask(()=>bridge.onmessage?.({data:JSON.stringify(response)}));
 }};
 const win={MeviNativeBridge:bridge,render(){},MeviHA:{debug:()=>({})}};
 runInNewContext(source,{window:win,document,localStorage,setTimeout,clearTimeout,console});
 return win;
};

const vault={pin:'5824'};
let win=createWindow(vault);
assert.equal(await win.MeviCredentials.tvPinReady(),'5824','APK must restore the encrypted PIN');
assert.equal(localStorage.getItem(key),null,'Native PIN must never be copied to localStorage');
credentialField('9271');
await win.MeviCredentials.save('tv');
assert.equal(vault.pin,'9271','APK must store a newly entered PIN in its native vault');
assert.equal(localStorage.getItem(key),null,'Save must not expose PIN via localStorage');
win=createWindow(vault);
assert.equal(await win.MeviCredentials.tvPinReady(),'9271','APK PIN must survive a fresh WebView navigation');
await win.MeviCredentials.clear('tv');
assert.equal(vault.pin,'','Removing the PIN must clear native credentials');
assert.equal(win.MeviCredentials.tvPin(),'');
assert.equal(localStorage.getItem(key),null);

// Seamless upgrade: migrate an existing localStorage PIN to the secure vault.
localStorage.setItem(key,'1649');
win=createWindow(vault);
assert.equal(await win.MeviCredentials.tvPinReady(),'1649');
assert.equal(vault.pin,'1649','Existing locally saved PIN should migrate to native storage');
assert.equal(localStorage.getItem(key),null,'Migrated plaintext PIN must be erased');

// Compatibility: older APK builds cannot read the secure vault and keep localStorage fallback.
local.clear();
vault.pin='';
win=createWindow(vault,false);
await win.MeviCredentials.tvPinReady();
credentialField('3570');
await win.MeviCredentials.save('tv');
assert.equal(localStorage.getItem(key),'3570','Legacy APK should keep working until updated');
assert.equal(win.MeviCredentials.tvPin(),'3570');
console.log('MeviTV native PIN: encrypted restore, restart, deletion, migration, legacy fallback OK');
