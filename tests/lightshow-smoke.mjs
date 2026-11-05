/* Independent Lichtshow app regression tests. Run: node tests/lightshow-smoke.mjs */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const src=readFileSync(new URL('../lightshow.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../lightshow.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
new Function(src);
assert.ok(css.includes('.lightshow-app')&&css.includes('.lightshow-stage'));
assert.match(html,/\['lightshow','Lichtshow'/);
assert.ok(html.includes('window.meviLightshowMount()')&&html.includes('window.meviLightshowUnmount()'));
assert.ok(html.includes("s.mode=id==='lightshow'?'split'"));

const effects=Array.from({length:35},(_,i)=>['effect-'+i,'Effekt '+i]);
let constructed=0,draws=[],resizes=0,touches=0,disconnected=0;
const library={effects,create(canvas){
  constructed++;
  assert.equal(canvas,stageCanvas);
  return {resize(){resizes++},draw(id,t,dt){draws.push({id,t,dt})},touch(){touches++}};
}};
let nextFrame=1;
const callbacks=new Map();
const requestAnimationFrame=fn=>{const id=nextFrame++;callbacks.set(id,fn);return id};
const cancelAnimationFrame=id=>callbacks.delete(id);
const tick=now=>{const prev=[...callbacks.values()];callbacks.clear();for(const cb of prev)cb(now)};
const elements=new Map();
for(const id of ['lightshow-name','lightshow-mode','lightshow-play','lightshow-effect','lightshow-fast','lightshow-slow']){
  elements.set(id,{value:'auto',textContent:'',innerHTML:'',dataset:{},
    setAttribute(key,value){this[key]=value}});
}
const stageCanvas={
  getBoundingClientRect(){return{width:620,height:360,left:0,top:0}},
  addEventListener(){},removeEventListener(){}
};
let app=null;
function makeApp(){
  return {isConnected:true,dataset:{},querySelector(selector){return selector==='#lightshow-canvas'?stageCanvas:null}};
}
let visibilityHandler=()=>{};
const document={
  hidden:false,
  querySelector(selector){assert.equal(selector,'.lightshow-app');return app},
  getElementById(id){return elements.get(id)||null},
  addEventListener(kind,fn){if(kind==='visibilitychange')visibilityHandler=fn}
};
const events={};
const window={
  MevidartsLightRenderer:library,
  meviSaverGet(){return{cycleSeconds:1}},
  devicePixelRatio:1,
  addEventListener(kind,fn){events[kind]=fn}
};
const store={};
const localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v};
let time=500;
class ResizeObserver{
  constructor(cb){this.cb=cb}
  observe(){this.cb()}
  disconnect(){disconnected++}
}
runInNewContext(src,{window,document,console,localStorage,
  requestAnimationFrame,cancelAnimationFrame,ResizeObserver,
  performance:{now:()=>time}});
assert.equal(window.meviLightshowDebug().cycleSeconds,1);
const mini=window.meviLightshowHTML(true),full=window.meviLightshowHTML(false);
assert.equal((mini.match(/<option /g)||[]).length,36); // 35 real + automatic
assert.ok(mini.includes('is-compact'));
assert.ok(!full.includes('is-compact'));
assert.match(full,/meviLightshowStep\(1\)/);
assert.match(full,/meviLightshowInterval\(24\)/);

app=makeApp();window.meviLightshowMount();
assert.equal(constructed,1);
assert.ok(resizes>0);assert.ok(draws.length>0);
assert.ok(callbacks.size===1);
for(let i=1;i<40;i++)tick(i*40);
assert.ok(draws.some(v=>v.id==='effect-0'));
assert.ok(draws.some(v=>v.id==='effect-1')); // 1s auto cycle
window.meviLightshowSelect('effect-8');
assert.equal(window.meviLightshowDebug().current,'effect-8');
window.meviLightshowStep(1);
assert.equal(window.meviLightshowDebug().current,'effect-9');
window.meviLightshowSelect('auto');
window.meviLightshowInterval(24);
assert.equal(window.meviLightshowDebug().cycleSeconds,24);
assert.equal(JSON.parse(store['mevicar-lightshow-v1']).cycleSeconds,24);
window.meviLightshowSelect('effect-33');
window.meviLightshowStep(1);
assert.equal(window.meviLightshowDebug().current,'effect-34');
window.meviLightshowStep(1);
assert.equal(window.meviLightshowDebug().current,'effect-0');
window.meviLightshowToggle();
assert.equal(window.meviLightshowDebug().playing,false);
assert.equal(callbacks.size,0);
window.meviLightshowToggle();
assert.equal(callbacks.size,1);
document.hidden=true;visibilityHandler();
assert.equal(callbacks.size,0);
document.hidden=false;visibilityHandler();
assert.equal(callbacks.size,1);
window.meviLightshowUnmount();
assert.equal(window.meviLightshowDebug().active,false);
assert.equal(callbacks.size,0);
assert.ok(disconnected>0);
app=makeApp();window.meviLightshowMount();
assert.equal(constructed,2); // new drawing surface for new app layout
assert.equal(window.meviLightshowDebug().active,true);
app=null;window.meviLightshowMount();
assert.equal(window.meviLightshowDebug().active,false);
assert.equal(callbacks.size,0);
console.log('Lichtshow OK: 35 effects, split/full canvas, auto 1s/24s, picker, pause, visibility, unmount.');
