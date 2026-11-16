/* Web-only visual parity for Fable's native destination search. Never change the hybrid APK. */
(function(){
'use strict';
if(window.MeviNativeBridge?.postMessage)return;
const nav=window.MeviGoogleNav;
if(!nav)return;
let tab='recent',view='search',pendingSlot='',pendingFavorite=false,filter='',gps=null;
const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
 back:'<path d="m15 18-6-6 6-6"/><path d="M9 12h12"/>',
 home:'<path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9"/><path d="M9 21v-8h6v8"/>',
 work:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
 fuel:'<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M3 21h13"/><path d="M7 7h5v5H7z"/><path d="m15 8 3 3v7a2 2 0 0 0 4 0v-6l-3-3"/>',
 charge:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="m13 6-4 6h4l-2 6 5-8h-4l1-4"/>',
 parking:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
 food:'<path d="M4 3v8a3 3 0 0 0 6 0V3M7 3v18M17 21V3c-4 3-4 8 0 10h2"/>',
 cafe:'<path d="M4 6h13v9a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V6z"/><path d="M17 8h2a3 3 0 0 1 0 6h-2M3 22h17"/>',
 cart:'<circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M2 4h3l3 12h12l2-9H6"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>',
 star:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
 pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
 edit:'<path d="m14 5 5 5M3 21l5-1 12-12-4-4L4 16l-1 5z"/>',
 remove:'<path d="M5 7h14M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
 search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
 plus:'<path d="M12 5v14M5 12h14"/>'
};
function ico(name){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.pin)+'</svg>'}
function data(){return nav.webData?.()||{favorites:[],recent:[],slots:{},suggestions:[],query:''}}
function distance(d){
 const p=gps||data().origin;
 if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||!Number.isFinite(d.lat)||!Number.isFinite(d.lng))return '';
 const rad=Math.PI/180,dl=(d.lat-p.lat)*rad,dg=(d.lng-p.lng)*rad;
 const a=Math.sin(dl/2)**2+Math.cos(p.lat*rad)*Math.cos(d.lat*rad)*Math.sin(dg/2)**2;
 const km=6371*2*Math.asin(Math.min(1,Math.sqrt(a)));
 return (km<10?km.toLocaleString('de-DE',{maximumFractionDigits:1}):Math.round(km).toLocaleString('de-DE'))+' km';
}
function row(d,kind,i,manage){
 const glyph=kind==='recent'?'clock':kind==='home'?'home':kind==='work'?'work':'pin';
 return '<div class="mg-parity-row"><button type="button" class="mg-parity-entry" onclick="MeviWebNavParity.choose(\''+kind+'\','+i+')" aria-label="'+safe(d.name)+' auswählen">'+
 '<span class="mg-parity-symbol">'+ico(glyph)+'</span><span class="mg-parity-description"><strong>'+safe(d.name)+'</strong>'+
 (d.address?'<small>'+safe(d.address)+'</small>':'')+'</span><span class="mg-parity-distance">'+safe(distance(d))+'</span></button>'+
 (manage?'<button type="button" class="mg-parity-inline" onclick="MeviWebNavParity.rename(\''+kind+'\','+i+')" aria-label="Umbenennen">'+ico('edit')+'</button>'+
 '<button type="button" class="mg-parity-inline" onclick="MeviWebNavParity.remove(\''+kind+'\','+i+')" aria-label="Entfernen">'+ico('remove')+'</button>':'')+'</div>';
}
function rows(kind,manage=false){
 const d=data(), items=kind==='recent'?d.recent:kind==='favorites'?d.favorites:d.slots[kind]?[d.slots[kind]]:[];
 return items.length?items.map((item,i)=>row(item,kind,i,manage)).join(''):'<div class="mg-parity-empty">'+(kind==='recent'?'Noch keine Ziele gefahren.':'Noch keine Ziele gespeichert.')+'</div>';
}
const categories=[['home','Zuhause','home'],['work','Arbeit','work'],['fuel','Tanken','Tankstelle'],['charge','Laden','Ladestation'],['parking','Parken','Parkplatz'],['food','Essen','Restaurant'],['cafe','Café','Café'],['cart','Einkaufen','Supermarkt']];
function chips(){return '<div class="mg-parity-chips" aria-label="Schnellziele und POI-Kategorien">'+categories.map(([icon,label,q],i)=>
 '<button type="button" onclick="'+(i<2?'MeviWebNavParity.slot(\''+icon+'\')':'MeviWebNavParity.poi(\''+q+'\')')+'">'+ico(icon)+'<span>'+label+'</span></button>').join('')+'</div>'}
