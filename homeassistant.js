/* MeviCar Next – Home Assistant. Mirrors Classic's FamilyPanel and separate
   Road Assist API access without copying secrets or weakening HA security. */
(function(){
 'use strict';
 const CONFIG_KEY='mevicar-next-ha-config-v1';
 const FAVORITES_KEY='mevicar-next-ha-favorite-entities-v1';
 const DEFAULT_ORIGIN='https://ha.mtankurt.synology.me';
 const DEFAULT_PATH='/dashboard-familie/0';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const viewNames={dashboard:'Dashboard',devices:'Geräte'};
 const sections={family:'Familie',climate:'Klima',lights:'Licht'};
 let unlocked=false, section='family';
 function unlock(pin){
  if(pin!=='0815')return false;
  unlocked=true;repaint();return true;
 }
 function selectSection(id){
  if(!unlocked||!Object.hasOwn(sections,id))return;
  section=id;repaint();
 }
 const supported=new Set(['light','switch']);
 const clickable=new Set(['light','switch']);
 const state={tab:'dashboard',origin:DEFAULT_ORIGIN,path:DEFAULT_PATH,token:'',connected:false,
  loading:false,refreshing:false,states:[],radar:[],query:'',filter:'all',message:'',error:'',
  lastUpdate:0,mounted:false,compact:false,busyIds:new Set(),requestId:0,favorites:[]};
 try{
  const saved=JSON.parse(localStorage.getItem(CONFIG_KEY)||'{}');
  if(saved.origin)state.origin=validateOrigin(saved.origin);
  if(saved.path)state.path=validatePath(saved.path);
 }catch{}
 try{
  const ids=JSON.parse(localStorage.getItem(FAVORITES_KEY)||'[]');
  if(Array.isArray(ids))state.favorites=[...new Set(ids.filter(id=>typeof id==='string'&&/^[a-z_]+\.[a-z0-9_]+$/i.test(id)))].slice(0,32);
 }catch{}
 let refreshTimer=null,controller=null;
 function validateOrigin(value){
  const u=new URL(String(value||'').trim());
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||
      !/^[a-z0-9.-]+$/i.test(u.hostname))
   throw new Error('Nur eine gültige HTTPS-Adresse ohne Pfad, Anmeldedaten oder Parameter verwenden.');
  return u.origin;
 }
 function validatePath(value){
  const v=String(value||'').trim();
  if(!v.startsWith('/')||v.startsWith('//')||v.includes('\\')||v.includes('?')||v.includes('#'))
   throw new Error('Dashboard-Pfad muss mit / beginnen und darf keine URL-Parameter enthalten.');
  return v;
 }
 function dashboardUrl(){return state.origin+state.path}
 function fetchUrl(path){return new URL(path,state.origin).href}
 function get(id){return document.getElementById(id)}
 function errorText(error){
  const msg=String(error?.message||error||'Unbekannter Fehler');
  if(error?.name==='AbortError')return 'Zeitüberschreitung. Home Assistant antwortet nicht.';
  if(error instanceof TypeError||/Failed to fetch|NetworkError|Load failed/i.test(msg))
   return 'Verbindung fehlgeschlagen. HTTPS, Erreichbarkeit und Home-Assistant-CORS für https://eskiya771.github.io prüfen.';
  return msg;
 }
 async function request(path,options={}){
  if(!state.token)throw new Error('API-Token fehlt. Öffne Verbindung und gib einen Long-Lived Access Token ein.');
  const endpoint=new URL(path,state.origin);
  if(endpoint.origin!==state.origin)throw new Error('Fremde API-Domain blockiert.');
  const timeout=new AbortController();
  const cancel=setTimeout(()=>timeout.abort(),12000);
  try{
   const response=await fetch(endpoint.href,{
    method:options.method||'GET',
    headers:{Authorization:'Bearer '+state.token,Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})},
    body:options.body?JSON.stringify(options.body):undefined,
    signal:timeout.signal,redirect:'error',cache:'no-store',credentials:'omit'
   });
   if(response.status===401)throw new Error('HTTP 401: Token ungültig oder abgelaufen.');
   if(response.status===403)throw new Error('HTTP 403: Zugriff für dieses Konto nicht erlaubt.');
   if(!response.ok)throw new Error('Home Assistant: HTTP '+response.status);
   return response.status===204?null:response.json();
  }finally{clearTimeout(cancel)}
 }
 function cameraFromState(entity){
  const a=entity?.attributes||{};
  if(!String(a.source||'').toLowerCase().startsWith('blitzer_'))return null;
  const lat=Number(a.latitude),lng=Number(a.longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||
     a.latitude===undefined||a.longitude===undefined)return null;
  return{id:String(entity.entity_id||''),lat,lng,
   name:String(a.friendly_name||a.street||entity.entity_id||'Kontrolle'),
   type:String(a.type||'unknown'),street:String(a.street||''),city:String(a.city||''),
   vmax:Number(a.vmax)>0?Number(a.vmax):null};
 }
 function derive(states){
  state.states=(Array.isArray(states)?states:[]).filter(x=>x&&typeof x.entity_id==='string');
  state.radar=state.states.map(cameraFromState).filter(Boolean);
  state.lastUpdate=Date.now();
 }
 function detailState(entity){
  const unit=entity.attributes?.unit_of_measurement;
  return String(entity.state||'unbekannt')+(unit?' '+unit:'');
 }
 function label(entity){return String(entity.attributes?.friendly_name||entity.entity_id)}
 function byName(a,b){return label(a).localeCompare(label(b),'de')}
 const iconPaths={
  home:'<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  light:'<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.3 1 2.2h5.2c0-.9.4-1.7 1-2.2A6 6 0 0 0 12 3z"/>',
  power:'<path d="M12 3v9"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>',
  temp:'<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 10v7"/>',
  drop:'<path d="M12 3s6 6.3 6 11a6 6 0 0 1-12 0c0-4.7 6-11 6-11z"/>',
  person:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  family:'<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-5.8 6.5-5.8s6.5 2.2 6.5 5.8"/><circle cx="17.5" cy="9" r="2.4"/><path d="M17.2 14.3c2.5.3 4.3 2 4.3 4.9"/>',
  gauge:'<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6"/>',
  lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  cover:'<path d="M4 4h16M5 4v16h14V4M5 9h14M5 14h14"/>',
  cog:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  refresh:'<path d="M20 11a8 8 0 0 0-14.3-4M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4M20 20v-4h-4"/>'
 };
 function svg(name){
  return '<svg class="ha-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+
   (iconPaths[name]||iconPaths.home)+'</svg>';
 }
 function iconName(entity){
  const group=entity.entity_id.split('.')[0],a=entity.attributes||{};
  if(group==='sensor'){
   if(a.device_class==='humidity')return 'drop';
   if(a.device_class==='temperature'||['°C','°F'].includes(a.unit_of_measurement))return 'temp';
   return 'gauge';
  }
  return ({light:'light',switch:'power',binary_sensor:'gauge',climate:'temp',person:'person',
   device_tracker:'person',cover:'cover',automation:'cog',lock:'lock'})[group]||'home';
 }
 function glyph(entity){return svg(iconName(entity))}
 function fmt(value,digits=1){
  if(value===null||value===undefined||String(value).trim()==='')return null;
  const n=Number(value);
  return Number.isFinite(n)?n.toLocaleString('de-DE',{maximumFractionDigits:digits}):null;
 }
 function stateWord(entity){
  return ({on:'An',off:'Aus',unavailable:'Nicht verfügbar',unknown:'Unbekannt',heat:'Heizen',
   cool:'Kühlen',auto:'Automatik',heat_cool:'Automatik',idle:'Bereit',home:'Zuhause',
   not_home:'Unterwegs'})[entity.state]||detailState(entity);
 }
 function brightness(entity){
  const b=Number(entity.attributes?.brightness);
  return entity.state==='on'&&Number.isFinite(b)&&b>0?Math.max(1,Math.min(100,Math.round(b/255*100))):null;
 }
 function average(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:null}
 function greeting(){
  const h=new Date().getHours();
  return h<5?'Gute Nacht':h<11?'Guten Morgen':h<18?'Guten Tag':'Guten Abend';
 }
 function getEntities(){
  let entries=state.states;
  if(state.filter==='switchable')entries=entries.filter(e=>clickable.has(e.entity_id.split('.')[0]));
  if(state.filter==='sensors')entries=entries.filter(e=>['sensor','binary_sensor','climate'].includes(e.entity_id.split('.')[0]));
  if(state.query){
   const q=state.query.toLocaleLowerCase('de');
   entries=entries.filter(e=>[e.entity_id,label(e),e.state].some(v=>String(v||'').toLocaleLowerCase('de').includes(q)));
  }
  return entries.sort(byName).slice(0,250);
 }
 function statusHTML(){
  if(state.error)return '<span class="ha-status ha-status-error" role="status">'+esc(state.error)+'</span>';
  if(state.loading)return '<span class="ha-status">Verbinde mit Home Assistant …</span>';
  return state.connected?'<span class="ha-status ha-status-ok">Verbunden · '+state.states.length+' Entitäten</span>':
   '<span class="ha-status">Dashboard-Webanmeldung · API separat</span>';
 }
 function tabButton(id){return '<button type="button" class="ha-tab '+(state.tab===id?'active':'')+
  '" aria-pressed="'+(state.tab===id)+'" onclick="MeviHA.tab(\''+id+'\')">'+viewNames[id]+'</button>'}
 function isValidEntityId(id){return /^[a-z_]+\.[a-z0-9_]+$/i.test(String(id||''))}
 function isAvailable(entity){return !['unavailable','unknown','none'].includes(String(entity?.state||''))}
 function favoriteEntity(id){
  if(!unlocked||!isValidEntityId(id))return;
  const set=new Set(state.favorites);
  if(set.has(id))set.delete(id);
  else if(set.size<32)set.add(id);
  state.favorites=[...set];
  try{localStorage.setItem(FAVORITES_KEY,JSON.stringify(state.favorites))}catch{}
  repaint();
 }
 function toggleFromDashboard(id){return toggle(id)}
 function initial(name){return Array.from(String(name||'?').trim())[0]||'?'}
 function updatedAt(entity){
  const d=new Date(entity.last_updated||entity.last_changed||'');
  if(Number.isNaN(d.getTime()))return '';
  return 'Stand '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
 }
 function dashboardItem(entity){
  const id=entity.entity_id;
  if(!isValidEntityId(id))return '';
  const domain=id.split('.')[0],attrs=entity.attributes||{};
  const available=isAvailable(entity);
  const control=clickable.has(domain);
  const interactive=control&&available;
  const busy=state.busyIds.has(id);
  const active=entity.state==='on';
  const starred=state.favorites.includes(id);
  const name=label(entity);
  let text=available?stateWord(entity):'Nicht verfügbar',foot;
  if(control){
   const pct=brightness(entity);
   if(pct!==null)text+=' · '+pct+' %';
   foot=(domain==='light'?'<span class="ha-dashboard-level" aria-hidden="true"><i style="width:'+
    (active?(pct??100):0)+'%"></i></span>':'<span class="ha-dashboard-level is-hidden" aria-hidden="true"></span>')+
    (interactive?'<button type="button" class="ha-dashboard-toggle'+(active?' is-on':'')+(busy?' is-busy':'')+
    '" role="switch" aria-checked="'+active+'" aria-label="'+esc(name)+(active?' ausschalten':' einschalten')+
    '" '+(busy?'disabled':'')+' onclick="MeviHA.toggleFromDashboard(\''+id+'\')"><i aria-hidden="true"></i></button>':
    '<span class="ha-dashboard-readonly">Keine Verbindung</span>');
  }else{
   const climate=domain==='climate';
   const value=available?fmt(climate?attrs.current_temperature:entity.state):null;
   const unit=climate?'°':String(attrs.unit_of_measurement||'');
   if(climate){
    const target=fmt(attrs.temperature);
    if(available&&target!==null)text+=' · Soll '+target+' °';
   }else if(available&&value!==null)text=updatedAt(entity)||'Messwert';
   foot='<span class="ha-dashboard-value'+(value===null?' is-text':'')+'"><b>'+
    esc(value!==null?value:available?stateWord(entity):'–')+'</b>'+
    (value!==null&&unit?'<small>'+esc(unit)+'</small>':'')+'</span>';
  }
  return '<article class="ha-dashboard-tile is-'+esc(iconName(entity))+(active?' is-active':'')+
   (!available?' is-unavailable':'')+'">'+
   '<div class="ha-dashboard-tile-top"><span class="ha-dashboard-glyph" aria-hidden="true">'+glyph(entity)+'</span>'+
   '<div class="ha-dashboard-tile-copy"><strong class="ha-dashboard-tile-name">'+esc(name)+'</strong>'+
   '<span class="ha-dashboard-tile-state">'+esc(text)+'</span></div>'+
   '<button type="button" class="ha-dashboard-favorite" aria-label="'+
   (starred?'Aus Favoriten entfernen':'Zu Favoriten hinzufügen')+'" aria-pressed="'+starred+
   '" title="'+(starred?'Favorit entfernen':'Zum Dashboard hinzufügen')+
   '" onclick="MeviHA.favoriteEntity(\''+id+'\')">'+(starred?'★':'☆')+'</button></div>'+
   '<div class="ha-dashboard-tile-foot">'+foot+'</div></article>';
 }
 function personCard(entity){
  const name=label(entity);
  const status={home:'Zuhause',not_home:'Unterwegs',unknown:'Unbekannt',unavailable:'Nicht verfügbar'}[entity.state]||entity.state;
  return '<article class="ha-person'+(entity.state==='home'?' is-home':'')+'"><i aria-hidden="true">'+
   esc(initial(name))+'</i><div><strong>'+esc(name)+'</strong><small>'+esc(status)+'</small></div></article>';
 }
 function heroStats(entities,lights){
  const numeric=e=>isAvailable(e)&&fmt(e.state)!==null;
  const sensors=entities.filter(e=>e.entity_id.startsWith('sensor.')&&numeric(e));
  const temps=sensors.filter(e=>['°C','°F'].includes(e.attributes?.unit_of_measurement));
  const unit=temps[0]?.attributes?.unit_of_measurement;
  const temp=average(temps.filter(e=>e.attributes.unit_of_measurement===unit).map(e=>Number(e.state)));
  const humid=average(sensors.filter(e=>e.attributes?.device_class==='humidity').map(e=>Number(e.state)));
  const stat=(name,value,caption)=>'<span class="ha-hero-stat">'+svg(name)+'<b>'+esc(value)+'</b><small>'+caption+'</small></span>';
  return (temp!==null?stat('temp',fmt(temp)+' '+unit,'im Mittel'):'')+
   (humid!==null?stat('drop',fmt(humid,0)+' %','Luftfeuchte'):'')+
   (lights.length?stat('light',lights.filter(e=>e.state==='on').length+' / '+lights.length,'Licht an'):'');
 }
 function dashboardHTML(){
  if(!state.connected)return loginPrompt('Dashboard');
  const entities=state.states.filter(e=>isValidEntityId(e.entity_id)).sort(byName);
  const people=entities.filter(e=>e.entity_id.startsWith('person.'));
  const lights=entities.filter(e=>e.entity_id.startsWith('light.'));
  const climate=entities.filter(e=>e.entity_id.startsWith('climate.')||
   (e.entity_id.startsWith('sensor.')&&(['temperature','humidity'].includes(e.attributes?.device_class)||
   ['°C','°F'].includes(e.attributes?.unit_of_measurement))));
  const favorites=entities.filter(e=>state.favorites.includes(e.entity_id));
  const grid=(items,render,empty,kind='')=>items.length?'<div class="ha-dashboard-grid'+kind+'">'+
   items.map(render).join('')+'</div>':'<p class="ha-empty">'+empty+'</p>';
  const counts={family:people.length,climate:climate.length,lights:lights.length};
  const sectionIcons={family:'family',climate:'temp',lights:'light'};
  const tabs=Object.entries(sections).map(([id,title])=>
   '<button type="button" aria-pressed="'+(section===id)+'" onclick="MeviHA.selectSection(\''+id+'\')">'+
   svg(sectionIcons[id])+'<span>'+title+'</span><b>'+counts[id]+'</b></button>').join('');
  let content;
  if(section==='family'){
   content=grid(people,personCard,'Keine Personen in Home Assistant gefunden.',' is-people');
   content+=favorites.length?'<h4>Meine Favoriten</h4>'+grid(favorites,dashboardItem,''):
    '<p class="ha-hint">☆ Tippe bei Klima oder Licht auf den Stern, um eine Kachel hier anzuheften.</p>';
  }else if(section==='climate')content=grid(climate,dashboardItem,'Keine Klimageräte oder Raumsensoren gefunden.');
  else content=grid(lights,dashboardItem,'Keine Leuchten gefunden.');
  const home=people.filter(e=>e.state==='home');
  const lit=lights.filter(e=>e.state==='on').length;
  return '<div class="ha-dashboard-native"><header class="ha-family-hero">'+
   '<div class="ha-hero-copy"><small>Mein Zuhause</small><h3>'+greeting()+'</h3><p>'+
   (people.length?home.length+' zuhause':'Anwesenheit offen')+' · '+lit+' von '+lights.length+' Leuchten an</p></div>'+
   (home.length?'<div class="ha-hero-people" aria-hidden="true">'+home.slice(0,4).map(e=>'<i>'+esc(initial(label(e)))+'</i>').join('')+'</div>':'')+
   '<div class="ha-hero-stats">'+heroStats(entities,lights)+'</div>'+
   '<button type="button" class="ha-hero-link" onclick="MeviHA.openDashboard()">Original-Dashboard ↗</button></header>'+
   '<nav class="ha-sections" aria-label="Dashboardbereiche">'+tabs+'</nav>'+
   '<section class="ha-dashboard-section">'+content+'</section></div>';
 }
 function deviceRow(entity){
  const domain=entity.entity_id.split('.')[0];
  const canToggle=clickable.has(domain)&&/^([a-z_]+)\.[a-z0-9_]+$/i.test(entity.entity_id);
  const busy=state.busyIds.has(entity.entity_id);
  const active=entity.state==='on';
  const values=['unavailable','unknown'].includes(entity.state)?' ha-unavailable':'';
  return '<div class="ha-device-row'+values+'">'+
   '<span class="ha-device-icon" aria-hidden="true">'+glyph(entity)+'</span>'+
   '<div class="ha-device-copy"><strong>'+esc(label(entity))+'</strong>'+
   '<span>'+esc(entity.entity_id)+'</span></div>'+
   '<div class="ha-device-state">'+esc(stateWord(entity))+'</div>'+
   (canToggle?'<button type="button" class="ha-device-action'+(active?' is-on':'')+
    '" '+(busy||values?'disabled':'')+' onclick="MeviHA.toggle(\''+esc(entity.entity_id)+'\')">'+
    (busy?'…':active?'AUS':'EIN')+'</button>':'')+
   '</div>';
 }
 function devicesHTML(){
  if(!state.connected)return loginPrompt('Geräte steuern und Sensorwerte sehen');
  return '<div class="ha-entities">'+
    '<div class="ha-filters"><input type="search" id="ha-search" placeholder="Gerät oder Sensor suchen" '+
    'autocomplete="off" value="'+esc(state.query)+'" oninput="MeviHA.search(this.value)" aria-label="Home-Assistant-Entitäten durchsuchen">'+
    '<div class="ha-filter-buttons">'+[['all','Alle'],['switchable','Schalter'],['sensors','Sensoren']].map(([id,l])=>
      '<button type="button" class="'+(state.filter===id?'active':'')+'" onclick="MeviHA.filter(\''+id+'\')">'+l+'</button>').join('')+'</div></div>'+
    '<div class="ha-entity-summary">'+getEntities().length+' von '+state.states.length+' Entitäten angezeigt · Aktualisierung alle 30 s</div>'+
    '<div id="ha-entity-list" class="ha-entity-list">'+(getEntities().map(deviceRow).join('')||'<div class="ha-empty">Keine passenden Entitäten gefunden.</div>')+'</div></div>';
 }
 function loginPrompt(topic){
  return `<div class="ha-login-prompt"><span class="ha-prompt-icon" aria-hidden="true">${svg('home')}</span><h3>${esc(topic)}</h3><p>Verbinde Home Assistant unter Einstellungen → Zugänge &amp; Schlüssel.</p></div>`;
 }
 function viewHTML(){
  if(!unlocked)return `<form class="ha-pin" onsubmit="event.preventDefault();if(!MeviHA.unlock(this.pin.value)){this.pin.value='';this.querySelector('output').textContent='PIN falsch. Erneut versuchen.';this.pin.focus()}"><span class="ha-prompt-icon" aria-hidden="true">${svg('lock')}</span><label for="ha-pin">${viewNames[state.tab]} entsperren</label><p>Vierstellige PIN eingeben</p><div class="ha-pin-row"><input id="ha-pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" aria-label="Vierstellige PIN" required><button>Entsperren</button></div><output aria-live="polite"></output></form>`;
  return state.tab==='devices'?devicesHTML():dashboardHTML();
 }
 function html(compact=false){
  state.compact=!!compact;
  return '<section class="ha-shell'+(compact?' is-compact':'')+'" aria-label="Home Assistant">'+
   '<header class="ha-header"><div class="ha-title"><span class="ha-logo" aria-hidden="true">'+svg('home')+'</span><b>Home Assistant</b></div>'+
   '<nav class="ha-tabs" aria-label="Home Assistant Seiten">'+Object.keys(viewNames).map(tabButton).join('')+'</nav>'+
   '<div class="ha-head-actions"><button type="button" onclick="MeviHA.reload()" title="Neu laden" aria-label="Home Assistant aktualisieren">'+svg('refresh')+'</button>'+
   '</div></header>'+
   '<div class="ha-status-row" id="ha-status-row">'+statusHTML()+'</div>'+
   '<main class="ha-main" id="ha-view">'+viewHTML()+'</main></section>';
 }
 let lastScrollKey='';
 function repaint(replaceView=true){
  const root=document.querySelector('.ha-shell');
  if(!root)return;
  const row=get('ha-status-row');if(row)row.innerHTML=statusHTML();
  if(replaceView){
   // Keep the list position across the 30 s refresh and after switching a device.
   const scrollKey=state.tab+'/'+section+'/'+unlocked;
   const scroller=root.querySelector('.ha-dashboard-native,.ha-entity-list');
   const top=scroller&&scrollKey===lastScrollKey?scroller.scrollTop:0;
   lastScrollKey=scrollKey;
   const v=get('ha-view');if(v)v.innerHTML=viewHTML();
   const next=top?root.querySelector('.ha-dashboard-native,.ha-entity-list'):null;
   if(next)next.scrollTop=top;
   for(const button of root.querySelectorAll('.ha-tab')){
    const selected=(button.textContent===viewNames[state.tab]);
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
   }
  }
 }
 function tab(id){
  if(!Object.hasOwn(viewNames,id))return;
  unlocked=false;section='family';
  state.tab=id;repaint();
  if(id==='devices'&&state.connected&&(!state.states.length||Date.now()-state.lastUpdate>15000))
   refresh().catch(()=>{});
 }
 function openDashboard(){
  if(!unlocked)return;
  const url=dashboardUrl();
  const w=window.open(url,'_blank','noopener,noreferrer');
  if(!w&&typeof location!=='undefined'&&typeof location.assign==='function'){
   // Popup blocking: prefer a visible clickable URL, never attempt iframe auth bypass.
   state.message='Pop-up blockiert. Den Dashboard-Link im Browser öffnen: '+url;
   repaint(false);
  }
 }
 function reload(){
  if(state.tab==='dashboard'){if(state.connected)refresh({force:true}).catch(()=>{});else repaint()}
  else if(state.connected)refresh().catch(()=>{});
  else repaint();
 }
 function configureEndpoint(address,path){
  const origin=validateOrigin(address),dash=validatePath(path);
  const changed=origin!==state.origin;
  state.origin=origin;state.path=dash;
  localStorage.setItem(CONFIG_KEY,JSON.stringify({origin,path:dash}));
  if(changed)disconnect({quiet:true});
  state.message='Home-Assistant-Adresse gespeichert.';
  repaint();return true;
 }
 function saveConfig(){return configureEndpoint(get('ha-origin')?.value||state.origin,get('ha-path')?.value||state.path)}
 async function connectWithToken(token){
  if(!token||!String(token).trim())throw new Error('Home-Assistant-Token fehlt.');
  state.token=String(token).trim();state.error='';state.message='';state.loading=true;
  try{await refresh({force:true});state.message='API-Verbindung erfolgreich.';return true}
  catch(e){state.connected=false;state.error=errorText(e);state.token='';throw e}
  finally{state.loading=false;repaint()}
 }
 async function connect(){try{return await connectWithToken((get('ha-token')?.value||state.token))}catch{return false}}
  function disconnect(options={}){
  unlocked=false;
  state.token='';state.connected=false;state.states=[];state.radar=[];state.query='';
  state.busyIds.clear();state.requestId++;
  state.error='';state.message=options.quiet?'':'API-Token aus dieser Sitzung entfernt.';
  window.MeviRoadAssist?.onHAChange?.();repaint();
 }
 async function refresh(options={}){
  if(!state.token)return;
  if(state.refreshing&&!options.force)return;
  const generation=++state.requestId;state.refreshing=true;
  try{
   const data=await request('/api/states');
   if(generation!==state.requestId)return;
   derive(data);state.connected=true;state.error='';window.MeviRoadAssist?.onHAChange?.();
   if(state.mounted&&['dashboard','devices'].includes(state.tab)&&unlocked)repaint();
   else repaint(false);
  }catch(e){
   if(generation===state.requestId){state.error=errorText(e);state.connected=false;window.MeviRoadAssist?.onHAChange?.();repaint(false)}
   throw e;
  }finally{if(generation===state.requestId)state.refreshing=false}
 }
 async function toggle(entityId){
  if(!unlocked||!state.connected||!state.token)return;
  const entity=state.states.find(x=>x.entity_id===entityId);
  const domain=String(entityId).split('.')[0];
  if(!entity||!supported.has(domain)||!/^([a-z_]+)\.[a-z0-9_]+$/i.test(entityId))return;
  if(state.busyIds.has(entityId))return;
  const service=entity.state==='on'?'turn_off':'turn_on';
  state.busyIds.add(entityId);repaint();
  try{
   await request('/api/services/'+domain+'/'+service,{method:'POST',body:{entity_id:entityId}});
   await refresh({force:true});
  }catch(e){state.error=errorText(e);repaint(false)}
  finally{state.busyIds.delete(entityId);repaint()}
 }
 function search(value){
  state.query=String(value||'').slice(0,120);
  const list=get('ha-entity-list');if(list)list.innerHTML=getEntities().map(deviceRow).join('')||'<div class="ha-empty">Keine passenden Entitäten gefunden.</div>';
 }
 function filter(id){if(!['all','switchable','sensors'].includes(id))return;state.filter=id;repaint()}
 function mount(){
  const root=document.querySelector('.ha-shell');
  state.mounted=!!root;
  if(!root){unmount();return}
  if(refreshTimer!==null)clearInterval(refreshTimer);
  refreshTimer=setInterval(()=>{
   if(state.connected&&!state.refreshing)refresh().catch(()=>{});
  },30000);
  if(state.token&&state.connected&&Date.now()-state.lastUpdate>15000)refresh().catch(()=>{});
 }
 function unmount(){
  if(!document.querySelector('.ha-shell')){unlocked=false;section='family';state.tab='dashboard'}
  state.mounted=false;
  if(refreshTimer!==null){clearInterval(refreshTimer);refreshTimer=null}
 }
 function stockSnapshot(){
  // Read-only, sanitized sensor data for other cockpit modules.
  // Credentials and the full HA entity list are intentionally not exposed.
  const sensors=state.connected?state.states.filter(e=>{
   const a=e?.attributes||{};
   return /^sensor\.[a-z0-9_]+$/i.test(e?.entity_id||'')&&
    typeof a.symbol==='string'&&a.symbol.trim().length>0&&
    (a.change_pct!==undefined||a.change!==undefined||a.previous_close!==undefined);
  }).map(e=>{
   const a=e.attributes||{};
   return {entity_id:e.entity_id,state:String(e.state??''),
    name:String(a.long_name||a.friendly_name||a.symbol||e.entity_id).slice(0,100),
    symbol:String(a.symbol||'').slice(0,50),
    currency:String(a.currency||a.unit_of_measurement||'').slice(0,12),
    change:a.change,change_pct:a.change_pct,
    market_state:String(a.market_state||'').slice(0,24),
    price_is_live:a.price_is_live===true,
    updated:String(e.last_updated||e.last_changed||'')};
  }):[];
  return {connected:state.connected,updatedAt:state.lastUpdate,sensors};
 }
 async function stockHistory(entityIds,days=7){
  // HA Recorder history is read-only. Restrict the request to existing Easy Stock sensors.
  if(!state.connected||!state.token)throw new Error('Home Assistant ist nicht verbunden.');
  if(![1,7,30].includes(days))throw new Error('Ungültiger Zeitraum.');
  const known=new Set(stockSnapshot().sensors.map(s=>s.entity_id));
  const ids=[...new Set(Array.isArray(entityIds)?entityIds:[])];
  if(!ids.length||ids.length>25||ids.some(id=>!/^sensor\.[a-z0-9_]+$/i.test(id)||!known.has(id)))
   throw new Error('Nur bekannte Easy-Stock-Sensoren dürfen abgefragt werden.');
  const end=new Date(),start=new Date(end.getTime()-days*86400000);
  const path='/api/history/period/'+encodeURIComponent(start.toISOString())+
   '?filter_entity_id='+encodeURIComponent(ids.join(','))+
   '&end_time='+encodeURIComponent(end.toISOString())+'&minimal_response&no_attributes';
  const groups=await request(path);
  if(!Array.isArray(groups))throw new Error('Ungültige Home-Assistant-Historie.');
  const result={};
  for(let i=0;i<ids.length;i++){
   const group=Array.isArray(groups[i])?groups[i]:[];
   const firstId=group.find(e=>typeof e?.entity_id==='string')?.entity_id;
   const id=firstId&&known.has(firstId)?firstId:ids[i];
   if(!known.has(id))continue;
   const samples=[];
   for(const e of group){
    const value=Number(e?.state),time=Date.parse(e?.last_changed||e?.last_updated||'');
    if(e?.state===null||e?.state===undefined||String(e.state).trim()===''||
       !Number.isFinite(value)||value<=0||!Number.isFinite(time))continue;
    samples.push({time,value});
   }
   samples.sort((a,b)=>a.time-b.time);
   // Keep timestamps and values only; never pass raw HA objects or credentials.
   const stride=Math.max(1,Math.ceil(samples.length/140));
   result[id]=samples.filter((_,index)=>index%stride===0||index===samples.length-1).slice(-141);
  }
  return result;
 }
 function cameraSnapshot(){
  return{connected:state.connected,updatedAt:state.lastUpdate,
   cameras:state.connected?state.radar.map(c=>({...c})):[]};
 }
 // Only these 3 HA endpoints are needed for Classic's optional on-route scan.
 async function requestService(path,options={}){
  if(!['/api/services/device_tracker/see','/api/states/device_tracker.mevicar_route_scan',
    '/api/services/blitzer/refresh_controls?return_response'].includes(path))
    throw new Error('Road Assist API-Pfad nicht zugelassen.');
  if(!state.connected||!state.token)throw new Error('Home Assistant ist nicht verbunden.');
  if(path.startsWith('/api/services/')&&options.method!=='POST')throw new Error('POST für HA-Service erforderlich.');
  return request(path,{method:options.method||'GET',body:options.body});
 }
 window.MeviHA={html,mount,unmount,unlock,selectSection,tab,openDashboard,reload,saveConfig,configureEndpoint,connect,connectWithToken,disconnect,refresh,toggle,search,filter,cameraSnapshot,stockSnapshot,stockHistory,requestService,favoriteEntity,toggleFromDashboard,
  debug:()=>({tab:state.tab,connected:state.connected,count:state.states.length,cameras:state.radar.length,
   origin:state.origin,dashboard:dashboardUrl(),tokenPresent:!!state.token,tokenStored:false}),
  // Helpers for node-only contract tests; no token or credentials exposed.
  cameraFromState,validateOrigin,validatePath};
})();
