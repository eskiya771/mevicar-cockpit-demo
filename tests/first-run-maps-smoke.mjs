import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const index=fs.readFileSync('index.html','utf8');
const nav=fs.readFileSync('navigation-google.js','utf8');
const inline=index.slice(index.indexOf('<script>')+8,index.indexOf('</script>'));
new vm.Script(inline.replace('__MEVICAR_BUILD__',
 JSON.stringify({version:'0.5.3',build:999,commit:'abc'})),{filename:'index-inline.js'});
new vm.Script(nav,{filename:'navigation-google.js'});

assert(!index.includes('id="fullscreenBtn"'));
assert(!index.includes('id="updateBtn"'));
assert(index.includes('APK-Updates') && index.includes('async function checkForUpdate()'));
assert(index.includes("if(!window.MeviGoogleNav?.hasKey?.()){openCredentialSettings();return}"),
 'Search must be gated until the Google Maps browser key is configured');

const start=inline.indexOf('function mapHTML(){');
const finish=inline.indexOf('\nconst gpsData=',start);
assert(start>=0&&finish>start,'Missing mapHTML function');
const factory=new Function('s','window','browseOverlay','searchOverlay','previewHTML',
 'readyRouteOverlay','activeGuidanceOverlay',inline.slice(start,finish)+';return mapHTML;');
const initial={app:'nav',mode:'map',nav:'search',keyboard:true};
const noKey=factory(initial,{MeviGoogleNav:{
 hasKey:()=>false,mapBackdrop:()=>'<section class="mg-setup">Setup</section>',
 locationButton:()=>'<button>GPS</button>'}},
 ()=>'<div class="nav-browse"></div>',()=>'<div class="nav-search"></div>',
 ()=>'',()=>'',()=>'' )();
assert(noKey.includes('mg-first-run')&&noKey.includes('mg-setup'));
assert(!noKey.includes('nav-browse')&&!noKey.includes('nav-search')&&!noKey.includes('GPS'));
assert.equal(initial.keyboard,false,'Keyboard remains closed before first-run setup');
const ready={app:'nav',mode:'map',nav:'browse',keyboard:false};
const withKey=factory(ready,{MeviGoogleNav:{
 hasKey:()=>true,mapBackdrop:()=>'<div id="mg-map"></div>',
 locationButton:()=>'<button>GPS</button>'}},
 ()=>'<div class="nav-browse"></div>',()=>'<div class="nav-search"></div>',
 ()=>'',()=>'',()=>'' )();
assert(withKey.includes('nav-browse')&&withKey.includes('GPS')&&!withKey.includes('mg-first-run'));

const storage=new Map();
const sandbox={
 window:{}, document:{getElementById:()=>null},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
 setTimeout,clearTimeout,console
};
vm.runInNewContext(nav,sandbox);
const api=sandbox.window.MeviGoogleNav;
assert.equal(api.hasKey(),false);
assert(api.mapBackdrop().includes('mg-setup'),'Missing first-run setup');
assert(!api.resultsHTML().includes('mg-setup'),'No duplicate setup dialog');
storage.set('mevicar-next-google-maps-key-v1','AIzaTEST_KEY_12345678901234567890');
assert.equal(api.hasKey(),true);
assert(!api.mapBackdrop().includes('mg-setup'),'Setup disappears once key exists');
console.log('Maps first-run and status-bar regression checks passed.');
