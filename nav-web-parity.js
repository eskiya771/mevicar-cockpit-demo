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
// iPhone landscape uses a compact in-page keyboard without iOS predictive
// and input accessory bars; Android and desktop keep their system keyboard.
const ua=typeof navigator==='undefined'?'':String(navigator.userAgent||'');
const iosDevice=/iPhone|iPad|iPod/.test(ua)||
 (typeof navigator!=='undefined'&&navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const touchKeyboard=!native&&iosDevice&&!!window.matchMedia?.('(orientation: landscape)')?.matches;
let keyboardVisible=false,keyboardUpper=false,keyboardNumbers=false;
let externalMapPlace=false,bookOpenedFromSearch=false,geminiHandoff=false;
let quickBookBusy=false,quickSelecting=false;
let exactAddressHint='',exactAddressSerial=0,geminiCityTarget='';
let tab='favorites',view='search',pendingSlot='',pendingFavorite=false,gps=null,editor=null,editError='',poiState=null,placeState=null,placeIndex=-1,placeBack='search',placeSerial=0,placeLoading=false,placeError='',stopMode=false,returnNav='browse',stopError='';
const safe=shared.escapeHtml;
const trace=(stage,state,message)=>window.MeviNavDiagnostics?.record?.(stage,state,message);
function diagnosticsHTML(){
 const details=window.MeviNavDiagnostics?.text?.()||'Noch keine Diagnose.';
 return '<details class="mg-nav-diagnostics"><summary>Ablaufdiagnose</summary><pre>'+
  safe(details)+'</pre></details>';
}
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
 const p=poiState?.scope==='destination'&&view==='results'?
  provider.routeContext()?.destination:gps||data().origin;
 if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||!Number.isFinite(d.lat)||!Number.isFinite(d.lng))return '';
 const km=shared.distanceMeters(p,d)/1000;
 return (km<10?km.toLocaleString('de-DE',{maximumFractionDigits:1}):Math.round(km).toLocaleString('de-DE'))+' km';
}
function row(d,kind,i,editable){
 const glyph=kind==='recent'?'clock':shared.effectiveIcon(d,kind==='favorites'?'':kind);
 const detail=[d.address||'',d.note||''].filter(Boolean).join(' · ');
 const editControls=editable&&kind!=='recent'?
   (kind==='favorites'?'<button type="button" class="mg-parity-inline" '+(i===0?'disabled ':'')+'onclick="MeviWebNavParity.move('+i+',-1)" aria-label="Nach oben">'+ico('up')+'</button>'+
    '<button type="button" class="mg-parity-inline" '+(i>=data().favorites.length-1?'disabled ':'')+'onclick="MeviWebNavParity.move('+i+',1)" aria-label="Nach unten">'+ico('down')+'</button>':'')+
   '<button type="button" class="mg-parity-inline" onclick="MeviWebNavParity.edit(\''+kind+'\','+i+')" aria-label="'+safe(d.name)+' bearbeiten">'+ico('edit')+'</button>':'';
 const removeControl=editable?'<button type="button" class="mg-parity-inline" onclick="MeviWebNavParity.remove(\''+kind+'\','+i+')" aria-label="'+safe(d.name)+' entfernen">'+ico('remove')+'</button>':'';
 return '<div class="mg-parity-row"><button type="button" class="mg-parity-entry" onclick="MeviWebNavParity.choose(\''+kind+'\','+i+')" aria-label="'+safe(d.name)+' auswählen">'+
 '<span class="mg-parity-symbol">'+ico(glyph)+'</span><span class="mg-parity-description"><strong>'+safe(d.name)+'</strong>'+
 (detail?'<small>'+safe(detail)+'</small>':'')+'</span><span class="mg-parity-distance">'+safe(distance(d))+'</span></button>'+
 editControls+removeControl+'</div>';
}
function rows(kind){
 const d=data();
 if(kind==='recent'){
  // Saved favourites and quick destinations have precedence over history.
  // Keep the original history index for choosing and deleting a visible row.
  const saved=[d.slots.home,d.slots.work,...d.favorites].filter(Boolean);
  const visible=d.recent.map((item,index)=>({item,index}))
   .filter(({item})=>!saved.some(entry=>sameSearchDestination(entry,item)));
  return visible.length?visible.map(({item,index})=>row(item,'recent',index,true)).join(''):
   '<div class="mg-parity-empty">Keine weiteren Ziele im Verlauf.</div>';
 }
 // A home/work destination is already displayed in its fixed slot row.
 // Preserve the original favorite indices for selecting, editing and deleting.
 const items=kind==='favorites'?d.favorites.map((item,index)=>({item,index}))
  .filter(({item})=>![d.slots.home,d.slots.work].some(slot=>sameSearchDestination(slot,item))):
  d.slots[kind]?[{item:d.slots[kind],index:0}]:[];
 return items.length?items.map(({item,index})=>row(item,kind,index,true)).join(''):
  '<div class="mg-parity-empty">Noch keine Ziele gespeichert.</div>';
}
const categories=[['fuel','Tanken','Tankstelle'],['charge','Laden','Ladestation'],['parking','Parken','Parkplatz'],['food','Essen','Restaurant'],['cafe','Café','Café'],['cart','Einkaufen','Supermarkt'],['rest','Rastplatz','Rastplatz WC'],['wrench','Werkstatt','Autowerkstatt']];
function chips(){return '<div class="mg-parity-chips" aria-label="POI-Kategorien">'+categories.map(([icon,label,q])=>
 '<button type="button" onclick="MeviWebNavParity.poi(\''+icon+'\',\''+q+'\')">'+ico(icon)+'<span>'+label+'</span></button>').join('')+'</div>'}
