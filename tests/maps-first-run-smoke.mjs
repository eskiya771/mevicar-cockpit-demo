/* First-run Google Maps setup should not show unusable search or stale
 * favorites in Next, for both Android WebView and standalone Web PWA. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';

const maps = readFileSync('navigation-google.js','utf8');
const index = readFileSync('index.html','utf8');
const mapCss = readFileSync('navigation-google.css','utf8');
const values = new Map();
const win = {};
const ctx = {
  window:win,
  document:{getElementById:()=>null},
  localStorage:{
    getItem:key=>values.get(key)||null,
    setItem:(key,value)=>values.set(key,String(value))
  },
  navigator:{},
  console,
  setTimeout,clearTimeout
};
runInNewContext(maps,ctx,{filename:'navigation-google.js'});
const api=win.MeviGoogleNav;
assert(api && !api.hasKey(),'Unconfigured first-run must report missing Maps key');
const setup=api.mapBackdrop();
assert.match(setup,/Google Maps einrichten/);
assert.match(setup,/Web-API-Key/);
assert.match(setup,/meviOpenCredentialSettings\(\)/);
assert.doesNotMatch(setup,/id="mg-map"|id="mg-map-notice"|nav-browse|nav-search|Letzte Ziele|Favoriten/);
assert.match(mapCss,/\.mg-navigation\.mg-unconfigured/);
assert.match(index,/if\(n && !n\.hasKey\(\)\)return/,'Navi must suppress browse panel before setup');
assert.match(index,/function openSearch\(\)\{if\(!window\.MeviGoogleNav\?\.hasKey\?\.\(\)\)/);
assert.doesNotMatch(index,/<button id="fullscreenBtn"/);
assert.doesNotMatch(index,/<button id="updateBtn"/);
assert.match(index,/setSettingsTab/,'Settings remain accessible');
assert.match(index,/native-updates\.js/,'APK updates remain under Settings');
assert.match(index,/function checkForUpdate\(\)/,'Web PWA update mechanism stays available');
assert.match(index,/const CURRENT_BUILD=__MEVICAR_BUILD__/);
const inline=index.slice(index.indexOf('<script>')+8,index.indexOf('</script>'));
new Script(inline.replace('__MEVICAR_BUILD__','{version:"0.5.3",build:39,commit:"test"}'),{filename:'index.html'});
values.set('mevicar-next-google-maps-key-v1','DUMMY_WEB_MAPS_KEY_FOR_TESTS');
assert(api.hasKey(),'Address search must become available when the key is stored');
assert.match(api.mapBackdrop(),/id="mg-map"/);
assert.doesNotMatch(api.mapBackdrop(),/Google Maps einrichten/);
console.log('First-run setup, key gating, no redundant header actions: OK');
