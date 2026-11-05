/* MeviCar Next screensaver, adapted from MeviDarts effects.js aurora / orbits / stars / neon grid.
   Self-contained: never animates in the background when hidden. */
(function(){
  'use strict';
  const KEY='mevicar-next-saver-v1';
  const MEVIDARTS=window.MevidartsLightRenderer;
  if(!MEVIDARTS||!Array.isArray(MEVIDARTS.effects)||MEVIDARTS.effects.length!==35)throw Error('MeviDarts 35-effect renderer not loaded');
  const EFFECTS=[['auto','Automatisch wechseln'],...MEVIDARTS.effects];
  const CYCLE=MEVIDARTS.effects.map(([id])=>id);
  const DELAYS=[30,60,120,300];
  const CYCLE_DELAYS=[1,24];
  const DEFAULT={enabled:true,timeout:120,effect:'auto',content:'clock',cycleSeconds:24};
  function normalize(v){
    const n=v&&typeof v==='object'?v:{};
    return {enabled:typeof n.enabled==='boolean'?n.enabled:DEFAULT.enabled,
      timeout:DELAYS.includes(Number(n.timeout))?Number(n.timeout):DEFAULT.timeout,
      effect:EFFECTS.some(a=>a[0]===n.effect)?n.effect:DEFAULT.effect,
      cycleSeconds:CYCLE_DELAYS.includes(Number(n.cycleSeconds))?Number(n.cycleSeconds):DEFAULT.cycleSeconds,
      content:n.content==='lights'?'lights':'clock'};
  }
  function load(){try{return normalize(JSON.parse(localStorage.getItem(KEY)||'null'))}catch{return {...DEFAULT}}}
  let config=load(), idleTimer=0, active=false, preview=false, layer=null, canvas=null, renderer=null,
      frameId=0, clockTimer=0, begin=0, previousFrame=0, lastEffect='', width=0, height=0,
      motionX=null, motionY=null;
  const reducedMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function save(){try{localStorage.setItem(KEY,JSON.stringify(config))}catch{}}
  function get(){return {...config}}
  function renderSettings(){
    const delays=DELAYS.map(n=>'<button type="button" aria-pressed="'+(config.timeout===n)+'" onclick="meviSaverSet(\'timeout\','+n+')">'+(n<60?n+' s':n/60+' min')+'</button>').join('');
    const options=EFFECTS.map(([id,label])=>'<option value="'+id+'"'+(config.effect===id?' selected':'')+'>'+label+'</option>').join('');
    const cycleButtons=CYCLE_DELAYS.map(n=>'<button type="button" aria-pressed="'+(config.cycleSeconds===n)+'" onclick="meviSaverSet(\'cycleSeconds\','+n+')">'+(n===1?'1 Sek. · Test':'24 Sek. · Normal')+'</button>').join('');
    const content=['clock','lights'].map(id=>'<button type="button" aria-pressed="'+(config.content===id)+'" onclick="meviSaverSet(\'content\',\''+id+'\')">'+(id==='clock'?'Uhr + Logo':'Nur Lichteffekte')+'</button>').join('');
    return '<div class="saver-settings"><div class="saver-row"><div class="saver-row-info"><b>MeviCar Neon-Bildschirmschoner</b><small>Beendet sich bei Touch, Maus oder Tastatur</small></div><button type="button" class="saver-toggle" aria-pressed="'+config.enabled+'" onclick="meviSaverSet(\'enabled\','+(!config.enabled)+')">'+(config.enabled?'✓ Ein':'Aus')+'</button></div>'+
      '<div class="saver-row"><div class="saver-row-info"><b>Start nach Inaktivität</b><small>Während aktiver Route oder GPS-Fahrt pausiert</small></div><div class="saver-options">'+delays+'</div></div>'+
      '<div class="saver-row"><label class="saver-row-info" for="meviSaverEffect"><b>Lichteffekt aus MeviDarts</b><small>Polarlicht, Lichtspuren, Neonraster und mehr</small></label><select id="meviSaverEffect" onchange="meviSaverSet(\'effect\',this.value)">'+options+'</select></div>'+
      (config.effect==='auto'?'<div class="saver-row"><div class="saver-row-info"><b>Automatischer Effektwechsel</b><small>1 Sekunde zum schnellen Testen aller Animationen</small></div><div class="saver-options">'+cycleButtons+'</div></div>':'')+
      '<div class="saver-row"><div class="saver-row-info"><b>Anzeige</b><small>Schriftzug und Uhr bewegen sich zum Einbrennschutz</small></div><div class="saver-options">'+content+'</div></div>'+
      '<div class="saver-bottom"><span class="small">Auf diesem Gerät gespeichert · Animiert nur im Bildschirmschoner</span><button class="saver-preview" type="button" onclick="meviSaverPreview()">✦ Jetzt ausprobieren</button></div></div>';
  }
  function createLayer(){
    if(layer)return;
    layer=document.createElement('div');layer.id='mevi-saver';layer.hidden=true;
    layer.setAttribute('role','dialog');layer.setAttribute('aria-label','MeviCar Bildschirmschoner. Beliebige Taste oder Berührung zum Beenden.');
    layer.innerHTML='<canvas aria-hidden="true"></canvas><div class="mevi-saver-vignette"></div>'+
      '<div class="mevi-saver-content"><div class="mevi-saver-logo">MEVI<b>CAR</b> NEXT</div><div class="mevi-saver-line"></div><time class="mevi-saver-time">--:--</time><div class="mevi-saver-date"></div></div>'+
      '<div class="mevi-saver-hint">BERÜHREN ODER TASTE DRÜCKEN ZUM FORTSETZEN</div>';
    layer.addEventListener('click',e=>{if(active){e.preventDefault();e.stopPropagation();hide()}});
    document.body.appendChild(layer);
    canvas=layer.querySelector('canvas');
    try{renderer=MEVIDARTS.create(canvas)}catch(err){console.warn('MeviCar MeviDarts renderer:',err);renderer=null}
  }
  function updateTime(){
    if(!layer||!active)return;
    const now=new Date();
    const t=layer.querySelector('.mevi-saver-time'),d=layer.querySelector('.mevi-saver-date');
    if(t)t.textContent=new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit'}).format(now);
    if(d)d.textContent=new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'2-digit',month:'long'}).format(now);
  }
  function measure(){
    if(!canvas||!renderer)return;
    width=Math.max(1,layer.clientWidth);height=Math.max(1,layer.clientHeight);
    const ratio=Math.min(window.devicePixelRatio||1,1.5);
    renderer.resize(width,height,ratio);
    lastEffect='';
  }
    function frame(now){
    if(!active||document.hidden)return;
    if(!previousFrame||now-previousFrame>=33){
      const dt=previousFrame?(now-previousFrame)/1000:0;
      previousFrame=now;
      const t=(now-begin)/1000;
      const effect=config.effect==='auto'?CYCLE[Math.floor(t/config.cycleSeconds)%CYCLE.length]:config.effect;
      try{if(renderer)renderer.draw(effect,t,dt)}catch(err){console.warn('MeviCar MeviDarts effect:',effect,err);renderer=null}
    }
    if(renderer)frameId=requestAnimationFrame(frame);
  }
  function canStart(){
    const routeActive=typeof s!=='undefined'&&!!s.route;
    const gpsActive=typeof gpsData!=='undefined'&&!!gpsData.active;
    return !document.hidden&&!routeActive&&!gpsActive;
  }
  function schedule(){
    clearTimeout(idleTimer);idleTimer=0;
    if(active||!config.enabled||document.hidden)return;
    idleTimer=setTimeout(()=>{if(canStart())show(false);else schedule()},config.timeout*1000);
  }
  function show(isPreview){
    clearTimeout(idleTimer);idleTimer=0;
    if(active||(!isPreview&&!canStart()))return;
    createLayer();
    preview=!!isPreview;active=true;
    layer.hidden=false;layer.dataset.theme=document.documentElement.dataset.theme||'cyberpunk';
    layer.dataset.content=config.content;
    updateTime();clearInterval(clockTimer);clockTimer=setInterval(updateTime,1000);
    if(renderer&&!reducedMotion){
      measure();begin=performance.now();previousFrame=0;frameId=requestAnimationFrame(frame);
    }else if(renderer){
      measure();const effect=config.effect==='auto'?CYCLE[0]:config.effect;renderer.draw(effect,0,0);
    }
  }
  function hide(){
    if(!active)return;
    active=false;preview=false;
    cancelAnimationFrame(frameId);frameId=0;
    clearInterval(clockTimer);clockTimer=0;
    if(layer)layer.hidden=true;
    schedule();
  }
  function setting(key,value){
    const next={...config,[key]:value};
    config=normalize(next);save();
    if(active)hide();else schedule();
    if(typeof render==='function')render();
  }
  function interact(e){
    if(active){
      if(e.type==='pointermove'||e.type==='mousemove'){
        if(motionX===null){motionX=e.clientX;motionY=e.clientY;return}
        if(Math.hypot(e.clientX-motionX,e.clientY-motionY)<14)return;
      }
      motionX=null;motionY=null;
      if(e.cancelable&&e.type!=='pointermove'&&e.type!=='mousemove'&&e.type!=='touchstart')e.preventDefault();
      e.stopImmediatePropagation();hide();return;
    }
    if(e.type==='pointermove'||e.type==='mousemove'){
      if(motionX===null){motionX=e.clientX;motionY=e.clientY;return}
      if(Math.hypot(e.clientX-motionX,e.clientY-motionY)<14)return;
      motionX=e.clientX;motionY=e.clientY;
    }
    schedule();
  }
  window.meviSaverSet=setting;
  window.meviSaverGet=get;
  window.meviSaverSettingsHTML=renderSettings;
  window.meviSaverPreview=()=>show(true);
  document.addEventListener('pointerdown',interact,true);
  document.addEventListener('keydown',interact,true);
  document.addEventListener('pointermove',interact,{passive:true,capture:true});
  document.addEventListener('touchstart',interact,{passive:true,capture:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){if(active)hide();else clearTimeout(idleTimer)}else schedule()});
  window.addEventListener('resize',()=>{if(active&&renderer)measure()});
  schedule();
})();
