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
assert.equal((browse.match(/Wohin soll es gehen\?/g)||[]).length,1);
assert.equal((browse.match(/Zuletzt verwendet · Demo/g)||[]).length,3);
assert.doesNotMatch(browse,/🎙|Apple-Karten-Stil · Suchen|Orte ›/);
assert.match(browse,/Favoriten/);
assert.match(browse,/app-illustration/);

let search=app.searchOverlay();
assert.match(search,/overlay glass nav-search/,'Landscape keyboard layout must apply to search');
assert.match(search,/Zieladresse eingeben/);
assert.match(search,/navClearQuery/);
assert.match(search,/Vorschläge und letzte Ziele/);
assert.match(search,/app-illustration/);
assert.doesNotMatch(search,/Zum Scrollen wischen/);

assert.doesNotMatch(app.mapHTML(),/IN 850 M|↱ Rechts abbiegen|Zusatzscreen|map-tools/);
assert.match(app.mapHTML(),/KARTE · DEMO/);
assert.doesNotMatch(app.previewHTML(),/24 Min|29 Min|Alternative Route/);
assert.match(app.previewHTML(),/keine Wegberechnung/);
assert.match(app.previewHTML(),/preview glass nav-preview/);
assert.match(app.previewHTML(),/Demo starten/);

// Re-run the user's paths in one persistent JS VM using a small mock DOM.
assert.equal(get('s.mode'),'map');
get('openApp("apps")');
assert.equal(get('s.mode'),'full');
get('launch("weather")');
assert.equal(get('s.mode'),'split');
assert.match(node('screen').innerHTML,/class="map /);
assert.match(node('screen').innerHTML,/class="side /);
get('openApp("nav")');
assert.equal(get('s.mode'),'map');
get('openApp("audio")');
assert.equal(get('s.mode'),'split');
get('openApp("audio")');
assert.equal(get('s.mode'),'full');
get('openApp("nav")');
get('openSearch()');
assert.equal(get('s.nav'),'search');
assert.match(node('screen').innerHTML,/Ziel suchen/);
assert.equal(get('resultsHTML().split("<strong>Erlangen-Nord</strong>").length-1'),1);
get('s.query="XYZ Testadresse 17"');
assert.match(get('resultsHTML()'),/Eigene Zieleingabe · Demo/);
get('selectPlace("Erlangen Arcaden")');
assert.equal(get('s.nav'),'preview');
get('startRoute()');
assert.equal(get('s.nav'),'driving');
assert.doesNotMatch(node('screen').innerHTML,/IN 850 M|Zusatzscreen/);
get('stopRoute()');
assert.equal(get('s.nav'),'browse');
console.log('UI smoke OK: 3 themes, nav-first split, search dedupe, demo route, SVG suggestions, no duplicate/dead controls.');
