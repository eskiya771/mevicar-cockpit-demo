/* Stocks 2.0: automatic Home Assistant watchlist, safe history chart contracts. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const js=readFileSync(new URL('../stocks.js',import.meta.url),'utf8');
const ha=readFileSync(new URL('../homeassistant.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../stocks.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
new Function(js);new Function(ha);
const store={};
const sensors=[
 {entity_id:'sensor.siemens',state:'281.70',name:'Siemens Aktiengesellschaft',symbol:'SIE.DE',
  currency:'EUR',change:4.7,change_pct:1.7,market_state:'CLOSED',updated:'2026-11-12T21:24:00Z'},
 {entity_id:'sensor.tesla',state:'300',name:'Tesla',symbol:'TSLA',
  currency:'USD',change:-3.5,change_pct:-1.2,updated:'2026-11-12T21:24:00Z'}
];
const window={MeviHA:{stockSnapshot:()=>({connected:true,sensors,updatedAt:Date.now()}),
 refresh:async()=>{},stockHistory:async()=>({})}};
const document={getElementById:()=>null,querySelector:()=>null};
runInNewContext(js,{window,document,localStorage:{getItem:key=>store[key]||null,setItem:(key,value)=>store[key]=value},Intl,Date,Number,String,JSON,console});
const api=window.MeviStocks;
assert.equal(api.debug().mounted,false);
assert.equal(api.parseSensor(sensors[0]).close,281.7);
assert.equal(api.parseSensor(sensors[0]).percent,1.7);
assert.equal(api.parseSensor({...sensors[0],state:'unavailable'}).close,null);
assert.equal(api.parseSensor({...sensors[0],change:null}).change,null);
assert.equal(api.parseSensor({...sensors[0],entity_id:'<script>'}),null);
assert.match(api.html(false),/Siemens Aktiengesellschaft/);
assert.match(api.html(false),/Tesla/);
assert.match(api.html(false),/281,70/);
assert.match(api.html(true),/is-compact/);
assert.match(api.html(false),/Im Plus/);
assert.match(api.html(false),/Ausgeblendet/);
assert.match(api.html(false),/Kursdetails/);
assert.match(api.html(false),/mevi-fin-nochart/);
assert.doesNotMatch(api.html(false),/API-KEY|API-Schlüssel|Twelve Data/);
assert.doesNotMatch(js,/twelvedata|api\.twelvedata|fetch\(/i);
const chart=api.chartPath([{time:100,value:10},{time:200,value:12},{time:300,value:9}],200,50);
assert.match(chart,/^M\d/);
assert.match(chart,/L\d/);
assert.equal(api.chartPath([{time:100,value:10}],200,50),'');
api.favorite('sensor.siemens');
assert.match(api.html(false),/is-fav/);
api.favoritesOnly();
assert.doesNotMatch(api.html(false),/Tesla/);
api.favoritesOnly();
api.hide('sensor.tesla');
assert.doesNotMatch(api.html(false),/Tesla/);
assert.match(api.html(false),/Ausgeblendet \(1\)/);
api.show('sensor.tesla');
assert.match(api.html(false),/Tesla/);
api.sort('change');
assert.ok(store['mevicar-stocks-ui-v2'],'User preferences persisted');
api.open('sensor.siemens');
assert.match(api.html(false),/Kursdetails/);
assert.match(api.html(false),/30T/);
api.period(30);
assert.equal(api.debug().days,30);
api.close();
assert.match(ha,/async function stockHistory\(entityIds,days=7\)/);
assert.match(ha,/cameraSnapshot,stockSnapshot,stockHistory,requestService/);
assert.match(ha,/api\/history\/period/);
assert.match(ha,/change_pct:a\.change_pct/);
assert.match(css,/\.mevi-fin-detailchart/);
assert.match(css,/\.mevi-fin\.is-compact/);
for(const token of ['window.MeviStocks?.html','window.MeviStocks.mount()','window.MeviStocks.unmount()','stocks-host','./stocks.js','./stocks.css'])
 assert.ok(html.includes(token),'Index integration: '+token);
assert.ok(workflow.includes('tests/stocks-smoke.mjs'));
assert.ok(workflow.includes('mevicar-stocks-script'));
assert.ok(workflow.includes('stocks.js stocks.css'));
assert.ok(sw.includes("'./stocks.js'")&&sw.includes("'./stocks.css'"));
console.log('Stocks 2.0: automatic sensors, favorites, sorting, hiding, SVG history and PWA integration passed.');
