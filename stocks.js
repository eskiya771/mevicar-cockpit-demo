/* MeviCar Next – Home Assistant Easy Stock sensor viewer.
   Reuses MeviHA's in-memory token; no direct finance API, proxy or credentials. */
(function(){
'use strict';
const STORAGE='mevicar-stocks-ha-v1';
const state={selected:[],hasSelection:false,mounted:false,loading:false,status:'Home Assistant verbinden, um Aktienkurse anzuzeigen.',snapshot:null,requestId:0};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'" :'&#39;'}[c]));
const validEntity=id=>/^sensor\.[a-z0-9_]+$/i.test(String(id||''));
function restore(){try{const data=JSON.parse(localStorage.getItem(STORAGE)||'{}');if(Array.isArray(data.selected)){state.selected=[...new Set(data.selected.filter(validEntity))].slice(0,25);state.hasSelection=true}}catch{}}
restore();
function save(){try{localStorage.setItem(STORAGE,JSON.stringify({selected:state.selected}))}catch{}}
function read(){const src=window.MeviHA?.stockSnapshot?.();return src&&Array.isArray(src.sensors)?src:{connected:false,sensors:[],updatedAt:0}}
function numeric(value){if(value===null||value===undefined||value===''||typeof value==='boolean')return null;const n=Number(value);return Number.isFinite(n)?n:null}
function parseSensor(sensor){
 if(!sensor||!validEntity(sensor.entity_id))return null;
 const close=numeric(sensor.state),change=numeric(sensor.change),percent=numeric(sensor.change_pct);
 if(close===null||close<=0)return null;
 const currency=/^[A-Z]{3}$/.test(String(sensor.currency||'').toUpperCase())?String(sensor.currency).toUpperCase():null;
 return {id:sensor.entity_id,name:String(sensor.name||sensor.symbol||sensor.entity_id),symbol:String(sensor.symbol||''),
 close,change,percent,currency,updated:String(sensor.updated||''),
 live:sensor.price_is_live===true,market:String(sensor.market_state||'')};
}
function price(n,c){return new Intl.NumberFormat('de-DE',{minimumFractionDigits:2,maximumFractionDigits:4,...(c?{style:'currency',currency:c}:{})}).format(n)+(c?'':' · Einheit unbekannt')}
function amount(n){return new Intl.NumberFormat('de-DE',{maximumFractionDigits:2}).format(Math.abs(n))}
function current(){state.snapshot=read();return state.snapshot}
function available(snapshot){return snapshot.sensors.filter(s=>validEntity(s?.entity_id))}
function chosen(snapshot){
 const all=available(snapshot);
 if(!state.hasSelection)return all;
 return state.selected.map(id=>all.find(s=>s.entity_id===id)||{entity_id:id,name:id,state:'unavailable',symbol:'',currency:''});
}
function displayRow(sensor){
 const quote=parseSensor(sensor),down=quote!==null&&quote.change!==null&&quote.change<0;
 const up=quote!==null&&quote.change!==null&&quote.change>=0;
 const delta=!quote||quote.change===null?'Tagesänderung unbekannt':
  (down?'−':'+')+amount(quote.change)+(quote.percent===null?'':' · '+(quote.percent<0?'−':'+')+amount(quote.percent)+' %');
 const fresh=quote?.updated?new Date(quote.updated):null;
 const time=fresh&&!Number.isNaN(fresh.getTime())?fresh.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}):null;
 return '<article class="mevi-stocks-row"><div class="mevi-stocks-identity"><strong>'+esc(sensor.name||sensor.symbol||sensor.entity_id)+'</strong><small>'+
 esc(sensor.symbol||sensor.entity_id)+(time?' · Stand '+esc(time):'')+'</small></div><div class="mevi-stocks-values"><strong>'+
 (quote?esc(price(quote.close,quote.currency)):'–')+'</strong><small class="'+(up?'up':down?'down':'')+'">'+
 esc(quote?delta:'Kein gültiger Kurs / Sensor nicht verfügbar')+'</small></div>'+
 '<button type="button" class="mevi-stocks-remove" aria-label="Aktie entfernen" onclick="MeviStocks.remove(\''+esc(sensor.entity_id)+'\')">×</button></article>';
}
function status(snapshot){
 if(!window.MeviHA?.stockSnapshot)return 'Home-Assistant-Modul ist nicht verfügbar.';
 if(!snapshot.connected)return 'Home Assistant nicht verbunden. Bitte in Home Assistant → Verbindung einen API-Token eingeben.';
 if(!snapshot.sensors.length)return 'Keine Easy-Stock-Sensoren gefunden. Easy Stock in Home Assistant installieren und Aktien hinzufügen.';
 if(state.hasSelection&&!state.selected.length)return 'Watchlist ist leer. Bitte eine Aktie auswählen.';
 return state.status;
}
function list(snapshot){const items=chosen(snapshot);return items.length?items.map(displayRow).join(''):
 '<div class="mevi-stocks-empty">Noch keine Aktien ausgewählt.</div>'}