function tabs(){return '<div class="mg-parity-tabs"><button type="button" class="'+(tab==='recent'?'selected':'')+'" onclick="MeviWebNavParity.tab(\'recent\')">Zuletzt</button><button type="button" class="'+(tab==='favorites'?'selected':'')+'" onclick="MeviWebNavParity.tab(\'favorites\')">Gespeichert</button></div>'}
function searchRows(){
 const d=data(),q=(s.query||'').trim();
 if(q){
  if(q.length<3)return '<div class="mg-parity-empty">Mindestens drei Zeichen eingeben.</div>';
  return d.suggestions.length?d.suggestions.map((item,i)=>row({name:item.name,address:item.address||'Google Places'},'suggest',i,false)).join(''):'<div class="mg-parity-empty">'+safe(d.error||'Google Places sucht Adressen …')+'</div>';
 }
 if(tab==='recent')return rows('recent');
 return '<div class="mg-parity-slot-rows">'+(d.slots.home?row(d.slots.home,'home',0,false):'')+(d.slots.work?row(d.slots.work,'work',0,false):'')+'</div>'+
 rows('favorites')+'<button type="button" class="mg-parity-book-link" onclick="MeviWebNavParity.book()">Adressbuch öffnen</button>';
}
function searchHTML(){
 return '<div class="mg-parity-shade" role="dialog" aria-modal="true" aria-label="Ziel suchen"><div class="mg-parity-layout">'+
 '<div class="mg-parity-top"><button type="button" class="mg-parity-back" onclick="MeviWebNavParity.close()" aria-label="Zurück">'+ico('back')+'</button>'+
 '<div class="mg-parity-field">'+ico('search')+'<input id="searchInput" type="search" placeholder="Adresse, Ort oder POI" aria-label="Adresse, Ort oder POI" autocomplete="off" spellcheck="false" maxlength="200" onkeydown="event.stopPropagation()" oninput="MeviWebNavParity.input(this.value)" value="'+safe(s.query)+'">'+
 (s.query?'<button type="button" class="mg-parity-clear" onclick="MeviWebNavParity.clear()" aria-label="Suche löschen">×</button>':'')+'</div></div>'+
 '<div id="mg-parity-controls" '+(s.query?'hidden':'')+'>'+chips()+tabs()+'</div>'+
 '<div class="mg-parity-results" id="suggestions" aria-live="polite">'+searchRows()+'</div></div></div>';
}
function bookItems(items,kind){
 const q=filter.toLocaleLowerCase('de-DE');
 return items.map((d,i)=>({d,i})).filter(x=>!q||(x.d.name+' '+(x.d.address||'')).toLocaleLowerCase('de-DE').includes(q))
 .map(x=>row(x.d,kind,x.i,true)).join('')||'<div class="mg-parity-empty">Keine passenden Ziele.</div>';
}
function bookBody(){
 const d=data(),slots=['home','work'];
 return '<div class="mg-parity-book-grid"><section><h3>SCHNELLZIELE</h3>'+
 slots.map(k=>d.slots[k]?row(d.slots[k],k,0,true):'<button type="button" class="mg-parity-empty-slot" onclick="MeviWebNavParity.slot(\''+k+'\')">'+ico(k)+' '+(k==='home'?'Zuhause':'Arbeit')+' festlegen</button>').join('')+
 '<h3>FAVORITEN ('+d.favorites.length+')</h3>'+bookItems(d.favorites,'favorites')+'</section><section><div class="mg-parity-book-row"><h3>ZULETZT ('+d.recent.length+')</h3><button type="button" onclick="MeviWebNavParity.clearHistory()">Verlauf löschen</button></div>'+bookItems(d.recent,'recent')+'</section></div>';
}
function bookHTML(){
 return '<div class="mg-parity-shade" role="dialog" aria-modal="true" aria-label="Adressbuch"><div class="mg-parity-layout">'+
 '<div class="mg-parity-top mg-parity-book-top"><button type="button" class="mg-parity-back" onclick="MeviWebNavParity.bookBack()" aria-label="Zurück">'+ico('back')+'</button>'+
 '<strong>Adressbuch</strong><input id="mg-parity-filter" type="search" placeholder="Adressbuch filtern" value="'+safe(filter)+'" onkeydown="event.stopPropagation()" oninput="MeviWebNavParity.filter(this.value)">'+
 '<button type="button" class="mg-parity-add" onclick="MeviWebNavParity.add()">'+ico('plus')+' Hinzufügen</button></div>'+
 '<div class="mg-parity-book-content" id="mg-parity-book-body">'+bookBody()+'</div>'+
 '<div class="mg-parity-footer"><button type="button" onclick="MeviWebNavParity.exportBook()">Exportieren</button>'+
 '<button type="button" onclick="document.getElementById(\'mg-parity-import\').click()">Importieren</button>'+
 '<input id="mg-parity-import" type="file" accept=".json,application/json" hidden onchange="MeviWebNavParity.importBook(this.files[0])"></div></div></div>';
}
function rerender(){window.render?.()}
function open(){
 if(!nav.hasKey?.()){window.openCredentialSettings?.();return}
 view='search';tab='recent';filter='';s.app='nav';s.mode='map';s.nav='search';s.keyboard=false;s.query='';
 nav.changeQuery('');rerender();
 if(navigator.geolocation&&!gps){navigator.geolocation.getCurrentPosition(p=>{gps={lat:p.coords.latitude,lng:p.coords.longitude};const el=document.getElementById('suggestions');if(el&&view==='search'&&!s.query)el.innerHTML=searchRows()},()=>{},{enableHighAccuracy:false,maximumAge:60000,timeout:4000})}
}
function close(){pendingSlot='';pendingFavorite=false;view='search';s.nav='browse';s.keyboard=false;rerender()}
function input(value){
 s.query=String(value||'');nav.changeQuery(s.query);
 const controls=document.getElementById('mg-parity-controls');if(controls)controls.hidden=!!s.query.trim();
 const clear=document.querySelector('.mg-parity-clear');
 if(clear)clear.hidden=!s.query;
}
function clear(){s.query='';nav.changeQuery('');rerender();document.getElementById('searchInput')?.focus({preventScroll:true})}
function setTab(value){tab=value==='favorites'?'favorites':'recent';rerender()}
async function choose(kind,index){
 await nav.pick(kind,index);
 if(pendingSlot){nav.webSaveSelectedSlot?.(pendingSlot);pendingSlot=''}
 if(pendingFavorite){nav.saveFavorite();pendingFavorite=false}
}
function slot(k){
 const d=data().slots[k];
 if(d){void choose(k,0);return}
 pendingSlot=k;view='search';s.query='';nav.changeQuery('');rerender();
 document.getElementById('searchInput')?.focus({preventScroll:true});
}
function poi(query){
 view='search';s.query=query;nav.changeQuery(query);rerender();
}
function book(){view='book';s.nav='search';s.keyboard=false;filter='';rerender()}
function bookBack(){view='search';s.query='';nav.changeQuery('');rerender()}
function add(){pendingFavorite=true;view='search';s.query='';nav.changeQuery('');rerender();document.getElementById('searchInput')?.focus({preventScroll:true})}
function write(changes){nav.webWrite?.(changes);rerender()}
function remove(kind,i){
 const d=data(),arr=kind==='recent'?d.recent:kind==='favorites'?d.favorites:[];
 if(kind==='home'||kind==='work'){if(!window.confirm('Schnellziel entfernen?'))return;delete d.slots[kind];write({slots:d.slots});return}
 if(!arr[i]||!window.confirm('„'+arr[i].name+'“ entfernen?'))return;
 arr.splice(i,1);write({[kind]:arr});
}
function rename(kind,i){
 const d=data(),item=kind==='home'||kind==='work'?d.slots[kind]:(kind==='recent'?d.recent:d.favorites)[i];
 if(!item)return;
 const value=window.prompt('Zielname bearbeiten',item.name);if(value===null)return;
 const name=value.trim();if(!name||name.length>120)return;
 if(kind==='home'||kind==='work'){d.slots[kind]={...item,name};write({slots:d.slots});return}
 const arr=kind==='recent'?d.recent:d.favorites;arr[i]={...item,name};write({[kind]:arr});
}
function clearHistory(){if(window.confirm('Alle zuletzt gefahrenen Ziele entfernen?'))write({recent:[]})}
function exportBook(){
 const d=data(),saved=[...['home','work'].map(k=>d.slots[k]?{...d.slots[k],slot:k}:null).filter(Boolean),...d.favorites.map(x=>({...x,slot:''}))];
 const payload={version:2,saved:saved.map((x,i)=>({id:'web-'+(i+1),placeId:'',name:x.name,address:x.address||'',lat:x.lat,lng:x.lng,fetchedAt:0,slot:x.slot,icon:'',note:'',order:i})),
 recent:d.recent.map(x=>({placeId:'',name:x.name,address:x.address||'',lat:x.lat,lng:x.lng,usedAt:Date.now(),count:1}))};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='MeviCar-Adressbuch.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importBook(file){
 if(!file)return;
 try{
  if(file.size>1000000)throw Error('Datei ist zu groß.');
  const book=JSON.parse(await file.text());
  const saved=Array.isArray(book.saved)?book.saved:Array.isArray(book.favorites)?book.favorites:[];
  const recent=Array.isArray(book.recent)?book.recent:[];
  const clean=x=>x&&typeof x.name==='string'&&Number.isFinite(x.lat)&&Number.isFinite(x.lng)&&Math.abs(x.lat)<=90&&Math.abs(x.lng)<=180?{name:x.name.slice(0,120),address:String(x.address||'').slice(0,200),lat:x.lat,lng:x.lng}:null;
  const slots={...data().slots},favorites=[...data().favorites],history=[...data().recent];let added=0,skipped=0;
  for(const item of saved){const x=clean(item);if(!x){skipped++;continue}if(item.slot==='home'||item.slot==='work')slots[item.slot]=x;else favorites.push(x);added++}
  for(const item of recent){const x=clean(item);if(x)history.push(x);else skipped++}
  write({slots,favorites,recent:history});
  window.alert(added+' Ziele importiert'+(skipped?' · '+skipped+' ohne nutzbare Koordinaten übersprungen':'')+'.');
 }catch(e){window.alert('Adressbuch konnte nicht importiert werden: '+(e.message||e))}
}
function refreshBook(){const el=document.getElementById('mg-parity-book-body');if(el)el.innerHTML=bookBody()}
function filterBook(q){filter=q;refreshBook()}
const originalBrowse=window.browseOverlay;
window.browseOverlay=function(){
 const html=originalBrowse?.()||'';
 return html.replace('<div class="inner">','<div class="inner"><div class="mg-parity-browse-actions"><button type="button" onclick="MeviWebNavParity.open()">Ziel / POI</button><button type="button" onclick="MeviWebNavParity.book()">Adressbuch</button></div>');
};
window.openSearch=open;
window.searchOverlay=function(){return view==='book'?bookHTML():searchHTML()};
window.MeviWebNavParity={open,close,input,clear,tab:setTab,choose,slot,poi,book,bookBack,add,remove,rename,clearHistory,exportBook,importBook,filter:filterBook,resultsHTML:()=>view==='search'?searchRows():''};
})();