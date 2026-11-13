import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(p,'utf8');
const code=read('credential-settings.js');
const index=read('index.html');
const maps=read('navigation-google.js');
const ha=read('homeassistant.js');
const calendar=read('calendar.js');
const road=read('roadassist.js');
const spotify=read('spotify.js');
const tv=read('tv.js');
const fields={};
const store=new Map();
const localStorage={
 getItem:k=>store.has(k)?store.get(k):null,
 setItem:(k,v)=>store.set(k,String(v)),
 removeItem:k=>store.delete(k)
};
const window={
 MeviHA:{debug:()=>({origin:'https://ha.example',dashboard:'https://ha.example/dashboard',connected:false,tokenPresent:false}),
  configureEndpoint:()=>true,connectWithToken:async()=>true,disconnect:()=>{}},
 MeviCalendar:{setClientId:()=>true},
 MeviRoadAssist:{setConfigId:()=>true},
 meviSpotifySaveClient:()=>{},
 meviSpotifyResetClient:()=>{},
 render:()=>{},
 location:{reload:()=>{}}
};
const document={getElementById:id=>fields[id]||null};
const context={window,localStorage,document,setTimeout,clearTimeout,console};
vm.runInNewContext(code,context,{filename:'credential-settings.js'});
const api=window.MeviCredentials;
assert.ok(api);
const markup=api.html();
for(const name of ['maps','calendar','spotify','road','tv','ha'])
 assert.ok(markup.includes('mevi-cred-'+name),'Missing centralized '+name);
assert.ok(index.includes('setSettingsTab(\\\'credentials\\\')'));
assert.doesNotMatch(maps,/id="mg-key"/);
assert.doesNotMatch(ha,/id="ha-token"/);
assert.doesNotMatch(calendar,/id="mevi-cal-clientid"/);
assert.doesNotMatch(road,/id="mevi-ra-config"/);
assert.doesNotMatch(spotify,/id="sp-client-id"/);
assert.doesNotMatch(tv,/name="pin"/);
const fake=(name,value)=>fields['mevi-cred-'+name]={value};
fake('maps','ABCD1234_EFGH5678_IJKLMN90');
await api.save('maps');
assert.equal(localStorage.getItem('mevicar-next-google-maps-key-v1'),'ABCD1234_EFGH5678_IJKLMN90');
fake('tv','9073');
await api.save('tv');
assert.equal(api.tvPin(),'9073');
assert.doesNotMatch(JSON.stringify([...store]),/9073/,'TV PIN may not persist');
assert.doesNotMatch(api.html(),/9073/,'TV PIN may not appear in settings HTML');
await api.clear('tv');
assert.equal(api.tvPin(),'');
fake('ha','LONG_LIVED_ACCESS_TOKEN_VALUE_ABC123');
await api.save('ha').catch(()=>{});
assert.doesNotMatch(JSON.stringify([...store]),/LONG_LIVED_ACCESS/,'HA token may not persist in browser');
assert.match(read('sw.js'),/const CACHE=['"]mevicar-next-shell-v\d+['"]/);
console.log('Central credentials: fields, removal from app screens, storage and no secret leakage OK');
