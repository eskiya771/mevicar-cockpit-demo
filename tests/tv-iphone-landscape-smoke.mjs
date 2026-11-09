import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../tv.css',import.meta.url),'utf8');
const tv=readFileSync(new URL('../tv.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');

assert.match(css,/@media\s*\(orientation:landscape\)\s*and\s*\(max-width:1024px\)\s*and\s*\(max-height:480px\)/);
assert.match(css,/\.tv-xtream-item\{flex:0 0 auto;min-height:48px/);
assert.match(css,/\.tv-root \.tv-xtream-item\{flex:0 0 auto;min-height:45px;height:45px/);
assert.match(css,/\.tv-root \.tv-xtream-list\{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden/);
assert.match(css,/\.tv-xtream-list\{overscroll-behavior:contain;touch-action:pan-y\}/);
assert.match(css,/-webkit-overflow-scrolling:touch/);
assert.match(css,/env\(safe-area-inset-bottom,0px\)/);
assert.match(css,/\.tv-root \.tv-library\{gap:4px;height:100%;max-height:100%;overflow:hidden\}/);
assert.match(css,/\.tv-root \.tv-xtream-tabs button\{min-height:36px/);
assert.match(css,/\.tv-root \.tv-xtream-group,\.tv-root \.tv-xtream-search\{min-height:36px/);
assert.match(css,/\.tv-root \[data-act="xtream-back"\]\{flex:none;min-height:30px/);
assert.match(tv,/data-xt-item/);
assert.match(html,/<link rel="stylesheet" href="\.\/tv\.css">/);
assert.match(workflow,/pathlib\.Path\('tv\.css'\)\.read_text\(\)/);
assert.match(workflow,/cp [^\n]*tv\.css [^\n]*dist\//);
console.log('MeviTV iPhone landscape: non-shrinking sender rows, available-height scrolling, compact controls and safe-area checks OK.');
