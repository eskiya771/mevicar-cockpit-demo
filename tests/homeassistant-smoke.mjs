/* Home Assistant Next: Classic dashboard + authenticated REST contract tests.
   Run with node, no network or real tokens. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const js=readFileSync(new URL('../homeassistant.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../homeassistant.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
new Function(js);
const states=[
 {entity_id:'light.wohnzimmer',state:'off',attributes:{friendly_name:'Wohnzimmer'}},
 {entity_id:'switch.steckdose',state:'on',attributes:{friendly_name:'Steckdose'}},
 {entity_id:'sensor.temperatur',state:'20.1',attributes:{unit_of_measurement:'°C',friendly_name:'Temperatur'}},
 {entity_id:'sensor.blitzer_1',state:'online',attributes:{friendly_name:'Radar',source:'blitzer_fixed',latitude:49.6,longitude:11.05,vmax:70,type:'fixed'}},
 {entity_id:'sensor.blitzer_count',state:'3',attributes:{source:'blitzer_fixed'}},
 {entity_id:'sensor.other_position',state:'here',attributes:{source:'somewhere',latitude:49.6,longitude:11.05}}
];
function makeEnvironment(options={}){
 const storage=[];
 const el={
  'ha-token':{value:options.token??'TEST_SESSION_TOKEN'},
  'ha-origin':{value:'https://ha.mtankurt.synology.me'},
  'ha-path':{value:'/dashboard-familie/0'}
 };
 const fetches=[];
 const document={
  getElementById:id=>el[id]||null,
  querySelector:()=>null
 };
 const localStorage={
  getItem:()=>null,
  setItem:(key,value)=>storage.push({key,value})
 };
 const window={open:()=>({})};
 const fetch=async(url,request)=>{
  fetches.push({url:String(url),request});
  if(options.fail)throw new TypeError('Failed to fetch');
  return{ok:true,status:200,json:async()=>url.endsWith('/api/states')?states:[]};
 };
 runInNewContext(js,{window,document,localStorage,fetch,URL,console,
  AbortController,setTimeout,clearTimeout,setInterval,clearInterval,Date,Intl,Number,Set});
 return{app:window.MeviHA,el,fetches,storage};
}
{
 const {app,fetches,storage}=makeEnvironment();
 assert.match(app.html(false),/Dein Smart Home in MeviCar Next/);
 assert.match(app.html(false),/Im Browser öffnen/);
 assert.match(app.html(false),/Original-Dashboard im Browser/);
 assert.match(app.html(true),/is-compact/);
 assert.equal(app.debug().connected,false);
 await app.connect();
 assert.equal(app.debug().connected,true);
 assert.equal(app.debug().count,states.length);
 assert.equal(app.debug().cameras,1,'Classic Blitzer filter excludes counters and unrelated sensors');
 app.tab('dashboard');
 let dashboard=app.html(false);
 assert.match(dashboard,/Mein Zuhause/,'Connected dashboard uses live HA states');
 assert.match(dashboard,/Wohnzimmer/,'Light appears in native dashboard');
 assert.match(dashboard,/Steckdose/,'Switch appears in native dashboard');
 assert.match(dashboard,/Temperatur/,'Sensor appears in native dashboard');
 assert.match(dashboard,/Original-Dashboard/,'Original Classic dashboard remains externally accessible');
 assert.doesNotMatch(dashboard,/<iframe\b/i,'No HA iframe that browsers block');
 assert.doesNotMatch(dashboard,/TEST_SESSION_TOKEN/,'Never expose HA token in HTML');
 app.favoriteEntity('light.wohnzimmer');
 dashboard=app.html(false);
 assert.match(dashboard,/Meine Favoriten/);
 assert.match(dashboard,/★/,'Pinned favorite must be visible');
 assert.equal(JSON.parse(storage[0].value)[0],'light.wohnzimmer','Only entity ID persisted as favorite');
 assert.equal(app.debug().tokenStored,false);
 assert.equal(fetches[0].url,'https://ha.mtankurt.synology.me/api/states');
 assert.equal(fetches[0].request.headers.Authorization,'Bearer TEST_SESSION_TOKEN');
 assert.equal(fetches[0].request.credentials,'omit');
 assert.equal(fetches[0].request.redirect,'error');
 assert.equal(storage.length,1,'Only one non-secret favorites record persisted');
 assert.equal(storage[0].key,'mevicar-next-ha-favorite-entities-v1');
 app.tab('devices');
 assert.match(app.html(false),/Wohnzimmer/);
 assert.match(app.html(false),/Temperatur/);
 assert.doesNotMatch(app.html(false),/TEST_SESSION_TOKEN/,'Token cannot appear in HTML');
 await app.toggle('light.wohnzimmer');
 assert.equal(fetches[1].url,'https://ha.mtankurt.synology.me/api/services/light/turn_on');
 assert.equal(fetches[1].request.method,'POST');
 assert.deepEqual(JSON.parse(fetches[1].request.body),{entity_id:'light.wohnzimmer'});
 const actionCount=fetches.length;
 await app.toggle('sensor.temperatur');
 assert.equal(fetches.length,actionCount,'Non-control entities must not receive service actions');
 app.tab('radar');
 assert.match(app.html(false),/1 Blitzer-Meldungen/);
 app.disconnect();
 assert.equal(app.debug().tokenPresent,false);
 assert.equal(app.debug().connected,false);
}
{
 const {app}=makeEnvironment({fail:true});
 await app.connect();
 assert.equal(app.debug().connected,false);
 assert.equal(app.debug().tokenPresent,false,'Failed token must be cleared');
 app.tab('settings');
 assert.match(app.html(false),/CORS/);
 assert.match(app.html(false),/https:\/\/eskiya771\.github\.io/);
}
{
 const {app,el,storage}=makeEnvironment();
 for(const bad of ['http://ha.local','https://name:secret@ha.example.com/','https://evil.example.com/foo','javascript:alert(1)']){
  assert.throws(()=>app.validateOrigin(bad));
 }
 assert.equal(app.validateOrigin('https://ha.mtankurt.synology.me/'),'https://ha.mtankurt.synology.me');
 assert.throws(()=>app.validatePath('//evil.example'));
 assert.throws(()=>app.validatePath('/dashboard?token=secret'));
 el['ha-path'].value='/dashboard-familie/1';
 app.saveConfig();
 assert.equal(storage.length,1);
 assert.equal(JSON.parse(storage[0].value).path,'/dashboard-familie/1');
 assert.deepEqual(Object.keys(JSON.parse(storage[0].value)).sort(),['origin','path']);
}
assert.match(js,/https:\/\/ha\.mtankurt\.synology\.me/,'Classic HA hostname');
assert.match(js,/\/dashboard-familie\/0/,'Classic FamilyPanel path');
assert.match(js,/api\/states/,'REST API for Road Assist');
assert.match(js,/api\/services/,'Service calls rather than writing raw states');
assert.ok(js.includes(String.raw`const canToggle=clickable.has(domain)&&/^([a-z_]+)\.[a-z0-9_]+$/i.test(entity.entity_id);`),'Only valid Home Assistant entity IDs may create control actions');
assert.doesNotMatch(js,/localStorage\.setItem\([^;\n]*token/i,'Tokens must not be written to localStorage');
assert.match(css,/\.ha-shell/);
assert.match(css,/\.ha-device-row/);
assert.match(css,/\.ha-dashboard-grid/);
assert.match(html,/homeassistant\.js/);
assert.match(html,/homeassistant\.css/);
assert.match(html,/s\.app==='ha'.*MeviHA\?\.html/);
assert.match(workflow,/mevicar-homeassistant-script/);
console.log('Home Assistant smoke OK: native dashboard, live HA devices and sensors, pinned favorites, read-only radar, controls, safe HTTPS and memory-only token.');
