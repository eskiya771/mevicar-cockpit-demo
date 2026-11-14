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
const storedBeforePin=JSON.stringify([...store]);
fake('tv','9073');
await api.save('tv');
assert.equal(api.tvPin(),'9073');
assert.notEqual(JSON.stringify([...store]),storedBeforePin,'TV PIN must be persisted when explicitly saved');
assert.equal(localStorage.getItem('mevicar-next-tv-pin-v1'),'9073','TV PIN must survive an app restart');
assert.doesNotMatch(api.html(),/9073/,'TV PIN may not appear in settings HTML');
// Simulate a new WebView/browser load with the same device storage.
const restoredWindow={...window};
vm.runInNewContext(code,{window:restoredWindow,localStorage,document,setTimeout,clearTimeout,console});
assert.equal(restoredWindow.MeviCredentials.tvPin(),'9073','PIN must be restored without asking again');
await api.clear('tv');
assert.equal(api.tvPin(),'');
assert.equal(localStorage.getItem('mevicar-next-tv-pin-v1'),null,'Removing PIN must delete stored PIN');
assert.doesNotMatch(api.html(),/9073/,'Removed PIN may not remain visible');
fake('ha','LONG_LIVED_ACCESS_TOKEN_VALUE_ABC123');
await api.save('ha').catch(()=>{});
assert.doesNotMatch(JSON.stringify([...store]),/LONG_LIVED_ACCESS/,'HA token may not persist in browser');
assert.match(read('sw.js'),/const CACHE=['"]mevicar-next-shell-v\d+['"]/);
const settingsCss=read('credential-settings.css');
const workflow=read('.github/workflows/pages.yml');
assert.match(settingsCss,/\.settings-ui \.settings-tabs button\s*\{[^}]*min-height:48px/s,
 'Settings tabs on all four pages must have 48px touch targets');
assert.doesNotMatch(settingsCss,/\.settings-ui:has\(\.mevi-credentials\) \.settings-tabs button/,
 'Larger Settings tabs must not be limited to Credentials');
assert.match(settingsCss,/\.settings-ui \.settings-bottom button\s*\{[^}]*min-height:46px/s,
 'Release Notes must be easy to tap');
assert.match(settingsCss,/\.mevi-cred-row input\s*\{[^}]*min-height:50px/s,
 'Credential inputs need 50px touch targets');
assert.match(settingsCss,/\.mevi-cred-row button,\.mevi-credentials>button\s*\{[^}]*min-height:50px/s,
 'Credential actions need 50px touch targets');
assert.match(settingsCss,/\.mevi-credentials\s*\{[^}]*overflow-y:auto/s,
 'Large labels must scroll without overflowing the cockpit');
assert.match(workflow,/mevicar-versioned-credentials/,
 'Credential CSS must be embedded in every versioned HTML release');
console.log('Central credentials: fields, removal from app screens, storage and no secret leakage OK');
