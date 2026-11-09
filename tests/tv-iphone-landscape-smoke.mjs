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
assert.match(tv,/data-xt-item/);

// Critical: never cover the MeviCar dock. Full-mode host has two simultaneous panes.
assert.doesNotMatch(css,/position:fixed;inset:0;z-index:1100/);
assert.doesNotMatch(css,/width:100vw;width:100dvw;height:100vh;height:100dvh/);
assert.match(css,/\.cockpit \.full>\.tv-root\.tv-xtream-mode\{[\s\S]*?position:static/);
assert.match(css,/\.cockpit \.full>\.tv-root\.tv-xtream-mode\.tv-watching>\.tv-library\{[\s\S]*?display:flex!important;flex:0 0 37%/);
assert.match(css,/\.cockpit \.full>\.tv-root\.tv-xtream-mode\.tv-watching>\.tv-player\{[\s\S]*?display:flex!important/);
assert.match(css,/\.tv-root\.tv-xtream-mode>\.tv-library>header,[\s\S]*?display:none!important/);
assert.match(css,/\.tv-root\.tv-xtream-mode \.tv-xtream-tools\{display:flex;flex-direction:column/);
assert.match(css,/\.tv-root\.tv-xtream-mode \.tv-xtream-list\{flex:1 1 auto;min-height:0;overflow-y:auto/);
assert.match(css,/\.tv-root\.tv-xtream-mode \.tv-player \[data-act="list"\]\{display:none\}/);

// IPTV has own categories and search, not public TV filters/header.
assert.match(tv,/root\.classList\.toggle\('tv-xtream-mode',xtreamView\)/);
assert.match(tv,/class="tv-xtream-tools"/);
assert.match(tv,/data-act="xtream-back"/);
assert.doesNotMatch(tv,/Zur Senderliste/);
assert.doesNotMatch(tv,/tv-player-back/);
assert.match(tv,/class="tv-stage"/);
assert.match(tv,/class="tv-actions"/);

assert.match(html,/<link rel="stylesheet" href="\.\/tv\.css">/);
assert.match(workflow,/pathlib\.Path\('tv\.css'\)\.read_text\(\)/);
assert.match(workflow,/cp [^\n]*tv\.css [^\n]*dist\//);
console.log('MeviTV iPhone landscape: MeviCar dock preserved, IPTV library + player visible together, scroll and controls OK.');
