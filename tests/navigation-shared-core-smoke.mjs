/* Pure navigation-core regressions; works without browser, Google API key or Android SDK. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';

const source=readFileSync(new URL('../navigation-shared-core.js',import.meta.url),'utf8');
new Script(source);
const browser={};
runInNewContext(source,{window:browser});
const core=browser.MeviNavigationShared;
assert(core&&Object.isFrozen(core));

const home={id:'android-home',placeId:'abc-123',icon:'home',note:'Seiteneingang',
 name:' Zuhause ',address:'Wohnadresse',lat:49.75012,lng:10.84012,fetchedAt:1234};
const gym={id:'gym',name:'Gymnasium',address:'Schulstraße 3',lat:49.71,lng:10.82};
const duplicateGym={...gym,name:'Doppelt'};
assert.equal(core.destination({name:'Falsch',lat:92,lng:11}),null);
assert.equal(core.destination({name:' ',lat:49,lng:11}),null);
assert.equal(core.destination(home).name,'Zuhause');
assert.equal(core.destination(home).note,'Seiteneingang');
assert.equal(core.destination(home).id,'android-home');
assert.equal(core.distinct([gym,duplicateGym,{name:'Leer',lat:null,lng:0}],20).length,1);
const current={slots:{home},favorites:[gym],recent:[{...gym,usedAt:4567,count:2}]};
const frozen=JSON.stringify(current);
const payload=core.exportAddressBook(current);
assert.equal(payload.version,2);
assert.equal(payload.saved.length,2);
assert.equal(payload.saved[0].slot,'home');
assert.equal(payload.saved[0].id,'android-home');
assert.equal(payload.saved[0].icon,'home');
assert.equal(payload.saved[0].note,'Seiteneingang');
assert.equal(payload.saved[0].placeId,'abc-123');
assert.equal(payload.recent[0].usedAt,4567);
assert.equal(payload.recent[0].count,2);
assert.equal(JSON.stringify(current),frozen,'export must not mutate caller data');

const moved=core.importAddressBook(payload,{});
assert.equal(moved.added,2);
assert.equal(moved.skipped,0);
assert.equal(moved.changes.slots.home.name,'Zuhause');
assert.equal(moved.changes.slots.home.id,'android-home');
assert.equal(moved.changes.favorites[0].name,'Gymnasium');
assert.equal(moved.changes.recent[0].usedAt,4567);
const merged=core.importAddressBook(payload,current);
assert.equal(merged.changes.favorites.length,1,'duplicates must be collapsed');
assert.equal(JSON.stringify(current),frozen,'import must not mutate caller data');
const partial=core.importAddressBook({
 favorites:[gym,{name:'Kaputt',lat:100,lng:0}],recent:[gym]
},{});
assert.equal(partial.added,1);
assert.equal(partial.skipped,1);
assert.equal(partial.changes.favorites.length,1);
assert.throws(()=>core.importAddressBook([],{}),/Ungültiges Adressbuch/);
assert.throws(()=>core.importAddressBook({unexpected:true},{}),/Ziellisten/);
assert.throws(()=>core.importAddressBook({saved:new Array(2001).fill(gym)},{}),/Zu viele Ziele/);

const calls=[];
const fakeNav={
 hasKey:()=>true,webData:()=>current,webWrite:delta=>{calls.push(['write',delta]);return true},
 changeQuery:q=>calls.push(['query',q]),
 pick:(kind,index)=>{calls.push(['pick',kind,index]);return Promise.resolve(true)},
 webSaveSelectedSlot:slot=>calls.push(['slot',slot]),
 saveFavorite:()=>calls.push(['favorite']),webPoi:(...args)=>calls.push(['poi',...args])
};
const provider=core.createBrowserProvider(fakeNav);
assert(Object.isFrozen(provider));
assert.equal(provider.isReady(),true);
assert.equal(provider.read().slots.home.name,'Zuhause');
provider.search('Erlangen');
await provider.choose('favorites',0);
provider.saveSlot('home');
provider.saveFavorite();
provider.searchNearby('fuel','Tankstelle',null);
provider.write({favorites:[]});
assert.deepEqual(calls.map(x=>x[0]),['query','pick','slot','favorite','poi','write']);
assert.throws(()=>core.createProvider({read(){}}),/missing method/);
// The same UI contract accepts a second implementation; no Android SDK is loaded.
const adapter=core.createProvider({
 isReady:()=>true,read:()=>core.snapshot({}),write:()=>true,search:()=>{},
 choose:()=>{},saveSlot:()=>{},saveFavorite:()=>{},searchNearby:()=>{}
});
assert.equal(adapter.read().recent.length,0);
console.log('Shared navigation core: provider interface, address-book roundtrip, migration and validation passed.');
