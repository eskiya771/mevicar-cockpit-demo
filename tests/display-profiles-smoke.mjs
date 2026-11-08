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
  '.mm-radio-tools',
  '.mm-radio.is-adding .mm-radio-tools',
  '.mm-radio-add',
  '.mm-radio-own',
  '.mm-radio-remove',
]){
  assert.ok(css.includes(selector),'Responsive selector missing: '+selector);
}
assert.ok(css.includes('env(safe-area-inset-left'),'iPhone safe-area insets must be handled');
assert.ok(css.includes('--car-touch:44px'),'Touch target baseline is missing');
const touchChecks=[
  '.mm-shell.is-compact .mm-mode-button{min-width:44px}',
  '.mm-shell.is-compact .mm-now .mm-icon-button{width:44px',
  '.mm-shell .mm-transport button{min-width:44px;min-height:44px}',
  '.mm-shell .mm-transport .mm-primary{min-width:56px;min-height:56px}',
  '.map.searchmode .keyboard{width:72%;max-width:72%',
  '.map.searchmode .keyboard .keyrow button{min-height:44px',
  '.nav-search .tool-control{min-height:44px}',
  '.cockpit:has(.map.searchmode) .dock{display:none}',
  '.map.searchmode .keyboard .keyrow button{',
  'min-height:clamp(51px,13.5vh,58px)',
  'width:26%;min-width:0;max-width:none',
  '.mm-radio-search{flex:none;width:100%;min-height:44px}',
  '.mm-radio.is-compact .mm-radio-add input{min-height:44px',
];
for (const rule of touchChecks){
  assert.ok(css.includes(rule),'Touch quality rule missing: '+rule);
}
assert.ok(html.includes('<link rel="stylesheet" href="./display-profiles.css">'));
assert.ok(workflow.includes('mevicar-display-profiles'),'Display profiles must be bundled into the deployed HTML');
assert.match(workflow,/cp [^\n]*display-profiles\.css(?: [^\n]*)? dist\//,'Display profiles must be copied into Pages assets');
assert.ok(workflow.includes('mevicar-tacho-next-script'),'Native Tacho Next must be bundled into versioned HTML');
assert.ok(workflow.includes('tacho-next.js tacho-next.css dist/'),'Native Tacho Next files must be deployed');
assert.ok(sw.includes("'./display-profiles.css'"),'Display profiles must be pre-cached');
assert.match(html,/name="viewport" content="[^"]*viewport-fit=cover/);
console.log('Five landscape profiles: iPhone 17, Galaxy S20 FE, DeX, Full HD, panorama – static integration checks passed.');
