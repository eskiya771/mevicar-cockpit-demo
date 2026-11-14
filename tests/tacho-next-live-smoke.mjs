/* Regression for live Tacho Next: never synthesize GPS/compass/OBD values.
 * No physical location is used. Mock positions come solely from this test. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const js=readFileSync('tacho-next.js','utf8');
const css=readFileSync('tacho-next.css','utf8');
assert.doesNotMatch(js,/dirSpeed|dirRpm|compassHeading=\(compassHeading\+|rpm=1900|speed=170/);
assert.match(js,/watchPosition/);
assert.match(js,/deviceorientation/);
assert.match(js,/requestPermission/);
assert.match(css,/\.tn-gps-status/);
assert.match(css,/\.tn-compass-empty/);

let time=1_000_000_000;
class Clock extends Date {static now(){return time;}}
const stored=new Map();
const storage={
 getItem:key=>stored.get(key)||null,
 setItem:(key,val)=>stored.set(key,String(val)),
 removeItem:key=>stored.delete(key)
};
const nodes=new Map();
function node(key){
 if(!nodes.has(key))nodes.set(key,{
  key,hidden:false,textContent:'',innerHTML:'',style:{},isConnected:true,
  children:[],attrs:{},listeners:{},
  setAttribute(name,value){this.attrs[name]=String(value)},
  getAttribute(name){return this.attrs[name]},
  getTotalLength(){return 565.49},
  querySelector(selector){return node(selector)},
  closest(selector){return selector==='.tn-compass-band'?node('compassBand'):null},
  insertBefore(el){this.children.push(el)},
  appendChild(el){this.children.push(el)},
  addEventListener(name,fn){this.listeners[name]=fn},
  removeEventListener(name){delete this.listeners[name]}
 });
 return nodes.get(key);
}
const host=node('host'),docListeners={},windowListeners={},timers=new Map(),watches=new Map(),removed=[];
let timerId=0,watchId=0;
const geolocation={
 watchPosition(ok,error,options){
  assert.equal(options.enableHighAccuracy,true);
  const id=++watchId;watches.set(id,{ok,error});return id;
 },
 clearWatch(id){removed.push(id);watches.delete(id)}
};
const document={
 hidden:false,querySelector:selector=>selector==='.tacho-next-host'?host:null,
 createElementNS:(namespace,tag)=>node('svg-created-'+tag+'-'+Math.random()),
 addEventListener:(name,fn)=>{docListeners[name]=fn},
 removeEventListener:name=>{delete docListeners[name]}
};
const window={
 DeviceOrientationEvent:function(){},
 addEventListener:(name,fn)=>{windowListeners[name]=fn},
 removeEventListener:name=>{delete windowListeners[name]}
};
const context={
 window,document,navigator:{geolocation},localStorage:storage,Date:Clock,
 setInterval:fn=>{const id=++timerId;timers.set(id,fn);return id},
 clearInterval:id=>timers.delete(id),console
};
runInNewContext(js,context,{filename:'tacho-next.js'});
const api=window;
api.meviTachoNextMount();
assert.equal(watches.size,1,'Opening Tacho Next starts live GPS automatically');
assert.ok(windowListeners.deviceorientation,'Compass listener should start automatically');
assert.match(host.innerHTML,/id="tn-speed">—/);
assert.match(host.innerHTML,/id="tn-rpm">—/);
assert.match(host.innerHTML,/id="tn-odometer">— km/);
assert.doesNotMatch(host.innerHTML,/Demo|302\.456|1900/,'Demo values must not be rendered');
assert.equal(api.meviTachoNextDebug().speedKmh,null);
assert.equal(node('#tn-speed').textContent,'—');
assert.equal(node('#tn-rpm').textContent,'—');
assert.equal(node('#tn-odometer').textContent,'— km');
const send=(coords,t=time)=>[...watches.values()][0].ok({coords,timestamp:t});
send({latitude:49.59,longitude:11.0,accuracy:8,speed:10,heading:90});
assert.equal(node('#tn-speed').textContent,'36','GPS m/s must convert to km/h');
assert.match(node('#tn-gps-status').textContent,/GPS aktiv/);
assert.equal(api.meviTachoNextDebug().heading,90,'Moving car heading is sourced from GPS');
time+=10_000;
send({latitude:49.591,longitude:11.0,accuracy:8,speed:12,heading:90});
const trip=api.meviTachoNextDebug().tripKm;
assert(trip>0.09&&trip<0.2,'Plausible travel adds GPS distance');
assert(stored.has('mevicar-tacho-next-gps-trip-v1'),'Real GPS trip must persist');
time+=1000;
send({latitude:50.591,longitude:11.0,accuracy:8,speed:12,heading:90});
assert.equal(api.meviTachoNextDebug().tripKm,trip,'Large position spike must not add trip distance');
windowListeners.deviceorientation({webkitCompassHeading:225});
assert.equal(api.meviTachoNextDebug().heading,90,'GPS heading should take priority while driving');
time+=1000;
send({latitude:49.591,longitude:11.0,accuracy:8,speed:0,heading:null});
assert.equal(node('#tn-speed').textContent,'0','Real stationary reading should display zero');
assert.equal(api.meviTachoNextDebug().heading,225,'Real compass sensor is used when stopped');
assert.equal(node('#tn-rpm').textContent,'—','GPS must not fake RPM');
assert.equal(node('#tn-odometer').textContent,'— km','GPS must not fake vehicle odometer');
time+=20_000;
for(const fn of timers.values())fn();
assert.equal(node('#tn-speed').textContent,'—','Old GPS reading must not stay on screen as live');
assert.equal(api.meviTachoNextDebug().heading,null,'Stale sensor reading must be hidden');
api.meviTachoNextUnmount();
assert.equal(watches.size,0,'GPS watch must be cleared on unmount');
assert.equal(timers.size,0,'Health timer must be cleared on unmount');
assert.equal(windowListeners.deviceorientation,undefined,'Compass listener must be cleared on unmount');
assert.equal(docListeners.visibilitychange,undefined,'Visibility listener must be cleared');
api.meviTachoNextMount();
assert.equal(watches.size,1,'Remount should start a new watch');
assert.equal(api.meviTachoNextDebug().tripKm,trip,'GPS trip survives switching between apps');
api.meviTachoNextUnmount();
console.log('Tacho Next live: GPS speed, real compass, spike filter, trip persistence, stale signal, no simulated OBD, lifecycle OK');
