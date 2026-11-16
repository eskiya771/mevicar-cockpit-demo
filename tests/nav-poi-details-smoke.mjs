/* Web POI integration: list results use cheap fields, details are fetched lazily,
   open-now and sorting options map to Places API and saving never starts routing.
   Uses fake Google Place responses; no network or real API credentials. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext,Script} from 'node:vm';
const source=readFileSync(new URL('../navigation-google.js',import.meta.url),'utf8');
new Script(source);
const logs=[],display={innerHTML:''};
const listing=[
 {id:'ChIJFUEL001',displayName:'Test-Tankstelle',formattedAddress:'Erlangen',
  location:{lat:49.6,lng:11.01},types:['gas_station']},
 {id:'ChIJFUEL002',displayName:'Autohof',formattedAddress:'Bamberg',
  location:{lat:49.61,lng:11.02},types:['gas_station']}
];
class Place{
 static async searchNearby(request){
  logs.push({kind:'nearby',request});
  if(request.includedPrimaryTypes.includes('car_repair'))throw new Error('Google API quota');
  return {places:listing};
 }
 static async searchByText(request){
  logs.push({kind:'text',request});
  return {places:listing.slice(0,1)};
 }
 constructor({id}){this.id=id}
 async fetchFields({fields}){
  logs.push({kind:'detail',fields});
  this.id=this.id||listing[0].id;this.displayName='Test-Tankstelle';
  this.formattedAddress='Hauptstraße 5, Erlangen';
  this.location={lat:49.6,lng:11.01};this.types=['gas_station'];
  this.rating=4.5;this.userRatingCount=123;this.internationalPhoneNumber='+49 9131 12345';
  this.currentOpeningHours={weekdayDescriptions:['Montag 06:00–22:00']};
 }
 async isOpen(){return true}
}
const maps={importLibrary:async name=>name==='places'?
 {Place,SearchNearbyRankPreference:{DISTANCE:'DISTANCE',POPULARITY:'POPULARITY'},
  SearchByTextRankPreference:{DISTANCE:'DISTANCE',RELEVANCE:'RELEVANCE'}}:{}};
const W={google:{maps}},doc={
 getElementById:id=>id==='suggestions'?display:null,
 querySelector:()=>null,createElement:()=>({}),
};
const storage={getItem:key=>key==='mevicar-next-google-maps-key-v1'?'WEB-TEST-KEY':null,
 setItem(){}};
runInNewContext(source,{
 window:W,document:doc,localStorage:storage,google:W.google,
 navigator:{geolocation:{}},Intl,setTimeout,clearTimeout,setInterval:()=>1,clearInterval:()=>{},console
});
const api=W.MeviGoogleNav;
const nearOrigin={lat:49.6,lng:11.01};
assert.equal(await api.webPoi('fuel','Tankstelle',nearOrigin),true);
let state=api.webData();
assert.equal(state.poiActive,true);
assert.equal(state.poiLoading,false);
assert.equal(state.poiResults.length,2);
assert.equal(state.poiResults[0].placeId,'ChIJFUEL001');
assert.equal(state.poiResults[0].types[0],'gas_station');
assert.equal(logs.filter(x=>x.kind==='detail').length,0,'Do not fetch details for list entries');
assert.equal(logs[0].kind,'nearby');
assert.deepEqual(Array.from(logs[0].request.fields),['id','displayName','formattedAddress','location','types']);
assert.equal(logs[0].request.rankPreference,'DISTANCE');
assert.match(display.innerHTML,/Test-Tankstelle/,'Results are rendered by live provider');

const detail=await api.webPlaceDetails('suggest',0);
assert.equal(detail.rating,4.5);
assert.equal(detail.ratingCount,123);
assert.equal(detail.phone,'+49 9131 12345');
assert.equal(detail.openNow,true);
assert.equal(detail.hours.length,1);
assert.equal(logs.filter(x=>x.kind==='detail').length,1,'Details are loaded on demand');
assert.equal(api.guidanceRunning(),false,'Opening place details never starts a route');

assert.equal(await api.webPoi('fuel','Tankstelle',nearOrigin,{sort:'relevance',openNow:true}),true);
assert.equal(logs.at(-1).kind,'text','Open-now uses Places TextSearch filter');
assert.equal(logs.at(-1).request.isOpenNow,true);
assert.equal(logs.at(-1).request.includedType,'gas_station');
assert.equal(logs.at(-1).request.rankPreference,'RELEVANCE');

assert.equal(await api.webPoi('text','Apotheke',nearOrigin,{sort:'distance'}),true);
assert.equal(logs.at(-1).request.textQuery,'Apotheke');
assert.equal(logs.at(-1).request.rankPreference,'DISTANCE');

assert.equal(await api.webPoi('wrench','Werkstatt',nearOrigin),false);
state=api.webData();
assert.equal(state.poiResults.length,0,'Failed POI request must not show stale results');
assert.match(state.poiError,/Google API quota/,'API failure must be visible with retry');
assert.equal(state.poiLoading,false);
assert.equal(api.guidanceRunning(),false);
console.log('POI list filtering, distance/relevance sorting, lazy rating/phone/opening details and errors: passed.');
