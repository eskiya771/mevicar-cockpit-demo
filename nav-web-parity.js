/* Sole destination search and address-book UI for Web/PWA and Android WebView.
   Android uses its native Places/book provider; there is no legacy dialog fallback. */
(function(){
'use strict';
const native=!!window.MeviNativeBridge?.postMessage;
const injected=window.MeviSharedNavigationProvider;
if(native&&!injected)return; // Do not open an unbound UI or fall back to removed Kotlin dialogs.
const nav=window.MeviGoogleNav;
const shared=window.MeviNavigationShared;
if(!shared||(!nav&&!injected))return;
const provider=injected?shared.createProvider(injected):shared.createBrowserProvider(nav);
let selectedReturnView='search',externalMapPlace=false,bookOpenedFromSearch=false;
let tab='recent',view='search',pendingSlot='',pendingFavorite=false,filter='',gps=null,editor=null,editError='',poiState=null,placeState=null,placeIndex=-1,placeBack='search',placeSerial=0,placeLoading=false,placeError='',stopMode=false,returnNav='browse',stopError='';
const safe=shared.escapeHtml;
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
 plus:'<path d="M12 5v14M5 12h14"/>',
 heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 1 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
 wrench:'<path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a5 5 0 0 0 6.4-6.4l-3 3-3-3 3-3z"/>',
 up:'<path d="m6 15 6-6 6 6"/>',
 down:'<path d="m6 9 6 6 6-6"/>',
 rest:'<path d="M5 4h14M5 20h14M8 4v16M16 4v16M8 10h8M8 15h8"/>'
};
function ico(name){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.pin)+'</svg>'}
function data(){return provider.read()}
function distance(d){
 const p=gps||data().origin;
 if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||!Number.isFinite(d.lat)||!Number.isFinite(d.lng))return '';
 const km=shared.distanceMeters(p,d)/1000;
 return (km<10?km.toLocaleString('de-DE',{maximumFractionDigits:1}):Math.round(km).toLocaleString('de-DE'))+' km';
}
function row(d,kind,i,manage){
 const glyph=kind==='recent'?'clock':shared.effectiveIcon(d,kind==='favorites'?'':kind);
 const detail=[d.address||'',d.note||''].filter(Boolean).join(' · ');
 const editControls=manage&&kind!=='recent'?
   (kind==='favorites'?'<button type="button" class="mg-parity-inline" '+(i===0?'disabled ':'')+'onclick="MeviWebNavParity.move('+i+',-1)" aria-label="Nach oben">'+ico('up')+'</button>'+
    '<button type="button" class="mg-parity-inline" '+(i>=data().favorites.length-1?'disabled ':'')+'onclick="MeviWebNavParity.move('+i+',1)" aria-label="Nach unten">'+ico('down')+'</button>':'')+
   '<button type="button" class="mg-parity-inline" onclick="MeviWebNavParity.edit(\''+kind+'\','+i+')" aria-label="'+safe(d.name)+' bearbeiten">'+ico('edit')+'</button>':'';
 const removeControl=manage?'<button type="button" class="mg-parity-inline" onclick="MeviWebNavParity.remove(\''+kind+'\','+i+')" aria-label="'+safe(d.name)+' entfernen">'+ico('remove')+'</button>':'';
 return '<div class="mg-parity-row"><button type="button" class="mg-parity-entry" onclick="MeviWebNavParity.choose(\''+kind+'\','+i+')" aria-label="'+safe(d.name)+' auswählen">'+
 '<span class="mg-parity-symbol">'+ico(glyph)+'</span><span class="mg-parity-description"><strong>'+safe(d.name)+'</strong>'+
 (detail?'<small>'+safe(detail)+'</small>':'')+'</span><span class="mg-parity-distance">'+safe(distance(d))+'</span></button>'+
 editControls+removeControl+'</div>';
}
function rows(kind,manage=false){
 const d=data(), items=kind==='recent'?d.recent:kind==='favorites'?d.favorites:d.slots[kind]?[d.slots[kind]]:[];
 return items.length?items.map((item,i)=>row(item,kind,i,manage)).join(''):'<div class="mg-parity-empty">'+(kind==='recent'?'Noch keine Ziele gefahren.':'Noch keine Ziele gespeichert.')+'</div>';
}
const categories=[['home','Zuhause','home'],['work','Arbeit','work'],['fuel','Tanken','Tankstelle'],['charge','Laden','Ladestation'],['parking','Parken','Parkplatz'],['food','Essen','Restaurant'],['cafe','Café','Café'],['cart','Einkaufen','Supermarkt'],['rest','Rastplatz','Rastplatz WC'],['wrench','Werkstatt','Autowerkstatt']];
function chips(){return '<div class="mg-parity-chips" aria-label="Schnellziele und POI-Kategorien">'+categories.map(([icon,label,q],i)=>
 '<button type="button" onclick="'+(i<2?'MeviWebNavParity.slot(\''+icon+'\')':'MeviWebNavParity.poi(\''+icon+'\',\''+q+'\')')+'">'+ico(icon)+'<span>'+label+'</span></button>').join('')+'</div>'}
