/* MeviCar Next · free TradingView stocks.
   Official embeddable chart with historical data. No Home Assistant or API key. */
(function(){
'use strict';
const STORAGE='mevicar-stocks-tradingview-v1';
const DEFAULTS=[
 {symbol:'XETR:SIE',name:'Siemens'},
 {symbol:'NASDAQ:TSLA',name:'Tesla'},
 {symbol:'NASDAQ:NVDA',name:'NVIDIA'},
 {symbol:'NASDAQ:AAPL',name:'Apple'},
 {symbol:'TVC:DEU40',name:'DAX'}
];
const PERIODS=[
 {key:'1D',label:'1T',interval:'15',range:'1D'},
 {key:'5D',label:'5T',interval:'60',range:'5D'},
 {key:'1M',label:'1M',interval:'D',range:'1M'},
 {key:'12M',label:'1J',interval:'D',range:'12M'},
 {key:'60M',label:'5J',interval:'W',range:'60M'}
];
const state={items:DEFAULTS.map(x=>({...x})),favorites:[],symbol:'XETR:SIE',
 period:'12M',query:'',onlyFavorites:false,compact:false,mounted:false,generation:0,status:''};
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const validSymbol=value=>/^[A-Z0-9^][A-Z0-9^._-]{0,29}:[A-Z0-9^][A-Z0-9^._-]{0,29}$/.test(String(value||''));
function read(){
 try{
  const raw=JSON.parse(localStorage.getItem(STORAGE)||'{}');
  if(Array.isArray(raw.items)){
   const seen=new Set(),items=[];
   for(const item of raw.items){
    const original=String(item?.symbol||'').toUpperCase().trim();
    const symbol=original==='INDEX:DEU40'?'TVC:DEU40':original;
    if(!validSymbol(symbol)||seen.has(symbol)||items.length>=25)continue;
    seen.add(symbol);items.push({symbol,name:String(item?.name||symbol).trim().slice(0,50)||symbol});
   }
   if(items.length)state.items=items;
  }
  if(Array.isArray(raw.favorites))state.favorites=[...new Set(raw.favorites.map(x=>x==='INDEX:DEU40'?'TVC:DEU40':x).filter(validSymbol))].slice(0,25);
  const selected=raw.symbol==='INDEX:DEU40'?'TVC:DEU40':raw.symbol;
  if(state.items.some(x=>x.symbol===selected))state.symbol=selected;
  if(PERIODS.some(p=>p.key===raw.period))state.period=raw.period;
 }catch{}
 if(!state.items.some(x=>x.symbol===state.symbol))state.symbol=state.items[0]?.symbol||'XETR:SIE';
}
read();
function save(){try{localStorage.setItem(STORAGE,JSON.stringify({
 items:state.items,favorites:state.favorites,symbol:state.symbol,period:state.period
}))}catch{}}
function current(){return state.items.find(x=>x.symbol===state.symbol)||state.items[0]}
function element(id){return document.getElementById('mevi-tv-'+id)}
function filtered(){
 const q=state.query.toLocaleLowerCase('de');
 return state.items.filter(x=>(!state.onlyFavorites||state.favorites.includes(x.symbol))&&
 (!q||(x.name+' '+x.symbol).toLocaleLowerCase('de').includes(q)));
}
function symbolURL(symbol){
 if(!validSymbol(symbol))return 'https://www.tradingview.com/';
 return 'https://www.tradingview.com/symbols/'+symbol.replace(':','-')+'/';
}
function listHTML(){
 const items=filtered();
 return items.length?items.map(item=>{
  const selected=item.symbol===state.symbol,liked=state.favorites.includes(item.symbol);
  return '<div class="mevi-tv-item'+(selected?' is-selected':'')+'">'+
   '<button type="button" class="mevi-tv-star'+(liked?' is-favorite':'')+'" aria-label="'+
   (liked?'Favorit entfernen':'Favorit hinzufügen')+'" aria-pressed="'+liked+
   '" onclick="MeviStocks.favorite(\''+escapeHTML(item.symbol)+'\')">'+(liked?'★':'☆')+'</button>'+
   '<button type="button" class="mevi-tv-pick" aria-pressed="'+selected+
   '" onclick="MeviStocks.select(\''+escapeHTML(item.symbol)+'\')"><strong>'+escapeHTML(item.name)+
   '</strong><small>'+escapeHTML(item.symbol)+'</small></button>'+
   '<button type="button" class="mevi-tv-remove" aria-label="'+escapeHTML(item.name)+
   ' entfernen" onclick="MeviStocks.remove(\''+escapeHTML(item.symbol)+'\')">×</button></div>';
 }).join(''):'<div class="mevi-tv-empty">Keine passenden Werte. Filter ändern oder Aktie hinzufügen.</div>';
}
function periodsHTML(){
 return PERIODS.map(p=>'<button type="button" class="'+(state.period===p.key?'active':'')+
 '" aria-pressed="'+(state.period===p.key)+'" onclick="MeviStocks.period(\''+p.key+'\')">'+p.label+'</button>').join('');
}
function html(compact=false){
 state.compact=!!compact;
 return '<section class="mevi-stocks mevi-tv'+(compact?' is-compact':'')+'" aria-label="Aktienkurse mit TradingView">'+
  '<div class="mevi-tv-layout"><nav class="mevi-tv-sidebar" aria-label="Meine Watchlist">'+
  '<div class="mevi-tv-actions"><input id="mevi-tv-search" aria-label="Aktien suchen" type="search" placeholder="Aktie suchen…" value="'+escapeHTML(state.query)+
  '" oninput="MeviStocks.search(this.value)"/><button type="button" class="mevi-tv-fav-filter '+(state.onlyFavorites?'active':'')+
  '" onclick="MeviStocks.favoritesOnly()" aria-label="Nur Favoriten" title="Favoriten filtern" aria-pressed="'+state.onlyFavorites+'">★</button>'+
  '<button type="button" onclick="MeviStocks.toggleAdd()" aria-label="Aktie hinzufügen" title="Aktie hinzufügen">+</button></div>'+
  '<div id="mevi-tv-add" class="mevi-tv-add" hidden><input id="mevi-tv-symbol" aria-label="TradingView-Börsensymbol" placeholder="NASDAQ:MSFT" maxlength="60" autocapitalize="characters"/>'+
  '<input id="mevi-tv-name" aria-label="Anzeigename" placeholder="Name (optional)" maxlength="50"/>'+
  '<button type="button" onclick="MeviStocks.add()">OK</button></div>'+
  '<div class="mevi-tv-list" id="mevi-tv-list">'+listHTML()+'</div>'+
  '<a class="mevi-tv-external" id="mevi-tv-link" href="'+symbolURL(state.symbol)+
  '" target="_blank" rel="noopener noreferrer">TradingView ↗</a></nav>'+
  '<div class="mevi-tv-right"><div class="mevi-tv-charttools"><strong id="mevi-tv-selected">'+escapeHTML(current()?.name||'Aktie wählen')+'</strong>'+
  '<div class="mevi-tv-periods" id="mevi-tv-periods">'+periodsHTML()+'</div></div>'+
  '<div class="mevi-tv-chart" id="mevi-tv-chart" aria-label="TradingView Kurschart">'+
  '<div class="mevi-tv-loading">TradingView-Chart wird geladen …</div></div></div></div>'+
  '<div class="mevi-tv-feedback" id="mevi-tv-feedback" role="status">'+escapeHTML(state.status)+'</div></section>';
}
function feedback(msg){state.status=msg;const n=element('feedback');if(n)n.textContent=msg}
function updateList(){
 const n=element('list');if(n)n.innerHTML=listHTML();
 const label=element('selected');if(label)label.textContent=current()?.name||'Aktie wählen';
 const link=element('link');if(link)link.href=symbolURL(state.symbol);
}
function chartConfig(symbol,period,compact){
 const range=PERIODS.find(x=>x.key===period)||PERIODS[3];
 return {autosize:true,symbol,interval:range.interval,range:range.range,timezone:'Europe/Berlin',theme:'dark',style:'3',locale:'de',
  backgroundColor:'#081622',gridColor:'rgba(109,153,174,0.12)',allow_symbol_change:true,calendar:false,details:false,
  hide_side_toolbar:true,hide_top_toolbar:true,hide_legend:true,hide_volume:true,
  withdateranges:false,save_image:false,watchlist:[],compareSymbols:[],studies:[],support_host:'https://www.tradingview.com'};
}
function buildChart(){
 if(!state.mounted)return;
 const target=element('chart'),item=current();
 if(!target||!item)return;
 const generation=++state.generation;
 target.replaceChildren();
 const shell=document.createElement('div');shell.className='tradingview-widget-container';
 shell.style.width='100%';shell.style.height='100%';
 const inner=document.createElement('div');inner.className='tradingview-widget-container__widget';
 inner.style.width='100%';inner.style.height='100%';
 shell.appendChild(inner);
 const script=document.createElement('script');
 script.type='text/javascript';
 script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
 script.async=true;
 script.textContent=JSON.stringify(chartConfig(item.symbol,state.period,state.compact));
 script.onerror=()=>{if(state.mounted&&generation===state.generation){
  target.innerHTML='<div class="mevi-tv-loading">TradingView konnte nicht geladen werden. Internetverbindung oder Inhaltsblocker prüfen.</div>';
  feedback('Externer Chart nicht erreichbar.');
 }};
 target.appendChild(shell);
 shell.appendChild(script);
}
function updateChart(){const label=element('selected');if(label)label.textContent=current()?.name||'';const link=element('link');if(link)link.href=symbolURL(state.symbol);buildChart()}
function select(symbol){if(!state.items.some(x=>x.symbol===symbol))return;state.symbol=symbol;save();updateList();updateChart()}
function period(key){if(!PERIODS.some(x=>x.key===key))return;state.period=key;save();const n=element('periods');if(n)n.innerHTML=periodsHTML();buildChart()}
function favorite(symbol){if(!state.items.some(x=>x.symbol===symbol))return;
 state.favorites=state.favorites.includes(symbol)?state.favorites.filter(x=>x!==symbol):[...state.favorites,symbol];save();updateList()}
function favoritesOnly(){state.onlyFavorites=!state.onlyFavorites;const n=document.querySelector('.mevi-tv-actions button');if(n){n.classList.toggle('active',state.onlyFavorites);n.setAttribute('aria-pressed',String(state.onlyFavorites))}updateList()}
function search(query){state.query=String(query||'').slice(0,60);updateList()}
function toggleAdd(){const panel=element('add');if(panel){panel.hidden=!panel.hidden;if(!panel.hidden)element('symbol')?.focus()}}
function add(){
 const raw=String(element('symbol')?.value||'').toUpperCase().trim(),name=String(element('name')?.value||'').trim().slice(0,50);
 if(!validSymbol(raw)){feedback('Bitte Börse:Symbol eingeben, z. B. NASDAQ:MSFT oder XETR:BMW.');return}
 if(state.items.some(x=>x.symbol===raw)){select(raw);feedback('Wert ist bereits vorhanden.');return}
 if(state.items.length>=25){feedback('Maximal 25 Werte in der Watchlist.');return}
 state.items.push({symbol:raw,name:name||raw});state.symbol=raw;state.query='';save();
 const searchBox=element('search');if(searchBox)searchBox.value='';
 const panel=element('add');if(panel)panel.hidden=true;
 updateList();updateChart();feedback(raw+' hinzugefügt.');
}
function remove(symbol){
 if(!validSymbol(symbol))return;
 state.items=state.items.filter(x=>x.symbol!==symbol);
 state.favorites=state.favorites.filter(x=>x!==symbol);
 if(!state.items.length)state.items=DEFAULTS.map(x=>({...x}));
 if(!state.items.some(x=>x.symbol===state.symbol))state.symbol=state.items[0].symbol;
 save();updateList();updateChart();feedback('Aus Watchlist entfernt.');
}
function mount(){state.mounted=!!document.querySelector('.mevi-tv');if(state.mounted){updateList();buildChart()}}
function unmount(){state.mounted=false;state.generation++}
window.MeviStocks={html,mount,unmount,select,period,favorite,favoritesOnly,search,toggleAdd,add,remove,validSymbol,chartConfig,
 debug:()=>({mounted:state.mounted,symbol:state.symbol,period:state.period,items:state.items.map(x=>x.symbol),favorites:[...state.favorites]})};
})();