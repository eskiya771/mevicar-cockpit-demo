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
let haOrigin='https://ha.example',haConnected=false,haFailure=false,haLoads=[],loadCallback=null;
const window={
 addEventListener:(event,callback)=>{if(event==='load')loadCallback=callback},
 MeviHA:{debug:()=>({origin:haOrigin,dashboard:haOrigin+'/dashboard',connected:haConnected,tokenPresent:haConnected}),
  configureEndpoint:(origin)=>{haOrigin=origin;haConnected=false;return true},
  connectWithToken:async token=>{haLoads.push(token);if(haFailure)throw new Error('Connection unavailable');haConnected=true;return true},
  disconnect:()=>{haConnected=false}},
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
const haKey='mevicar-next-ha-web-token-v1';
const haValue='LONG_LIVED_ACCESS_TOKEN_VALUE_ABC123';
fake('ha',haValue);
await api.save('ha');
const record=JSON.parse(localStorage.getItem(haKey));
assert.equal(record.origin,'https://ha.example');
assert.equal(record.token,haValue,'Web HA token should survive a browser restart');
assert.match(api.html(),/im Browser gespeichert/);
assert.doesNotMatch(api.html(),/LONG_LIVED_ACCESS/,'Web HA token must never be rendered as HTML');

// New browser session: restore automatically from this origin/device after all scripts load.
let restartLoad=null,restartConnected=false,restoredTokens=[];
const haRestart={
 addEventListener:(event,callback)=>{if(event==='load')restartLoad=callback},
 MeviHA:{
  debug:()=>({origin:'https://ha.example',connected:restartConnected}),
  connectWithToken:async token=>{restoredTokens.push(token);restartConnected=true}
 },
 render:()=>{}
};
vm.runInNewContext(code,{window:haRestart,localStorage,document,setTimeout,clearTimeout,console});
assert.equal(restartConnected,false,'Never connect before the page has loaded');
restartLoad();
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(restartConnected,true,'Home Assistant connection is restored on page load');
assert.deepEqual(restoredTokens,[haValue]);
assert.doesNotMatch(haRestart.MeviCredentials.html(),/LONG_LIVED_ACCESS/);

// A browser-only credential must not be saved to Android WebView localStorage.
await api.clear('ha');
assert.equal(localStorage.getItem(haKey),null,'Remove must delete saved browser HA token');
assert.equal(haConnected,false);
fake('ha',haValue);
await api.save('ha');
fake('ha-origin','https://ha-other.example');
fake('ha-path','/dashboard');
await api.save('ha-origin');
assert.equal(localStorage.getItem(haKey),null,'Changing HA origin must discard the previously bound token');

// A stored token for a different origin must never be sent to this HA server.
localStorage.setItem(haKey,JSON.stringify({origin:'https://another.example',token:haValue}));
let wrongOriginLoad=null,wrongOriginCalls=0;
const wrongOriginWindow={
 addEventListener:(event,callback)=>{if(event==='load')wrongOriginLoad=callback},
 MeviHA:{debug:()=>({origin:'https://ha-other.example',connected:false}),
   connectWithToken:async()=>{wrongOriginCalls++}}
};
vm.runInNewContext(code,{window:wrongOriginWindow,localStorage,document,setTimeout,clearTimeout,console});
wrongOriginLoad();
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(wrongOriginCalls,0,'A token bound to another HA origin must not be replayed');
localStorage.removeItem(haKey);

// Failed connect must not persist a new token.
haFailure=true;haConnected=false;
fake('ha',haValue);
await api.save('ha');
assert.equal(localStorage.getItem(haKey),null);
haFailure=false;

// Android still uses only the native vault for HA credentials.
let nativeSecret='',nativeConnected=false,nativeLoad=null;
const nativeWindow={
 Capacitor:{Plugins:{MeviSecureSettings:{
  get:async()=>({value:''}),set:async({name,value})=>{if(name==='haToken')nativeSecret=value},
  remove:async({name})=>{if(name==='haToken')nativeSecret=''}
 }}},
 addEventListener:(event,callback)=>{if(event==='load')nativeLoad=callback},
 MeviHA:{debug:()=>({origin:'https://ha-other.example',connected:nativeConnected}),
  connectWithToken:async()=>{nativeConnected=true},disconnect:()=>{nativeConnected=false}},
 render:()=>{}
};
vm.runInNewContext(code,{window:nativeWindow,localStorage,document,setTimeout,clearTimeout,console});
fake('ha',haValue);
await nativeWindow.MeviCredentials.save('ha');
assert.equal(nativeSecret,haValue);
assert.equal(localStorage.getItem(haKey),null,'The Android hybrid may not write HA tokens to browser storage');
nativeLoad();
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(localStorage.getItem(haKey),null);
await nativeWindow.MeviCredentials.clear('ha');
assert.equal(nativeSecret,'','Native remove must remove HA token from native vault');

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
console.log('Central credentials: browser HA token persistence, restart, removal, origin isolation, native vault and UI OK');
