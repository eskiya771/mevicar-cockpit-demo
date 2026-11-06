/* Premium speedometer regression tests. Run: node tests/speedometer-smoke.mjs */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const src = readFileSync(new URL('../speedometer.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../speedometer.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
new Function(src);

assert.match(css, /\.tacho-app\.is-compact \.tacho-cluster/);
assert.match(css, /\.side\.tacho-host\{overflow:hidden/);
assert.match(css, /iPhone 17 874×402/);
assert.match(css, /Panorama \/ Infotainment 1920×720/);
assert.match(css, /DeX 1920×1200 and Full HD 1920×1080/);
assert.match(css, /@media\(orientation:landscape\) and \(max-width:1024px\) and \(max-height:480px\)/);
assert.match(css, /@media\(orientation:landscape\) and \(min-width:1500px\) and \(max-height:820px\)/);
assert.match(css, /@media\(orientation:landscape\) and \(min-width:1500px\) and \(min-height:880px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);
// Full layout 2.0: dials are square size containers that grow to the cluster height; scale numerals stay in SVG viewBox units.
assert.ok(css.includes('.tacho-app:not(.is-compact):not(.is-tight) .tacho-cluster{container-type:size'), 'cluster must be a size container in full layout');
assert.ok(css.includes('.tacho-app:not(.is-compact):not(.is-tight) .tacho-dial{container-type:size;container-name:tacho-dial;width:min(100%,100cqh)'), 'dials must grow to the cluster height');
assert.ok(!/.tacho-num[^{]*{[^}]*cq(min|h|w)/.test(css), 'SVG numerals must not use container units (they overlap on large dials)');
assert.ok(css.includes('.tacho-app:not(.is-compact):not(.is-tight) .tacho-hero b{font-size:clamp(44px,13cqmin,124px)}'), 'hero speed scales with the dial');
assert.ok(css.includes('.tacho-app:not(.is-compact):not(.is-tight) .tacho-compass svg{width:clamp(40px,9.5vh,104px)'), 'full-layout compass must scale with viewport height');
assert.ok(css.includes('.tacho-app.is-compact:not(.is-tight) .tacho-stat strong,.tacho-app.is-compact:not(.is-tight) .tacho-compass b{font-size:clamp(18px,3.2vh,36px)'), 'large split odometer must scale, tight stays at 14px');
assert.ok(css.includes('.tacho-app.is-compact.is-tall .tacho-cluster{grid-template-columns:minmax(0,1fr)'), 'tall split hosts must stack both dials');
assert.ok(css.includes('.tacho-app.is-compact .tacho-dial-rpm,.tacho-app.is-tight .tacho-dial-rpm{width:100%;height:100%'), 'split RPM dial must fill its grid cell');
assert.ok(src.includes('class="tacho-compass-c">O<') && src.includes('class="tacho-compass-c">W<'), 'compass rose must show cardinal letters');
assert.ok(src.includes('y="206" class="tacho-scale-note"'), 'RPM ×1000 note must sit below the digital readout');
assert.ok(html.includes('href="./speedometer.css"') && html.includes('src="./speedometer.js"'));
assert.ok(html.includes('meviSpeedMount()') && html.includes('meviSpeedUnmount()'));
assert.ok(html.includes("s.app==='speed'&&s.mode==='full'") && html.includes('tacho-host'));
assert.ok(html.includes('mapHTML()'), 'Split screen must keep the navigation map');
assert.ok(workflow.includes('mevicar-speedometer-styles') && workflow.includes('speedometer.js speedometer.css'));
assert.ok(workflow.includes('tests/speedometer-smoke.mjs'));
assert.ok(sw.includes("'./speedometer.js'") && sw.includes("'./speedometer.css'"));
assert.ok(sw.includes('mevicar-next-shell-v21'));

const elements = new Map();
function makeNode(id) {
  return {
    id, textContent: '', dataset: {}, attrs: {},
    classList: { toggle() {} },
    setAttribute(key, value) { this.attrs[key] = value; },
    getAttribute(key) { return this.attrs[key]; }
  };
}
for (const id of ['tachoSpeedValue','tachoSpeedSource','tachoRpmValue','tachoRpmUnit','tachoOdo','tachoOdoSource','tachoTrip','tachoTripSource','tachoHeading','tachoCardinal','tachoMode','tachoStatus','tachoSources','tachoGps','tachoDemo','tachoSpeedNeedle','tachoRpmNeedle','tachoCompassRot','gpsSignalIcon']) {
  elements.set(id, makeNode(id));
}
let rect = { width: 900, height: 560, left: 0, top: 0 };
let app = null;
let disconnected = 0;
function makeApp() {
  return {
    isConnected: true,
    dataset: {},
    className: '',
    classList: { toggle(name, force) { this[name] = force !== false; } },
    querySelector() { return { classList: { toggle() {} } }; },
    getBoundingClientRect() { return rect; }
  };
}
const listeners = [];
let hidden = false;
const document = {
  get hidden() { return hidden; },
  querySelector(selector) { assert.equal(selector, '.tacho-app'); return app; },
  getElementById(id) { return elements.get(id) || null; },
  addEventListener() {}
};
let watchSeq = 1;
const watches = new Map();
const cleared = [];
const navigator = {
  geolocation: {
    watchPosition(ok, err) { const id = watchSeq++; watches.set(id, { ok, err }); return id; },
    clearWatch(id) { cleared.push(id); watches.delete(id); }
  }
};
function DeviceOrientationEvent() {}
const store = {};
const localStorage = { getItem: key => store[key] || null, setItem: (key, value) => { store[key] = value; } };
let nextFrame = 1;
const callbacks = new Map();
const requestAnimationFrame = fn => { const id = nextFrame++; callbacks.set(id, fn); return id; };
const cancelAnimationFrame = id => callbacks.delete(id);
const tick = now => { const queued = [...callbacks.values()]; callbacks.clear(); for (const fn of queued) fn(now); };
class ResizeObserver {
  constructor(cb) { this.cb = cb; }
  observe() { this.cb(); }
  disconnect() { disconnected++; }
}
const window = {
  document, navigator, DeviceOrientationEvent, localStorage,
  addEventListener(type, fn) { listeners.push({ type, fn }); },
  removeEventListener(type, fn) {
    const index = listeners.findIndex(entry => entry.type === type && entry.fn === fn);
    if (index >= 0) listeners.splice(index, 1);
  },
  matchMedia() { return { matches: false }; }
};
runInNewContext(src, { window, document, navigator, localStorage, console, requestAnimationFrame, cancelAnimationFrame, ResizeObserver, DeviceOrientationEvent, Date, Math, JSON, Number });
const api = window.MeviSpeedometer;

assert.equal(api.SPEED_MAX, 220);
assert.equal(api.RPM_MAX, 8000);
assert.equal(JSON.stringify(api.speedMarks()), JSON.stringify([0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220]));
assert.equal(JSON.stringify(api.rpmMarks()), JSON.stringify([0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000]));
assert.equal(api.needleAngle(0, 220), -120);
assert.equal(api.needleAngle(220, 220), 120);
assert.equal(api.needleAngle(110, 220), 0);
assert.equal(api.needleAngle(-20, 220), -120);
assert.equal(api.needleAngle(999, 220), 120);
assert.equal(api.needleAngle(Number.NaN, 220), -120);
assert.equal(api.needleAngle(4000, 8000), 0);
assert.equal(api.needleAngle(8000, 8000), 120);
assert.equal(api.needleAngle('nope', 8000), -120);
assert.equal(api.cardinal(0), 'N');
assert.equal(api.cardinal(90), 'O');
assert.equal(api.cardinal(359), 'N');
assert.equal(api.cardinal(null), null);
assert.equal(api.clampReading(-1, 220), null);
assert.equal(api.clampReading(300, 220), 220);

const moved = api.acceptTrackPoint(
  { lat: 49.59, lon: 11.0, time: 1_000 },
  { lat: 49.591, lon: 11.0, accuracy: 12, time: 11_000 }
);
assert.equal(moved.ok, true);
assert.ok(moved.km > 0.1 && moved.km < 0.13);
assert.equal(api.acceptTrackPoint(null, { lat: 49.59, lon: 11, accuracy: 10, time: 5 }).ok, true);
assert.equal(api.acceptTrackPoint(null, { lat: 99, lon: 0, time: 5 }).reason, 'invalid');
assert.equal(api.acceptTrackPoint(null, { lat: 49, lon: 11, accuracy: 120, time: 5 }).reason, 'accuracy');
assert.equal(api.acceptTrackPoint(
  { lat: 49.59, lon: 11, time: 1_000 },
  { lat: 50.59, lon: 11, accuracy: 8, time: 2_000 }
).reason, 'spike');
assert.equal(api.approach(0, 100, 0.016, true), 100);
const stepped = api.approach(0, 100, 0.016, false);
assert.ok(stepped > 0 && stepped < 40);
const a = api.demoFrame(0);
const b = api.demoFrame(4);
assert.ok(a.speedKmh >= 0 && a.speedKmh <= 220);
assert.ok(a.rpm >= 0 && a.rpm <= 8000);
assert.notEqual(Math.round(a.speedKmh), Math.round(b.speedKmh));
assert.ok(a.tripPerSecondKm > 0);

const full = window.meviSpeedHTML(false);
const compact = window.meviSpeedHTML(true);
assert.equal(full.includes('is-compact'), false);
assert.ok(compact.includes('is-compact') && compact.includes('data-layout="split"'));
assert.ok(full.includes('data-layout="full"') && full.includes('data-speed-max="220"') && full.includes('data-rpm-max="8000"'));
assert.match(full, /Tachometer 0 bis 220 km\/h/);
assert.match(full, /Drehzahlmesser 0 bis 8000 U\/min/);
for (const mark of api.speedMarks()) assert.ok(full.includes('>' + mark + '<'), 'missing speed mark ' + mark);
for (const mark of [0, 1, 2, 3, 4, 5, 6, 7, 8]) assert.ok(full.includes('>' + mark + '<'), 'missing rpm mark ' + mark);
assert.ok(full.includes('tacho-redzone') && full.includes('keine Fahrzeugdaten') && full.includes('keine OBD'));
assert.equal((full.match(/id="tachoSpeedNeedle"/g) || []).length, 1);
assert.equal((full.match(/id="tachoRpmNeedle"/g) || []).length, 1);

app = makeApp();
window.meviSpeedMount();
assert.equal(window.meviSpeedDebug().mounted, true);
assert.equal(elements.get('tachoOdo').textContent, '—');
assert.equal(elements.get('tachoRpmUnit').textContent, 'keine OBD');
window.meviSpeedGps(true);
assert.equal(watches.size, 1);
const watchId = window.meviSpeedDebug().watch;
watches.get(watchId).ok({ coords: { latitude: 49.59, longitude: 11, accuracy: 9, speed: 10, heading: 45, altitude: 280 }, timestamp: 5_000 });
assert.equal(window.meviSpeedDebug().live.speedKmh, 36);
assert.equal(window.meviSpeedDebug().live.source.speed, 'gps');
const tripBeforeSpike = window.meviSpeedDebug().live.tripKm;
watches.get(watchId).ok({ coords: { latitude: 50.59, longitude: 11, accuracy: 9, speed: 10, heading: 45, altitude: 280 }, timestamp: 6_000 });
assert.equal(window.meviSpeedDebug().live.tripKm, tripBeforeSpike);
watches.get(watchId).ok({ coords: { latitude: 49.591, longitude: 11, accuracy: 9, speed: 12, heading: 45, altitude: 280 }, timestamp: 16_000 });
assert.ok(window.meviSpeedDebug().live.tripKm > tripBeforeSpike);
assert.equal(window.meviSpeedDebug().live.odometerKm, null);
assert.equal(window.meviSpeedDebug().live.source.odometer, 'unavailable');

const liveTrip = window.meviSpeedDebug().live.tripKm;
window.meviSpeedToggleDemo();
assert.equal(window.meviSpeedDebug().mode, 'demo');
tick(30);
tick(80);
assert.equal(callbacks.size, 1);
assert.equal(elements.get('tachoMode').textContent, 'DEMO');
assert.equal(window.meviSpeedDebug().live.tripKm, liveTrip);
assert.ok(window.meviSpeedDebug().demo.tripKm > 0);
assert.equal(window.meviSpeedDebug().demo.odometerKm, null);
assert.equal(window.meviSpeedDebug().view.source.rpm, 'demo');
window.meviSpeedIngest({ rpm: 2450, odometerKm: 184320.4, speedKmh: 99 });
assert.equal(window.meviSpeedDebug().live.rpm, 2450);
assert.equal(window.meviSpeedDebug().live.odometerKm, 184320.4);
assert.equal(window.meviSpeedDebug().live.speedKmh, 43.2);
assert.equal(window.meviSpeedDebug().view.odometerKm, null);
assert.notEqual(window.meviSpeedDebug().view.source.rpm, 'obd');
window.meviSpeedToggleDemo();
tick(200);
assert.equal(window.meviSpeedDebug().mode, 'live');
assert.equal(window.meviSpeedDebug().view.rpm, 2450);
assert.equal(window.meviSpeedDebug().view.odometerKm, 184320.4);
assert.equal(window.meviSpeedDebug().live.tripKm, liveTrip);
assert.equal(elements.get('tachoMode').textContent, 'LIVE');

window.meviSpeedResetTrip();
assert.equal(window.meviSpeedDebug().live.tripKm, 0);
assert.equal(JSON.parse(store['mevicar-tacho-trip-v1']).tripKm, 0);
await window.meviSpeedCompass();
assert.equal(listeners.filter(entry => entry.type === 'deviceorientation').length, 1);
listeners.find(entry => entry.type === 'deviceorientation').fn({ webkitCompassHeading: 180 });
assert.equal(window.meviSpeedDebug().live.headingDeg, 180);
assert.equal(window.meviSpeedDebug().live.source.heading, 'sensor');

window.meviSpeedUnmount();
assert.equal(window.meviSpeedDebug().mounted, false);
assert.equal(window.meviSpeedDebug().animating, false);
assert.equal(window.meviSpeedDebug().watch, null);
assert.ok(cleared.includes(watchId));
assert.equal(listeners.filter(entry => entry.type === 'deviceorientation').length, 0);
assert.ok(disconnected > 0);

app = makeApp();
window.meviSpeedMount();
assert.equal(watches.size, 1);
assert.equal(listeners.filter(entry => entry.type === 'deviceorientation').length, 1);
const second = window.meviSpeedDebug().watch;
window.meviSpeedUnmount();
app = makeApp();
window.meviSpeedMount();
assert.equal(watches.size, 1);
assert.notEqual(window.meviSpeedDebug().watch, second);
assert.ok(cleared.includes(second));
window.meviSpeedUnmount();
app = null;
window.meviSpeedMount();
assert.equal(window.meviSpeedDebug().mounted, false);
assert.equal(watches.size, 0);
assert.equal(callbacks.size, 0);

rect = { width: 320, height: 280, left: 0, top: 0 };
app = makeApp();
window.meviSpeedMount();
assert.equal(app.classList['is-tight'], true);
assert.equal(app.dataset.layout, 'tight');
window.meviSpeedUnmount();

rect = { width: 640, height: 1120, left: 0, top: 0 };
app = makeApp();
app.dataset.layout = 'split';
window.meviSpeedMount();
assert.equal(app.classList['is-tight'], false);
assert.equal(app.classList['is-tall'], true, 'tall split host stacks the dials');
assert.equal(app.dataset.layout, 'split');
window.meviSpeedUnmount();

rect = { width: 680, height: 660, left: 0, top: 0 };
app = makeApp();
app.dataset.layout = 'split';
window.meviSpeedMount();
assert.equal(app.classList['is-tall'], false, 'panorama split stays side by side');
window.meviSpeedUnmount();

console.log('Speedometer OK: scales, needles, GPS trip filter, demo isolation, OBD ingest, compass, remount cleanup, PWA bundle.');
