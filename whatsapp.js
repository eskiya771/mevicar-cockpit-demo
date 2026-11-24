/* MeviCar Next / WhatsApp
   Official wa.me and WhatsApp Web hand-off, not an unauthorized chat client.
   Contacts are stored only on this device. Never claim to receive notifications,
   read chats, send messages automatically or access Android NotificationListener.
 */
(function(){
 'use strict';
 const STORE='mevicar-next-whatsapp-contacts-v1';
 const LIMIT=250, VCARD_LIMIT=1024*1024;
 const fallbackText='Hallo, ich bin unterwegs.';
 const templates=[
  ['Bin unterwegs','Ich bin unterwegs und melde mich später.'],
  ['Komme später','Ich komme etwas später.'],
  ['Bitte anrufen','Ruf mich bitte an, wenn du Zeit hast.']
 ];
 const state={contacts:[],selectedId:'',query:'',body:'',name:'',phone:'',editingId:'',
  view:'contacts',notice:'',error:'',mounted:false,speaking:false};
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const el=id=>document.getElementById(id);
 const isContactId=id=>/^wa-[0-9a-z-]{5,45}$/.test(String(id||''));
 function phoneDigits(input){
  let text=String(input||'').trim();
  if(!text||!/^\+?[\d .()\/-]+$/.test(text))return null;
  const startsPlus=text.startsWith('+');
  const digits=text.replace(/\D/g,'');
  let normalized=startsPlus?digits:digits.startsWith('00')?digits.slice(2):
   digits.startsWith('0')?'49'+digits.slice(1):digits;
  if(!/^[1-9]\d{7,14}$/.test(normalized))return null;
  return normalized;
 }
 function whatsappUrl(number,text=''){
  const normalized=phoneDigits(number);
  if(!normalized)throw new Error('Bitte eine gültige internationale Telefonnummer eingeben.');
  const base='https://wa.me/'+normalized;
  return base+(text?'?text='+encodeURIComponent(String(text).slice(0,3500)):'');
 }
 function shareUrl(text){return 'https://wa.me/?text='+encodeURIComponent(String(text||'').slice(0,3500))}
 function get(id){return state.contacts.find(c=>c.id===id)||null}
 function selected(){return get(state.selectedId)}
 function saveContacts(){
  try{localStorage.setItem(STORE,JSON.stringify(state.contacts))}catch{
   state.error='Kontakte konnten nicht lokal gespeichert werden (Speicher voll oder deaktiviert).';
  }
 }
 try{
  const stored=JSON.parse(localStorage.getItem(STORE)||'[]');
  if(Array.isArray(stored)){
   state.contacts=stored.filter(c=>c&&isContactId(c.id)&&
    typeof c.name==='string'&&phoneDigits(c.phone)).slice(0,LIMIT)
    .map(c=>({id:c.id,name:c.name.slice(0,90),phone:phoneDigits(c.phone),
     favorite:!!c.favorite,lastOpened:Number(c.lastOpened)||0}));
   state.contacts.sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.lastOpened-a.lastOpened||a.name.localeCompare(b.name,'de'));
   state.selectedId=state.contacts[0]?.id||'';
  }
 }catch{}
 function formatPhone(n){return '+'+String(n||'')}
 function timestamp(ms){return ms?new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit'}).format(new Date(ms)):'Kontakt'}
 function status(message,error=false){
  state.notice=message;state.error=error?message:'';
  const box=el('mevi-wa-status');
  if(box){box.textContent=message;box.classList.toggle('error',!!error)}
 }
 function contactsView(){
  const q=state.query.toLocaleLowerCase('de');
  const list=state.contacts.filter(c=>!q||c.name.toLocaleLowerCase('de').includes(q)||c.phone.includes(q.replace(/\D/g,'')));
  return '<div class="mevi-wa-list-head"><label for="mevi-wa-search">KONTAKTE</label>'+
   '<button type="button" onclick="MeviWhatsApp.newContact()">+ Kontakt</button></div>'+
   '<input type="search" id="mevi-wa-search" autocomplete="off" placeholder="Name oder Nummer suchen" '+
    'value="'+esc(state.query)+'" oninput="MeviWhatsApp.search(this.value)" />'+
   '<div class="mevi-wa-contacts" id="mevi-wa-contacts" role="list">'+
   (list.length?list.map(c=>'<div class="mevi-wa-contact-row'+(c.id===state.selectedId?' selected':'')+
    '" role="listitem">'+
    '<button type="button" class="mevi-wa-contact-select" onclick="MeviWhatsApp.select(\''+c.id+'\')">'+
    '<span class="mevi-wa-avatar">'+esc(c.name.trim().slice(0,1).toUpperCase()||'?')+'</span>'+
    '<span class="mevi-wa-contact-name"><strong>'+esc(c.name)+'</strong><small>'+esc(formatPhone(c.phone))+
    '</small></span></button>'+
    '<button type="button" class="mevi-wa-star'+(c.favorite?' selected':'')+'" aria-label="'+
    (c.favorite?'Favorit entfernen':'Als Favorit markieren')+'" aria-pressed="'+c.favorite+
    '" onclick="MeviWhatsApp.favorite(\''+c.id+'\')">'+(c.favorite?'★':'☆')+'</button></div>').join(''):
    '<div class="mevi-wa-empty">'+(state.contacts.length?'Keine Kontakte gefunden.':
     'Noch keine Kontakte gespeichert. Füge einen Kontakt hinzu oder importiere eine VCF-Datei.')+'</div>')+
   '</div>'+
   '<div class="mevi-wa-import"><input type="file" id="mevi-wa-vcf" hidden accept=".vcf,text/vcard" '+
   'onchange="MeviWhatsApp.importFile(this.files?.[0])"/>'+
   '<button type="button" onclick="MeviWhatsApp.chooseFile()">VCF-Kontakte importieren</button>'+
   '<small>Kontakte bleiben nur im Browser auf diesem Gerät.</small></div>';
 }
 function composeView(){
  const c=selected();
  return '<div class="mevi-wa-compose-top">'+
   '<div><small>NACHRICHT VORBEREITEN</small><h2>'+esc(c?.name||'Neuen Chat öffnen')+'</h2>'+
   '<span>'+esc(c?formatPhone(c.phone):'Empfänger noch nicht ausgewählt')+'</span></div>'+
   (c?'<button type="button" class="mevi-wa-edit-trigger" onclick="MeviWhatsApp.editContact()">Bearbeiten</button>':'')+'</div>'+
   (!c?'<div class="mevi-wa-direct-number"><label for="mevi-wa-direct">Telefonnummer für Direktchat</label>'+
    '<input id="mevi-wa-direct" type="tel" inputmode="tel" placeholder="+49 170 1234567" autocomplete="tel" /></div>':'')+
   '<div class="mevi-wa-compose-body"><label for="mevi-wa-text">Nachricht</label>'+
   '<textarea id="mevi-wa-text" rows="5" maxlength="3500" placeholder="Nachricht eingeben …" '+
   'oninput="MeviWhatsApp.compose(this.value)">'+esc(state.body)+'</textarea>'+
   '<div class="mevi-wa-templates">'+templates.map((t,i)=>
    '<button type="button" onclick="MeviWhatsApp.template('+i+')">'+esc(t[0])+'</button>').join('')+'</div>'+
   '<div class="mevi-wa-send-actions">'+
   '<button type="button" class="mevi-wa-primary" onclick="MeviWhatsApp.openChat()">Chat in WhatsApp öffnen ↗</button>'+
   '<button type="button" onclick="MeviWhatsApp.copyLink()">Link kopieren</button>'+
   '<button type="button" onclick="MeviWhatsApp.speakDraft()">Text vorlesen</button></div>'+
   '</div>'+
   '<div class="mevi-wa-note"><strong>So funktioniert es:</strong> WhatsApp wird auf dem Gerät oder in einem separaten Browserfenster geöffnet. '+
   'Dein Text wird nur vorausgefüllt; <b>du sendest ihn selbst in WhatsApp ab.</b></div>'+
   '<div class="mevi-wa-extras"><button type="button" onclick="MeviWhatsApp.openWeb()">WhatsApp Web öffnen ↗</button>'+
   '<button type="button" onclick="MeviWhatsApp.shareText()">Text über WhatsApp teilen</button></div>';
 }
 function editView(){
  const c=state.editingId?get(state.editingId):null;
  return '<div class="mevi-wa-editor"><div class="mevi-wa-compose-top"><div><small>KONTAKTE</small><h2>'+
   (c?'Kontakt bearbeiten':'Kontakt hinzufügen')+'</h2></div></div>'+
   '<label for="mevi-wa-name">Name</label>'+
   '<input type="text" id="mevi-wa-name" maxlength="90" autocomplete="name" value="'+esc(state.name)+'" placeholder="Kontaktname"/>'+
   '<label for="mevi-wa-phone">Telefonnummer mit Ländervorwahl</label>'+
   '<input type="tel" id="mevi-wa-phone" inputmode="tel" autocomplete="tel" value="'+esc(state.phone)+
   '" placeholder="+49 170 1234567"/>'+
   '<small>Deutsche Nummern mit führender 0 werden automatisch in +49 umgewandelt. Sonst die internationale Vorwahl angeben.</small>'+
   '<div class="mevi-wa-editor-actions"><button type="button" class="mevi-wa-primary" onclick="MeviWhatsApp.saveContact()">Speichern</button>'+
   '<button type="button" onclick="MeviWhatsApp.cancelEdit()">Abbrechen</button>'+
   (c?'<button type="button" class="mevi-wa-delete" onclick="MeviWhatsApp.removeContact()">Kontakt löschen</button>':'')+
   '</div></div>';
 }
 function html(compact=false){
  return '<section class="mevi-wa-shell'+(compact?' compact':'')+'" aria-label="WhatsApp">'+
   '<header class="mevi-wa-header"><div><small>MEVICAR NEXT · MESSENGER</small><strong>WhatsApp</strong></div>'+
   '<div class="mevi-wa-header-actions"><span>WEB-VERKNÜPFUNG</span><button type="button" onclick="MeviWhatsApp.openWeb()">WhatsApp Web ↗</button></div></header>'+
   '<div class="mevi-wa-privacy">Die PWA kann keine WhatsApp-Nachrichten auslesen oder automatisch beantworten. '+
   'Für den Nachrichtenverlauf aus Classic ist eine Android-Benachrichtigungs-Bridge erforderlich.</div>'+
   (compact?'<nav class="mevi-wa-mobile-tabs"><button type="button" class="'+(state.view==='contacts'?'active':'')+
    '" onclick="MeviWhatsApp.view(\'contacts\')">Kontakte</button><button type="button" class="'+
    (state.view==='compose'?'active':'')+'" onclick="MeviWhatsApp.view(\'compose\')">Nachricht</button></nav>':'')+
   '<div class="mevi-wa-status" id="mevi-wa-status" role="status">'+esc(state.notice||'Bereit · WhatsApp wird erst beim Öffnen kontaktiert.')+'</div>'+
   '<div class="mevi-wa-layout">'+
    '<aside class="mevi-wa-left'+(compact&&state.view!=='contacts'?' hidden-mobile':'')+'">'+contactsView()+'</aside>'+
    '<main class="mevi-wa-right'+(compact&&state.view==='contacts'?' hidden-mobile':'')+'">'+
    (state.view==='edit'?editView():composeView())+'</main></div>'+
   '</section>';
 }
 function repaint(keepScroll=false){
  const root=document.querySelector('.mevi-wa-shell');if(!root)return;
  const list=root.querySelector('.mevi-wa-contacts'),scroll=list?.scrollTop||0;
  root.outerHTML=html(root.classList.contains('compact'));
  if(keepScroll){const next=document.querySelector('.mevi-wa-contacts');if(next)next.scrollTop=scroll}
 }
 function search(value){
  state.query=String(value||'').slice(0,110);
  const list=el('mevi-wa-contacts');
  // Do not replace the search field while it has keyboard focus.
  if(!list)return;
  const q=state.query.toLocaleLowerCase('de');
  const results=state.contacts.filter(c=>!q||c.name.toLocaleLowerCase('de').includes(q)||c.phone.includes(q.replace(/\D/g,'')));
  list.innerHTML=results.map(c=>'<div class="mevi-wa-contact-row'+(c.id===state.selectedId?' selected':'')+'" role="listitem">'+
   '<button type="button" class="mevi-wa-contact-select" onclick="MeviWhatsApp.select(\''+c.id+'\')"><span class="mevi-wa-avatar">'+
   esc(c.name.slice(0,1).toUpperCase()||'?')+'</span><span class="mevi-wa-contact-name"><strong>'+esc(c.name)+
   '</strong><small>'+esc(formatPhone(c.phone))+'</small></span></button><button type="button" class="mevi-wa-star'+
   (c.favorite?' selected':'')+'" aria-label="'+(c.favorite?'Favorit entfernen':'Als Favorit markieren')+
   '" onclick="MeviWhatsApp.favorite(\''+c.id+'\')">'+(c.favorite?'★':'☆')+'</button></div>').join('')||
   '<div class="mevi-wa-empty">Keine passenden Kontakte.</div>';
 }
 function select(id){if(!get(id))return;state.selectedId=id;state.view='compose';repaint()}
 function view(which){if(!['contacts','compose'].includes(which))return;state.view=which;repaint()}
 function newContact(){state.name='';state.phone='';state.editingId='';state.view='edit';repaint();el('mevi-wa-name')?.focus()}
 function editContact(){const c=selected();if(!c)return;state.editingId=c.id;state.name=c.name;state.phone='+'+c.phone;state.view='edit';repaint()}
 function cancelEdit(){state.view='compose';state.editingId='';repaint()}
 function saveContact(){
  const name=String(el('mevi-wa-name')?.value||'').trim().slice(0,90);
  const raw=el('mevi-wa-phone')?.value||'',number=phoneDigits(raw);
  if(!name||!number){status('Bitte Namen und gültige internationale Nummer eingeben.',true);return}
  const existing=state.contacts.find(c=>c.phone===number&&c.id!==state.editingId);
  if(existing){status('Diese Telefonnummer ist bereits unter „'+existing.name+'“ gespeichert.',true);return}
  if(!state.editingId&&state.contacts.length>=LIMIT){status('Maximal 250 Kontakte möglich.',true);return}
  let c=get(state.editingId);
  if(c){c.name=name;c.phone=number}
  else{c={id:'wa-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),
   name,phone:number,favorite:false,lastOpened:0};state.contacts.unshift(c)}
  state.selectedId=c.id;state.editingId='';state.view='compose';saveContacts();state.notice='Kontakt gespeichert.';repaint();
 }
 function removeContact(){
  const c=get(state.editingId);if(!c)return;
  // Removal is local to MeviCar; does not delete anything in WhatsApp.
  state.contacts=state.contacts.filter(x=>x.id!==c.id);
  state.selectedId=state.contacts[0]?.id||'';state.editingId='';state.view='contacts';
  saveContacts();state.notice='Kontakt aus MeviCar entfernt.';repaint();
 }
 function favorite(id){const c=get(id);if(!c)return;c.favorite=!c.favorite;
  state.contacts.sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.lastOpened-a.lastOpened||a.name.localeCompare(b.name,'de'));
  saveContacts();repaint(true);
 }
 function compose(value){state.body=String(value||'').slice(0,3500)}
 function template(index){const item=templates[Number(index)];if(!item)return;state.body=item[1];
  const box=el('mevi-wa-text');if(box){box.value=state.body;box.focus()}else repaint();
 }
 function targetNumber(){
  const c=selected();return c?.phone||phoneDigits(el('mevi-wa-direct')?.value||'');
 }
 function openChat(){
  const n=targetNumber();if(!n){status('Kontakt auswählen oder gültige Telefonnummer angeben.',true);return false}
  const url=whatsappUrl(n,state.body.trim());
  const c=selected();if(c){c.lastOpened=Date.now();saveContacts()}
  status('WhatsApp wurde geöffnet. Nachricht bitte dort selbst senden.');
  window.open(url,'_blank','noopener,noreferrer');
  return true;
 }
 async function copyLink(){
  const n=targetNumber();if(!n){status('Bitte zuerst einen Kontakt oder eine Telefonnummer auswählen.',true);return}
  const url=whatsappUrl(n,state.body.trim());
  try{await navigator.clipboard.writeText(url);status('WhatsApp-Link kopiert.')}
  catch{status('Kopieren nicht möglich. Prüfe die Browserberechtigung.',true)}
 }
 function openWeb(){window.open('https://web.whatsapp.com/','_blank','noopener,noreferrer')}
 function shareText(){
  const text=state.body.trim();if(!text){status('Bitte zuerst eine Nachricht eingeben.',true);return false}
  window.open(shareUrl(text),'_blank','noopener,noreferrer');
  status('Empfänger und Versand erfolgen in WhatsApp.');return true;
 }
 function speakDraft(){
  const text=state.body.trim();if(!text){status('Kein Text zum Vorlesen vorhanden.',true);return false}
  if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){
   status('Sprachausgabe wird in diesem Browser nicht unterstützt.',true);return false
  }
  try{
   window.speechSynthesis.cancel();
   const spoken=new window.SpeechSynthesisUtterance(text);
   spoken.lang='de-DE';spoken.rate=0.95;
   window.speechSynthesis.speak(spoken);status('Nachrichtentext wird vorgelesen.');return true;
  }catch{status('Sprachausgabe fehlgeschlagen.',true);return false}
 }
 function decodeVCardText(s){return String(s||'').replace(/\\n/gi,'\n').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\').trim()}
 function parseVCF(raw){
  const text=String(raw||'').replace(/\r\n?/g,'\n').replace(/\n[ \t]/g,'');
  const blocks=text.split(/BEGIN:VCARD/i).slice(1),found=[];
  if(!blocks.length)throw new Error('Keine gültige VCF-Datei.');
  for(const rawBlock of blocks){
   if(!/END:VCARD/i.test(rawBlock))continue;
   const lines=rawBlock.split('\n');
   let name='',phone='',structured='';
   for(const line of lines){
    const i=line.indexOf(':');if(i<0)continue;
    const key=line.slice(0,i).split(';')[0].toUpperCase(),value=line.slice(i+1);
    if(key==='FN')name=decodeVCardText(value);
    else if(key==='N')structured=decodeVCardText(value).split(';').slice(0,2).reverse().join(' ').trim();
    else if(key==='TEL'&&!phone)phone=phoneDigits(value)||'';
   }
   if(phone)found.push({name:(name||structured||'Unbenannt').slice(0,90),phone});
  }
  return found.slice(0,LIMIT);
 }
 function chooseFile(){el('mevi-wa-vcf')?.click()}
 async function importFile(file){
  if(!file)return;
  try{
   if(file.size>VCARD_LIMIT)throw new Error('Die VCF-Datei darf maximal 1 MB groß sein.');
   const entries=parseVCF(await file.text());
   if(!entries.length)throw new Error('Keine gültigen Kontakte mit Rufnummer gefunden.');
   const existing=new Set(state.contacts.map(c=>c.phone));
   let added=0;
   for(const row of entries){
    if(state.contacts.length>=LIMIT)break;
    if(existing.has(row.phone))continue;
    existing.add(row.phone);
    state.contacts.push({id:'wa-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),
     name:row.name,phone:row.phone,favorite:false,lastOpened:0});added++;
   }
   state.contacts.sort((a,b)=>Number(b.favorite)-Number(a.favorite)||a.name.localeCompare(b.name,'de'));
   if(!state.selectedId)state.selectedId=state.contacts[0]?.id||'';
   saveContacts();state.notice=added+' Kontakte importiert (nur lokal).';state.view='contacts';repaint();
  }catch(e){status(String(e?.message||'Import fehlgeschlagen.'),true)}
 }
 function mount(){state.mounted=!!document.querySelector('.mevi-wa-shell')}
 function unmount(){state.mounted=false;try{window.speechSynthesis?.cancel()}catch{}}
 window.MeviWhatsApp={html,mount,unmount,search,select,view,newContact,editContact,cancelEdit,saveContact,
  removeContact,favorite,compose,template,openChat,copyLink,openWeb,shareText,speakDraft,chooseFile,importFile,
  phoneDigits,whatsappUrl,shareUrl,parseVCF,debug:()=>({
   contacts:state.contacts.length,selected:!!selected(),localOnly:true,inboxAvailable:false,notificationBridge:false
  })};
})();
