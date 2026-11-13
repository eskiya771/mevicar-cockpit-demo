import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const files=['credential-settings.js','navigation-google.js','homeassistant.js','calendar.js','spotify.js','roadassist.js','tv.js'];
for (const f of files) new vm.Script(fs.readFileSync(f,'utf8'),{filename:f});
const html=fs.readFileSync('index.html','utf8');
new vm.Script(html.slice(html.indexOf('<script>')+8,html.indexOf('</script>')),{filename:'index-inline.js'});
assert.match(html,/setSettingsTab\(\\'credentials\\'\)/);
assert.match(html,/credential-settings.js/);
assert.match(html,/credential-settings.css/);
assert.doesNotMatch(fs.readFileSync('navigation-google.js','utf8'),/id="mg-key"/);
assert.doesNotMatch(fs.readFileSync('homeassistant.js','utf8'),/id="ha-token"/);
assert.doesNotMatch(fs.readFileSync('roadassist.js','utf8'),/id="mevi-ra-config"/);
assert.doesNotMatch(fs.readFileSync('calendar.js','utf8'),/id="mevi-cal-clientid"/);
assert.doesNotMatch(fs.readFileSync('spotify.js','utf8'),/id="sp-client-id"/);
assert.doesNotMatch(fs.readFileSync('tv.js','utf8'),/name="pin"/);
const kv=new Map();
const localStorage={getItem:k=>kv.get(k)??null,setItem:(k,v)=>kv.set(k,String(v)),removeItem:k=>kv.delete(k)};
let renderCount=0;
const fields={};
const window={
  localStorage,
  document:{getElementById:id=>fields[id]??null},
  render:()=>{renderCount++},
  MeviRoadAssist:{setConfigId:()=>true},
  MeviCalendar:{setClientId:()=>true},
  MeviHA:{debug:()=>({connected:true}),connectWithToken:async()=>true,disconnect:()=>{}},
  meviSpotifySaveClient:()=>{},
  meviSpotifyResetClient:()=>{}
};
const context={window,document:window.document,localStorage,console,setTimeout,clearTimeout};
vm.runInNewContext(fs.readFileSync('credential-settings.js','utf8'),context,{filename:'credential-settings.js'});
const set=(id,v)=>fields['mevi-cred-'+id]={value:v};
set('maps','A'.repeat(35));
await window.MeviCredentials.save('maps').catch(()=>{});
assert.equal(kv.get('mevicar-next-google-maps-key-v1'),'A'.repeat(35));
console.log('Central credentials UI and syntax checks passed.');
