/* Classic -> Next Weather contract and DST rain-planner regression. No network. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const rainJS=readFileSync(new URL('../weather/js/weather-rain.js',import.meta.url),'utf8');
const weatherJS=readFileSync(new URL('../weather/js/weather.js',import.meta.url),'utf8');
const sceneJS=readFileSync(new URL('../weather/js/weather-scene.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../weather/weather.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../weather/css/weather.css',import.meta.url),'utf8');
const next=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const hostCSS=readFileSync(new URL('../weather-next.css',import.meta.url),'utf8');
const flow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
new Function(rainJS);
new Function(weatherJS);
new Function(sceneJS);
const module={exports:{}};
runInNewContext(rainJS,{module,Intl,Date,Math,Map,Object,Number});
const rain=module.exports;
function hours(date){
 const start=rain.midnight(date),end=rain.midnight(rain.nextDate(date));
 const time=Array.from({length:(end-start)/rain.HOUR},(_,i)=>start+(i+1)*rain.HOUR);
 return {time,precipitation:time.map(()=>0),precipitation_probability:time.map(()=>10)};
}
const day=hours('2026-10-18');
for(const i of [10,11,12,13]){day.precipitation[i]=.6;day.precipitation_probability[i]=80}
day.precipitation_probability[18]=60;
const result=rain.day(day,'2026-10-18');
assert.equal(result.complete,true);
assert.equal(result.windows.length,2);
assert.equal(result.windows[0].expected,true);
assert.equal(result.windows[1].expected,false);
assert.equal(result.probability,80);
const gap=hours('2026-10-18');
for(const i of [10,11,12])gap.precipitation[i]=1;
gap.precipitation[11]=null;
assert.equal(rain.day(gap,'2026-10-18').windows.length,2,'missing measurement creates a gap');
for(const [date,length] of [['2026-03-29',23],['2026-10-25',25]]){
 const d=hours(date);assert.equal(d.time.length,length);
 d.precipitation.fill(1);
 const windows=rain.day(d,date);
 assert.equal(windows.complete,true);
 assert.equal(windows.windows.length,1);
 assert.equal(windows.windows[0].end-windows.windows[0].start,length*rain.HOUR);
}
assert.match(html,/data-view="overview"/);
assert.match(html,/data-view="week"/);
assert.match(html,/data-view="map"/);
assert.match(html,/id="temperature"/);
assert.match(html,/id="rain-days"/);
assert.match(html,/id="daily"/);
assert.match(html,/id="weather-map"/);
assert.match(html,/weather-rain\.js/);
assert.match(html,/weather-scene\.js/);
assert.match(weatherJS,/https:\/\/api\.open-meteo\.com\/v1\/forecast/);
assert.match(weatherJS,/latitude: 49\.71216, longitude: 10\.895/,'Same Adelsdorf coordinates as Classic');
assert.match(weatherJS,/setLayer\('wind'\)/);
assert.match(weatherJS,/embed\.windy\.com\/embed\.html/);
assert.match(weatherJS,/15 \* 60 \* 1000/,'15-minute forecast refresh');
assert.match(weatherJS,/document\.hidden/,'Do not poll while page is hidden');
assert.match(weatherJS,/temperature_2m_max/);
assert.match(weatherJS,/precipitation_probability_max/);
assert.match(css,/@media\(max-height:499px\)/);
assert.match(hostCSS,/\.side\.weather-host/);
assert.match(next,/s\.app==='weather'\)return '<iframe class="mevi-weather-frame"/);
assert.match(next,/weather-host/);
assert.match(next,/weather-next\.css/);
assert.match(flow,/cp -R weather\/\./,'Weather source tree shipped to Pages');
assert.match(flow,/mevicar-weather-styles/,'Weather wrapper styles included in versioned shell');
console.log('MeviCar Weather passed: Open-Meteo/Adelsdorf, 7-day & Windy tabs, DST rain forecasts, 5-profile stylesheet.');
