/* MeviCar Next – "Wer ist schuld?" party bottle spinner.
   A local, playful random selector: no server, no personal data, no hidden weighting. */
(function(root){
'use strict';
const DEFAULT=['Merz','Typtest','Systemtest','Entwicklung','PSS','Werk','PL','EU','SINAMICS'];
const STORE='mevicar-wer-ist-schuld-parties-v1';
const MAX=16;
const clean=s=>String(s??'').trim().replace(/\s+/g,' ').slice(0,28);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function load(){
 try{
  const data=JSON.parse(localStorage.getItem(STORE));
  if(Array.isArray(data)&&data.length>=2&&data.length<=MAX){
   const names=data.map(clean).filter(Boolean);
   if(names.length===data.length&&new Set(names.map(x=>x.toLocaleLowerCase('de-DE'))).size===names.length)return names;
  }
 }catch{}
 return DEFAULT.slice();
}
function save(names){try{localStorage.setItem(STORE,JSON.stringify(names))}catch{}}
function randomIndex(length){
 if(length<=0)return -1;
 if(root.crypto?.getRandomValues){
  const data=new Uint32Array(1);
  const range=0x100000000;
  const limit=range-(range%length);
  do{root.crypto.getRandomValues(data)}while(data[0]>=limit);
  return data[0]%length;
 }
 return Math.floor(Math.random()*length);
}
function nextRotation(current,index,length,loops=6){
 const per=360/length;
 const desired=index*per;
 const normalized=((current%360)+360)%360;
 const adjust=((desired-normalized+360)%360);
 return current+Math.max(4,Math.floor(loops))*360+adjust;
}
const state={names:load(),rotation:0,winner:null,spinning:false,feedback:'',root:null,timer:null,raf:null,openConfig:false};
const isSplit=()=>!!state.root?.closest?.('.side');
const bottleSVG='<svg class="wis-bottle-shape" viewBox="0 0 180 180" aria-hidden="true" focusable="false">'+
 '<defs><linearGradient id="wis-bottle-glass" x1="0%" y1="0%" x2="100%" y2="100%">'+
 '<stop offset="0" stop-color="#d9fff8" stop-opacity=".85"/><stop offset=".22" stop-color="#36f3dc" stop-opacity=".65"/>'+
 '<stop offset=".63" stop-color="#168fa5" stop-opacity=".90"/><stop offset="1" stop-color="#014366" stop-opacity=".92"/></linearGradient>'+
 '<linearGradient id="wis-liquid" x1="0%" y1="0%" x2="85%" y2="100%">'+
 '<stop offset="0" stop-color="#a5e767" stop-opacity=".88"/><stop offset="1" stop-color="#40bdb4" stop-opacity=".92"/></linearGradient></defs>'+
 // top neck points towards the name; bottom is weighted like a real bottle
 '<path d="M82 32 L82 48 C82 53 79 56 74 62 C62 73 58 85 57 102 L57 140 C57 151 66 159 90 159 C114 159 123 151 123 140 L123 102 C122 85 118 73 106 62 C101 56 98 53 98 48 L98 32 Z" fill="url(#wis-bottle-glass)" stroke="#d5ffff" stroke-width="2.2"/>'+
 '<path d="M65 117 L115 117 L115 140 Q113 151 90 151 Q67 151 65 140 Z" fill="url(#wis-liquid)" opacity=".88"/>'+
 '<path d="M78 72 Q68 84 66 106 L66 137" fill="none" stroke="#efffff" stroke-width="4.5" stroke-linecap="round" opacity=".6"/>'+
 '<path d="M82 32 L98 32 L99 18 Q90 12 81 18 Z" fill="#ffcd6b" stroke="#fff2c1" stroke-width="2"/>'+
 '<path d="M87 17 L87 32" stroke="#fff7d3" stroke-width="2" opacity=".8"/>'+
 '<rect x="68" y="105" width="44" height="23" rx="6" fill="#e8f9fb" opacity=".93"/>'+
 '<text x="90" y="119" text-anchor="middle" font-size="11" font-weight="900" fill="#0c5363">MEVI</text>'+
 '<path d="M90 4 L82 14 L98 14 Z" fill="#ffcc67" stroke="#fff1b5" stroke-width="1.5"/>'+
 '</svg>';
function wheel(){
 const names=state.names,n=names.length;
 const colors=['rgba(17,171,202,.17)','rgba(95,213,181,.15)'];
 const wedges=names.map((_,i)=>colors[i%2]+' '+(i*100/n)+'% '+((i+1)*100/n)+'%').join(', ');
 const marks=names.map((name,i)=>{
  const rad=i*2*Math.PI/n;
  const x=(50+40*Math.sin(rad)).toFixed(3),y=(50-40*Math.cos(rad)).toFixed(3);
  const chosen=state.winner===i?' wis-chosen':'';
  return '<span class="wis-party'+chosen+'" style="left:'+x+'%;top:'+y+'%" title="'+esc(name)+'">'+esc(name)+'</span>';
 }).join('');
 return '<div class="wis-wheel" aria-label="Drehscheibe mit '+n+' Parteien" style="--wis-wedges:conic-gradient(from -'+(180/n)+'deg, '+wedges+')">'+
 '<div class="wis-wheel-face"></div><div class="wis-wheel-glow"></div>'+
 marks+
 '<button class="wis-bottle" type="button" data-action="spin" style="transform:rotate('+state.rotation+'deg)"'+(state.spinning?' disabled':'')+' aria-label="Flasche drehen">'+bottleSVG+'</button>'+
 '<div class="wis-hub" aria-hidden="true"></div></div>';
}
function markup(split=false){
 const result=state.spinning?'Die Flasche dreht sich …':
  state.winner!==null?state.names[state.winner]+' ist schuld!':'Wen trifft es diesmal?';
 const chips=state.names.map((s,i)=>'<span class="wis-chip">'+esc(s)+' <button type="button" data-remove="'+i+'" title="'+esc(s)+' entfernen" aria-label="'+esc(s)+' entfernen">×</button></span>').join('');
 const cfg='<details class="wis-config"'+(state.openConfig?' open':'')+'>'+
  '<summary>Teilnehmer bearbeiten</summary><div class="wis-config-inner"><div class="wis-chips">'+chips+'</div>'+
  '<form class="wis-add"><input name="name" aria-label="Neuer Teilnehmer" placeholder="Weiteren Namen hinzufügen" maxlength="28" autocomplete="off" required><button type="submit">+</button></form>'+
  '<button type="button" class="wis-restore" data-action="restore">Standardliste wiederherstellen</button>'+
  '<small>Mindestens 2, höchstens 16 Namen</small></div></details>';
 return '<section class="wis-root'+(split?' wis-split':'')+'" aria-label="Wer ist schuld?">'+
  '<div class="wis-wheel-wrap">'+wheel()+'</div>'+
  '<div class="wis-panel"><div class="wis-heading"><span>MEVICAR · PARTY GAME</span><h2>WER IST SCHULD?</h2>'+
  '<p>Die Flasche entscheidet. Ganz zufällig.</p></div>'+
  '<div class="wis-result'+(state.winner!==null?' wis-has-result':'')+'" role="status" aria-live="polite">'+
  (state.winner!==null&&!state.spinning?'<small>DIE SCHULD TRÄGT</small>':'<small>RUNDE '+(state.winner===null?'START':'NEU')+'</small>')+
  '<strong>'+esc(result)+'</strong></div>'+
  '<button type="button" class="wis-spin" data-action="spin"'+(state.spinning?' disabled':'')+'>'+
  (state.spinning?'⏳ Dreht sich …':'↻ FLASCHE DREHEN')+'</button>'+
  '<div class="wis-count">'+state.names.length+' Parteien im Rennen · Zufällige Auswahl</div>'+
  cfg+'<div class="wis-feedback" role="status">'+esc(state.feedback)+'</div></div></section>';
}
function html(split=false){return markup(split)}
function renderCurrent(){
 if(!state.root||!state.root.isConnected)return;
 state.root.outerHTML=markup(isSplit());
 // root has been replaced; delegation must be rebound by mount
 const next=document.querySelector('.wis-root');
 if(next){state.root=next;bind(next)}
}
function bind(el){
 // Direct assignment makes repeated binding safe and avoids duplicate event handlers.
 el.onclick=e=>{
  if(state.spinning)return;
  const remove=e.target.closest?.('[data-remove]');
  if(remove){
   e.preventDefault();
   const index=Number(remove.dataset.remove);
   if(state.names.length<=2){state.feedback='Mindestens zwei Teilnehmer müssen bleiben.';renderCurrent();return}
   if(!Number.isInteger(index)||index<0||index>=state.names.length)return;
   state.names.splice(index,1);save(state.names);
   state.feedback='Teilnehmer entfernt.';state.winner=null;state.rotation=0;
   state.openConfig=true;renderCurrent();return;
  }
  const button=e.target.closest?.('[data-action]');
  if(!button)return;
  const action=button.dataset.action;
  if(action==='spin')spin();
  if(action==='restore'){
   state.names=DEFAULT.slice();save(state.names);state.winner=null;state.rotation=0;
   state.feedback='Standardliste wiederhergestellt.';state.openConfig=true;renderCurrent();
  }
 };
 el.onsubmit=e=>{
  if(!e.target.matches?.('.wis-add'))return;
  e.preventDefault();
  if(state.spinning)return;
  const input=e.target.querySelector('input');
  const name=clean(input?.value);
  state.openConfig=true;
  if(!name){state.feedback='Bitte einen Namen eingeben.'}
  else if(state.names.length>=MAX){state.feedback='Höchstens 16 Teilnehmer möglich.'}
  else if(state.names.some(p=>p.toLocaleLowerCase('de-DE')===name.toLocaleLowerCase('de-DE'))){state.feedback='Dieser Name ist bereits dabei.'}
  else{state.names.push(name);save(state.names);state.winner=null;state.rotation=0;state.feedback=name+' hinzugefügt.'}
  renderCurrent();
 };
 const details=el.querySelector('.wis-config');
 if(details)details.ontoggle=()=>{if(state.root===el)state.openConfig=details.open};
}
function mount(){
 const el=document.querySelector('.wis-root');
 if(!el)return;
 if(state.root===el)return;
 state.root=el;
 bind(el);
}
function spin(){
 if(state.spinning||state.names.length<2||!state.root)return;
 const index=randomIndex(state.names.length);
 const extra=5+randomIndex(4);
 const start=state.rotation;
 const target=nextRotation(start,index,state.names.length,extra);
 state.feedback='';
 state.winner=null;state.spinning=true;
 const duration=root.matchMedia?.('(prefers-reduced-motion: reduce)').matches?400:3900;
 const btn=state.root.querySelector('.wis-spin');
 if(btn){btn.disabled=true;btn.textContent='⏳ Dreht sich …'}
 const bottle=state.root.querySelector('.wis-bottle');
 if(bottle){bottle.disabled=true;bottle.style.transition='transform '+duration+'ms cubic-bezier(.11,.73,.08,1)';bottle.style.transform='rotate('+start+'deg)';}
 const result=state.root.querySelector('.wis-result strong');
 if(result)result.textContent='Die Flasche dreht sich …';
 state.raf=requestAnimationFrame(()=>{
  if(bottle&&state.spinning)bottle.style.transform='rotate('+target+'deg)';
 });
 state.rotation=target;
 state.timer=setTimeout(()=>{
  state.spinning=false;state.winner=index;state.timer=null;
  renderCurrent();
 },duration+70);
}
function unmount(){
 if(state.spinning){
  // Complete a pending spin before moving away; keep the result across tabs.
  clearTimeout(state.timer);
  state.timer=null;state.spinning=false;
  const n=state.names.length;
  state.winner=((Math.round(state.rotation/(360/n))%n)+n)%n;
 }
 if(state.raf!==null&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(state.raf);
 state.raf=null;state.root=null;
}
root.meviWhosGuiltyHTML=html;
root.meviWhosGuiltyMount=mount;
root.meviWhosGuiltyUnmount=unmount;
if(typeof module!=='undefined'&&module.exports)module.exports={DEFAULT,randomIndex,nextRotation,clean};
})(typeof window!=='undefined'?window:globalThis);
