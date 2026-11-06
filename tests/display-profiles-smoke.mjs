/* Five viewport profile smoke gate (no browser dependency in GitHub Actions).
   Actual Chromium geometry + screenshot tests run separately in the UI audit. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../display-profiles.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
const doc=readFileSync(new URL('../DISPLAY_PROFILE_MATRIX.md',import.meta.url),'utf8');
const profiles=[
  ['iPhone 17',874,402],
  ['S20 FE',915,412],
  ['DeX',1920,1200],
  ['Full HD',1920,1080],
  ['Panorama',1920,720],
];
assert.equal(profiles.length,5);
for(const [name,width,height] of profiles){
  assert.ok(width>height,name+' must use a landscape test viewport');
  assert.ok(doc.includes(name),name+' must be documented');
  assert.ok(doc.includes(width+' × '+height),name+' size missing in profile matrix');
}
assert.match(css,/@media\(orientation:landscape\) and \(max-width:1024px\) and \(max-height:480px\)/);
assert.match(css,/@media\(orientation:landscape\) and \(min-width:1150px\)/);
assert.match(css,/@media\(orientation:landscape\) and \(min-width:1500px\) and \(min-height:880px\)/);
assert.match(css,/@media\(orientation:landscape\) and \(min-width:1500px\) and \(max-height:820px\)/);
for(const selector of [
  '.map.searchmode .keyboard',
  '.map.searchmode .overlay.nav-search',
  '.mm-shell.is-compact .mm-content',
  '.mm-shell.is-compact[data-pane="player"] .mm-library',
  '.mm-shell.is-compact .mm-transport',
]){
  assert.ok(css.includes(selector),'Responsive selector missing: '+selector);
}
assert.ok(css.includes('env(safe-area-inset-left'),'iPhone safe-area insets must be handled');
assert.ok(css.includes('--car-touch:44px'),'Touch target baseline is missing');
assert.ok(html.includes('<link rel="stylesheet" href="./display-profiles.css">'));
assert.ok(workflow.includes('mevicar-display-profiles'),'Display profiles must be bundled into the deployed HTML');
assert.ok(workflow.includes('display-profiles.css dist/'),'Display profiles must be copied into Pages assets');
assert.ok(sw.includes("'./display-profiles.css'"),'Display profiles must be pre-cached');
assert.match(html,/name="viewport" content="[^"]*viewport-fit=cover/);
console.log('Five landscape profiles: iPhone 17, Galaxy S20 FE, DeX, Full HD, panorama – static integration checks passed.');
