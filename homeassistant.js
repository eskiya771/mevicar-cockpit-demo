/* MeviCar Next – Home Assistant. Mirrors Classic's FamilyPanel and separate
   Road Assist API access without copying secrets or weakening HA security. */
(function(){
 'use strict';
 const CONFIG_KEY='mevicar-next-ha-config-v1';
 const FAVORITES_KEY='mevicar-next-ha-favorite-entities-v1';
 const DEFAULT_ORIGIN='https://ha.mtankurt.synology.me';
 const DEFAULT_PATH='/dashboard-familie/0';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const viewNames={dashboard:'Dashboard',devices:'Geräte',radar:'Road Assist',settings:'Verbindung'};
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
 function icon(entity){
  const group=entity.entity_id.split('.')[0];
  return ({light:'💡',switch:'⏻',sensor:'◉',binary_sensor:'◈',climate:'◉',
   person:'●',device_tracker:'●',cover:'▤',automation:'⚙',lock:'🔒'})[group]||'⌂';
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
  if(!isValidEntityId(id))return;
  const set=new Set(state.favorites);
  if(set.has(id))set.delete(id);
  else if(set.size<32)set.add(id);
  state.favorites=[...set];
  try{localStorage.setItem(FAVORITES_KEY,JSON.stringify(state.favorites))}catch{}
  repaint();
 }
 function toggleFromDashboard(id){return toggle(id)}
 function dashboardItem(entity){
  const id=entity.entity_id;
  if(!isValidEntityId(id))return '';
  const domain=id.split('.')[0];
  const interactive=clickable.has(domain)&&isAvailable(entity);
  const busy=state.busyIds.has(id);
  const active=entity.state==='on';
  const starred=state.favorites.includes(id);
  return '<article class="ha-dashboard-tile'+(active?' is-active':'')+
   (!isAvailable(entity)?' is-unavailable':'')+'">'+
   '<div class="ha-dashboard-tile-top"><span class="ha-dashboard-glyph" aria-hidden="true">'+
   esc(icon(entity))+'</span>'+
   '<button type="button" class="ha-dashboard-favorite" aria-label="'+
   (starred?'Aus Favoriten entfernen':'Zu Favoriten hinzufügen')+'" aria-pressed="'+starred+
   '" title="'+(starred?'Favorit entfernen':'Zum Dashboard hinzufügen')+
   '" onclick="MeviHA.favoriteEntity(\''+id+'\')">'+(starred?'★':'☆')+'</button></div>'+
   '<strong class="ha-dashboard-tile-name">'+esc(label(entity))+'</strong>'+
   '<span class="ha-dashboard-tile-state">'+esc(detailState(entity))+'</span>'+
   (interactive?'<button type="button" class="ha-dashboard-toggle'+(active?' is-on':'')+
   '" '+(busy?'disabled':'')+' onclick="MeviHA.toggleFromDashboard(\''+id+'\')">'+
   (busy?'Bitte warten …':active?'Ausschalten':'Einschalten')+'</button>':
    '<span class="ha-dashboard-readonly">'+(!isAvailable(entity)?'Nicht verfügbar':'Statusanzeige')+'</span>')+
   '</article>';
 }
 function featureEntities(){
  // Default dashboard: present high-value real states, never invented values.
  const preferred=['person','weather','climate','light','switch','sensor','binary_sensor'];
  const sensors=/(temperatur|temperature|humidity|feuchte|power|leistung|energy|battery|batterie|co2|luft|raum)/i;
  return state.states.filter(e=>isValidEntityId(e.entity_id)&&isAvailable(e)).map(e=>{
   const domain=e.entity_id.split('.')[0];
   let order=preferred.indexOf(domain);
   if(order<0)order=40;
   if(domain==='light'||domain==='switch')order+=e.state==='on'?-2:0;
   if(domain==='sensor'&&!sensors.test(e.entity_id+' '+label(e)))order=35;
   return{e,order};
  }).sort((a,b)=>a.order-b.order||label(a.e).localeCompare(label(b.e),'de'))
   .slice(0,12).map(x=>x.e);
 }
 function dashboardHTML(){
  if(!state.connected)return '<div class="ha-dashboard-view">'+
   '<div class="ha-dashboard-unconnected"><div class="ha-dashboard-icon">⌂</div>'+
   '<h3>Dein Smart Home in MeviCar Next</h3>'+
   '<p>Die Home-Assistant-Weboberfläche lässt sich in der PWA nicht direkt einbetten. '+
   'Verbinde die API, um echte Geräte und Sensoren hier im Cockpit zu sehen.</p>'+
   '<div class="ha-dashboard-calltoaction">'+
   '<button type="button" onclick="MeviHA.tab(\'settings\')">API-Verbindung einrichten</button>'+
   '<button type="button" onclick="MeviHA.openDashboard()">Original-Dashboard im Browser ↗</button>'+
   '</div></div></div>';
  const valid=state.states.filter(e=>isValidEntityId(e.entity_id));
  const controllable=valid.filter(e=>clickable.has(e.entity_id.split('.')[0]));
  const on=controllable.filter(e=>e.state==='on').length;
  const unavailable=state.states.filter(e=>!isAvailable(e)).length;
  const favorites=state.favorites.map(id=>state.states.find(e=>e.entity_id===id)).filter(Boolean);
  const suggested=featureEntities().filter(e=>!state.favorites.includes(e.entity_id));
  const fmtDate=state.lastUpdate?new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit'}).format(new Date(state.lastUpdate)):'–';
  const favored=favorites.length?favorites.map(dashboardItem).join(''):
   '<p class="ha-dashboard-helper">Noch keine Favoriten. Mit ☆ bei einer Kachel kannst du Geräte dauerhaft zu deinem Dashboard hinzufügen.</p>';
  return '<div class="ha-dashboard-native">'+
   '<div class="ha-dashboard-overview">'+
   '<div class="ha-dashboard-intro"><div><small>MEVICAR HOME</small>'+
   '<h3>Mein Zuhause</h3><p>Live-Daten über die Home-Assistant-API · Stand '+esc(fmtDate)+'</p></div>'+
   '<button type="button" onclick="MeviHA.openDashboard()">Original-Dashboard ↗</button></div>'+
   '<div class="ha-dashboard-stats">'+
   '<div><strong>'+state.states.length+'</strong><span>Entitäten</span></div>'+
   '<div><strong>'+on+'</strong><span>Geräte eingeschaltet</span></div>'+
   '<div><strong>'+controllable.length+'</strong><span>Schaltbare Geräte</span></div>'+
   '<div><strong>'+unavailable+'</strong><span>Nicht verfügbar</span></div>'+
   '</div></div>'+
   '<section class="ha-dashboard-section"><div class="ha-dashboard-section-title">'+
   '<h4>Meine Favoriten</h4><button type="button" onclick="MeviHA.tab(\'devices\')">Alle Geräte anzeigen</button></div>'+
   (favorites.length?'<div class="ha-dashboard-grid">'+favored+'</div>':favored)+
   '</section>'+
   (suggested.length?'<section class="ha-dashboard-section"><div class="ha-dashboard-section-title">'+
   '<h4>Geräte und Sensoren</h4><span>Echte Home-Assistant-Entitäten</span></div>'+
   '<div class="ha-dashboard-grid">'+suggested.map(dashboardItem).join('')+'</div></section>':'')+
   '<div class="ha-dashboard-disclaimer">Das ist eine eigene MeviCar-Ansicht mit echten HA-Daten. '+
   'Das ursprüngliche Lovelace-Familien-Dashboard bleibt über „Original-Dashboard“ erreichbar.</div></div>';
 }
 function deviceRow(entity){
  const domain=entity.entity_id.split('.')[0];
  const canToggle=clickable.has(domain)&&/^([a-z_]+)\.[a-z0-9_]+$/i.test(entity.entity_id);
  const busy=state.busyIds.has(entity.entity_id);
  const active=entity.state==='on';
  const values=['unavailable','unknown'].includes(entity.state)?' ha-unavailable':'';
  return '<div class="ha-device-row'+values+'">'+
   '<span class="ha-device-icon">'+esc(icon(entity))+'</span>'+
   '<div class="ha-device-copy"><strong>'+esc(label(entity))+'</strong>'+
   '<span>'+esc(entity.entity_id)+'</span></div>'+
   '<div class="ha-device-state">'+esc(detailState(entity))+'</div>'+
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
 function radarHTML(){
  if(!state.connected)return loginPrompt('Road Assist: Blitzer.de-Entitäten aus Home Assistant lesen');
  const items=state.radar;
  return '<div class="ha-radar-view">'+
   '<div class="ha-radar-title"><b>'+items.length+' Blitzer-Meldungen</b><span>Read-only · Quelle: Home Assistant / Blitzer.de</span></div>'+
   '<div class="ha-radar-list">'+(window.MeviRoadAssist?.infoHTML()||'')+(items.map(c=>'<div class="ha-radar-item"><span class="ha-radar-pin">⌖</span>'+
    '<div><strong>'+esc(c.name)+'</strong><span>'+esc([c.street,c.city].filter(Boolean).join(' · ')||c.id)+
    '</span></div><span class="ha-radar-badge">'+(c.vmax?c.vmax+' km/h':esc(c.type))+'</span></div>').join('')||
    '<div class="ha-empty">Keine Blitzer.de-Kamera-Entitäten gefunden. Classic filtert auf attributes.source = blitzer_* mit gültigen GPS-Koordinaten.</div>')+
   '</div><div class="ha-footnote">Blitzer-Daten sind hier nur eine Liste. Eine echte Zuordnung zur aktiven Google-Route wird dadurch nicht behauptet.</div></div>';
 }
 function loginPrompt(topic){
  return '<div class="ha-login-prompt"><span class="ha-large-icon">⌂</span>'+
    '<h3>'+esc(topic)+'</h3><p>Dieser Bereich benötigt einen Home-Assistant-Long-Lived-Access-Token. '+
    'Die Familien-Dashboard-Anmeldung ist davon unabhängig.</p>'+
    '<button type="button" onclick="MeviHA.tab(\'settings\')">API-Verbindung einrichten</button></div>';
 }
 function settingsHTML(){
  return '<div class="ha-settings"><div class="ha-settings-content">'+
   '<h3>Home Assistant verbinden</h3><p>Das Dashboard verwendet wie in Classic die eigene Web-Anmeldung. '+
   'Für API-Geräte und Road Assist wird ein separater Long-Lived Access Token verwendet.</p>'+
   '<label for="ha-origin">Home-Assistant-Adresse (HTTPS)</label>'+
   '<input type="url" id="ha-origin" autocomplete="url" spellcheck="false" value="'+esc(state.origin)+'">'+
   '<label for="ha-path">Dashboard-Pfad</label>'+
   '<input type="text" id="ha-path" spellcheck="false" value="'+esc(state.path)+'">'+
   '<button type="button" class="ha-save-config" onclick="MeviHA.saveConfig()">Dashboard-Adresse speichern</button>'+
   '<label for="ha-token">Long-Lived Access Token · API und Road Assist</label>'+
   '<input type="password" id="ha-token" autocomplete="off" spellcheck="false" placeholder="'+
    (state.token?'API-Token für diese Sitzung vorhanden':'Token hier eingeben · wird nicht gespeichert')+'">'+
   '<div class="ha-token-actions"><button type="button" class="ha-save-config" onclick="MeviHA.connect()"'+
    (state.loading?' disabled':'')+'>Verbinden / testen</button>'+
   '<button type="button" onclick="MeviHA.disconnect()">Token entfernen</button></div>'+
   '<div class="ha-security-note">Aus Sicherheitsgründen bleibt der API-Token nur im laufenden Speicher dieser Seite. '+
   'Er wird weder in GitHub noch in localStorage gespeichert. Nach einem Neuladen ist eine neue Eingabe nötig.</div>'+
   '<div class="ha-cors-note">Falls die API im Browser wegen CORS blockiert wird: Home Assistant muss '+
   '<code>https://eskiya771.github.io</code> in seinen erlaubten CORS-Ursprüngen führen. '+
   'Keine allgemeine Freigabe und kein HTTP verwenden.</div>'+
   '<div class="ha-feedback" role="status">'+esc(state.error||state.message)+'</div>'+
   '</div></div>';
 }
 function viewHTML(){
  switch(state.tab){
   case 'devices':return devicesHTML();
   case 'radar':return radarHTML();
   case 'settings':return settingsHTML();
   default:return dashboardHTML();
  }
 }
 function html(compact=false){
  state.compact=!!compact;
  return '<section class="ha-shell'+(compact?' is-compact':'')+'" aria-label="Home Assistant">'+
   '<header class="ha-header"><div class="ha-title"><small>MEVICAR NEXT · HOME ASSISTANT</small><b>HOME ASSISTANT</b></div>'+
   '<div class="ha-head-actions"><button type="button" onclick="MeviHA.reload()" title="Neu laden" aria-label="Home Assistant aktualisieren">↻</button>'+
   '<button type="button" onclick="MeviHA.openDashboard()" title="Im Browser öffnen" aria-label="Home Assistant im Browser öffnen">↗</button></div></header>'+
   '<nav class="ha-tabs" aria-label="Home Assistant Seiten">'+Object.keys(viewNames).map(tabButton).join('')+'</nav>'+
   '<div class="ha-status-row" id="ha-status-row">'+statusHTML()+'</div>'+
   '<main class="ha-main" id="ha-view">'+viewHTML()+'</main></section>';
 }
 function repaint(replaceView=true){
  const root=document.querySelector('.ha-shell');
  if(!root)return;
  const row=get('ha-status-row');if(row)row.innerHTML=statusHTML();
  if(replaceView){
   const v=get('ha-view');if(v)v.innerHTML=viewHTML();
   for(const button of root.querySelectorAll('.ha-tab')){
    const selected=(button.textContent===viewNames[state.tab]);
    button.classList.toggle('active',selected);
    button.setAttribute('aria-pressed',String(selected));
   }
  }
 }
 function tab(id){
  if(!viewNames[id])return;
  state.tab=id;repaint();
  if((id==='devices'||id==='radar')&&state.connected&&(!state.states.length||Date.now()-state.lastUpdate>15000))
   refresh().catch(()=>{});
 }
 function openDashboard(){
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
 function saveConfig(){
  try{
   const origin=validateOrigin(get('ha-origin')?.value||'');
   const path=validatePath(get('ha-path')?.value||'');
   const changed=origin!==state.origin;
   state.origin=origin;state.path=path;state.message='HTTPS-Adresse gespeichert.';
   if(changed){disconnect({quiet:true});state.message='Adresse geändert: API-Token bitte erneut eingeben.'}
   localStorage.setItem(CONFIG_KEY,JSON.stringify({origin,path}));
   repaint();
  }catch(e){state.error=errorText(e);repaint(false);const msg=document.querySelector('.ha-feedback');if(msg)msg.textContent=state.error}
 }
 async function connect(){
  const input=get('ha-token');
  const entered=(input?.value||'').trim();
  if(!entered&&!state.token){state.error='Bitte einen Long-Lived Access Token eingeben.';repaint(false);const el=document.querySelector('.ha-feedback');if(el)el.textContent=state.error;return}
  if(entered)state.token=entered;
  if(input)input.value='';
  state.error='';state.message='';state.loading=true;repaint(false);
  try{
   await refresh({force:true});
   state.message='API-Verbindung erfolgreich.';
  }catch(e){
   state.connected=false;state.error=errorText(e);
   state.token=''; // Do not retain a token after unsuccessful verification.
  }finally{state.loading=false;repaint()}
 }
 function disconnect(options={}){
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
   if(state.mounted&&['dashboard','devices','radar'].includes(state.tab))repaint();
   else repaint(false);
  }catch(e){
   if(generation===state.requestId){state.error=errorText(e);state.connected=false;window.MeviRoadAssist?.onHAChange?.();repaint(false)}
   throw e;
  }finally{if(generation===state.requestId)state.refreshing=false}
 }
 async function toggle(entityId){
  if(!state.connected||!state.token)return;
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
 // Native bridge receives the already authenticated HA session in memory only.
 // Do not expose the token as a getter, save it, or put it in Android Intent extras.
 function launchNativeWithRadar(destination){
  if(!window.MeviPlatform?.navigation?.nativeRoute)
   return Promise.reject(new Error('Native Android-Navigation ist nicht verfuegbar.'));
  const prefs=window.MeviRoadAssist?.nativeConfig?.()||{};
  const auth=state.connected&&state.token?{origin:state.origin,token:state.token,...prefs}:prefs;
  return window.MeviPlatform.navigation.nativeRoute(destination,auth);
 }
 window.MeviHA={html,mount,unmount,tab,openDashboard,reload,saveConfig,connect,disconnect,refresh,toggle,search,filter,cameraSnapshot,stockSnapshot,stockHistory,requestService,launchNativeWithRadar,favoriteEntity,toggleFromDashboard,
  debug:()=>({tab:state.tab,connected:state.connected,count:state.states.length,cameras:state.radar.length,
   origin:state.origin,dashboard:dashboardUrl(),tokenPresent:!!state.token,tokenStored:false}),
  // Helpers for node-only contract tests; no token or credentials exposed.
  cameraFromState,validateOrigin,validatePath};
})();