function tabs(){return '<div class="mg-parity-tabs"><button type="button" class="'+(tab==='recent'?'selected':'')+'" onclick="MeviWebNavParity.tab(\'recent\')">Zuletzt</button><button type="button" class="'+(tab==='favorites'?'selected':'')+'" onclick="MeviWebNavParity.tab(\'favorites\')">Gespeichert</button><button type="button" class="mg-parity-book-tab" onclick="MeviWebNavParity.book()">Adressbuch</button></div>'}
function searchRows(){
 const d=data(),q=(s.query||'').trim();
 if(q){
  if(q.length<2)return '<div class="mg-parity-empty">Mindestens zwei Zeichen eingeben.</div>';
  return d.suggestions.length?d.suggestions.map((item,i)=>row({name:item.name,address:item.address||'Google Places'},'suggest',i,false)).join(''):'<div class="mg-parity-empty">'+safe(d.error||'Google Places sucht Adressen …')+'</div>';
 }
 if(tab==='recent')return rows('recent');
 return '<div class="mg-parity-slot-rows">'+(d.slots.home?row(d.slots.home,'home',0,false):'')+(d.slots.work?row(d.slots.work,'work',0,false):'')+'</div>'+
 rows('favorites');
}
function searchHTML(){
 return '<div class="mg-parity-shade" role="dialog" aria-modal="true" aria-label="Ziel suchen"><div class="mg-parity-layout">'+
 '<div class="mg-parity-top"><button type="button" class="mg-parity-back" onclick="MeviWebNavParity.close()" aria-label="Zurück">'+ico('back')+'</button>'+
 '<div class="mg-parity-field">'+ico('search')+'<input id="searchInput" type="search" placeholder="Adresse, Ort oder POI" aria-label="Adresse, Ort oder POI" autocomplete="off" spellcheck="false" maxlength="200" onkeydown="if(event.key===\'Enter\'){event.preventDefault();MeviWebNavParity.submitSearch()}event.stopPropagation()" oninput="MeviWebNavParity.input(this.value)" value="'+safe(s.query)+'">'+
 '<button type="button" class="mg-parity-clear" '+(s.query?'':'hidden ')+'onclick="MeviWebNavParity.clear()" aria-label="Suche löschen">×</button></div></div>'+
 '<div id="mg-parity-controls" '+(s.query?'hidden':'')+'>'+chips()+tabs()+'</div>'+
 (stopError?'<p class="mg-poi-warning" role="alert">'+safe(stopError)+'</p>':'')+
 '<div class="mg-parity-results" id="suggestions" aria-live="polite">'+searchRows()+'</div></div></div>';
}
/* Single POI list and place card for Web and Android map interactions.
   Details are fetched only after one item is opened (Google Enterprise billing). */
const placeTypes={gas_station:'Tankstelle',electric_vehicle_charging_station:'Ladestation',parking:'Parkplatz',
 restaurant:'Restaurant',fast_food_restaurant:'Schnellrestaurant',cafe:'Café',bakery:'Bäckerei',
 supermarket:'Supermarkt',shopping_mall:'Einkaufszentrum',rest_stop:'Rastplatz',
 public_bathroom:'WC',car_repair:'Werkstatt'};
