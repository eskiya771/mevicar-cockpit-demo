/* MeviCar Next Lichtshow – 35 authentic MeviDarts effects as a cockpit app.
   Independent from the idle screensaver; animation is cancelled on unmount. */
(function(){
  'use strict';
  const library=window.MevidartsLightRenderer;
  if(!library||!Array.isArray(library.effects)||library.effects.length!==35){
    console.warn('MeviCar Lichtshow: MeviDarts effect library unavailable');
    return;
  }
  const KEY='mevicar-lightshow-v1';
  const all=library.effects;
  const effectIds=all.map(([id])=>id);
  const nameOf=id=>all.find(row=>row[0]===id)?.[1]||'Polarlicht';
  function readSettings(){
    let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch{}
    let saver={};try{saver=window.meviSaverGet?.()||{}}catch{}
    return {
      effect:saved.effect==='auto'||effectIds.includes(saved.effect)?saved.effect:'auto',
      cycleSeconds:[1,24].includes(saved.cycleSeconds)?saved.cycleSeconds:([1,24].includes(saver.cycleSeconds)?saver.cycleSeconds:24),
      playing:true
    };
  }
  const state=readSettings();
  let root=null,canvas=null,renderer=null,observer=null,raf=0,last=0,clock=0,elapsed=0,visible=false,activeEffect='';
  let lastTouch=0;
  const svg=(d)=>'<svg aria-hidden="true" viewBox="0 0 24 24">'+d+'</svg>';
  const icons={
    pause:svg('<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>'),
    play:svg('<path d="m8 5 12 7-12 7Z" fill="currentColor" stroke="none"/>'),
    left:svg('<path d="m14.5 4-8 8 8 8"/>'),
    right:svg('<path d="m9.5 4 8 8-8 8"/>'),
    fullscreen:svg('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
    split:svg('<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M12 3v18"/>'),
  };
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify({effect:state.effect,cycleSeconds:state.cycleSeconds}))}catch{}
  }
  function effective(){
    if(state.effect!=='auto')return state.effect;
    return effectIds[Math.floor(elapsed/state.cycleSeconds)%effectIds.length];
  }
  function html(compact){
    const opts=[['auto','✦ Automatisch · alle 35'],...all]
      .map(([id,label])=>'<option value="'+id+'"'+(state.effect===id?' selected':'')+'>'+label+'</option>').join('');
    return '<section class="lightshow-app'+(compact?' is-compact':'')+'" data-effect-mode="'+(state.effect==='auto'?'auto':'manual')+'" aria-label="MeviDarts Lichtshow">'+
      '<div class="lightshow-head"><div class="lightshow-heading"><span class="lightshow-eyebrow">MEVIDARTS · LIVE AMBIENT</span><span class="lightshow-title">LICHT<b>SHOW</b></span></div>'+
      '<div class="lightshow-quick"><button type="button" class="lightshow-btn" title="Vorheriger Effekt" aria-label="Vorheriger Effekt" onclick="meviLightshowStep(-1)">'+icons.left+'</button>'+
      '<button type="button" class="lightshow-btn" id="lightshow-play" title="Animation pausieren" aria-label="Animation pausieren" onclick="meviLightshowToggle()">'+icons.pause+'</button>'+
      '<button type="button" class="lightshow-btn" title="Nächster Effekt" aria-label="Nächster Effekt" onclick="meviLightshowStep(1)">'+icons.right+'</button>'+
      '<button type="button" class="lightshow-btn" title="'+(compact?'Vollbild öffnen':'In Split-Screen wechseln')+'" aria-label="'+(compact?'Vollbild öffnen':'In Split-Screen wechseln')+'" onclick="openApp(\'lightshow\')">'+(compact?icons.fullscreen:icons.split)+'</button></div></div>'+
      '<div class="lightshow-stage"><canvas id="lightshow-canvas" aria-label="Animierte Lichtshow mit MeviDarts-Effekten"></canvas><div class="lightshow-glass"></div>'+
      '<div class="lightshow-overlay"><div class="lightshow-now"><small id="lightshow-mode">'+(state.effect==='auto'?'AUTOMATISCHER WECHSEL':'AUSGEWÄHLTER EFFEKT')+'</small><strong id="lightshow-name">'+nameOf(effective())+'</strong></div><span class="lightshow-total">35 EFFEKTE</span></div></div>'+
      '<div class="lightshow-controls"><div class="lightshow-selector"><label for="lightshow-effect">Effekt</label><select id="lightshow-effect" class="lightshow-effect-select" onchange="meviLightshowSelect(this.value)" aria-label="Lichtshow-Effekt auswählen">'+opts+'</select></div>'+
      '<div class="lightshow-interval"><label>Wechsel</label><button type="button" id="lightshow-fast" aria-pressed="'+(state.cycleSeconds===1)+'" onclick="meviLightshowInterval(1)" title="Schneller Testwechsel">1 s</button><button type="button" id="lightshow-slow" aria-pressed="'+(state.cycleSeconds===24)+'" onclick="meviLightshowInterval(24)" title="Normaler Effektwechsel">24 s</button></div></div></section>';
  }
  function drawOnce(dt){
    if(!renderer)return;
    const id=effective();
    if(id!==activeEffect){
      activeEffect=id;
      const n=document.getElementById('lightshow-name'),mode=document.getElementById('lightshow-mode');
      if(n)n.textContent=nameOf(id);
      if(mode)mode.textContent=state.effect==='auto'?'AUTOMATISCHER WECHSEL':'AUSGEWÄHLTER EFFEKT';
    }
    try{renderer.draw(id,elapsed,dt)}
    catch(err){console.warn('MeviCar Lichtshow effect:',id,err);state.playing=false;updateControls();stopAnimation()}
  }
  function frame(now){
    raf=0;
    if(!visible||!state.playing||document.hidden||!root||!root.isConnected)return;
    if(!last||now-last>=30){
      const dt=last?Math.min(.1,Math.max(0,(now-last)/1000)):0;
      last=now;elapsed+=dt;
      drawOnce(dt);
    }
    if(visible&&state.playing)raf=requestAnimationFrame(frame);
  }
  function stopAnimation(){if(raf)cancelAnimationFrame(raf);raf=0;last=0}
  function startAnimation(){
    if(!visible||!state.playing||document.hidden||raf)return;
    last=0;raf=requestAnimationFrame(frame);
  }
  function resize(){
    if(!visible||!renderer||!canvas)return;
    const rect=canvas.getBoundingClientRect();
    if(rect.width<1||rect.height<1)return;
    renderer.resize(rect.width,rect.height,Math.min(window.devicePixelRatio||1,1.5));
    activeEffect='';drawOnce(0);
  }
  function updateControls(){
    if(!root||!root.isConnected)return;
    root.dataset.effectMode=state.effect==='auto'?'auto':'manual';
    const btn=document.getElementById('lightshow-play');
    if(btn){
      btn.innerHTML=state.playing?icons.pause:icons.play;
      btn.title=state.playing?'Animation pausieren':'Animation fortsetzen';
      btn.setAttribute('aria-label',btn.title);
      btn.setAttribute('aria-pressed',String(!state.playing));
    }
    const select=document.getElementById('lightshow-effect');if(select&&select.value!==state.effect)select.value=state.effect;
    const fast=document.getElementById('lightshow-fast'),slow=document.getElementById('lightshow-slow');
    if(fast)fast.setAttribute('aria-pressed',String(state.cycleSeconds===1));
    if(slow)slow.setAttribute('aria-pressed',String(state.cycleSeconds===24));
    const mode=document.getElementById('lightshow-mode');if(mode)mode.textContent=state.effect==='auto'?'AUTOMATISCHER WECHSEL':'AUSGEWÄHLTER EFFEKT';
  }
  function select(id){
    if(id!=='auto'&&!effectIds.includes(id))return;
    state.effect=id;elapsed=0;activeEffect='';
    save();updateControls();drawOnce(0);
  }
  function interval(seconds){
    if(![1,24].includes(seconds))return;
    state.cycleSeconds=seconds;elapsed=0;activeEffect='';
    save();updateControls();drawOnce(0);
  }
  function step(direction){
    const id=effective();const index=effectIds.indexOf(id);
    select(effectIds[(index+(direction>=0?1:-1)+effectIds.length)%effectIds.length]);
  }
  function toggle(){
    state.playing=!state.playing;
    updateControls();
    if(state.playing)startAnimation();else stopAnimation();
  }
  function pointer(e){
    if(!visible||!canvas||!renderer||effective()!=='touch')return;
    const now=performance.now();if(e.type==='pointermove'&&now-lastTouch<45)return;lastTouch=now;
    const bounds=canvas.getBoundingClientRect();
    if(!bounds.width||!bounds.height)return;
    const x=Math.max(0,Math.min(1,(e.clientX-bounds.left)/bounds.width));
    const y=Math.max(0,Math.min(1,(e.clientY-bounds.top)/bounds.height));
    renderer.touch(x,y,elapsed);drawOnce(0);
  }
  function unmount(){
    visible=false;stopAnimation();
    if(observer){observer.disconnect();observer=null}
    if(canvas){canvas.removeEventListener('pointerdown',pointer);canvas.removeEventListener('pointermove',pointer)}
    canvas=null;root=null;renderer=null;
  }
  function mount(){
    const next=document.querySelector('.lightshow-app');
    if(!next){unmount();return}
    if(root===next&&visible)return;
    unmount();root=next;canvas=root.querySelector('#lightshow-canvas');
    if(!canvas)return;
    try{renderer=library.create(canvas)}catch(err){console.warn('MeviCar Lichtshow unavailable:',err);return}
    visible=true;elapsed=0;last=0;activeEffect='';
    canvas.addEventListener('pointerdown',pointer);canvas.addEventListener('pointermove',pointer);
    if(typeof ResizeObserver!=='undefined'){
      observer=new ResizeObserver(()=>resize());
      observer.observe(canvas);
    }
    resize();updateControls();startAnimation();
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAnimation();else startAnimation()});
  window.addEventListener('resize',resize);
  window.meviLightshowHTML=html;
  window.meviLightshowMount=mount;
  window.meviLightshowUnmount=unmount;
  window.meviLightshowSelect=select;
  window.meviLightshowInterval=interval;
  window.meviLightshowStep=step;
  window.meviLightshowToggle=toggle;
  window.meviLightshowDebug=()=>({active:visible,playing:state.playing,effect:state.effect,current:effective(),cycleSeconds:state.cycleSeconds,frames:!!raf});
})();
