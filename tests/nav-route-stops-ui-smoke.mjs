/* Android-parity route-stop UI state tests: keep navigation active when
 * searching nearby POIs and adding a stop; no native bridge changes. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext, Script} from 'node:vm';

const source=readFileSync(new URL('../nav-web-parity.js',import.meta.url),'utf8');
const shared=readFileSync(new URL('../navigation-shared-core.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../nav-web-parity.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../index.html',import.meta.url),'utf8');
new Script(source);new Script(shared);
assert.match(css,/mg-poi-action-stop/);
assert.match(app,/routeStopsHTML/);
assert.match(app,/MeviWebNavParity\.openStopSearch\(\)/);
assert.match(app,/MeviGoogleNav\.removeRouteStop\(/);

const place={name:'Test-Autohof',address:'A3 Nürnberg',lat:49.61,lng:11.0,placeId:'ChIJAutohof',types:['gas_station']};
const initial={name:'Ziel',address:'Zielstadt',lat:49.9,lng:10.9};
const state={favorites:[],recent:[],slots:{home:null,work:null},suggestions:[],
 poiResults:[],poiActive:false,poiLoading:false,poiError:'',query:'',origin:{lat:49.60,lng:11}};
const ctx={hasRoute:true,active:true,stops:[],maxStops:8,destination:initial};
const calls=[];let failNext=false;
const W={
 browseOverlay:()=>'<div class="inner"></div>',
 render:()=>{},confirm:()=>true,
 MeviSharedNavigationProvider:{
  isReady:()=>true,read:()=>state,write:()=>true,search:query=>{state.query=query;state.poiResults=[]},
  choose:async()=>{calls.push({action:'choose'});return true},saveSlot:()=>true,saveFavorite:()=>true,
  routeContext:()=>ctx,addStop:async stop=>{
   calls.push({action:'add',stop});if(failNext)return false;
   ctx.stops.push(stop);return true;
  },
  removeStop:async index=>ctx.stops.splice(index,1),
  resolveStop:async place=>{calls.push({action:'resolve',place});return place.placeId==='ChIJImported'?
   {...place,lat:49.66,lng:11.04}:null},
  searchNearby:async (type,query,origin,options)=>{
   calls.push({action:'poi',type,query,options});
   state.poiResults=[place];state.poiActive=true;state.poiLoading=false;return true;
  },
  details:async()=>({...place,rating:4.5,openNow:true}),
  startRoute:async()=>{calls.push({action:'route'});return true}
 }
};
const s={app:'nav',mode:'map',nav:'driving',query:'',keyboard:false};
runInNewContext(shared,{window:W});
runInNewContext(source,{window:W,s,document:{getElementById:()=>null,querySelector:()=>null},
 navigator:{},console});
const ui=W.MeviWebNavParity;
ui.openStopSearch();
assert.equal(s.nav,'search');
assert(W.searchOverlay().includes('Ziel suchen'));
ui.poi('fuel','Tankstelle');
let html=W.searchOverlay();
assert(html.includes('In Routennähe'),'Active route offers corridor toggle');
assert(html.includes('Suche an mehreren Punkten'),'Corridor mode must state approximation');
assert(html.includes('Als Zwischenstopp hinzufügen'),'POI list actions become add-stop');
assert(calls.find(c=>c.action==='poi')?.options.alongRoute===true,'Stop search defaults to route corridor');
ui.poiAlongRoute();
assert.equal(calls.at(-1).options.alongRoute,false,'User can disable corridor search');
ui.poiAlongRoute();
assert.equal(calls.at(-1).options.alongRoute,true,'User can enable corridor search');
await ui.showPlace(0);
html=W.searchOverlay();
assert(html.includes('＋ Als Stopp hinzufügen'),'Detail sheet lets user add a stop');
assert(html.includes('Neue Route'),'Alternative explicit route action still visible');
assert.equal(ctx.stops.length,0,'Opening details does not mutate route');
await ui.addStopPlace();
assert.equal(ctx.stops.length,1,'Add stop must route through platform provider');
assert.equal(s.nav,'driving','After stop addition resume running guidance');
assert.equal(calls.filter(c=>c.action==='route').length,0,'Adding stop does not start a new unrelated route');

// Favorites and recent targets must be added as intermediate waypoints, not
// treated as an ordinary destination (which would stop active Road Assist).
state.favorites=[
 {name:'Zuhause',address:'Adelsdorf',lat:49.71,lng:10.90,placeId:'ChIJHome'},
 {name:'Importiertes Ziel',address:'Bamberg',placeId:'ChIJImported'},
 {name:'Ungültiges Ziel',address:'Ohne Position',placeId:'ChIJMissing'}
];
state.recent=[{name:'Werkstatt',address:'Forchheim',lat:49.72,lng:11.04}];
ui.openStopSearch();
await ui.choose('favorites',0);
assert.equal(ctx.stops.length,2,'Saved favorite becomes an intermediate stop');
assert.equal(ctx.destination.name,initial.name,'Final destination must not change');
assert.equal(s.nav,'driving','Resume guidance after adding a saved favorite');
ui.openStopSearch();
await ui.choose('recent',0);
assert.equal(ctx.stops.length,3,'Recent target becomes an intermediate stop');
ui.openStopSearch();
await ui.choose('favorites',1);
assert.equal(ctx.stops.length,4,'Place-ID-only imported favorite is resolved and added');
assert(calls.some(c=>c.action==='resolve'&&c.place.placeId==='ChIJImported'));
assert.equal(calls.filter(c=>c.action==='choose').length,0,
 'Saved stops must never call choose() and terminate running navigation');
ui.openStopSearch();
assert.equal(await ui.choose('favorites',2),undefined);
assert.equal(ctx.stops.length,4,'Unresolvable Place ID preserves route');
assert(W.searchOverlay().includes('bisherige Route bleibt bestehen'));
ui.close();

failNext=true;
ui.openStopSearch();
ui.poi('fuel','Tankstelle');
assert.equal(await ui.addStopResult(0),false);
assert.equal(s.nav,'search','On failed route computation remain in POI sheet');
assert.equal(ctx.stops.length,4,'Do not mutate waypoint list on failed add');
assert(W.searchOverlay().includes('bisherige Route bleibt bestehen'),'Show visible failure and rollback');
failNext=false;
ui.close();
assert.equal(s.nav,'driving','Back from failed stop search preserves guidance');

ctx.active=false;
ui.openStopSearch();
ui.poi('fuel','Tankstelle');
await ui.addStopResult(0);
assert.equal(s.nav,'ready','When planning, return to route preview');

console.log('Route-stop POI UI: corridor toggle, explicit stop actions, fail-safe add, resume guidance and preview: passed.');
