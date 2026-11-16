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
assert(nav.includes("fuel:'gas_station'")&&nav.includes("wrench:'car_repair'"),'POI buttons must map to correct Google place types');
assert(nav.includes("if(query.length<2||!key())"),'Web autocomplete must match Android 2-character threshold');
assert(nav.includes("Place.searchByText("),'Free-text Enter must invoke real Google Places text search');
assert(css.includes('position:fixed')&&css.includes('.mg-parity-chips'));
const state={
 favorites:[{name:'Gymnasium',address:'Bergstraße 4',lat:49.71,lng:10.82}],
 poiActive:false,poiLoading:false,poiError:'',poiResults:[],
 recent:[{name:'Arbeit',address:'Erlangen',lat:49.60,lng:11}],
 slots:{home:{name:'Zuhause',address:'Privat',lat:49.75,lng:10.84}},
 suggestions:[],query:''
};
const calls=[];
let detailRequests=0,routeStarts=0;
const win={
 startRoute:async()=>{routeStarts++;return true},
 confirm:()=>true,
 browseOverlay:()=>'<div class="inner"></div>',render:()=>{},
 MeviGoogleNav:{
  hasKey:()=>true,changeQuery:value=>{state.query=value;state.suggestions=value.length>=2?[{name:value,address:'Testadresse'}]:[]},
  webData:()=>state,webPoi:(...args)=>{calls.push(args);state.poiActive=true;state.poiResults=[{name:'Tankstelle am Markt',address:'Erlangen',lat:49.72,lng:10.82,placeId:'ChIJPlace',types:['gas_station']}];state.poiLoading=false;state.poiError='';return Promise.resolve(true)},webPlaceDetails:async()=>{detailRequests++;return {name:'Tankstelle am Markt',address:'Erlangen',lat:49.72,lng:10.82,placeId:'ChIJPlace',types:['gas_station'],rating:4.5,ratingCount:123,phone:'+49913112345',openNow:true,hours:['Montag 06:00–22:00']}},pick:async (...args)=>{calls.push(['pick',...args]);return true},
  webWrite:delta=>Object.assign(state,delta),webSaveSelectedSlot:slot=>{calls.push(['slot',slot]);return true},saveFavorite:()=>calls.push(['favorite'])
 }
};
const s={app:'nav',mode:'map',nav:'browse',query:'',keyboard:false};
runInNewContext(core,{window:win});
runInNewContext(js,{window:win,s,navigator:{},document:{getElementById:()=>null,querySelector:()=>null},console});
win.openSearch();
let output=win.searchOverlay();
for(const term of ['Adresse, Ort oder POI','Tanken','Laden','Parken','Essen','Café','Einkaufen','Rastplatz','Werkstatt','Zuletzt','Gespeichert','Arbeit'])assert(output.includes(term),term);
win.MeviWebNavParity.tab('favorites');
output=win.searchOverlay();
assert(output.includes('Gymnasium')&&output.includes('Zuhause'));
win.MeviWebNavParity.book();
output=win.searchOverlay();
for(const term of ['Adressbuch filtern','Hinzufügen','Exportieren','Importieren','Verlauf löschen'])assert(output.includes(term),term);
// Address-book editing mirrors the native APK: icon, note, role, ordering and role replacement.
win.MeviWebNavParity.edit('favorites',0);
output=win.searchOverlay();
for(const term of ['Ziel bearbeiten','Notiz (optional)','SYMBOL','VERWENDEN ALS','Löschen'])assert(output.includes(term),term);
win.MeviWebNavParity.editField('name','Gymnasium neu');
win.MeviWebNavParity.editField('note','Haupteingang');
win.MeviWebNavParity.editIcon('heart');
win.MeviWebNavParity.editSlot('work');
win.MeviWebNavParity.saveEdit();
assert.equal(state.slots.work.name,'Gymnasium neu');
assert.equal(state.slots.work.note,'Haupteingang');
assert.equal(state.slots.work.icon,'heart');
assert.equal(state.favorites.length,0);
win.MeviWebNavParity.edit('work',0);
win.MeviWebNavParity.editSlot('');
win.MeviWebNavParity.saveEdit();
assert.equal(state.slots.work,null);
assert.equal(state.favorites.length,1);
state.favorites.push({name:'Bäckerei',lat:49.74,lng:10.85});
win.MeviWebNavParity.move(1,-1);
assert.equal(state.favorites[0].name,'Bäckerei');
win.MeviWebNavParity.filter('Haupteingang');
output=win.searchOverlay();
assert(output.includes('Gymnasium neu'),'Filter should search notes as Android does');
assert(!output.includes('Bäckerei'),'Filtered address book should hide nonmatches');
win.MeviWebNavParity.bookBack();
win.MeviWebNavParity.poi('fuel','Tankstelle');
assert.equal(calls[0][0],'fuel');
assert.equal(detailRequests,0,'POI list must not request paid Place Details until opened');
assert(win.searchOverlay().includes('Entfernung')&&win.searchOverlay().includes('Jetzt geöffnet'));
assert(win.searchOverlay().includes('Tankstelle am Markt'),'POI result list must show real provider hits');
assert.equal(s.query,'Tankstelle');
win.MeviWebNavParity.backToSearch();
win.MeviWebNavParity.input('Apotheke');
assert(win.searchOverlay().includes('MeviWebNavParity.submitSearch()'),'Search input must support Enter');
win.MeviWebNavParity.submitSearch();
assert(calls.some(c=>c[0]==='text'&&c[1]==='Apotheke'),'Enter should search places by text');
assert(win.searchOverlay().includes('Entfernung'),'Pressing Enter must navigate into POI result mode');