function placeKind(types){
 const labels=(Array.isArray(types)?types:[]).map(t=>placeTypes[t]).filter(Boolean);
 return labels[0]||'';
}
function poiRows(){
 const d=data();
 if(d.poiLoading)return '<p class="mg-parity-empty" role="status">Google Places sucht Orte …</p>';
 if(d.poiError)return '<div class="mg-parity-empty" role="status">'+safe(d.poiError)+
  '<button type="button" class="mg-poi-retry" onclick="MeviWebNavParity.retryPoi()">Erneut versuchen</button></div>';
 if(!d.poiResults.length)return '<div class="mg-parity-empty">Keine passenden Orte gefunden.</div>';
 return d.poiResults.map((item,i)=>{
  const detail=[placeKind(item.types),distance(item),item.address].filter(Boolean).join(' · ');
  return '<div class="mg-poi-hit"><button class="mg-poi-hit-main" type="button" onclick="MeviWebNavParity.showPlace('+i+')" aria-label="'+safe(item.name)+' Details öffnen">'+
   '<span class="mg-poi-number">'+(i+1)+'</span><span class="mg-poi-desc"><strong>'+safe(item.name)+'</strong>'+
   '<small>'+safe(detail)+'</small></span></button>'+
   '<button type="button" class="mg-poi-route" onclick="'+(stopMode?'MeviWebNavParity.addStopResult(':'MeviWebNavParity.routeResult(')+i+')" aria-label="'+(stopMode?'Als Zwischenstopp hinzufügen: ':'Route zu ')+safe(item.name)+'">'+(stopMode?ico('plus'):ico('pin'))+'</button></div>';
 }).join('');
}
function poiHTML(){
 const d=data(),sort=poiState?.sort||'distance',openNow=!!poiState?.openNow;
 const route=provider.routeContext();
 return '<div class="mg-parity-shade" role="dialog" aria-modal="true" aria-label="POI-Suchergebnisse">'+
 '<div class="mg-parity-layout"><div class="mg-parity-top">'+
 '<button type="button" class="mg-parity-back" onclick="MeviWebNavParity.backToSearch()" aria-label="Zurück zur Suche">'+ico('back')+'</button>'+
 '<strong class="mg-poi-title">'+safe(poiState?.query||'Orte')+'</strong><span class="mg-poi-google">Google Maps</span></div>'+
 '<div class="mg-poi-chips" aria-label="Treffer sortieren und filtern">'+
 '<button type="button" class="'+(sort==='distance'?'selected':'')+'" aria-pressed="'+(sort==='distance')+'" onclick="MeviWebNavParity.poiSort(\'distance\')">Entfernung</button>'+
 '<button type="button" class="'+(sort==='relevance'?'selected':'')+'" aria-pressed="'+(sort==='relevance')+'" onclick="MeviWebNavParity.poiSort(\'relevance\')">Relevanz</button>'+
 '<button type="button" class="'+(openNow?'selected':'')+'" aria-pressed="'+openNow+'" onclick="MeviWebNavParity.poiOpenNow()">Jetzt geöffnet</button>'+
 (route.hasRoute?'<button type="button" class="'+(poiState?.alongRoute?'selected':'')+'" aria-pressed="'+!!poiState?.alongRoute+'" onclick="MeviWebNavParity.poiAlongRoute()">In Routennähe</button>':'')+'</div>'+
 (poiState?.alongRoute?'<div class="mg-poi-hint">Suche an mehreren Punkten der Route · keine exakten Umwegzeiten</div>':'')+
 (stopError?'<p class="mg-poi-warning" role="alert">'+safe(stopError)+'</p>':'')+
 '<div id="suggestions" class="mg-parity-results mg-poi-results" aria-live="polite">'+poiRows()+'</div></div></div>';
}
function placeKey(p){return shared.destinationKey(p)}
function isPlaceSaved(){
 const key=placeKey(placeState);
 return !!key&&data().favorites.some(item=>placeKey(item)===key);
}
function placeHTML(){
 const selectedMode=s.nav==='preview';
 const p=selectedMode?(nav?.selectedDestination?.()||{}):(placeState||{}),name=p.name||'Ort',point=Number.isFinite(p.lat)&&Number.isFinite(p.lng);
 const label=placeKind(p.types),rating=Number.isFinite(p.rating)&&p.rating>=1&&p.rating<=5?
  p.rating.toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})+
  (Number.isInteger(p.ratingCount)&&p.ratingCount>0?' ('+p.ratingCount.toLocaleString('de-DE')+')':''):'';
 const phone=typeof p.phone==='string'&&/^[+0-9 ()/-]{3,32}$/.test(p.phone)?p.phone:'';
 const saved=selectedMode?!!nav?.isFavorite?.():isPlaceSaved(),route=provider.routeContext();
 const hours=Array.isArray(p.hours)?p.hours.filter(x=>typeof x==='string').slice(0,7):[];
 const opening=p.openNow===true?'Geöffnet':p.openNow===false?'Geschlossen':'';
 return '<div class="mg-parity-shade'+(selectedMode?' mg-parity-selected':'')+'" role="dialog" aria-modal="true" aria-label="Ortsdetails">'+
 '<div class="mg-parity-layout"><div class="mg-parity-top">'+
 '<button type="button" class="mg-parity-back" onclick="MeviWebNavParity.backFromPlace()" aria-label="Zurück zu den Treffern">'+ico('back')+'</button>'+
 (selectedMode?'':'<strong class="mg-poi-title">Ortsdetails</strong>')+'<span class="mg-poi-google">Google Maps</span></div>'+
 '<div class="mg-poi-detail-body" aria-live="polite"><h2>'+safe(name)+'</h2>'+
 (label?'<p class="mg-poi-muted">'+safe(label)+'</p>':'')+
 (p.address?'<p>'+safe(p.address)+'</p>':'')+
 (point?'<p class="mg-poi-muted">'+safe(distance(p))+(distance(p)?' Luftlinie':'')+'</p>':'')+
 (opening?'<p class="mg-poi-opening">'+safe(opening)+'</p>':'')+
 (rating?'<p>'+ico('star')+' '+safe(rating)+'</p>':'')+
 (phone?'<p>'+ico('pin')+' <a href="tel:'+safe(phone.replace(/[^0-9+]/g,''))+'">'+safe(phone)+'</a></p>':'')+
 (hours.length?'<details class="mg-poi-hours"><summary>Öffnungszeiten</summary>'+hours.map(h=>'<div>'+safe(h)+'</div>').join('')+'</details>':'')+
 (!selectedMode&&placeLoading?'<p class="mg-poi-muted">Google-Ortsdaten werden geladen …</p>':'')+
 (!selectedMode&&stopError?'<p class="mg-poi-warning" role="alert">'+safe(stopError)+'</p>':'')+
 (!selectedMode&&(placeError||p.detailError)?'<p class="mg-poi-warning">'+safe(placeError||p.detailError)+
  ' <button type="button" onclick="MeviWebNavParity.retryPlace()">Erneut versuchen</button></p>':'')+
 '</div><div class="mg-poi-detail-actions">'+
 (route.hasRoute&&point&&route.stops.length<route.maxStops?'<button type="button" class="mg-poi-action-stop" onclick="MeviWebNavParity.addStopPlace()">＋ Als Stopp hinzufügen</button>':'')+
 (point?'<button type="button" class="mg-poi-action-route" onclick="MeviWebNavParity.routePlace()">'+
 (route.active?'Neue Route':'Route')+'</button>':'')+
 (point||p.placeId?'<button type="button" onclick="MeviWebNavParity.savePlace()">'+(saved?'Gespeichert ✓':'Speichern')+'</button>':'')+
 '</div></div></div>';
}
function bookItems(items,kind){
 const q=filter.toLocaleLowerCase('de-DE').trim();
 return items.map((d,i)=>({d,i})).filter(x=>!q||(x.d.name+' '+(x.d.address||'')+' '+(x.d.note||'')).toLocaleLowerCase('de-DE').includes(q))
 .map(x=>row(x.d,kind,x.i,true)).join('')||'<div class="mg-parity-empty">Keine passenden Ziele.</div>';
}
function bookBody(){
 const d=data(),slots=['home','work'];
 return '<div class="mg-parity-book-grid"><section><h3>SCHNELLZIELE</h3>'+
 slots.map(k=>{
  const item=d.slots[k];
  if(filter&&!item)return '';
  if(item&&filter&&!(item.name+' '+item.address+' '+(item.note||'')).toLocaleLowerCase('de-DE').includes(filter.toLocaleLowerCase('de-DE')))return '';
  return item?row(item,k,0,true):'<button type="button" class="mg-parity-empty-slot" onclick="MeviWebNavParity.slot(\''+k+'\')">'+ico(k)+' '+(k==='home'?'Zuhause':'Arbeit')+' festlegen</button>';
 }).join('')+
 '<h3>FAVORITEN ('+d.favorites.length+')</h3>'+bookItems(d.favorites,'favorites')+'</section><section><div class="mg-parity-book-row"><h3>ZULETZT ('+d.recent.length+')</h3><button type="button" onclick="MeviWebNavParity.clearHistory()">Verlauf löschen</button></div>'+bookItems(d.recent,'recent')+'</section></div>';
}
function bookHTML(){
 return '<div class="mg-parity-shade" role="dialog" aria-modal="true" aria-label="Adressbuch"><div class="mg-parity-layout">'+
 '<div class="mg-parity-top mg-parity-book-top"><button type="button" class="mg-parity-back" onclick="MeviWebNavParity.bookBack()" aria-label="Zurück">'+ico('back')+'</button>'+
 '<strong>Adressbuch</strong><input id="mg-parity-filter" type="search" placeholder="Adressbuch filtern" value="'+safe(filter)+'" onkeydown="event.stopPropagation()" oninput="MeviWebNavParity.filter(this.value)">'+
 '<button type="button" class="mg-parity-add" onclick="MeviWebNavParity.add()">'+ico('plus')+' Hinzufügen</button></div>'+
 '<div class="mg-parity-book-content" id="mg-parity-book-body">'+bookBody()+'</div>'+
 '<div class="mg-parity-footer"><button type="button" onclick="MeviWebNavParity.exportBook()">Exportieren</button>'+
 (provider.importPicker?'<button type="button" onclick="MeviWebNavParity.nativeImport()">Importieren</button>':
 '<button type="button" onclick="document.getElementById(\'mg-parity-import\').click()">Importieren</button>'+
 '<input id="mg-parity-import" type="file" accept=".json,application/json" hidden onchange="MeviWebNavParity.importBook(this.files[0])">')+'</div></div></div>';
}
function editHTML(){
 if(!editor)return bookHTML();
 const glyphs=shared.ICONS.map(k=>'<button type="button" title="'+safe(k)+'" aria-label="Symbol '+safe(k)+'" aria-pressed="'+(editor.icon===k)+'" class="'+(editor.icon===k?'selected':'')+'" onclick="MeviWebNavParity.editIcon(\''+k+'\')">'+ico(k)+'</button>').join('');
 const roles=[['','Favorit'],['home','Zuhause'],['work','Arbeit']].map(([key,label])=>
  '<button type="button" class="'+(editor.slot===key?'selected':'')+'" aria-pressed="'+(editor.slot===key)+'" onclick="MeviWebNavParity.editSlot(\''+key+'\')">'+label+'</button>').join('');
 const original=editor.item;
 return '<div class="mg-parity-shade" role="dialog" aria-modal="true" aria-label="Ziel bearbeiten"><div class="mg-parity-layout mg-parity-editor">'+
 '<div class="mg-parity-top"><button type="button" class="mg-parity-back" onclick="MeviWebNavParity.cancelEdit()" aria-label="Zurück">'+ico('back')+'</button><strong>Ziel bearbeiten</strong></div>'+
 '<div class="mg-parity-edit-scroll"><label>Name<input id="mg-edit-name" maxlength="120" autocomplete="off" value="'+safe(editor.name)+'" oninput="MeviWebNavParity.editField(\'name\',this.value)"></label>'+
 '<label>Notiz (optional)<input id="mg-edit-note" maxlength="200" autocomplete="off" value="'+safe(editor.note)+'" oninput="MeviWebNavParity.editField(\'note\',this.value)"></label>'+
 '<p class="mg-parity-edit-address">'+safe(original.address||'')+'</p>'+
 '<h3>SYMBOL</h3><div class="mg-parity-edit-icons">'+glyphs+'</div>'+
 '<h3>VERWENDEN ALS</h3><div class="mg-parity-edit-roles">'+roles+'</div>'+
 '<p class="mg-parity-edit-error" role="alert">'+safe(editError)+'</p></div>'+
 '<div class="mg-parity-edit-actions"><button type="button" onclick="MeviWebNavParity.cancelEdit()">Abbrechen</button>'+
 '<button type="button" class="mg-parity-edit-save" onclick="MeviWebNavParity.saveEdit()">Speichern</button>'+
 '<button type="button" onclick="MeviWebNavParity.removeEdited()">Löschen</button></div></div></div>';
}
function edit(kind,index){
 if(!['home','work','favorites'].includes(kind))return;
 const book=data(),item=kind==='favorites'?book.favorites[index]:book.slots[kind];
 if(!item)return;
 editor={kind,index,item,name:item.name,note:item.note||'',slot:kind==='favorites'?'':kind,icon:shared.effectiveIcon(item,kind==='favorites'?'':kind)};
 editError='';view='edit';rerender();
}
function editField(field,value){if(editor&&['name','note'].includes(field))editor[field]=String(value);}
function editIcon(icon){if(editor&&shared.ICONS.includes(icon)){editor.icon=icon;rerender()}}
function editSlot(slot){
 if(!editor||!shared.SLOTS.includes(slot))return;
 if(editor.icon===shared.defaultIcon(editor.slot))editor.icon=shared.defaultIcon(slot);
 editor.slot=slot;rerender();
}
function cancelEdit(){editor=null;editError='';view='book';rerender()}
async function saveEdit(){
 if(!editor)return;
 try{
  const book=data(),current=editor;
  const changes=shared.editSaved(book,current.kind,current.index,current);
  const occupied=current.slot&&book.slots[current.slot]&&current.slot!==current.kind;
  if(occupied&&!window.confirm((current.slot==='home'?'Zuhause':'Arbeit')+' ist bereits „'+book.slots[current.slot].name+'“. Dieses Schnellziel ersetzen?'))return;
  if(provider.editSaved)await provider.editSaved(current.kind,current.index,current);
  else write(changes);
  editor=null;editError='';view='book';rerender();
 }catch(e){editError=String(e.message||e);rerender()}
}
function removeEdited(){
 if(!editor)return;
 const {kind,index}=editor;
 editor=null;editError='';view='book';remove(kind,index);
}
async function move(index,delta){
 try{
  if(provider.moveFavorite){await provider.moveFavorite(index,delta);rerender()}
  else write(shared.moveFavorite(data(),index,delta));
 }catch(e){nativeFailure(e)}
}
function rerender(){window.render?.()}
function open(){
 if(!provider.isReady()){
  if(window.MeviAndroidSharedNav?.isOptedIn?.()){
   void window.MeviAndroidSharedNav.connect().then(open).catch(e=>window.MeviAndroidSharedNav.showError?.(e));
  }else window.openCredentialSettings?.();
  return;
 }
 const context=provider.routeContext();
 bookOpenedFromSearch=false;
 returnNav=context.nativeOwned?'browse':s.nav==='preview'?'preview':context.active?'driving':context.hasRoute?'ready':'browse';stopMode=false;stopError='';
 externalMapPlace=false;view='search';tab='recent';filter='';editor=null;poiState=null;placeState=null;placeSerial++;s.app='nav';s.mode='map';s.nav='search';s.keyboard=false;s.query='';
 provider.search('');rerender();window.MeviAndroidSharedNav?.setOpen(true);
 if(navigator.geolocation&&!gps){navigator.geolocation.getCurrentPosition(p=>{gps={lat:p.coords.latitude,lng:p.coords.longitude};const el=document.getElementById('suggestions');if(el&&view==='search'&&!s.query)el.innerHTML=searchRows()},()=>{},{enableHighAccuracy:false,maximumAge:60000,timeout:4000})}
}
function close(){
 bookOpenedFromSearch=false;externalMapPlace=false;pendingSlot='';pendingFavorite=false;editor=null;poiState=null;placeState=null;placeSerial++;stopMode=false;stopError='';view='search';s.nav=returnNav;s.keyboard=false;
 window.meviNavSearchClosed?.();
 rerender();window.MeviAndroidSharedNav?.setOpen(false);provider.cancel?.();
}
function input(value){
 s.query=String(value||'');provider.search(s.query);
 const controls=document.getElementById('mg-parity-controls');if(controls)controls.hidden=!!s.query.trim();
 const clear=document.querySelector('.mg-parity-clear');
 if(clear)clear.hidden=!s.query;
}
function clear(){s.query='';provider.search('');rerender();document.getElementById('searchInput')?.focus({preventScroll:true})}
function setTab(value){tab=value==='favorites'?'favorites':'recent';rerender()}
async function choose(kind,index){
 try{
  const savingSlot=pendingSlot,savingFavorite=pendingFavorite;
  const saveOnly=!!(savingSlot||savingFavorite);
  if(kind==='suggest'&&!saveOnly){await showPlace(index);return}
  // Stored stops cannot replace an active final destination.
  if(stopMode&&!saveOnly){
   const book=data();
   const place=kind==='favorites'?book.favorites[index]:kind==='recent'?book.recent[index]:
    (kind==='home'||kind==='work')?book.slots[kind]:null;
   if(place)await finishStop(place);
   return;
  }
  if(!saveOnly)selectedReturnView=view==='book'?'book':'search';
  // The Android APK routes stored targets immediately. Match that flow in
  // the Web browser, without showing the intermediate Place-details dialog.
  // Search hits, stop selection, saving and native bridge paths are unchanged.
  const directRoute=!native&&!saveOnly&&['home','work','favorites','recent'].includes(kind);
  const success=await provider.choose(kind,index,{saveOnly,skipPreview:directRoute});
  if(success===false)return;
  if(savingSlot)await provider.saveSlot(savingSlot);
  if(savingFavorite)await provider.saveFavorite();
  if(saveOnly){
   pendingSlot='';pendingFavorite=false;
   view=savingFavorite?'book':'search';s.nav='search';s.query='';
   provider.search('');rerender();
  }else if(directRoute){
   s.nav='browse';s.keyboard=false;s.mode='map';rerender();
   const ready=await provider.startRoute();
   // Keep the selected destination available if route calculation fails.
   if(ready===false){s.nav='preview';rerender()}
  }
 }catch(e){nativeFailure(e)}
}
function slot(k){
 const d=data().slots[k];
 if(d){void choose(k,0);return}
 pendingSlot=k;view='search';s.query='';provider.search('');rerender();
 document.getElementById('searchInput')?.focus({preventScroll:true});
}
function poi(type,query){
 stopError='';poiState={type,query,sort:'distance',openNow:false,alongRoute:stopMode&&provider.routeContext().hasRoute};
 view='results';s.nav='search';s.keyboard=false;s.query=query;
 provider.search(query);
 void provider.searchNearby(type,query,gps||null,{sort:'distance',openNow:false,alongRoute:poiState.alongRoute});
 rerender();
}
function retryPoi(){
 if(!poiState)return;
 s.query=poiState.query;
 void provider.searchNearby(poiState.type,poiState.query,gps||null,{sort:poiState.sort,openNow:poiState.openNow,alongRoute:poiState.alongRoute});
 rerender();
}
function poiSort(sort){
 if(!poiState||!['distance','relevance'].includes(sort)||poiState.sort===sort)return;
 poiState={...poiState,sort};retryPoi();
}
function poiOpenNow(){
 if(!poiState)return;
 poiState={...poiState,openNow:!poiState.openNow};retryPoi();
}
function poiAlongRoute(){
 if(!poiState||!provider.routeContext().hasRoute)return;
 poiState={...poiState,alongRoute:!poiState.alongRoute};retryPoi();
}
function openStopSearch(){
 const context=provider.routeContext();
 if(!context.hasRoute)return;
 if(context.stops.length>=context.maxStops){stopError='Maximal acht Zwischenstopps möglich.';return}
 returnNav=context.nativeOwned?'browse':context.active?'driving':'ready';stopMode=true;stopError='';pendingSlot='';pendingFavorite=false;
 view='search';tab='recent';s.app='nav';s.mode='map';s.nav='search';s.keyboard=false;s.query='';
 provider.search('');window.MeviAndroidSharedNav?.setOpen(true);rerender();
}
async function finishStop(place){
 if(!place)return false;
 stopError='';
 // Imported Android address books may contain a Place ID but no coordinates.
 // Resolve it without calling provider.choose(), which would stop navigation.
 let target=place;
 if(!Number.isFinite(target.lat)||!Number.isFinite(target.lng)){
  try{target=await provider.resolveStop(place)}catch{target=null}
 }
 if(!target||!Number.isFinite(target.lat)||!Number.isFinite(target.lng)){
  stopError='Für dieses gespeicherte Ziel konnte keine Position ermittelt werden. Die bisherige Route bleibt bestehen.';
  rerender();return false;
 }
 const ok=await provider.addStop(target);
 if(ok){
  close();return true;
 }
 stopError='Zwischenziel konnte nicht übernommen werden. Die bisherige Route bleibt bestehen.';
 rerender();return false;
}
async function addStopResult(index){
 const place=data().poiResults[index];if(!place)return false;
 return finishStop(place);
}
async function addStopPlace(){return finishStop(placeState)}
function backToSearch(){
 placeSerial++;placeState=null;poiState=null;view='search';s.query='';
 provider.search('');rerender();
}
/** Native map taps enter the normal place card, without a parallel Kotlin UI.
    A coordinate-only tap is a real destination; Places details require an ID. */
