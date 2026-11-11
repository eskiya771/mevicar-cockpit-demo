import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {verifyOfficialMovi,officialBase} from '../scripts/verify-official-movi.mjs';

const manifest=verifyOfficialMovi();
const source=readFileSync(new URL('../tv.js',import.meta.url),'utf8');
const instrumented=source.replace('global.meviTVHTML=html;',
 'global.testOfficial={loadMoviPlayer,moviAssetBase};global.meviTVHTML=html;');
for(const search of ['', '?moviExperimental=1', '?moviExperimental=0']){
 const requests=[];
 const doc={createElement:()=>({}),head:{appendChild(script){
  requests.push(script.src);queueMicrotask(()=>script.onload());
 }}};
 const win={document:doc};
 runInNewContext(instrumented,{
  window:win,document:doc,URL,URLSearchParams,location:{search},
  localStorage:{getItem:()=>null},
  customElements:{get:()=>undefined,whenDefined:()=>Promise.resolve()}
 });
 await win.testOfficial.loadMoviPlayer();
 assert.deepEqual(requests,[officialBase+'element.slim.global.js']);
 assert.equal(win.testOfficial.moviAssetBase()+'movi.wasm',officialBase+'movi.wasm');
}
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
assert(sw.includes(officialBase+'element.slim.global.js'));
assert(sw.includes(officialBase+'movi.wasm'));
assert(!sw.includes('mevicar-next-shell-v31'));
const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
assert(!pages.includes('npm view movi-player version'));
assert(!pages.includes('gh run download'));
assert(pages.includes('node tests/movi-official-smoke.mjs'));
assert(pages.includes('cp -R vendor/movi-mevitv-mkv-size-2 dist/vendor/'));
assert(!source.includes('QUELLCODE-TESTBUILD'));
console.log('Official Movi OK: exact validated JS/WASM, default and former test URLs, matching WASM path, fresh PWA cache and deterministic deployment. Revision '+manifest.revision);
