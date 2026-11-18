import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const ctx = {window: {}, Intl, Number, String, Object, Math, Date};
for(const file of ['navigation-shared-core.js','nav-route-details.js','nav-dashboard.js'])
  vm.runInNewContext(read(file), ctx, {filename:file});
const nav = ctx.window.MeviNavigationShared;
const route = ctx.window.MeviNavRouteDetails;
const dash = ctx.window.MeviNavDashboard;

assert(nav && route && dash);
assert.equal(nav.validCoordinates({lat:49.59,lng:11.005}),true);
assert.equal(nav.validCoordinates({lat:91,lng:11.005}),false);
assert.equal(nav.validPlaceId('ChIJ_test'),true);
assert.equal(nav.validPlaceId('invalid/id'),false);
assert.equal(nav.escapeHtml('<A & "B">'),'&lt;A &amp; &quot;B&quot;&gt;');
assert.equal(nav.distinct([
  {name:'A',lat:49.59,lng:11.005},{name:'Duplicate',lat:49.59,lng:11.005}
],200).length,1);
assert.equal(route.averageKmh(1000,60000),60);
assert.equal(route.averageKmh(50,600000),null);
assert.equal(route.averageKmh(5000,30000),null);
assert.equal(route.distance(12340),'12 km');
assert.equal(route.distance(12340,'dashboard'),'12,3 km');
assert.equal(route.duration(7200,'ceil'),'2 Std.');
assert.equal(route.duration(7200),'2 Std. 0 Min.');
const painted = {};
const container = {querySelector(sel) {
  const key = sel.match(/data-dash="([^"]+)"/)?.[1];
  return key ? painted[key] ??= {textContent:'–'} : null;
}};
dash.paint(container, {
  speedKmh:86.7,remainingSeconds:4500,remainingMeters:12340,
  drivenMeters:2000,elapsedMs:120000,maxKmh:115,nextCameraMeters:350
});
assert.equal(painted.speed.textContent,'87');
assert.equal(painted.time.textContent,'1 Std. 15 Min.');
assert.equal(painted.distance.textContent,'12,3 km');
assert.equal(painted.average.textContent,'60');
assert.equal(painted.camera.textContent,'350 m');
dash.paint(container,{drivenMeters:50,elapsedMs:120000});
assert.equal(painted.average.textContent,'–');
dash.paint(container,{remainingSeconds:7200,nextCameraMeters:1480});
assert.equal(painted.time.textContent,'2 Std.');
assert.equal(painted.camera.textContent,'1,5 km');
dash.paint(container,{});
assert(Object.values(painted).every(x=>x.textContent==='–'),'stale fields reset');
assert(read('navigation-google.js').includes('MeviNavigationShared.distinct(items,max)'));
assert(read('navigation-android-provider.js').includes('shared.validCoordinates(d)'));
assert(read('nav-web-parity.js').includes('const safe=shared.escapeHtml;'));
assert(read('nav-dashboard.html').indexOf('nav-route-details.js') <
  read('nav-dashboard.html').indexOf('nav-dashboard.js'));
const info=JSON.parse(read('build-info.json'));
const manifest=JSON.parse(read('offline-bundle.json'));
assert.deepEqual(info,{version:'0.6.7',build:1249,commit:'58cd48d3fc82c96acd2943c10be5f01dc38ec37f'});
assert.equal(manifest.build,1249);
const html=read('index.html');
assert(html.indexOf('id="mevicar-route-detail-script"') <
 html.indexOf('id="mevicar-navigation-script"'));
assert(html.indexOf('id="mevicar-shared-navigation-script"') <
 html.indexOf('id="mevicar-navigation-script"'));
console.log('Web v0.6.7 B1249 navigation release QA passed');