function openMapPlace(place){
 if(!native)return false;
 const item=shared.destination(place);
 if(!item||!Number.isFinite(item.lat)||!Number.isFinite(item.lng))return false;
 externalMapPlace=true;returnNav='browse';stopMode=false;stopError='';
 pendingSlot='';pendingFavorite=false;editor=null;poiState=null;
 placeState=item;placeIndex=-1;placeBack='search';
 placeError='';placeLoading=!!item.placeId;view='place';s.app='nav';s.mode='map';s.nav='search';s.keyboard=false;
 const serial=++placeSerial;
 window.MeviAndroidSharedNav?.setOpen(true);
 rerender();
 if(item.placeId&&provider.externalDetails){
  void Promise.resolve(provider.externalDetails(item)).then(detail=>{
   if(serial!==placeSerial||!externalMapPlace||view!=='place')return;
   if(detail)placeState={...placeState,...detail};
   else placeError='Google-Ortsdetails sind nicht verfügbar.';
  }).catch(error=>{
   if(serial===placeSerial&&externalMapPlace&&view==='place')
    placeError='Ortsdaten konnten nicht geladen werden: '+String(error.message||error);
  }).finally(()=>{
   if(serial===placeSerial&&externalMapPlace&&view==='place'){placeLoading=false;rerender()}
  });
 }
 return true;
}
async function showPlace(index){
 const items=view==='results'?data().poiResults:data().suggestions;
 if(!Number.isInteger(index)||!items?.[index])return;
 placeBack=view==='place'?placeBack:view==='results'?'results':'search';
 placeState={...items[index]};placeIndex=index;view='place';s.nav='search';
 placeLoading=true;placeError='';const serial=++placeSerial;rerender();
 try{
  const detail=await provider.details('suggest',index);
  if(serial!==placeSerial||view!=='place')return;
  if(detail)placeState={...placeState,...detail};
  else placeError='Google-Ortsdetails sind nicht verfügbar.';
 }catch(e){
  if(serial!==placeSerial||view!=='place')return;
  placeError='Ortsdaten konnten nicht geladen werden: '+String(e.message||e);
 }
 if(serial===placeSerial&&view==='place'){placeLoading=false;rerender()}
}
function retryPlace(){
 if(externalMapPlace&&placeState){openMapPlace(placeState);return}
 if(view==='place'&&placeIndex>=0)void showPlace(placeIndex);
}
function backFromPlace(){
 if(externalMapPlace){close();return}
 if(s.nav==='preview'){
  placeSerial++;placeLoading=false;placeState=null;view=selectedReturnView;
  s.nav='search';s.keyboard=false;s.query='';provider.search('');rerender();return;
 }
 placeSerial++;placeLoading=false;placeState=null;view=placeBack;rerender();
}
function savePlace(){
 if(s.nav==='preview'){
  if(nav?.isFavorite?.())nav.removeFavorite?.();else nav?.saveFavorite?.();
  rerender();return;
 }
 if(!placeState)return;
 if(provider.savePlace){
  // Android: the native book accepts single validated operations only.
  void Promise.resolve(provider.savePlace({...placeState},isPlaceSaved())).then(rerender).catch(nativeFailure);
  return;
 }
 const clean=shared.destination(placeState);
 if(!clean)return;
 const book=data(),key=placeKey(clean);
 if(isPlaceSaved())write({favorites:book.favorites.filter(item=>placeKey(item)!==key)});
 else{
  const item={...clean,id:clean.id||'web-'+Date.now()};
  write({favorites:shared.distinct([item,...book.favorites],200)});
 }
}
async function routeResult(index){
 const success=await provider.choose('suggest',index);
 if(success===false)return;
 placeSerial++;placeState=null;view='search';s.keyboard=false;
 if(s.nav==='search'){s.nav='browse';rerender()}
 await provider.startRoute();
}
async function routePlace(){
 if(s.nav==='preview'){await window.startRoute?.();return}
 if(!placeState||!Number.isFinite(placeState.lat)||!Number.isFinite(placeState.lng))return;
 if(externalMapPlace){
  try{
   if(!provider.routeExternal)throw new Error('Kartenpunkt-Navigation ist nicht verfügbar.');
   await provider.routeExternal({...placeState});
  }catch(error){nativeFailure(error)}
  return;
 }
 await routeResult(placeIndex);
}