function html(compact=false){
 const snap=current(),options=available(snap),selected=new Set(state.hasSelection?state.selected:options.map(x=>x.entity_id));
 return '<section class="mevi-stocks'+(compact?' is-compact':'')+'" aria-label="Aktienkurse">'+
 '<header class="mevi-stocks-header"><div><small>MEVICAR NEXT · HOME ASSISTANT</small><strong>Aktienkurse</strong></div>'+
 '<button id="mevi-stocks-refresh" type="button" onclick="MeviStocks.refresh()">↻ Aktualisieren</button></header>'+
 '<div class="mevi-stocks-add"><select id="mevi-stocks-entity" aria-label="Easy-Stock-Sensor auswählen">'+
 '<option value="">Aktie aus Home Assistant auswählen …</option>'+
 options.filter(s=>!selected.has(s.entity_id)).map(s=>'<option value="'+esc(s.entity_id)+'">'+esc((s.name||s.symbol||s.entity_id)+' · '+(s.symbol||s.entity_id))+'</option>').join('')+
 '</select><button type="button" onclick="MeviStocks.add()">+ Hinzufügen</button></div>'+
 '<div id="mevi-stocks-status" class="mevi-stocks-status" role="status">'+esc(status(snap))+'</div>'+
 '<div id="mevi-stocks-list" class="mevi-stocks-list">'+list(snap)+'</div>'+
 '<footer class="mevi-stocks-footer">Quelle: Home Assistant · Easy Stock (Yahoo Finance). Kurse können verzögert sein. '+
 '<a href="https://github.com/derspe/ha-easy-stock" target="_blank" rel="noopener noreferrer">Easy Stock einrichten</a></footer></section>';
}
function el(id){return document.getElementById('mevi-stocks-'+id)}
function redraw(){
 if(!state.mounted)return;
 const snap=current(),root=document.querySelector('.mevi-stocks');if(!root)return;
 // Update only the data and selector; preserve the user's active view.
 const options=available(snap),selected=new Set(state.hasSelection?state.selected:options.map(x=>x.entity_id));
 const selector=el('entity');
 if(selector){const previous=selector.value;selector.innerHTML='<option value="">Aktie aus Home Assistant auswählen …</option>'+
  options.filter(s=>!selected.has(s.entity_id)).map(s=>'<option value="'+esc(s.entity_id)+'">'+esc((s.name||s.symbol||s.entity_id)+' · '+(s.symbol||s.entity_id))+'</option>').join('');
  if([...selector.options].some(o=>o.value===previous))selector.value=previous;}
 const listEl=el('list');if(listEl)listEl.innerHTML=list(snap);
 const statusEl=el('status');if(statusEl)statusEl.textContent=status(snap);
 const button=el('refresh');if(button)button.disabled=state.loading;
}
function add(){
 const id=el('entity')?.value||'';
 if(!validEntity(id)){state.status='Bitte zuerst eine verfügbare Aktie auswählen.';redraw();return}
 const snap=current();if(!available(snap).some(s=>s.entity_id===id)){state.status='Sensor nicht gefunden.';redraw();return}
 const visible=state.hasSelection?state.selected:available(snap).map(s=>s.entity_id);
 if(visible.includes(id)){state.status='Aktie ist bereits enthalten.';redraw();return}
 if(visible.length>=25){state.status='Maximal 25 Aktien in der Watchlist.';redraw();return}
 state.selected=[...visible,id];state.hasSelection=true;save();state.status='Aktie hinzugefügt.';redraw();
}
function remove(id){
 if(!validEntity(id))return;
 const snap=current();const visible=state.hasSelection?state.selected:available(snap).map(s=>s.entity_id);
 state.selected=visible.filter(x=>x!==id);state.hasSelection=true;save();state.status='Aktie aus Watchlist entfernt.';redraw();
}
async function refresh(){
 if(!state.mounted||state.loading)return;
 if(!window.MeviHA?.stockSnapshot){state.status='Home-Assistant-Modul fehlt.';redraw();return}
 const snap=read();
 if(!snap.connected){state.status='Home Assistant zuerst im Home-Assistant-Tab verbinden.';redraw();return}
 const run=++state.requestId;state.loading=true;state.status='Home Assistant aktualisiert die Sensordaten …';redraw();
 try{
  await window.MeviHA.refresh({force:true});
  if(run!==state.requestId||!state.mounted)return;
  const next=read();state.status=next.connected?'Sensoren aktualisiert · '+new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})+
   ' (HA-Kursintervall kann länger sein).':'Home Assistant ist nicht verbunden.';
 }catch(e){if(run===state.requestId)state.status='Aktualisierung fehlgeschlagen: '+String(e?.message||'Verbindung').slice(0,120)}
 finally{if(run===state.requestId){state.loading=false;redraw()}}
}
function mount(){state.mounted=!!document.querySelector('.mevi-stocks');if(state.mounted)redraw()}
function unmount(){state.mounted=false;state.requestId++;state.loading=false}
window.MeviStocks={html,mount,unmount,refresh,add,remove,parseSensor,debug:()=>({mounted:state.mounted,selected:[...state.selected],hasSelection:state.hasSelection})};
})();