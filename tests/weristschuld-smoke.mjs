/* Regression checks for the MeviCar Next bottle spinner and nine default parties. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const js=readFileSync(new URL('../weristschuld.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../weristschuld.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const pages=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
const quality=readFileSync(new URL('../.github/workflows/quality.yml',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
new Function(js);
const {DEFAULT,randomIndex,nextRotation,clean}=require('../weristschuld.js');
assert.deepEqual(DEFAULT,['Merz','Typtest','Systemtest','Entwicklung','PSS','Werk','PL','EU','SINAMICS']);
assert.equal(DEFAULT.length,9);
assert.equal(new Set(DEFAULT).size,DEFAULT.length);
assert.equal(clean('  Neues   Team  '),'Neues Team');
assert.ok(clean('a'.repeat(40)).length<=28,'Participant names limited');
for(let i=0;i<900;i++){
 const index=randomIndex(DEFAULT.length);
 assert.ok(index>=0&&index<DEFAULT.length,'Uniform random selection must remain inside wheel');
 const old=i*73.6;
 const next=nextRotation(old,index,DEFAULT.length,5);
 assert.ok(next>old+4*360,'Bottle must make multiple full turns');
 const settled=((next%360)+360)%360;
 const expected=(index*360/DEFAULT.length)%360;
 assert.ok(Math.abs(settled-expected)<0.00001,'Bottle must stop exactly at chosen name');
}
for(const test of [
 'meviWhosGuiltyHTML','meviWhosGuiltyMount','meviWhosGuiltyUnmount',
 "['guilty','Wer ist schuld?','↻']",'class="full wis-host"','DOCK_COLORS.guilty','APP_VECTORS.guilty'
])assert.ok(html.includes(test),'Missing cockpit app integration '+test);
assert.match(css,/\.wis-split/);
assert.match(css,/@media\(max-height:480px\)/);
assert.match(css,/\.wis-bottle/);
assert.match(js,/localStorage/);
assert.match(js,/data-action="restore"/);
assert.match(js,/data-action="spin"/);
assert.match(js,/meviWhosGuiltyUnmount/);
assert.doesNotMatch(js,/fetch\s*\(/,'Game must remain private and offline');
for(const workflow of [pages,quality]){
 assert.match(workflow,/weristschuld-smoke\.mjs/);
 assert.match(workflow,/weristschuld\.css/);
 assert.match(workflow,/weristschuld\.js/);
}
assert.match(sw,/weristschuld\.css/);
assert.match(sw,/weristschuld\.js/);
console.log('Wer ist schuld? nine parties, unbiased bottle selection, animation alignment, CSS and deploy wiring passed');