function submitSearch(){
 const q=String(s.query||'').trim();
 if(q.length<2)return;
 poi('text',q);
}
function book(){
 if(!provider.isReady()&&window.MeviAndroidSharedNav?.isOptedIn?.()){
  void window.MeviAndroidSharedNav.connect().then(book).catch(e=>window.MeviAndroidSharedNav.showError?.(e));
  return;
 }
 // Back returns to the entry view; only a book opened from search returns to search.
 bookOpenedFromSearch=s.nav==='search';
 if(!bookOpenedFromSearch){
  returnNav=provider.routeContext().nativeOwned?'browse':s.nav;
  s.query='';stopMode=false;stopError='';pendingSlot='';pendingFavorite=false;editor=null;
  provider.search('');
 }
 view='book';s.nav='search';s.keyboard=false;filter='';rerender();window.MeviAndroidSharedNav?.setOpen(true)
}
function bookBack(){
 if(!bookOpenedFromSearch){close();return}
 editor=null;view='search';s.query='';provider.search('');rerender();
}
function add(){pendingFavorite=true;view='search';s.query='';provider.search('');rerender();document.getElementById('searchInput')?.focus({preventScroll:true})}
function write(changes){provider.write(changes);rerender()}
async function remove(kind,i){
 const d=data(),arr=kind==='recent'?d.recent:kind==='favorites'?d.favorites:[];
 if(kind==='home'||kind==='work'){
  if(!window.confirm('Schnellziel entfernen?'))return;
  if(provider.removeEntry){try{await provider.removeEntry(kind,0);rerender()}catch(e){nativeFailure(e)}}
  else{d.slots[kind]=null;write({slots:d.slots})}
  return;
 }
 if(!arr[i]||!window.confirm('„'+arr[i].name+'“ entfernen?'))return;
 if(provider.removeEntry){try{await provider.removeEntry(kind,i);rerender()}catch(e){nativeFailure(e)}}
 else{arr.splice(i,1);write({[kind]:arr})}
}
async function clearHistory(){
 if(!window.confirm('Alle zuletzt gefahrenen Ziele entfernen?'))return;
 try{if(provider.clearHistory){await provider.clearHistory();rerender()}else write({recent:[]})}
 catch(e){nativeFailure(e)}
}
function exportBook(){
 if(provider.exportPicker){void provider.exportPicker().catch(nativeFailure);return}
 const payload=shared.exportAddressBook(data());
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='MeviCar-Adressbuch.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importBook(file){
 if(!file)return;
 try{
  if(file.size>1000000)throw Error('Datei ist zu groß.');
  const result=shared.importAddressBook(JSON.parse(await file.text()),data());
  write(result.changes);
  window.alert(result.added+' Ziele importiert'+(result.skipped?' · '+result.skipped+' ohne nutzbare Koordinaten übersprungen':'')+'.');
 }catch(e){window.alert('Adressbuch konnte nicht importiert werden: '+(e.message||e))}
}
function refreshBook(){const el=document.getElementById('mg-parity-book-body');if(el)el.innerHTML=bookBody()}
function filterBook(q){filter=q;refreshBook()}
function nativeFailure(e){window.MeviAndroidSharedNav?.showError?.(e);window.alert?.('Adressbuch: '+(e?.message||e))}
function nativeImport(){if(provider.importPicker)void provider.importPicker().catch(nativeFailure)}
window.openSearch=open;
function overlayHTML(){return view==='book'?bookHTML():view==='edit'?editHTML():view==='results'?poiHTML():view==='place'?placeHTML():searchHTML()}
window.searchOverlay=overlayHTML;
window.MeviWebNavParity={overlayHTML,selectedDestinationHTML:()=>s.nav==='preview'?placeHTML():'',open,openMapPlace,close,input,clear,tab:setTab,choose,slot,poi,poiAlongRoute,openStopSearch,addStopResult,addStopPlace,retryPoi,poiSort,poiOpenNow,backToSearch,showPlace,retryPlace,backFromPlace,savePlace,routeResult,routePlace,submitSearch,book,bookBack,add,remove,edit,editField,editIcon,editSlot,cancelEdit,saveEdit,removeEdited,move,clearHistory,exportBook,importBook,nativeImport,filter:filterBook,resultsHTML:()=>view==='results'?poiRows():view==='search'?searchRows():''};
window.render?.();
})();