win.MeviWebNavParity.book();
win.MeviWebNavParity.add();
await win.MeviWebNavParity.choose('recent',0);
const savePick=calls.find(call=>call[0]==='pick'&&call[3]?.saveOnly===true);
assert.equal(savePick?.[1],'recent','Web favourites use save-only intent without starting a route');
assert(calls.some(call=>call[0]==='favorite'),'Web must save selected destination as favourite');
assert.equal(s.nav,'search','After saving favourite stay in address-book/search flow');
state.slots.home=null;
win.MeviWebNavParity.slot('home');
await win.MeviWebNavParity.choose('recent',0);
assert(calls.some(call=>call[0]==='slot'&&call[1]==='home'),'Quick-destination save calls shared provider');

win.MeviWebNavParity.poi('fuel','Tankstelle');
assert.equal(detailRequests,0,'List results are cheap: no detail fetch');
win.MeviWebNavParity.poiSort('relevance');
assert.equal(calls.at(-1)[3].sort,'relevance','Changing sort must requery Google Places');
win.MeviWebNavParity.poiOpenNow();
assert.equal(calls.at(-1)[3].openNow,true,'Now-open filter must requery Google Places');
await win.MeviWebNavParity.showPlace(0);
output=win.searchOverlay();
for(const term of ['Ortsdetails','Tankstelle am Markt','4,5','123','Geöffnet','+49913112345','Öffnungszeiten','Route','Speichern']){
 assert(output.includes(term),'Expected place detail: '+term);
}
assert.equal(detailRequests,1,'Place Details fetched only once a hit opens');
const callsBeforeSave=calls.length;
win.MeviWebNavParity.savePlace();
assert(state.favorites.some(item=>item.placeId==='ChIJPlace'),'Save must write to existing address book');
assert.equal(calls.length,callsBeforeSave,'Save must not launch native navigation or a route');
assert(win.searchOverlay().includes('Gespeichert ✓'));
win.MeviWebNavParity.savePlace();
assert(!state.favorites.some(item=>item.placeId==='ChIJPlace'),'Saved place can be removed again');
win.MeviWebNavParity.backFromPlace();
assert(win.searchOverlay().includes('Entfernung'),'Back returns to results list');
await win.MeviWebNavParity.routeResult(0);
assert(calls.some(call=>call[0]==='pick'&&call[1]==='suggest'&&call[2]===0),'Route selects the correct result');
assert.equal(routeStarts,1,'Explicit Route button must call the existing web routing');


assert(win.browseOverlay().includes('Adressbuch'));
const native={MeviNativeBridge:{postMessage(){}},MeviGoogleNav:win.MeviGoogleNav};
runInNewContext(core,{window:native});
runInNewContext(js,{window:native,s,navigator:{},document:{}});
assert.equal(native.MeviWebNavParity,undefined,'Native hybrid must not be overridden');
// Future Android branch can inject a provider without copying HTML/CSS or changing the current APK.
const injectedCalls=[];
const preview={
 MeviNativeBridge:{postMessage(){}},
 browseOverlay:()=>'<div class="inner"></div>',render:()=>{},
 MeviSharedNavigationProvider:{
  isReady:()=>true,read:()=>state,write:delta=>Object.assign(state,delta),
  search:q=>{state.query=q},choose:(kind,i)=>injectedCalls.push([kind,i]),
  saveSlot:()=>true,saveFavorite:()=>true,searchNearby:()=>{}
 }
};
const previewState={app:'nav',mode:'map',nav:'browse',query:'',keyboard:false};
runInNewContext(core,{window:preview});
runInNewContext(js,{window:preview,s:previewState,navigator:{},document:{getElementById:()=>null,querySelector:()=>null},console});
preview.MeviWebNavParity.open();
assert(preview.searchOverlay().includes('Zuletzt'));
assert(preview.searchOverlay().includes('Erlangen'));
await preview.MeviWebNavParity.choose('recent',0);
assert.equal(injectedCalls[0][0],'recent');
console.log('Shared search UI smoke: browser works, native remains unchanged until provider opt-in.');
