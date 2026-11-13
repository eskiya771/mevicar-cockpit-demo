/* UX quality gate – no new features: verify nav-first layout, demo honesty,
   unique address search and source-backed SVGs. Run: node tests/ui-quality-smoke.mjs */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../themes.css',import.meta.url),'utf8');
const js=html.slice(html.indexOf('<script>')+8,html.indexOf('</script>',html.indexOf('<script>')+8));
assert.ok(js.length>30000);
new Function(js);
assert.ok(css.includes('Quality pass 01:'));
assert.ok(css.includes('html[data-theme="cyberpunk"]'));
assert.ok(css.includes('html[data-theme="liquidglass"]'));

const states={};
const elements=new Map();
const node=id=>{
  if(!elements.has(id))elements.set(id,{
    innerHTML:'',textContent:'',className:'',style:{},firstChild:null,
    classList:{toggle(){},add(){},remove(){}},
    setAttribute(){},appendChild(){},insertBefore(){},remove(){},
    getAttribute(){return''}
  });
  return elements.get(id);
};
const doc={
  documentElement:{dataset:{}},body:node('body'),
  getElementById:id=>id==='gpsSpeed'?null:node(id),
  addEventListener(){},
  querySelector(){return null},
};
const localStorage={getItem(){return null},setItem(){}};
const context={
  document:doc,localStorage,navigator:{},
  window:{addEventListener(){}},
  console:{log(){},warn(){},error(){}},
  setTimeout(){return 1},setInterval(){return 2},clearTimeout(){},
  fetch(){return Promise.reject(Error('not in UI smoke test'))},
};
const cut=js.indexOf('setInterval(updateClock,1000)');
assert.ok(cut>0);
const code=js.slice(0,cut).replace('const CURRENT_BUILD=__MEVICAR_BUILD__','const CURRENT_BUILD={version:"0.4.0",build:0}');
// Execute the cockpit only once in a persistent VM context.
const vm = await import('node:vm');
const ctx=vm.createContext(context);
vm.runInContext(code,ctx);
const get=expr=>vm.runInContext(expr,ctx);
const app=get('({state:s,openApp,launch,resultsHTML,browseOverlay,searchOverlay,previewHTML,mapHTML,appVector})');
assert.equal(app.state.app,'nav');
assert.equal(app.state.mode,'map');
assert.deepEqual(Array.from(new Set(['default','cyberpunk','liquidglass'])),['default','cyberpunk','liquidglass']);

let browse=app.browseOverlay();
assert.match(browse,/overlay glass nav-browse/,'Responsive browse styles must be bound to the real markup');
assert.equal((browse.match(/Ort oder Adresse/g)||[]).length,1);
assert.match(browse,/Letzte Ziele/);
assert.doesNotMatch(browse,/Zuletzt verwendet · Demo/);
assert.doesNotMatch(browse,/🎙|Apple-Karten-Stil · Suchen|Orte ›/);
assert.match(browse,/Favoriten/);
assert.match(browse,/app-illustration/);

let search=app.searchOverlay();
assert.match(search,/overlay glass nav-search/,'Landscape keyboard layout must apply to search');
assert.match(search,/Zieladresse eingeben/);
assert.match(search,/navClearQuery/);
assert.match(search,/nav-entry-caret/);
assert.match(search,/navEntryPlaceholder/);
assert.match(search,/Vorschläge und letzte Ziele/);
assert.match(search,/app-illustration/);
assert.doesNotMatch(search,/Zum Scrollen wischen/);

assert.doesNotMatch(app.mapHTML(),/IN 850 M|↱ Rechts abbiegen|Zusatzscreen|map-tools/);
assert.doesNotMatch(app.mapHTML(),/KARTE · DEMO/);
assert.doesNotMatch(app.previewHTML(),/24 Min|29 Min|Alternative Route/);
assert.match(app.previewHTML(),/Google Maps/);
assert.match(app.previewHTML(),/preview glass nav-preview/);
assert.match(app.previewHTML(),/Route berechnen/);

// Re-run the user's paths in one persistent JS VM using a small mock DOM.
assert.equal(get('s.mode'),'map');
get('openApp("apps")');
assert.equal(get('s.mode'),'full');
get('launch("weather")');
assert.equal(get('s.mode'),'full');
get('openApp("weather")');
assert.equal(get('s.mode'),'split');
assert.match(node('screen').innerHTML,/class="map /);
assert.match(node('screen').innerHTML,/class="side /);
get('openApp("weather")');
assert.equal(get('s.mode'),'full');
get('openApp("nav")');
assert.equal(get('s.mode'),'map');
get('openApp("nav")');
assert.equal(get('s.mode'),'map'); // Navigation must never toggle to split on repeated tap.
get('openApp("nav")');
assert.equal(get('s.mode'),'map');
get('openApp("audio")');
assert.equal(get('s.mode'),'full');
get('openApp("audio")');
assert.equal(get('s.mode'),'split');
get('openApp("audio")');
assert.equal(get('s.mode'),'full');
get('openApp("nav")');
get('openSearch()');
assert.equal(get('s.app'),'settings','Before a Maps key exists, search opens central credential Settings');
assert.equal(get('s.settingsTab'),'credentials');
assert.equal(get('s.nav'),'browse','Search does not activate without a key');
get('window.MeviGoogleNav={hasKey:()=>true,changeQuery(){},mapBackdrop(){return "<div id=\\"mg-map\\"></div>"},locationButton(){return ""},resultsHTML(){return ""},favoritesHTML(){return ""},buttons(){return ""},mount(){}}');
get('openApp("nav")');
get('openSearch()');
assert.equal(get('s.nav'),'search','Search opens after configuring the Web Maps key');
assert.match(node('screen').innerHTML,/Ziel suchen/);
// The legacy fixed-destination demo is replaced by an isolated Web navigation
// adapter. Assert the integration contract, not fake address results/routes.
assert.match(node('screen').innerHTML,/mg-navigation/);
assert.doesNotMatch(node('screen').innerHTML,/Erlangen · Demo-Karte|ROUTEN-DEMO/);
assert.match(js,/MeviGoogleNav\?\.resultsHTML\(\)/);
assert.match(js,/MeviGoogleNav\?\.changeQuery\(v\)/);
assert.match(js,/n\.calculateRoute\(\)/);
assert.match(js,/n\.startGuidance\(\)/);
assert.match(html,/navigation-google\.js/);
assert.match(html,/navigation-google\.css/);
assert.match(readFileSync(new URL('../navigation-google.js',import.meta.url),'utf8'),/AutocompleteSuggestion\.fetchAutocompleteSuggestions/);
assert.match(readFileSync(new URL('../navigation-google.js',import.meta.url),'utf8'),/Route\.computeRoutes/);
get('backToBrowse()');
assert.equal(get('s.nav'),'browse');
console.log('UI smoke OK: 3 themes, first-run Maps key gating, CarPlay-like search overlay and route adapter linked.');
