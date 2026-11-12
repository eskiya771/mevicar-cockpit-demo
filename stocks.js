/* MeviCar Next – real quotes via user-supplied Twelve Data key.
   No demo prices, backend, shared key, or automatic paid subscription. */
(function(){
'use strict';
const STORE='mevicar-stocks-v1';
const defaults=[{symbol:'SIE:XETR',name:'Siemens'},{symbol:'TSLA',name:'Tesla'},{symbol:'NVDA',name:'NVIDIA'}];
const state={items:defaults.map(x=>({...x})),key:'',quotes:{},errors:{},mounted:false,requestId:0,loading:false,status:'API-Schlüssel eintragen, um echte Kurse abzurufen.',updated:0};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const validSymbol=x=>/^[A-Z0-9][A-Z0-9.:-]{0,24}$/.test(x);
function read(){
 try{
  const data=JSON.parse(localStorage.getItem(STORE)||'{}');
  if(Array.isArray(data.items)){const unique=new Set();const items=[];
   for(const o of data.items){const symbol=String(o?.symbol||'').toUpperCase().trim();
    if(!validSymbol(symbol)||unique.has(symbol)||items.length>=12)continue;
    unique.add(symbol);items.push({symbol,name:String(o?.name||symbol).slice(0,45)})}
   if(items.length)state.items=items;
  }
 }catch{}
}
read();
function save(){try{localStorage.setItem(STORE,JSON.stringify({items:state.items}))}catch{}}
function node(id){return document.getElementById('mevi-stocks-'+id)}
function message(s){state.status=s;const n=node('status');if(n)n.textContent=s}
function price(value,currency){
 if(!Number.isFinite(value))return '–';
 return new Intl.NumberFormat('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2,style:'currency',currency:/^[A-Z]{3}$/.test(currency||'')?currency:'USD'}).format(value)
}
function amount(value,unit=''){return Number.isFinite(value)?new Intl.NumberFormat('de-DE',{maximumFractionDigits:2}).format(value)+unit:'–'}
function quoteRow(item){
 const q=state.quotes[item.symbol],error=state.errors[item.symbol];
 const change=q&&Number.isFinite(q.change)?q.change:null;
 const style=change===null?'':change>=0?' up':' down';
 return '<article class="mevi-stocks-row"><div class="mevi-stocks-identity"><strong>'+esc(item.name)+'</strong><small>'+esc(item.symbol)+'</small></div>'+
 '<div class="mevi-stocks-values"><strong>'+ (q?esc(price(q.close,q.currency)):'–')+'</strong>'+
 '<small class="'+style+'">'+(q?esc((change>=0?'+':'')+amount(change)+' ('+(q.percent>=0?'+':'')+amount(q.percent,'%')+')'):esc(error||'Noch keine Daten'))+'</small></div>'+
 '<button class="mevi-stocks-remove" type="button" aria-label="'+esc(item.symbol)+' entfernen" onclick="MeviStocks.remove(\''+esc(item.symbol)+'\')">×</button></article>';
}
function rows(){return state.items.map(quoteRow).join('')||'<div class="mevi-stocks-empty">Watchlist leer. Symbol hinzufügen.</div>'}
function html(compact=false){return '<section class="mevi-stocks'+(compact?' is-compact':'')+'" aria-label="Aktienkurse">'+
 '<header class="mevi-stocks-header"><div><small>MEVICAR NEXT · FINANZEN</small><strong>Aktienkurse</strong></div><button type="button" onclick="MeviStocks.refresh()" id="mevi-stocks-refresh">↻ Aktualisieren</button></header>'+
 '<div class="mevi-stocks-config"><label>TWELVE DATA API-KEY<input id="mevi-stocks-key" type="password" autocomplete="off" spellcheck="false" placeholder="Privaten API-Key eingeben" value="'+esc(state.key)+'" oninput="MeviStocks.setKey(this.value)"></label>'+
 '<button type="button" onclick="MeviStocks.clearKey()" aria-label="API-Key entfernen">Schlüssel löschen</button></div>'+
 '<div class="mevi-stocks-add"><input type="text" id="mevi-stocks-symbol" autocapitalize="characters" placeholder="Börsensymbol, z. B. AAPL" aria-label="Aktien-Symbol">'+
 '<button type="button" onclick="MeviStocks.add()">+ Hinzufügen</button></div>'+
 '<div class="mevi-stocks-status" id="mevi-stocks-status" role="status">'+esc(state.status)+'</div>'+
 '<div class="mevi-stocks-list" id="mevi-stocks-list">'+rows()+'</div>'+
 '<footer class="mevi-stocks-footer">Daten: Twelve Data · verzögert je nach Börse/Tarif · keine Anlageberatung. <a href="https://twelvedata.com/" target="_blank" rel="noopener noreferrer">API-Key erhalten</a></footer></section>'}
function update(){const list=node('list');if(list)list.innerHTML=rows();const b=node('refresh');if(b)b.disabled=state.loading}
function setKey(value){state.key=String(value||'').trim().slice(0,256)}
function clearKey(){state.key='';state.requestId++;state.loading=false;state.quotes={};state.errors={};const input=node('key');if(input)input.value='';message('API-Schlüssel entfernt. Keine Live-Kurse geladen.');update()}
function add(){
 const input=node('symbol');const symbol=String(input?.value||'').trim().toUpperCase();
 if(!validSymbol(symbol)){message('Ungültiges Symbol. Beispiel: AAPL oder SIE:XETR.');return}
 if(state.items.some(x=>x.symbol===symbol)){message(symbol+' ist bereits vorhanden.');return}
 if(state.items.length>=12){message('Maximal 12 Werte in der Watchlist.');return}
 state.items.push({symbol,name:symbol});save();if(input)input.value='';
 message(symbol+' hinzugefügt. Zur Kursabfrage „Aktualisieren“ tippen.');update()
}
function remove(symbol){state.items=state.items.filter(x=>x.symbol!==symbol);delete state.quotes[symbol];delete state.errors[symbol];save();message(symbol+' entfernt.');update()}
function parseQuote(data,symbol){
 if(!data||data.status==='error'||data.code||data.message&&data.status!=='ok')throw Error(String(data?.message||'Keine Kursdaten verfügbar').slice(0,150));
 const close=Number(data.close);
 if(!Number.isFinite(close)||close<=0)throw Error('Keine gültigen Kursdaten für '+symbol);
 const change=Number(data.change),percent=Number(data.percent_change);
 return {close,change:Number.isFinite(change)?change:null,percent:Number.isFinite(percent)?percent:null,
  currency:String(data.currency||'USD').toUpperCase(),datetime:String(data.datetime||'')};
}
async function refresh(){
 if(!state.mounted||state.loading)return;
 const key=state.key.trim();if(!key){message('Bitte eigenen Twelve Data API-Key eintragen.');return}
 const run=++state.requestId;state.loading=true;message('Echte Kursdaten werden geladen …');update();
 const quote={},errors={};let done=0;
 try{
  for(const item of state.items){
   if(run!==state.requestId||!state.mounted)return;
   try{
    const controller=typeof AbortController==='function'?new AbortController():null;
    const timeout=controller?setTimeout(()=>controller.abort(),12000):null;
    let response;
    try{
     const url='https://api.twelvedata.com/quote?'+new URLSearchParams({symbol:item.symbol,apikey:key}).toString();
     response=await fetch(url,{cache:'no-store',...(controller?{signal:controller.signal}:{})});
    }finally{if(timeout!==null)clearTimeout(timeout)}
    if(!response.ok)throw Error('HTTP '+response.status);
    quote[item.symbol]=parseQuote(await response.json(),item.symbol);done++;
   }catch(e){errors[item.symbol]=e?.name==='AbortError'?'Zeitüberschreitung':String(e?.message||'Abruf fehlgeschlagen').slice(0,120)}
   if(run!==state.requestId||!state.mounted)return;
   state.quotes={...state.quotes,...quote};state.errors={...state.errors,...errors};update();
  }
  state.updated=Date.now();
  message(done+' von '+state.items.length+' Kursen aktualisiert · '+new Date(state.updated).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})+'.');
 }finally{if(run===state.requestId){state.loading=false;update()}}
}
function mount(){if(!document.querySelector('.mevi-stocks')){unmount();return}state.mounted=true;update()}
function unmount(){state.mounted=false;state.requestId++;state.loading=false}
window.MeviStocks={html,mount,unmount,refresh,add,remove,setKey,clearKey,parseQuote,validSymbol,debug:()=>({items:state.items.map(x=>x.symbol),mounted:state.mounted,loading:state.loading})};
})();