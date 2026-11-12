/* MeviCar Next – Aktienkurse 2.0. Real Easy Stock snapshots and HA Recorder history.
   No external finance API, no shared secrets, no simulated history. */
(function(){
'use strict';
const STORAGE='mevicar-stocks-ui-v2';
const periods=[1,7,30];
let refreshTimer=null;
const state={favorites:[],hidden:[],onlyFavorites:false,query:'',sort:'name',detail:'',
 days:7,history:{},loading:false,historyLoading:false,historyError:'',
 message:'',mounted:false,requestId:0,historyId:0,historyAt:0,snapshot:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const valid=id=>/^sensor\.[a-z0-9_]+$/i.test(String(id||''));
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'?null:(Number.isFinite(Number(v))?Number(v):null);
function restore(){try{const p=JSON.parse(localStorage.getItem(STORAGE)||'{}');
 if(Array.isArray(p.favorites))state.favorites=[...new Set(p.favorites.filter(valid))].slice(0,100);
 if(Array.isArray(p.hidden))state.hidden=[...new Set(p.hidden.filter(valid))].slice(0,100);
 if(['name','change','price'].includes(p.sort))state.sort=p.sort;
 if(periods.includes(p.days))state.days=p.days;
}catch{}}
restore();
function save(){try{localStorage.setItem(STORAGE,JSON.stringify({favorites:state.favorites,hidden:state.hidden,sort:state.sort,days:state.days}))}catch{}}
function snapshot(){const v=window.MeviHA?.stockSnapshot?.();return v&&Array.isArray(v.sensors)?v:{connected:false,updatedAt:0,sensors:[]}}
function parseSensor(s){
 if(!s||!valid(s.entity_id))return null;
 const close=num(s.state),change=num(s.change),percent=num(s.change_pct);
 const currency=String(s.currency||'').toUpperCase();
 return {id:s.entity_id,name:String(s.name||s.symbol||s.entity_id).slice(0,100),symbol:String(s.symbol||s.entity_id).slice(0,60),
 close:close!==null&&close>0?close:null,change,percent,
 currency:/^[A-Z]{3}$/.test(currency)?currency:null,market:String(s.market_state||''),
 updated:String(s.updated||''),live:s.price_is_live===true};
}
function all(){state.snapshot=snapshot();return state.snapshot.sensors.map(parseSensor).filter(Boolean)}
function money(v,c){if(v===null)return '–';return new Intl.NumberFormat('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2,...(c?{style:'currency',currency:c}:{})}).format(v)+(c?'':'');}
function fmt(v,max=2){return v===null?'–':new Intl.NumberFormat('de-DE',{maximumFractionDigits:max}).format(Math.abs(v))}
function change(q){if(!q||q.change===null)return 'Tagesänderung unbekannt';return (q.change>=0?'+':'−')+fmt(q.change)+' '+(q.currency||'')+(q.percent===null?'':' · '+(q.percent>=0?'+':'−')+fmt(q.percent)+' %')}
function color(q){return q?.change===null?'neutral':q.change>=0?'up':'down'}
function recency(value){const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'–'}
function series(id){return Array.isArray(state.history[id])?state.history[id]:[]}
function chartPath(points,width,height,pad=7){
 const validPoints=points.filter(p=>Number.isFinite(p?.value)&&Number.isFinite(p?.time)&&p.value>0).sort((a,b)=>a.time-b.time);
 if(validPoints.length<2)return '';
 const t0=validPoints[0].time,t1=validPoints[validPoints.length-1].time;
 const values=validPoints.map(p=>p.value),min=Math.min(...values),max=Math.max(...values);
 const range=Math.max(max-min,Math.abs(max)*.003,0.001),from=min-(range-(max-min))/2;
 return validPoints.map((p,i)=>{
  const x=pad+((t1===t0?i/(validPoints.length-1):(p.time-t0)/(t1-t0))*(width-pad*2));
  const y=height-pad-((p.value-from)/range)*(height-pad*2);
  return (i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1);
 }).join(' ');
}
function graph(points,w,h,cls){
 const path=chartPath(points,w,h);
 if(!path)return '<div class="mevi-fin-nochart">Noch keine Verlaufsdaten</div>';
 const rising=points[points.length-1].value>=points[0].value;
 return '<svg class="mevi-fin-chart '+cls+(rising?' is-up':' is-down')+'" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none" role="img" aria-label="Kursverlauf mit '+points.length+' Messpunkten">'+
 '<path class="mevi-fin-gridline" d="M0 '+(h/2)+' H'+w+'"/><path class="mevi-fin-line" d="'+path+'"/></svg>';
}
function filtered(){
 let rows=all().filter(q=>!state.hidden.includes(q.id));
 if(state.onlyFavorites)rows=rows.filter(q=>state.favorites.includes(q.id));
 if(state.query){const q=state.query.toLocaleLowerCase('de');rows=rows.filter(s=>(s.name+' '+s.symbol).toLocaleLowerCase('de').includes(q))}
 rows.sort((a,b)=>state.sort==='change'?(b.percent??-1e10)-(a.percent??-1e10)||a.name.localeCompare(b.name,'de'):
  state.sort==='price'?(b.close??-1e10)-(a.close??-1e10)||a.name.localeCompare(b.name,'de'):
  a.name.localeCompare(b.name,'de'));
 return rows;
}
function summary(){
 const a=all(),known=a.filter(x=>x.percent!==null),winners=known.filter(x=>x.percent>0).length,
 losers=known.filter(x=>x.percent<0).length;
 return '<div class="mevi-fin-summary"><div><small>Aktien</small><strong>'+a.length+'</strong></div>'+
 '<div><small>Im Plus</small><strong class="up">'+winners+'</strong></div>'+
 '<div><small>Im Minus</small><strong class="down">'+losers+'</strong></div>'+
 '<div><small>Favoriten</small><strong>'+a.filter(q=>state.favorites.includes(q.id)).length+'</strong></div></div>';
}
function tickerRow(q){
 const liked=state.favorites.includes(q.id),stockId=esc(q.id),spark=graph(series(q.id),150,45,'spark');
 return '<article class="mevi-fin-row"><button class="mevi-fin-star'+(liked?' is-fav':'')+'" type="button" '+
 'aria-label="'+(liked?'Favorit entfernen':'Zu Favoriten')+'" aria-pressed="'+liked+'" onclick="MeviStocks.favorite(\''+stockId+'\')">'+(liked?'★':'☆')+'</button>'+
 '<button class="mevi-fin-open" type="button" onclick="MeviStocks.open(\''+stockId+'\')" aria-label="'+esc(q.name)+' Kursdetails öffnen">'+
 '<span class="mevi-fin-symbol"><strong>'+esc(q.name)+'</strong><small>'+esc(q.symbol)+(q.market?' · '+esc(q.market):'')+'</small></span>'+
 '<span class="mevi-fin-spark">'+spark+'</span>'+
 '<span class="mevi-fin-values"><strong>'+money(q.close,q.currency)+'</strong><small class="'+color(q)+'">'+esc(change(q))+'</small></span></button>'+
 '<button class="mevi-fin-hide" type="button" aria-label="'+esc(q.name)+' ausblenden" title="Ausblenden" onclick="MeviStocks.hide(\''+stockId+'\')">◌</button></article>';
}
function toolbar(){
 return '<div class="mevi-fin-toolbar"><input id="mevi-fin-search" aria-label="Aktien suchen" type="search" placeholder="Aktie suchen" value="'+esc(state.query)+'" oninput="MeviStocks.search(this.value)">'+
 '<select id="mevi-fin-sort" aria-label="Sortierung" onchange="MeviStocks.sort(this.value)">'+
 [['name','Name A–Z'],['change','Tagesperformance'],['price','Kurs absteigend']].map(([id,name])=>'<option value="'+id+'"'+(id===state.sort?' selected':'')+'>'+name+'</option>').join('')+'</select>'+
 '<button class="'+(state.onlyFavorites?'active':'')+'" type="button" onclick="MeviStocks.favoritesOnly()" aria-pressed="'+state.onlyFavorites+'">★ Favoriten</button>'+
 '<button type="button" onclick="MeviStocks.toggleHidden()">Ausgeblendet ('+state.hidden.length+')</button></div>';
}
function detailHTML(){
 if(!state.detail)return '';
 const q=all().find(x=>x.id===state.detail);
 if(!q){state.detail='';return ''}
 const points=series(q.id);
 const min=points.length?Math.min(...points.map(x=>x.value)):null,max=points.length?Math.max(...points.map(x=>x.value)):null;
 return '<section class="mevi-fin-detail" aria-label="Kursdetails"><div class="mevi-fin-detailhead"><div><small>'+esc(q.symbol)+'</small><h3>'+esc(q.name)+'</h3></div>'+
 '<button type="button" onclick="MeviStocks.close()" aria-label="Details schließen">×</button></div>'+
 '<div class="mevi-fin-detailprice"><strong>'+money(q.close,q.currency)+'</strong><span class="'+color(q)+'">'+esc(change(q))+'</span></div>'+
 '<div class="mevi-fin-period">'+periods.map(d=>'<button type="button" class="'+(state.days===d?'active':'')+'" onclick="MeviStocks.period('+d+')">'+(d===1?'1T':d===7?'7T':'30T')+'</button>').join('')+'</div>'+
 '<div class="mevi-fin-detailchart">'+(state.historyLoading?'<div class="mevi-fin-nochart">Historie wird geladen …</div>':graph(points,800,225,'big'))+'</div>'+
 '<div class="mevi-fin-detailstats"><span>Tief <b>'+(min===null?'–':money(min,q.currency))+'</b></span><span>Hoch <b>'+(max===null?'–':money(max,q.currency))+'</b></span>'+
 '<span>Messpunkte <b>'+points.length+'</b></span><span>Aktualisiert <b>'+esc(recency(q.updated))+'</b></span></div>'+
 (state.historyError?'<p class="mevi-fin-error">'+esc(state.historyError)+'</p>':'')+
 '<p class="mevi-fin-hint">Verlauf aus Home Assistant Recorder, keine Börsen-Tickdaten. Zeitraum hängt von der gespeicherten Historie ab.</p></section>';
}
function hiddenHTML(){
 if(!state.hiddenOpen)return '';
 const available=all().filter(q=>state.hidden.includes(q.id));
 return '<div class="mevi-fin-hidden">'+(available.length?available.map(q=>'<button type="button" onclick="MeviStocks.show(\''+esc(q.id)+'\')">+ '+esc(q.name)+'</button>').join(''):
 '<span>Keine ausgeblendeten Aktien</span>')+'</div>';
}
function mainHTML(){
 const snap=state.snapshot||snapshot(),rows=filtered();
 if(!snap.connected)return '<div class="mevi-fin-empty">Home Assistant ist nicht verbunden. Bitte im Home-Assistant-Tab die API-Verbindung herstellen.</div>';
 if(!snap.sensors.length)return '<div class="mevi-fin-empty">Keine Easy-Stock-Sensoren vorhanden. Füge Aktien einmalig in Home Assistant hinzu; MeviCar übernimmt sie automatisch.</div>';
 return summary()+toolbar()+hiddenHTML()+
 (state.detail?detailHTML():'')+
 '<div class="mevi-fin-results">'+(rows.length?rows.map(tickerRow).join(''):
 '<div class="mevi-fin-empty">Keine passenden Aktien. Suche oder Favoritenfilter ändern.</div>')+'</div>';
}
function html(compact=false){
 state.snapshot=snapshot();
 return '<section class="mevi-stocks mevi-fin'+(compact?' is-compact':'')+'" aria-label="Aktienkurse">'+
 '<header class="mevi-fin-header"><div><small>MEVICAR NEXT · HOME ASSISTANT</small><strong>Aktienkurse</strong></div>'+
 '<button type="button" id="mevi-fin-refresh" onclick="MeviStocks.refresh()">↻ Aktualisieren</button></header>'+
 '<div class="mevi-fin-message" id="mevi-fin-message" role="status">'+esc(state.message||(!state.snapshot.connected?'HA-Verbindung benötigt':'Automatisch aus Home Assistant synchronisiert'))+'</div>'+
 '<div class="mevi-fin-main" id="mevi-fin-main">'+mainHTML()+'</div>'+
 '<footer class="mevi-fin-footer">Daten: Easy Stock / Home Assistant · verzögerte Kurse möglich · keine Anlageberatung</footer></section>';
}
function update(){
 if(!state.mounted)return;
 state.snapshot=snapshot();
 const target=document.getElementById('mevi-fin-main');
 if(target)target.innerHTML=mainHTML();
 const msg=document.getElementById('mevi-fin-message');
 if(msg)msg.textContent=state.message||(!state.snapshot.connected?'HA-Verbindung benötigt':'Automatisch aus Home Assistant synchronisiert');
 const button=document.getElementById('mevi-fin-refresh');
 if(button)button.disabled=state.loading;
}
function search(v){
 state.query=String(v||'').slice(0,80);
 // Avoid replacing the focused search input on every keystroke.
 const root=document.getElementById('mevi-fin-main');if(!root)return;
 const results=root.querySelector('.mevi-fin-results');
 if(results){const rows=filtered();results.innerHTML=rows.length?rows.map(tickerRow).join(''):'<div class="mevi-fin-empty">Keine passenden Aktien.</div>'}
}
function sort(v){if(!['name','change','price'].includes(v))return;state.sort=v;save();update()}
function favorite(id){if(!valid(id))return;const found=new Set(state.favorites);if(found.has(id))found.delete(id);else found.add(id);state.favorites=[...found];save();update()}
function favoritesOnly(){state.onlyFavorites=!state.onlyFavorites;update()}
function toggleHidden(){state.hiddenOpen=!state.hiddenOpen;update()}
function hide(id){if(!valid(id))return;state.hidden=[...new Set([...state.hidden,id])];save();update()}
function show(id){state.hidden=state.hidden.filter(x=>x!==id);save();update()}
function open(id){if(!valid(id)||!all().some(s=>s.id===id))return;state.detail=id;update();const root=document.getElementById('mevi-fin-main');if(root)root.scrollTop=0;loadHistory()}
function close(){state.detail='';update()}
function period(days){if(!periods.includes(days))return;state.days=days;state.history={};state.historyAt=0;save();update();loadHistory()}
async function loadHistory(){
 if(!state.mounted||!state.snapshot?.connected||!window.MeviHA?.stockHistory)return;
 const run=++state.historyId;
 // One bounded request for visible stocks; the detail stock is always included.
 const ids=[...new Set([...filtered().map(x=>x.id),state.detail].filter(valid))].slice(0,25);
 if(!ids.length)return;
 state.historyLoading=true;state.historyError='';update();
 try{
  const history=await window.MeviHA.stockHistory(ids,state.days);
  if(run!==state.historyId||!state.mounted)return;
  state.history=history||{};state.historyAt=Date.now();
 }catch(error){if(run===state.historyId){state.historyError='Verlauf nicht verfügbar: '+String(error?.message||error).slice(0,110);state.history={}}}
 finally{if(run===state.historyId){state.historyLoading=false;update()}}
}
async function refresh(){
 if(state.loading||!state.mounted)return;
 if(!state.snapshot?.connected){state.message='Bitte zuerst Home Assistant verbinden.';update();return}
 const run=++state.requestId;state.loading=true;state.message='Home Assistant wird aktualisiert …';update();
 try{await window.MeviHA.refresh({force:true});if(run!==state.requestId||!state.mounted)return;
  state.message='Aktualisiert · '+new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
  update();await loadHistory();
 }catch(e){if(run===state.requestId)state.message='Aktualisierung fehlgeschlagen: '+String(e?.message||e).slice(0,100)}
 finally{if(run===state.requestId){state.loading=false;update()}}
}
function mount(){state.mounted=!!document.querySelector('.mevi-fin');if(state.mounted){update();loadHistory();if(refreshTimer!==null)clearInterval(refreshTimer);refreshTimer=setInterval(()=>{if(!state.loading&&state.mounted&&snapshot().connected)refresh()},60000)}}
function unmount(){state.mounted=false;state.requestId++;state.historyId++;state.loading=false;state.historyLoading=false;if(refreshTimer!==null){clearInterval(refreshTimer);refreshTimer=null}}
window.MeviStocks={html,mount,unmount,refresh,search,sort,favorite,favoritesOnly,toggleHidden,hide,show,open,close,period,
 parseSensor,chartPath,debug:()=>({mounted:state.mounted,days:state.days,detail:state.detail,historyLoading:state.historyLoading,auto:!state.hidden.length})};
})();