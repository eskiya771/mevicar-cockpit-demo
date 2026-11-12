import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../meviplatform.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
new Function(source);
function setup(native=false) {
  const calls=[];
  const window={Capacitor:{isNativePlatform:()=>native}};
  const navigator={userAgent:'test',geolocation:{
    watchPosition:(...args)=>{calls.push(['watch',args]);return 3;},
    clearWatch:id=>calls.push(['clear',id])
  }};
  runInNewContext(source,{window,navigator});
  return {api:window.MeviPlatform,calls};
}
const web=setup(),android=setup(true);
assert.equal(web.api.platform(),'web');
assert.equal(android.api.platform(),'android');
assert.equal(android.api.capabilities().native,true);
assert.equal(web.api.capabilities().nativeBluetooth,false);
assert.equal(web.api.capabilities().geolocation,true);
assert.equal(web.api.geolocation.watch(()=>{},()=>{},{}),3);
web.api.geolocation.clear(3);
assert.deepEqual(web.calls.map(x=>x[0]),['watch','clear']);
assert.equal((await web.api.bluetooth.connect()).available,false);
assert.equal((await android.api.phone.dial()).available,false);
assert.match(html,/<script src="\.\/meviplatform\.js"><\/script>/);
assert.match(pages,/meviplatform-smoke\.mjs/);
assert.match(pages,/mevicar-platform-script/);
console.log('MeviPlatform: Web fallback, Android detection, feature flags and no-op native methods passed');
