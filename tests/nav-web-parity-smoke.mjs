/* Regression for Web-only Android-style navigation search; does not use a Maps key. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';

const js=readFileSync(new URL('../nav-web-parity.js',import.meta.url),'utf8');
const core=readFileSync(new URL('../navigation-shared-core.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../nav-web-parity.css',import.meta.url),'utf8');
const nav=readFileSync(new URL('../navigation-google.js',import.meta.url),'utf8');
const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
new Script(js);
new Script(core);
assert(html.includes('<script src="./navigation-shared-core.js"></script><script src="./nav-web-parity.js"></script>'));
assert(html.includes('<link rel="stylesheet" href="./nav-web-parity.css">'));
assert(pages.includes('navigation-shared-core.js nav-web-parity.js nav-web-parity.css'));
assert(sw.includes("'./navigation-shared-core.js'")&&sw.includes("'./nav-web-parity.js'")&&sw.includes("'./nav-web-parity.css'"));
assert(nav.includes('function webPoi(')&&nav.includes('function webSaveSelectedSlot('));
assert(css.includes('position:fixed')&&css.includes('.mg-parity-chips'));
const state={
 favorites:[{name:'Gymnasium',address:'Bergstraße 4',lat:49.71,lng:10.82}],
 recent:[{name:'Arbeit',address:'Erlangen',lat:49.60,lng:11}],
 slots:{home:{name:'Zuhause',address:'Privat',lat:49.75,lng:10.84}},
 suggestions:[],query:''
};
const calls=[];
const win={
 browseOverlay:()=>'<div class="inner"></div>',render:()=>{},
 MeviGoogleNav:{
  hasKey:()=>true,changeQuery:value=>{state.query=value;state.suggestions=value.length>=3?[{name:value,address:'Testadresse'}]:[]},
  webData:()=>state,webPoi:(...args)=>calls.push(args),pick:async()=>{},
  webWrite:delta=>Object.assign(state,delta),webSaveSelectedSlot:()=>true,saveFavorite:()=>{}
 }
};
const s={app:'nav',mode:'map',nav:'browse',query:'',keyboard:false};
runInNewContext(core,{window:win});
runInNewContext(js,{window:win,s,navigator:{},document:{getElementById:()=>null,querySelector:()=>null},console});
win.openSearch();
let output=win.searchOverlay();
for(const term of ['Adresse, Ort oder POI','Tanken','Laden','Parken','Essen','Café','Einkaufen','Zuletzt','Gespeichert','Arbeit'])assert(output.includes(term),term);
win.MeviWebNavParity.tab('favorites');
output=win.searchOverlay();
assert(output.includes('Gymnasium')&&output.includes('Zuhause'));
win.MeviWebNavParity.book();
output=win.searchOverlay();
for(const term of ['Adressbuch filtern','Hinzufügen','Exportieren','Importieren','Verlauf löschen'])assert(output.includes(term),term);
win.MeviWebNavParity.bookBack();
win.MeviWebNavParity.poi('fuel','Tankstelle');
assert.equal(calls[0][0],'fuel');
assert.equal(s.query,'Tankstelle');
assert(win.browseOverlay().includes('Adressbuch'));
const native={MeviNativeBridge:{postMessage(){}},MeviGoogleNav:win.MeviGoogleNav};
runInNewContext(core,{window:native});
runInNewContext(js,{window:native,s,navigator:{},document:{}});
assert.equal(native.MeviWebNavParity,undefined,'Native hybrid must not be overridden');
console.log('Web search and address-book parity smoke: passed; native unchanged.');