function tabs(){
 return '<div class="mg-parity-tabs" role="group" aria-label="Gespeicherte Ziele und Verlauf">'+
  '<button type="button" class="'+(tab==='favorites'?'selected':'')+'" aria-pressed="'+(tab==='favorites')+'" onclick="MeviWebNavParity.tab(\'favorites\')">Gespeichert</button>'+
  '<button type="button" class="'+(tab==='recent'?'selected':'')+'" aria-pressed="'+(tab==='recent')+'" onclick="MeviWebNavParity.tab(\'recent\')">Zuletzt</button>'+'</div>';
}
// Keep only one result per physical target, even if a saved favourite and
// a recent destination carry different provider IDs. This affects only the
// displayed search results: the underlying favourite and history remain intact.
function normalizedDestinationText(value){
 return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('de-DE').replace(/ß/g,'ss')
  .replace(/\bstr\.(?=\s|$)/g,'strasse')
  .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function sameSearchDestination(a,b){
 if(!a||!b)return false;
 if(a.placeId&&b.placeId&&a.placeId===b.placeId)return true;
 const ka=shared.destinationKey(a),kb=shared.destinationKey(b);
 if(ka&&kb&&ka===kb)return true;
 const addressA=normalizedDestinationText(a.address);
 const addressB=normalizedDestinationText(b.address);
 if(addressA&&addressB&&addressA===addressB)return true;
 const nameA=normalizedDestinationText(a.name),nameB=normalizedDestinationText(b.name);
 // Different addresses with the same street/name must not be merged.
 if(!nameA||nameA!==nameB)return false;
 if(!Number.isFinite(a.lat)||!Number.isFinite(a.lng)||
    !Number.isFinite(b.lat)||!Number.isFinite(b.lng))return false;
 return shared.distanceMeters(a,b)<=15;
}
function localMatches(query){
 const q=query.toLocaleLowerCase('de-DE'),d=data(),matches=[],shown=[];
 const add=(item,kind,index)=>{
  if(!item||![item.name,item.address,item.note].filter(Boolean).join(' ').toLocaleLowerCase('de-DE').includes(q))return;
  if(shown.some(previous=>sameSearchDestination(previous,item)))return;
  shown.push(item);
  // Keep the source's real index. A filtered result must still select or edit
  // the correct favourite, quick slot or history record on Web AND Android.
  matches.push(row(item,kind,index,false));
 };
 // A saved slot or favourite wins over the same place in recent history.
 for(const kind of ['home','work'])add(d.slots[kind],kind,0);
 d.favorites.forEach((item,i)=>add(item,'favorites',i));
 d.recent.forEach((item,i)=>add(item,'recent',i));
 return matches.join('');
}
// Dashboard quick destinations are projections of the *same* provider used
// by the unified Zielsuche/Adressbuch, never a second favorite store.
function quickDestinations(){
 if(native&&!provider.isReady()){
  if(!quickBookBusy&&window.MeviAndroidSharedNav?.connect){
   quickBookBusy=true;
   Promise.resolve().then(()=>window.MeviAndroidSharedNav.connect()).then(()=>{
    window.MeviNavDashboard?.refreshQuick?.(document.getElementById?.('mg-nav-dashboard-split'));
   }).catch(()=>{}).finally(()=>{quickBookBusy=false});
  }
  return [];
 }
 let book;
 try{book=provider.read()}catch{return []}
 const entries=[],seen=[];
 const append=(item,kind,index)=>{
  if(!item||seen.some(other=>sameSearchDestination(other,item)))return;
  seen.push(item);
  const actual=shared.effectiveIcon(item,kind==='favorites'?'':kind);
  const point=book.origin;
  const km=shared.validCoordinates(point)&&shared.validCoordinates(item)?
   shared.distanceMeters(point,item)/1000:null;
  const distance=Number.isFinite(km)?
   (km<1?Math.round(km*1000)+' m':
    (km<10?km.toLocaleString('de-DE',{maximumFractionDigits:1}):
     Math.round(km).toLocaleString('de-DE'))+' km'):'';
  entries.push({kind,index,name:item.name|| (kind==='home'?'Zuhause':'Arbeit'),
   icon:actual,distance,address:item.address||''});
 };
 append(book.slots?.home,'home',0);
 append(book.slots?.work,'work',0);
 (book.favorites||[]).forEach((item,index)=>append(item,'favorites',index));
 return entries;
}
async function quickSelect(kind,index){
 // Dashboard only: no hijacking an already planned route.
 if(!['home','work','favorites'].includes(kind)||!Number.isInteger(index)||index<0||quickSelecting)return false;
 if(window.MeviGoogleNav?.guidanceDashboardData?.()?.routeActive===true)return false;
 quickSelecting=true;
 try{
  if(native&&!provider.isReady())await window.MeviAndroidSharedNav?.connect?.();
  const book=provider.read();
  const selected=kind==='favorites'?book.favorites[index]:book.slots[kind];
  if(!selected)return false;
  // The normal book selection owns native navigation and browser routing.
  // Switch from dashboard to the live map before calling it, with no search overlay.
  returnNav='browse';bookOpenedFromSearch=false;
  s.app='nav';s.mode='map';s.nav='browse';s.keyboard=false;
  window.render?.();
  await choose(kind,index);
  return true;
 }catch(e){nativeFailure(e);return false}
 finally{quickSelecting=false}
}
function searchRows(){
 const d=data(),q=(s.query||'').trim();
 // Only a single, exact city-name hit can be auto-selected. Never guess a
 // station, shopping centre or similarly named place from fuzzy suggestions.
 if(geminiCityTarget&&geminiHandoff&&!stopMode&&s.nav==='search'&&q===geminiCityTarget){
  const hits=Array.isArray(d.suggestions)?d.suggestions:[];
  // Never auto-route a named POI or a saved destination through a city
  // search. A city is only unambiguous if the Places address itself
  // identifies the same locality, rather than a business or street.
  const normalized=value=>String(value||'').trim().toLocaleLowerCase('de-DE');
  const exact=hits.map((hit,index)=>({hit,index})).filter(({hit})=>{
   if(normalized(hit.name)!==normalized(q))return false;
   const address=normalized(hit.address);
   // City/locality suggestions generally have an address starting with the
   // locality; named businesses usually have a street or venue in address.
   // The shared Places provider uses "Google Places" as a generic
   // address fallback. An exact single-name result is still selectable:
   // unlike "Nürnberg Hbf." or "NürnbergMesse", its displayed name is
   // exactly the requested city. Never accept a non-generic mismatched
   // address, and never guess when multiple exact matches exist.
   return !address||address==='google places'||
    address===normalized(q)||address.startsWith(normalized(q)+',');
  });
  if(exact.length===1){
   geminiCityTarget='';
   const index=exact[0].index;
   Promise.resolve().then(()=>{
    if(s.nav==='search'&&geminiHandoff&&!stopMode&&s.query===q)
     void routeResult(index);
   });
  }
 }

 // On iPhone the initial keyboard state is deliberately blank: no recent
 // destinations should appear behind the virtual keys until typing starts.
 if(touchKeyboard&&keyboardVisible&&!q)return '';
 if(q){
  const local=localMatches(q);
  const remote=q.length<2?'<div class="mg-parity-empty">Für Online-Ergebnisse mindestens zwei Zeichen eingeben.</div>':
   d.suggestions.length?d.suggestions.map((item,i)=>row({name:item.name,address:item.address||'Google Places'},'suggest',i,false)).join(''):
   '<div class="mg-parity-empty">'+safe(d.error||'Google Places sucht Adressen …')+'</div>';
  return (local?'<div class="mg-parity-section-title">Deine Ziele</div>'+local:'')+
   '<div class="mg-parity-section-title">Adressen und Orte</div>'+remote;
 }
 if(tab==='recent')return rows('recent');
 return '<div class="mg-parity-slot-rows">'+(['home','work'].map(k=>d.slots[k]?
  row(d.slots[k],k,0,true):
  '<button type="button" class="mg-parity-empty-slot'+(pendingSlot===k?' is-assigning':'')+'" aria-pressed="'+(pendingSlot===k)+'" onclick="MeviWebNavParity.slot(\''+k+'\')">'+ico(k)+' '+(pendingSlot===k?(k==='home'?'Zuhause auswählen':'Arbeit auswählen'):(k==='home'?'Zuhause':'Arbeit')+' festlegen')+'</button>').join(''))+'</div>'+
    rows('favorites');
}
function manageActions(){
 return '<div class="mg-parity-manage-actions" role="group" aria-label="Ziele verwalten">'+
  '<button type="button" onclick="MeviWebNavParity.exportBook()">Exportieren</button>'+
  (provider.importPicker?'<button type="button" onclick="MeviWebNavParity.nativeImport()">Importieren</button>':
   '<button type="button" onclick="document.getElementById(\'mg-parity-import\').click()">Importieren</button>'+
   '<input id="mg-parity-import" type="file" accept=".json,application/json" hidden onchange="MeviWebNavParity.importBook(this.files[0])">')+
  '<button type="button" onclick="MeviWebNavParity.clearHistory()">Verlauf löschen</button></div>';
}
function touchKeyboardHTML(){
 if(!touchKeyboard)return '';
 const letters=keyboardUpper?['QWERTZUIOPÜ','ASDFGHJKLÖÄ']:['qwertzuiopü','asdfghjklöä'];
 const rows=keyboardNumbers?
  [['1','2','3','4','5','6','7','8','9','0'],
   ['-','/',':',';','(',')','€','&','@'],
   ['abc','.',',','?','!','apostrophe','backspace']]:
  [Array.from(letters[0]),Array.from(letters[1]),
   ['shift',...Array.from(keyboardUpper?'YXCVBNM':'yxcvbnm'),'backspace']];
 rows.push([keyboardNumbers?'abc':'numbers','space','done','search']);
 const labels={shift:'⇧',backspace:'⌫',numbers:'123',abc:'ABC',space:'Leerzeichen',
  done:'Fertig',search:'Suchen',apostrophe:"'"};
 const keyHTML=key=>{
  const label=labels[key]||key;
  const kind=['shift','backspace','numbers','abc','done','search','space'].includes(key)?key:'letter';
  return '<button type="button" data-key="'+safe(key)+'" class="mg-touch-key mg-touch-key-'+kind+
   '" aria-label="'+safe(label)+'" onmousedown="event.preventDefault()" onclick="MeviWebNavParity.typeKey(this.dataset.key)">'+
   safe(label)+'</button>';
 };
 return '<div class="mg-parity-touch-keyboard" id="mg-parity-touch-keyboard"'+
  (keyboardVisible?'':' hidden')+' role="group" aria-label="Tastatur ohne Wortvorschläge">'+
  rows.map(row=>'<div class="mg-touch-key-row">'+row.map(keyHTML).join('')+'</div>').join('')+'</div>';
}
function refreshSearchRows(){
 const results=document.getElementById?.('suggestions');
 if(results&&view==='search')results.innerHTML=searchRows();
}
function focusSearch(){
 if(!touchKeyboard||view!=='search')return;
 keyboardVisible=true;
 document.querySelector?.('.mg-parity-shade')?.classList?.add('mg-parity-keyboard-open');
 const keyboard=document.getElementById?.('mg-parity-touch-keyboard');
 if(keyboard)keyboard.hidden=false;
 refreshSearchRows();
}
function hideSearchKeyboard(){
 if(!touchKeyboard||!keyboardVisible)return;
 keyboardVisible=false;
 document.querySelector?.('.mg-parity-shade')?.classList?.remove('mg-parity-keyboard-open');
 const keyboard=document.getElementById?.('mg-parity-touch-keyboard');
 if(keyboard)keyboard.hidden=true;
 document.getElementById?.('searchInput')?.blur?.();
 // Closing an unused keyboard restores the normal search start page with
 // quick destinations, recent history and stored targets. Keep the input DOM.
 refreshSearchRows();
}
function blankResultsTapped(){
 if(touchKeyboard&&keyboardVisible&&!(s.query||'').trim())hideSearchKeyboard();
}
function resultsScrolled(){
 if(touchKeyboard&&keyboardVisible)hideSearchKeyboard();
}
function updateKeyboard(){
 const element=document.getElementById?.('mg-parity-touch-keyboard');
 if(element)element.outerHTML=touchKeyboardHTML();
}
function typeKey(key){
 if(!touchKeyboard)return;
 if(key==='done'){hideSearchKeyboard();return}
 if(key==='search'){hideSearchKeyboard();submitSearch();return}
 if(key==='shift'){keyboardUpper=!keyboardUpper;updateKeyboard();return}
 if(key==='numbers'||key==='abc'){keyboardNumbers=key==='numbers';keyboardUpper=false;updateKeyboard();return}
 const field=document.getElementById?.('searchInput');
 const value=field?.value??s.query??'';
 const start=Number.isInteger(field?.selectionStart)?field.selectionStart:value.length;
 const end=Number.isInteger(field?.selectionEnd)?field.selectionEnd:start;
 const insert=key==='space'?' ':key==='apostrophe'?"'":key;
 let next,pos;
 if(key==='backspace'){
  if(end>start){next=value.slice(0,start)+value.slice(end);pos=start}
  else{
   const before=Array.from(value.slice(0,start)).slice(0,-1).join('');
   next=before+value.slice(end);pos=before.length;
  }
 }else{
  next=(value.slice(0,start)+insert+value.slice(end)).slice(0,200);
  pos=Math.min(200,start+insert.length);
  if(keyboardUpper){keyboardUpper=false;updateKeyboard()}
 }
 if(field){field.value=next;field.focus?.({preventScroll:true});field.setSelectionRange?.(pos,pos)}
 input(next);
}
function fitVisualViewport(){
 // A reduced visualViewport can linger after iOS rotation, Safari browser
 // chrome changes or closing the keyboard. Only resize for a *real, focused*
 // system keyboard; otherwise the destination sheet must fill the screen.
 const shade=document.querySelector?.('.mg-parity-shade:not(.mg-parity-selected)');
 if(!shade)return;
 const vv=window.visualViewport;
 const active=document.activeElement;
 const inputFocused=!!active?.matches?.('.mg-parity-field input, .mg-parity-edit-scroll input');
 const keyboardOpen=!touchKeyboard&&!!vv&&inputFocused&&
   vv.height<window.innerHeight-Math.max(100,window.innerHeight*.2);
 if(!keyboardOpen){
   shade.style.top='';
   shade.style.bottom='';
   shade.style.height='';
   return;
 }
 shade.style.top=Math.max(0,Math.round(vv.offsetTop||0))+'px';
 shade.style.bottom='auto';
 shade.style.height=Math.max(180,Math.round(vv.height))+'px';
}
window.visualViewport?.addEventListener?.('resize',fitVisualViewport);
window.visualViewport?.addEventListener?.('scroll',fitVisualViewport);
function searchHTML(){
 const slotName=pendingSlot==='work'?'Arbeit':pendingSlot==='home'?'Zuhause':'';
 const purpose=slotName?'<label for="searchInput"><strong>'+slotName+'</strong></label>':'';
 return '<div class="mg-parity-shade'+(pendingSlot?' mg-parity-assigning-slot':'')+(keyboardVisible?' mg-parity-keyboard-open':'')+
  ((s.query||'').trim()?' mg-parity-querying':'')+'" role="dialog" aria-modal="true" aria-label="Zielsuche und Adressbuch"><div class="mg-parity-layout">'+
  '<div class="mg-parity-top"><button type="button" class="mg-parity-back" onclick="MeviWebNavParity.back()" aria-label="Zurück">'+ico('back')+'</button>'+
  '<div class="mg-parity-field'+(pendingSlot?' is-assigning':'')+'">'+ico(pendingSlot||'search')+purpose+'<input id="searchInput" type="text" placeholder="'+(slotName?'Adresse festlegen':'Adresse, Ort, Favorit oder POI')+'" aria-label="'+(slotName?'Adresse für '+slotName+' festlegen':'Adresse, Ort oder POI')+'" inputmode="'+(touchKeyboard?'none':'search')+'" enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" maxlength="200" onfocus="MeviWebNavParity.focusSearch()" onkeydown="if(event.key===\'Enter\'){event.preventDefault();MeviWebNavParity.submitSearch()}event.stopPropagation()" oninput="MeviWebNavParity.input(this.value)" value="'+safe(s.query)+'">'+
  '<button type="button" class="mg-parity-clear" '+(s.query?'':'hidden ')+'onclick="MeviWebNavParity.clear()" aria-label="Suche löschen">×</button></div>'+
  '<button type="button" class="mg-gemini-launch" onclick="MeviGeminiVoice.start()" aria-label="Gemini Sprach-Zielsuche öffnen" title="Gemini Sprachsuche">✦</button></div>'+
  '<div id="mg-parity-controls" '+(s.query?'hidden':'')+'>'+chips()+'</div>'+
  '<div class="mg-parity-toolbar" role="group" aria-label="Ziele und Verwaltung">'+tabs()+manageActions()+'</div>'+
  (stopError?'<p class="mg-poi-warning" role="alert">'+safe(stopError)+'</p>':'')+
  (exactAddressHint?'<p class="mg-poi-warning" role="status">'+safe(exactAddressHint)+'</p>':'')+
  '<div class="mg-parity-results" id="suggestions" aria-live="polite" onclick="MeviWebNavParity.blankResultsTapped()" onscroll="MeviWebNavParity.resultsScrolled()">'+searchRows()+'</div>'+touchKeyboardHTML()+'</div></div>';
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
// Pure POI projection: preserves provider indices for buttons, voice selection and
// detour results. No DOM, provider calls or mutable UI state inside this function.
function selectPoiResults(results,{fuelSearch=false,sort='distance',ranking=null}={}){
 const seenIds=new Set(),seenLocations=new Set();
 const visible=(Array.isArray(results)?results:[]).map((item,index)=>({item,index}))
  .filter(({item})=>!fuelSearch||
   !((item.types||[]).includes('electric_vehicle_charging_station')||
    /\b(ladestation|ladepark|charging|charger)\b/i.test(item.name||''))||
    (item.types||[]).includes('gas_station'))
  .filter(({item})=>{
   const id=String(item.placeId||'').trim();
   const lat=Number(item.lat),lng=Number(item.lng);
   const coords=Number.isFinite(lat)&&Number.isFinite(lng)?
    lat.toFixed(5)+','+lng.toFixed(5):'';
   const address=String(item.address||'').trim().toLocaleLowerCase('de-DE');
   const brand=String(item.name||'').toLocaleLowerCase('de-DE')
    .replace(/\b(tankstelle|autohof|station)\b/g,'').trim();
   const location=fuelSearch&&address&&address!=='google places'?
    'fuel:'+brand+'|'+address:coords?'geo:'+coords:'';
   const fallback='name:'+brand+'|'+address;
   if((id&&seenIds.has(id))||(location&&seenLocations.has(location))||
      (!id&&!location&&seenLocations.has(fallback)))return false;
   if(id)seenIds.add(id);
   if(location)seenLocations.add(location);
   else seenLocations.add(fallback);
   return true;
  });
 if(sort!=='detour')return visible;
 // Freeze row numbering until the entire asynchronous batch completes.
 return visible.slice().sort((a,b)=>{
  const x=ranking?.[a.index],y=ranking?.[b.index];
  const dx=x&&!x.error&&Number.isFinite(x.minutes)?x.minutes:Infinity;
  const dy=y&&!y.error&&Number.isFinite(y.minutes)?y.minutes:Infinity;
  return dx-dy||a.index-b.index;
 });
}
// One ordering source for rendered POIs, route actions and Gemini voice.
function orderedPoiResults(results){
 return selectPoiResults(results,{
  fuelSearch:stopMode&&['fuel','gas_station'].includes(poiState?.type),
  sort:poiState?.sort,
  ranking:poiDetourState?.ranking||poiDetourState?.values
 });
}
// Explicit opt-in: compare at most three visible stops, sequentially to
// bound Routes API usage. Never calculate for hidden or filtered POIs.
let poiDetourRun=0,poiDetourState=null;
function clearPoiDetours(){poiDetourRun++;poiDetourState=null}
function rerenderPoiWithScroll(){
 const selectors=['#suggestions','.mg-parity-layout'];
 const positions=selectors.map(selector=>{
  const node=document.querySelector(selector);
  return node?{selector,top:node.scrollTop,left:node.scrollLeft}:null;
 }).filter(Boolean);
 rerender();
 for(const {selector,top,left} of positions){
  const node=document.querySelector(selector);
  if(node){node.scrollTop=top;node.scrollLeft=left}
 }
}
function poiResultFingerprint(results){
 return (Array.isArray(results)?results:[]).map(item=>
  [item.placeId||'',item.lat??'',item.lng??'',item.name||'',item.address||''].join('|')
 ).join('\\n');
}
function poiRouteFingerprint(){
 const context=provider.routeContext();
 if(!context?.hasRoute)return '';
 const point=p=>p?[
  p.placeId||'',p.lat??'',p.lng??'',p.address||'',p.name||''
 ].join('|'):'';
 return JSON.stringify([
  point(context.origin),point(context.destination),
  (context.stops||[]).map(point),
  context.routeId||context.route?.id||'',
  context.route?.polyline||context.polyline||'',
  context.revision??''
 ]);
}
function poiComparisonIsStale(resultFingerprint,routeFingerprint){
 return poiResultFingerprint(data().poiResults)!==resultFingerprint||
  poiRouteFingerprint()!==routeFingerprint;
}
// One guard for both request start and completion, including rejected requests.
function currentPoiDetourRun(run,resultFingerprint,routeFingerprint){
 if(run!==poiDetourRun||view!=='results')return false;
 if(!poiComparisonIsStale(resultFingerprint,routeFingerprint))return true;
 clearPoiDetours();
 rerenderPoiWithScroll();
 return false;
}
async function comparePoiDetours(retryIndices=null){
 if(native||!stopMode||view!=='results'||!poiState||
    !window.MeviGoogleNav?.previewStopDetour||poiDetourState?.busy)return;
 const visible=orderedPoiResults(data().poiResults);
 if(!visible.length)return;
 const retrySet=Array.isArray(retryIndices)?new Set(retryIndices.map(Number)):null;
 const next=visible.filter(({index})=>retrySet?retrySet.has(index):!poiDetourState?.values?.[index]).slice(0,3);
 if(!next.length)return;
 const run=++poiDetourRun;
 const resultFingerprint=poiResultFingerprint(data().poiResults);
 const routeFingerprint=poiRouteFingerprint();
 if(!routeFingerprint)return;
 if(!poiDetourState)poiDetourState={busy:false,values:{}};
 poiDetourState.progress={done:0,total:next.length};
 poiDetourState.ranking={...poiDetourState.values};
 poiDetourState.busy=true;
 rerenderPoiWithScroll();
 for(const {item,index} of next){
  // Never issue another paid request for a changed route or Places list.
  if(!currentPoiDetourRun(run,resultFingerprint,routeFingerprint))return;
  let result;
  try{result=await window.MeviGoogleNav.previewStopDetour(item)}
  catch{result=null}
  if(!currentPoiDetourRun(run,resultFingerprint,routeFingerprint))return;
  poiDetourState.values[index]=result||{error:true};
  poiDetourState.progress.done++;
  rerenderPoiWithScroll();
 }
 if(run===poiDetourRun){
  poiDetourState.busy=false;
  poiDetourState.progress=null;
  // The frozen ranking is needed only while the batch is running.
  poiDetourState.ranking=null;
  rerenderPoiWithScroll();
 }
}
// Failed Google Routes lookups are retried only on an explicit tap.
function retryPoiDetours(){
 if(poiDetourState?.busy||!poiDetourState?.values)return;
 // Retry in the same order the user currently sees, not stale provider keys.
 const failures=orderedPoiResults(data().poiResults)
  .filter(({index})=>poiDetourState.values[index]?.error)
  .slice(0,3).map(({index})=>index);
 if(!failures.length)return;
 void comparePoiDetours(failures);
}
function poiRows(d=data(),visible=orderedPoiResults(d.poiResults)){
 // The full POI sheet passes its ordered list so filtering happens once.
 if(d.poiLoading)return '<p class="mg-parity-empty" role="status">Google Places sucht Orte …</p>';
 if(d.poiError)return '<div class="mg-parity-empty" role="status">'+safe(d.poiError)+
  '<small>Fehlerphase: Google Places. Die bisherige Route bleibt erhalten.</small>'+
  '<button type="button" class="mg-poi-retry" onclick="MeviWebNavParity.retryPoi()">Erneut versuchen</button></div>';
 if(!d.poiResults.length)return '<div class="mg-parity-empty">Keine passenden Orte gefunden.</div>';
 if(!visible.length)return '<div class="mg-parity-empty">Keine passenden Orte gefunden.</div>';
 return visible.map(({item,index:i},position)=>{
  const directDistance=distance(item);
  const detour=poiDetourState?.values?.[i];
  const extra=detour?(detour.error?'Umweg nicht verfügbar':
   'Umweg +'+window.MeviNavRouteDetails.distance(detour.meters,'compact')+
   ' · +'+window.MeviNavRouteDetails.duration(detour.minutes*60)):'';
  const detail=[placeKind(item.types),extra|| (directDistance?'Luftlinie '+directDistance:''),item.address].filter(Boolean).join(' · ');
  return '<div class="mg-poi-hit"><button class="mg-poi-hit-main" type="button" onclick="MeviWebNavParity.showPlace('+i+')" aria-label="'+safe(item.name)+' Details öffnen">'+
   '<span class="mg-poi-number">'+(position+1)+'</span><span class="mg-poi-desc"><strong>'+safe(item.name)+'</strong>'+
   '<small>'+safe(detail)+'</small></span></button>'+
   '<button type="button" class="mg-poi-route" onclick="'+(stopMode?'MeviWebNavParity.addStopResult(':'MeviWebNavParity.routeResult(')+i+')" aria-label="'+(stopMode?'Als Zwischenstopp hinzufügen: ':'Route zu ')+safe(item.name)+'">'+(stopMode?ico('plus'):ico('pin'))+'</button></div>';
 }).join('');
}
function poiHTML(){
 const d=data(),sort=poiState?.sort||'distance',openNow=!!poiState?.openNow;
 const route=provider.routeContext();
 // One filtered and sorted view feeds both the visible POI rows and counters.
 const visible=orderedPoiResults(d.poiResults);
 const remaining=visible.filter(({index})=>!poiDetourState?.values?.[index]).length;
 const failed=visible.filter(({index})=>poiDetourState?.values?.[index]?.error).length;
 return '<div class="mg-parity-shade" role="dialog" aria-modal="true" aria-label="POI-Suchergebnisse">'+
 '<div class="mg-parity-layout"><div class="mg-parity-top">'+
 '<button type="button" class="mg-parity-back" onclick="MeviWebNavParity.backToSearch()" aria-label="Zurück zur Suche">'+ico('back')+'</button>'+
 '<strong class="mg-poi-title">'+safe((poiState?.query||'Orte')+(poiState?.scope==='destination'?' · am Ziel':poiState?.near?' · '+poiState.near:''))+'</strong><span class="mg-poi-google">Google Maps</span></div>'+
 '<div class="mg-poi-chips" aria-label="Treffer sortieren und filtern">'+
 '<button type="button" class="'+(sort==='distance'?'selected':'')+'" aria-pressed="'+(sort==='distance')+'" onclick="MeviWebNavParity.poiSort(\'distance\')">Entfernung</button>'+
 '<button type="button" class="'+(sort==='relevance'?'selected':'')+'" aria-pressed="'+(sort==='relevance')+'" onclick="MeviWebNavParity.poiSort(\'relevance\')">Relevanz</button>'+
 (stopMode&&route.hasRoute&&poiDetourState?.values&&
 Object.values(poiDetourState.values).some(v=>v&&!v.error)?
 '<button type="button" class="'+(sort==='detour'?'selected':'')+'" aria-pressed="'+(sort==='detour')+'" onclick="MeviWebNavParity.poiSort(\'detour\')">Kleinster Umweg</button>':'')+
 '<button type="button" class="'+(openNow?'selected':'')+'" aria-pressed="'+openNow+'" onclick="MeviWebNavParity.poiOpenNow()">Jetzt geöffnet</button>'+
 (route.hasRoute&&poiState?.scope==='route'?'<button type="button" class="'+(poiState?.alongRoute?'selected':'')+'" aria-pressed="'+!!poiState?.alongRoute+'" onclick="MeviWebNavParity.poiAlongRoute()">In Routennähe</button>':'')+'</div>'+
 (stopMode&&route.hasRoute&&!native&&poiState?.scope==='route'?
  '<div class="mg-poi-hint"><button type="button" onclick="MeviWebNavParity.comparePoiDetours()" '+(poiDetourState?.busy||!remaining?'disabled':'')+'>'+
  (poiDetourState?.busy?'Berechne Umwege '+(poiDetourState.progress?.done||0)+'/'+(poiDetourState.progress?.total||3)+' …':remaining?'Umwege für nächste '+Math.min(3,remaining)+' Treffer berechnen':'Alle sichtbaren Treffer verglichen')+
  '</button> · maximal 3 Vergleiche, je 2 Google-Routenanfragen</div>':'')+
 (stopMode&&route.hasRoute&&!native&&failed?
  '<div class="mg-poi-hint">'+failed+' Umwegvergleich(e) fehlgeschlagen · <button type="button" onclick="MeviWebNavParity.retryPoiDetours()" '+(poiDetourState?.busy?'disabled':'')+'>'+(poiDetourState?.busy?'Umwegvergleich läuft '+(poiDetourState.progress?.done||0)+'/'+(poiDetourState.progress?.total||3):'Nächste '+Math.min(3,failed)+' fehlgeschlagene erneut prüfen')+'</button></div>':'')+
 (poiState?.scope==='destination'?'<div class="mg-poi-hint">'+safe(poiState.query||'Orte')+' im Umkreis von 8 km um das gewählte Ziel · du kannst einen Treffer als neues Endziel auswählen</div>':
  poiState?.scope==='area'?'<div class="mg-poi-hint">Google-Places-Suche im Gebiet '+safe(poiState.near||'')+' · bitte einen passenden Ort auswählen</div>':poiState?.alongRoute?'<div class="mg-poi-hint">'+(poiState.near?'Suche bei '+safe(poiState.near)+' entlang der Route':'Suche an mehreren Punkten der Route')+' · Entfernungen sind Luftlinie, keine Umwegzeiten</div>':'')+
 (stopError?'<p class="mg-poi-warning" role="alert">'+safe(stopError)+'</p>':'')+
 diagnosticsHTML()+
 '<div id="suggestions" class="mg-parity-results mg-poi-results" aria-live="polite">'+poiRows(d,visible)+'</div></div></div>';
}
function placeKey(p){return shared.destinationKey(p)}
function isPlaceSaved(){
 const key=placeKey(placeState);
 return !!key&&data().favorites.some(item=>placeKey(item)===key);
}
// One state represents idle, loading, success or failure for place-level detour preview.
let detourPreview=null;
async function checkStopDetour(){
 if(detourPreview?.loading||!placeState||!window.MeviGoogleNav?.previewStopDetour)return;
 const serial=placeSerial,place={...placeState};detourPreview={loading:true};rerender();
 try{
  const result=await window.MeviGoogleNav.previewStopDetour(place);
  if(serial===placeSerial&&view==='place')detourPreview=result||{error:'Keine Umwegdaten verfügbar.'};
 }catch(e){
  if(serial===placeSerial&&view==='place')detourPreview={error:'Umweg konnte nicht berechnet werden.'};
 }finally{if(serial===placeSerial&&view==='place')rerender()}
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
 (route.hasRoute&&point&&stopMode&&!selectedMode?
  '<p class="mg-poi-muted">'+(detourPreview?.loading?'Umweg wird berechnet …':detourPreview?
   detourPreview.error?safe(detourPreview.error):
   'Zusätzlicher Umweg: +'+(detourPreview.meters/1000).toLocaleString('de-DE',{maximumFractionDigits:1})+
   ' km · +'+window.MeviNavRouteDetails.duration(detourPreview.minutes*60):
   '<button type="button" onclick="MeviWebNavParity.checkStopDetour()">Umweg berechnen</button>')+'</p>':'')+
 (opening?'<p class="mg-poi-opening">'+safe(opening)+'</p>':'')+
 (rating?'<p>'+ico('star')+' '+safe(rating)+'</p>':'')+
 (phone?'<p>'+ico('pin')+' <a href="tel:'+safe(phone.replace(/[^0-9+]/g,''))+'">'+safe(phone)+'</a></p>':'')+
 (hours.length?'<details class="mg-poi-hours"><summary>Öffnungszeiten</summary>'+hours.map(h=>'<div>'+safe(h)+'</div>').join('')+'</details>':'')+
 (!selectedMode&&placeLoading?'<p class="mg-poi-muted">Google-Ortsdaten werden geladen …</p>':'')+
 (!selectedMode&&stopError?'<p class="mg-poi-warning" role="alert">'+safe(stopError)+'</p>':'')+
 (!selectedMode&&(placeError||p.detailError)?'<p class="mg-poi-warning">'+safe(placeError||p.detailError)+
  ' <button type="button" onclick="MeviWebNavParity.retryPlace()">Erneut versuchen</button></p>':'')+
 '</div><div class="mg-poi-detail-actions">'+
 (route.hasRoute&&point&&poiState?.scope!=='destination'&&route.stops.length<route.maxStops?'<button type="button" class="mg-poi-action-stop" onclick="MeviWebNavParity.addStopPlace()">＋ Als Stopp hinzufügen</button>':'')+
 (point?'<button type="button" class="mg-poi-action-route" onclick="MeviWebNavParity.routePlace()">'+
 (route.active?'Neue Route':'Route')+'</button>':'')+
 (!geminiHandoff&&(point||p.placeId)?'<button type="button" onclick="MeviWebNavParity.savePlace()">'+(saved?'Gespeichert ✓':'Speichern')+'</button>':'')+
 '</div></div></div>';
}
function editHTML(){
 if(!editor)return searchHTML();
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
function cancelEdit(){editor=null;editError='';view='search';rerender()}
async function saveEdit(){
 if(!editor)return;
 try{
  const book=data(),current=editor;
  const changes=shared.editSaved(book,current.kind,current.index,current);
  const occupied=current.slot&&book.slots[current.slot]&&current.slot!==current.kind;
  if(occupied&&!window.confirm((current.slot==='home'?'Zuhause':'Arbeit')+' ist bereits „'+book.slots[current.slot].name+'“. Dieses Schnellziel ersetzen?'))return;
  if(provider.editSaved)await provider.editSaved(current.kind,current.index,current);
  else write(changes);
  editor=null;editError='';view='search';rerender();
 }catch(e){editError=String(e.message||e);rerender()}
}
function removeEdited(){
 if(!editor)return;
 const {kind,index}=editor;
 editor=null;editError='';view='search';remove(kind,index);
}
async function move(index,delta){
 try{
  if(provider.moveFavorite){await provider.moveFavorite(index,delta);rerender()}
  else write(shared.moveFavorite(data(),index,delta));
 }catch(e){nativeFailure(e)}
}
function rerender(){window.render?.()}
function open(options={}){
 clearPoiDetours();
 exactAddressSerial++;exactAddressHint='';
 if(!provider.isReady()){
  if(window.MeviAndroidSharedNav?.isOptedIn?.()){
   void window.MeviAndroidSharedNav.connect().then(()=>open(options)).catch(e=>window.MeviAndroidSharedNav.showError?.(e));
  }else window.openCredentialSettings?.();
  return;
 }
 const context=provider.routeContext();
 geminiHandoff=options?.gemini===true;geminiCityTarget='';
 bookOpenedFromSearch=false;keyboardVisible=false;keyboardUpper=false;keyboardNumbers=false;
 returnNav=context.nativeOwned?'browse':s.nav==='preview'?'preview':context.active?'driving':context.hasRoute?'ready':'browse';stopMode=false;stopError='';
 externalMapPlace=false;view='search';tab='favorites';editor=null;poiState=null;placeState=null;placeSerial++;s.app='nav';s.mode='map';s.nav='search';s.keyboard=false;s.query='';
 provider.search('');rerender();fitVisualViewport();window.MeviAndroidSharedNav?.setOpen(true);
 if(navigator.geolocation&&!gps){navigator.geolocation.getCurrentPosition(p=>{gps={lat:p.coords.latitude,lng:p.coords.longitude};const el=document.getElementById('suggestions');if(el&&view==='search'&&!s.query)el.innerHTML=searchRows()},()=>{},{enableHighAccuracy:false,maximumAge:60000,timeout:4000})}
}
/* Search header Back is hierarchical. Close the custom keyboard first,
   then return from a filtered suggestion list to the normal search start.
   Only Back on the unfiltered search start page leaves navigation search. */
function back(){
 if(view==='search'){
  if(touchKeyboard&&keyboardVisible){
   hideSearchKeyboard();
   return;
  }
  if((s.query||'').trim()){
   s.query='';
   provider.search('');
   rerender();
   return;
  }
 }
 close();
}
function close(){
 clearPoiDetours();
 exactAddressSerial++;exactAddressHint='';geminiHandoff=false;geminiCityTarget='';
 bookOpenedFromSearch=false;keyboardVisible=false;externalMapPlace=false;pendingSlot='';pendingFavorite=false;editor=null;poiState=null;placeState=null;placeSerial++;stopMode=false;stopError='';view='search';s.nav=returnNav;s.keyboard=false;
 window.meviNavSearchClosed?.();
 rerender();window.MeviAndroidSharedNav?.setOpen(false);provider.cancel?.();
}
function input(value){
 exactAddressSerial++;exactAddressHint='';geminiCityTarget='';
 s.query=String(value||'');provider.search(s.query);
 document.querySelector?.('.mg-parity-shade')?.classList?.toggle('mg-parity-querying',!!s.query.trim());
 const controls=document.getElementById('mg-parity-controls');if(controls)controls.hidden=!!s.query.trim();
 const clear=document.querySelector('.mg-parity-clear');
 if(clear)clear.hidden=!s.query;
 // Local saved/recent results must update immediately, even below Places'
 // two-character threshold. Keep the input DOM intact so the caret stays put.
 const results=document.getElementById('suggestions');
 if(results&&view==='search')results.innerHTML=searchRows();
}
/* Match spoken destination names against the existing address book first.
 * Only one exact name across distinct saved destinations may auto-route.
 * Ambiguous matches fall through to the normal selectable search list. */
function routeSavedDestination(value){
 const name=String(value||'').trim().toLocaleLowerCase('de-DE');
 if(!name)return false;
 let book;
 try{book=data()}catch{return false}
 const candidates=[];
 const add=(item,kind,index)=>{
  if(item&&String(item.name||'').trim().toLocaleLowerCase('de-DE')===name)
   candidates.push({item,kind,index});
 };
 for(const kind of ['home','work'])add(book.slots?.[kind],kind,0);
 (book.favorites||[]).forEach((item,index)=>add(item,'favorites',index));
 (book.recent||[]).forEach((item,index)=>add(item,'recent',index));
 const unique=[];
 for(const entry of candidates){
  if(!unique.some(other=>sameSearchDestination(other.item,entry.item)))unique.push(entry);
 }
 if(unique.length!==1)return false;
 const selected=unique[0];
 // Reuse the ordinary saved-address selection and route calculation.
 // Avoid rendering the search overlay for an exact saved name.
 s.app='nav';s.mode='map';s.nav='browse';s.keyboard=false;
 rerender();
 void choose(selected.kind,selected.index);
 return true;
}
/* Gemini city-only requests may skip the suggestions list only if Google
 * returns exactly one suggestion whose name equals the requested city.
 * Other requests keep the regular, user-selectable Places results. */
function routeExactCity(value,options={}){
 const phrase=String(value||'').trim().slice(0,100);
 if(native||!(/^[\p{L}][\p{L} .'-]{1,80}$/u.test(phrase))||phrase.split(/\\s+/).length>3)return false;
 open({gemini:options?.gemini===true});
 input(phrase);
 geminiCityTarget=phrase;
 const field=document.getElementById?.('searchInput');
 if(field)field.value=phrase;
 // Re-evaluate results already available synchronously; subsequent provider
 // renders will re-evaluate when asynchronous Google suggestions arrive.
 searchRows();
 return true;
}
/* Voice confirmation for a precise house-number address. Reuse the
 * same Google Places Autocomplete provider as manual destination selection.
 * Unambiguous street-number matches route directly; otherwise show the list. */
async function routeExactAddress(value,options={}){
 if(native||typeof nav?.exactAddressParts!=='function'||!nav.exactAddressParts(value)||
   typeof nav?.resolveExactAddress!=='function'||typeof nav?.selectVerifiedAddress!=='function')
  return false;
 const phrase=String(value||'').trim().slice(0,200);
 open({gemini:options?.gemini===true});input(phrase);
 const field=document.getElementById?.('searchInput');
 if(field)field.value=phrase;
 exactAddressHint='Prüfe die vollständige Adresse bei Google Maps …';
 rerender();
 const attempt=exactAddressSerial;
 try{
  const resolved=await nav.resolveExactAddress(phrase);
  if(attempt!==exactAddressSerial||s.nav!=='search'||s.query!==phrase)return false;
  if(resolved&&nav.selectVerifiedAddress(resolved)){
   exactAddressSerial++;exactAddressHint='';
   s.nav='browse';s.keyboard=false;s.mode='map';s.app='nav';rerender();
   const routed=await provider.startRoute();
   if(routed===false){s.nav='preview';rerender()}
   else window.MeviGeminiVoice?.onRouteReady?.(provider.routeContext());
   return true;
  }
  exactAddressHint='Adresse nicht eindeutig bestätigt. Bitte den passenden Google-Treffer auswählen.';
 }catch(error){
  if(attempt!==exactAddressSerial||s.nav!=='search'||s.query!==phrase)return false;
  exactAddressHint='Automatische Adressprüfung nicht möglich. Bitte einen Treffer auswählen.';
 }
 if(attempt===exactAddressSerial&&s.nav==='search')rerender();
 return false;
}
function clear(){
 s.query='';provider.search('');rerender();
 document.getElementById?.('searchInput')?.focus?.({preventScroll:true});
}
function setTab(value){tab=value==='favorites'?'favorites':'recent';rerender()}
async function choose(kind,index){
 try{
  const savingSlot=pendingSlot,savingFavorite=pendingFavorite;
  const saveOnly=!!(savingSlot||savingFavorite);
  if(kind==='suggest'&&!saveOnly){
   // The Gemini handoff already chose destination vs intermediate stop.
   // Skip the unnecessary Route / Stop / Save choice for a primary target.
   if(geminiHandoff&&!stopMode){await routeResult(index);return}
   await showPlace(index);return;
  }
  // Stored stops cannot replace an active final destination.
  if(stopMode&&!saveOnly){
   const book=data();
   const place=kind==='favorites'?book.favorites[index]:kind==='recent'?book.recent[index]:
    (kind==='home'||kind==='work')?book.slots[kind]:null;
   if(place)await finishStop(place);
   return;
  }
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
   view='search';tab=savingFavorite?'favorites':tab;s.nav='search';s.query='';
   provider.search('');rerender();
  }else if(directRoute){
   s.nav='browse';s.keyboard=false;s.mode='map';rerender();
   const ready=await provider.startRoute();
   // A previously confirmed voice request may now offer route-corridor stops.
   if(ready!==false)window.MeviGeminiVoice?.onRouteReady?.(provider.routeContext());
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
// Both initial and filtered POI searches use one Google Places request path.
function searchPoiResults(retry=false){
 if(!poiState)return;
 const {type,query,sort,openNow,alongRoute,near,namedPlace,scope}=poiState;
 const destination=scope==='destination';
 const origin=destination?provider.routeContext().destination:gps||null;
 trace('places','start',retry?'Google-Places-Suche erneut':
  destination?'Suche am Ziel':scope==='area'?'Ortsbezogene POI-Suche':'Suche entlang der Route');
 s.query=query;
 // Detour ranking is UI-only; never send it as a Google Places sort mode.
 void Promise.resolve(provider.searchNearby(type,query,origin,{
  sort:sort==='detour'?'distance':sort,openNow,alongRoute,near,
  atDestination:destination,namedPlace
 })).then(ok=>trace('places',ok===false?'error':'ok',
  ok===false?'Suche fehlgeschlagen':'Google-Places-Antwort'))
  .catch(()=>trace('places','error','Places-Anfrage fehlgeschlagen'));
 rerender();
}
function poi(type,query,near='',scope='route',namedPlace=false){
 clearPoiDetours();
 keyboardVisible=false;
 const context=provider.routeContext();
 const destination=scope==='destination'&&!!context?.hasRoute;
 stopError='';poiState={type,query,near:String(near||'').trim().slice(0,60),
  scope:destination?'destination':scope==='area'?'area':'route',
  namedPlace:!!namedPlace,sort:'distance',openNow:false,
  alongRoute:!destination&&stopMode&&!!context?.hasRoute};
 view='results';s.nav='search';s.keyboard=false;s.query=query;
 provider.search(query);
 searchPoiResults();
}
function retryPoi(){
 clearPoiDetours();
 searchPoiResults(true);
}
function poiSort(sort){
 if(!poiState||!['distance','relevance','detour'].includes(sort)||poiState.sort===sort)return;
 if(sort==='detour'){poiState={...poiState,sort};rerenderPoiWithScroll();return}
 poiState={...poiState,sort};retryPoi();
}
function poiOpenNow(){
 if(!poiState)return;
 // A new Places result set invalidates all previously compared detours.
 poiState={...poiState,openNow:!poiState.openNow,sort:poiState.sort==='detour'?'distance':poiState.sort};retryPoi();
}
function poiAlongRoute(){
 if(!poiState||poiState.scope==='destination'||!provider.routeContext().hasRoute)return;
 // Reset client-only detour ranking when the Places filter changes.
 poiState={...poiState,alongRoute:!poiState.alongRoute,sort:poiState.sort==='detour'?'distance':poiState.sort};retryPoi();
}
function openStopSearch(options={}){
 clearPoiDetours();
 const context=provider.routeContext();
 if(!context.hasRoute)return;
 geminiHandoff=options?.gemini===true;
 if(context.stops.length>=context.maxStops){stopError='Maximal acht Zwischenstopps möglich.';return}
 returnNav=context.nativeOwned?'browse':context.active?'driving':'ready';stopMode=true;stopError='';pendingSlot='';pendingFavorite=false;
 view='search';tab='favorites';s.app='nav';s.mode='map';s.nav='search';s.keyboard=false;s.query='';
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
 trace('selection','start','Zwischenstopp übernehmen');
 const ok=await provider.addStop(target);
 if(ok){
  trace('route','ok','Zwischenstopp in bestehende Route übernommen');
  close();return true;
 }
 trace('route','error','Zwischenstopp konnte nicht berechnet werden');
 stopError='Zwischenziel konnte nicht übernommen werden. Die bisherige Route bleibt bestehen.';
 rerender();return false;
}
async function addStopResult(index){
 const place=data().poiResults[index];if(!place)return false;
 return finishStop(place);
}
async function addStopPlace(){return finishStop(placeState)}
function backToSearch(){
 clearPoiDetours();
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
 detourPreview=null;
 const items=view==='results'?data().poiResults:data().suggestions;
 if(!Number.isInteger(index)||!items?.[index])return;
 // Stop pending comparisons when opening details, without discarding completed values.
 if(view==='results'&&poiDetourState?.busy){
  poiDetourRun++;
  poiDetourState.busy=false;
  poiDetourState.progress=null;
  poiDetourState.ranking=null;
 }
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
  placeSerial++;placeLoading=false;placeState=null;view='search';
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
 trace('selection','start','Google-Places-Ziel auswählen');
 try{
  const success=await provider.choose('suggest',index);
  if(success===false){trace('places','error','Ziel konnte nicht übernommen werden');return false}
  placeSerial++;placeState=null;view='search';s.keyboard=false;
  if(s.nav==='search'){s.nav='browse';rerender()}
  trace('route','start','Route berechnen');
  const routed=await provider.startRoute();
  if(routed===false){
   trace('route','error','Routenberechnung fehlgeschlagen');
   stopError='Route konnte nicht berechnet werden. Bitte Ziel oder Verbindung prüfen.';
   s.nav='preview';rerender();return false;
  }
  trace('route','ok','Route berechnet');
  window.MeviGeminiVoice?.onRouteReady?.(provider.routeContext());
  return true;
 }catch(error){
  trace('route','error','Routenberechnung oder Zielübernahme fehlgeschlagen');
  stopError='Navigation konnte das Ziel nicht übernehmen.';
  rerender();return false;
 }
}
/* Voice can operate only on numbered, CURRENT Places hits. The same methods
   as the visible route/stop buttons are used; no separate routing source. */
function voiceResultState(){
 if(native||s.nav!=='search'||view!=='results'||!poiState)return null;
 const current=data();
 if(current.poiLoading||current.poiError||!Array.isArray(current.poiResults)||!current.poiResults.length)return null;
 const hits=orderedPoiResults(current.poiResults).slice(0,20).map(({item,index})=>({
  name:String(item.name||'Ort').slice(0,100),
  placeId:String(item.placeId||''),
  lat:item.lat,lng:item.lng,index
 }));
 return {type:poiState.type,mode:stopMode?'stop':'destination',
  count:hits.length,hits};
}
async function voiceSelectResult(number){
 const snapshot=voiceResultState();
 if(!snapshot||!Number.isInteger(number)||number<1||number>snapshot.count){
  trace('selection','error','Sprachauswahl nicht in aktiver Ergebnisliste');
  return {ok:false,message:'Keine passende nummerierte Trefferliste. Bitte die Suche erneut öffnen.'};
 }
 const index=number-1,item=snapshot.hits[index];
 const key=shared.destinationKey(item);
 // Stop stale voice commands while Places is refreshing or another search opens.
 if(!key||!voiceResultState()||
    shared.destinationKey(voiceResultState().hits[index])!==key){
  trace('selection','error','Trefferliste hat sich geändert');
  return {ok:false,message:'Die Trefferliste hat sich geändert. Bitte erneut auswählen.'};
 }
 trace('selection','start','Sprachwahl Treffer '+number);
 const ok=snapshot.mode==='stop'?await addStopResult(item.index):await routeResult(item.index);
 trace('selection',ok?'ok':'error',ok?'Treffer '+number+' übernommen':'Treffer '+number+' nicht übernommen');
 return {ok:ok===true,mode:snapshot.mode,name:item.name,
  message:ok?'Treffer '+number+' übernommen.':'Treffer konnte nicht übernommen werden. Die Route bleibt erhalten.'};
}

async function routePlace(){
 if(s.nav==='preview'){
  const routed=await window.startRoute?.();
  if(routed!==false)window.MeviGeminiVoice?.onRouteReady?.(provider.routeContext());
  return;
 }
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
 if(pendingSlot){hideSearchKeyboard();return}
 keyboardVisible=false;
 const q=String(s.query||'').trim();
 if(q.length<2)return;
 poi('text',q);
}
// Backward-compatible Android/book entry: the same shared search screen.
function book(){
 if(!provider.isReady()&&window.MeviAndroidSharedNav?.isOptedIn?.()){
  void window.MeviAndroidSharedNav.connect().then(book).catch(e=>window.MeviAndroidSharedNav.showError?.(e));
  return;
 }
 bookOpenedFromSearch=s.nav==='search';
 if(!bookOpenedFromSearch){
  const previousNav=s.nav,fromDashboard=s.app==='navdashboard'&&s.mode==='split';
  if(fromDashboard&&typeof window.openDashboardSearch==='function')window.openDashboardSearch();
  else open();
  // A direct Adressbuch call must restore its original route/map state.
  returnNav=provider.routeContext().nativeOwned?'browse':previousNav;
  bookOpenedFromSearch=false;
 }
 tab='favorites';view='search';s.nav='search';s.keyboard=false;rerender();
}
function bookBack(){
 if(!bookOpenedFromSearch){close();return}
 tab='favorites';s.query='';provider.search('');rerender();
}
function add(){
 pendingFavorite=true;tab='favorites';view='search';s.query='';
 provider.search('');rerender();document.getElementById('searchInput')?.focus({preventScroll:true});
}
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
function filterBook(q){input(q);rerender()}
function nativeFailure(e){window.MeviAndroidSharedNav?.showError?.(e);window.alert?.('Adressbuch: '+(e?.message||e))}
function nativeImport(){if(provider.importPicker)void provider.importPicker().catch(nativeFailure)}
window.openSearch=open;
function overlayHTML(){return view==='edit'?editHTML():view==='results'?poiHTML():view==='place'?placeHTML():searchHTML()}
window.searchOverlay=overlayHTML;
window.MeviWebNavParity={overlayHTML,quickDestinations,quickSelect,quickIcon:ico,focusSearch,hideSearchKeyboard,blankResultsTapped,resultsScrolled,typeKey,selectedDestinationHTML:()=>s.nav==='preview'?placeHTML():'',open,openMapPlace,back,close,input,routeExactAddress,routeExactCity,routeSavedDestination,voiceResultState,voiceSelectResult,clear,tab:setTab,choose,slot,poi,poiAlongRoute,openStopSearch,addStopResult,addStopPlace,comparePoiDetours,retryPoiDetours,retryPoi,poiSort,poiOpenNow,backToSearch,showPlace,retryPlace,checkStopDetour,backFromPlace,savePlace,routeResult,routePlace,submitSearch,book,bookBack,add,remove,edit,editField,editIcon,editSlot,cancelEdit,saveEdit,removeEdited,move,clearHistory,exportBook,importBook,nativeImport,filter:filterBook,resultsHTML:()=>view==='results'?poiRows():view==='search'?searchRows():''};
window.render?.();
})();
