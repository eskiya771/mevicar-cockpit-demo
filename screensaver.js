/* MeviCar Next screensaver, adapted from MeviDarts effects.js aurora / orbits / stars / neon grid.
   Self-contained: never animates in the background when hidden. */
(function(){
  'use strict';
  const KEY='mevicar-next-saver-v1';
  const EFFECTS=[['auto','Automatisch wechseln'],['aurora','Polarlicht'],['orbits','Lichtspuren'],['grid','Neonraster'],['stars','Sternenflug'],['nebula','Weltraum-Nebel']];
  const CYCLE=['aurora','orbits','grid','nebula','stars'];
  const DELAYS=[30,60,120,300];
  const DEFAULT={enabled:true,timeout:120,effect:'auto',content:'clock'};
  function normalize(v){
    const n=v&&typeof v==='object'?v:{};
    return {enabled:typeof n.enabled==='boolean'?n.enabled:DEFAULT.enabled,
      timeout:DELAYS.includes(Number(n.timeout))?Number(n.timeout):DEFAULT.timeout,
      effect:EFFECTS.some(a=>a[0]===n.effect)?n.effect:DEFAULT.effect,
      content:n.content==='lights'?'lights':'clock'};
  }
  function load(){try{return normalize(JSON.parse(localStorage.getItem(KEY)||'null'))}catch{return {...DEFAULT}}}
  let config=load(), idleTimer=0, active=false, preview=false, layer=null, canvas=null, ctx=null,
      frameId=0, clockTimer=0, begin=0, previousFrame=0, lastEffect='', width=0, height=0,
      motionX=null, motionY=null;
  const reducedMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const seed=n=>{const v=Math.sin(n*127.1+37)*43758.5453;return v-Math.floor(v)};
  const wrap=n=>(n%1+1)%1;
  const stars=Array.from({length:170},(_,i)=>({x:seed(i+15)*2-1,y:seed(i+191)*2-1,z:seed(i+500)*.96+.04}));
  function save(){try{localStorage.setItem(KEY,JSON.stringify(config))}catch{}}
  function get(){return {...config}}
  function renderSettings(){
    const delays=DELAYS.map(n=>'<button type="button" aria-pressed="'+(config.timeout===n)+'" onclick="meviSaverSet(\'timeout\','+n+')">'+(n<60?n+' s':n/60+' min')+'</button>').join('');
    const options=EFFECTS.map(([id,label])=>'<option value="'+id+'"'+(config.effect===id?' selected':'')+'>'+label+'</option>').join('');
    const content=['clock','lights'].map(id=>'<button type="button" aria-pressed="'+(config.content===id)+'" onclick="meviSaverSet(\'content\',\''+id+'\')">'+(id==='clock'?'Uhr + Logo':'Nur Lichteffekte')+'</button>').join('');
    return '<div class="saver-settings"><div class="saver-row"><div class="saver-row-info"><b>MeviCar Neon-Bildschirmschoner</b><small>Beendet sich bei Touch, Maus oder Tastatur</small></div><button type="button" class="saver-toggle" aria-pressed="'+config.enabled+'" onclick="meviSaverSet(\'enabled\','+(!config.enabled)+')">'+(config.enabled?'✓ Ein':'Aus')+'</button></div>'+
      '<div class="saver-row"><div class="saver-row-info"><b>Start nach Inaktivität</b><small>Während aktiver Route oder GPS-Fahrt pausiert</small></div><div class="saver-options">'+delays+'</div></div>'+
      '<div class="saver-row"><label class="saver-row-info" for="meviSaverEffect"><b>Lichteffekt aus MeviDarts</b><small>Polarlicht, Lichtspuren, Neonraster und mehr</small></label><select id="meviSaverEffect" onchange="meviSaverSet(\'effect\',this.value)">'+options+'</select></div>'+
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
    try{ctx=canvas.getContext('2d',{alpha:false})}catch{}
  }
  function updateTime(){
    if(!layer||!active)return;
    const now=new Date();
    const t=layer.querySelector('.mevi-saver-time'),d=layer.querySelector('.mevi-saver-date');
    if(t)t.textContent=new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit'}).format(now);
    if(d)d.textContent=new Intl.DateTimeFormat('de-DE',{weekday:'long',day:'2-digit',month:'long'}).format(now);
  }
  function measure(){
    if(!canvas||!ctx)return;
    width=Math.max(1,layer.clientWidth);height=Math.max(1,layer.clientHeight);
    const ratio=Math.min(window.devicePixelRatio||1,1.5);
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
    ctx.setTransform(ratio,0,0,ratio,0,0);
    lastEffect='';
  }
  function bg(top='#020716',bottom='#04030e'){
    const g=ctx.createLinearGradient(0,0,0,height);g.addColorStop(0,top);g.addColorStop(1,bottom);
    ctx.fillStyle=g;ctx.fillRect(0,0,width,height);
  }
  function glow(x,y,r,color){
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,color);g.addColorStop(1,'transparent');
    ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  function draw(effect,t){
    if(!ctx)return;
    const size=Math.min(width,height),cx=width/2,cy=height/2;
    if(effect!==lastEffect){ctx.clearRect(0,0,width,height);lastEffect=effect}
    if(effect==='aurora'){
      bg('#030615','#060314');
      ctx.globalCompositeOperation='lighter';
      // MeviDarts sine-wave aurora: layered cyan-to-magenta luminous ribbons.
      const count=45;
      for(let i=0;i<count;i++){
        const hue=180+i*3.4+Math.sin(t/8)*13;
        ctx.beginPath();
        for(let x=0;x<=width+20;x+=18){
          const y=height*.49+Math.sin(x/(width*.28)+t*.24+i*.035)*height*.18+
            Math.sin(x/(width*.12)-t*.4+i*.08)*height*.065+(i-count/2)*height/170;
          if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
        }
        ctx.strokeStyle='hsla('+hue+',95%,65%,.14)';
        ctx.lineWidth=Math.max(2,height/110);ctx.stroke();
      }
      glow(cx+Math.sin(t*.14)*width*.24,cy,size*.32,'#a022bb24');
      ctx.globalCompositeOperation='source-over';
    }else if(effect==='orbits'){
      ctx.fillStyle='rgba(3,6,17,.20)';ctx.fillRect(0,0,width,height);
      ctx.globalCompositeOperation='lighter';
      // MeviDarts orbit paths: chromatic points tracing low-frequency interlaced paths.
      const rad=size*.31;
      for(let i=0;i<100;i++){
        const phase=i/100*Math.PI*2;
        const x=cx+Math.sin(t*.43+phase)*rad*1.4*Math.cos(t*.13+phase*2);
        const y=cy+Math.cos(t*.37+phase*3)*rad;
        ctx.fillStyle='hsla('+(i*3+t*11)+',94%,68%,.75)';
        ctx.beginPath();ctx.arc(x,y,1.2+(i%5)*.3,0,Math.PI*2);ctx.fill();
      }
      ctx.globalCompositeOperation='source-over';
    }else if(effect==='grid'){
      bg('#08071f','#100716');
      const horizon=height*.43;
      glow(cx,horizon*.67,size*.25,'#fc64c925');
      ctx.fillStyle='#ff7f9b';ctx.beginPath();ctx.arc(cx,horizon*.62,size*.115,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#230a2b';for(let i=0;i<7;i++)ctx.fillRect(cx-size*.116,horizon*.62+i*size*.013,size*.232,2+i*.8);
      ctx.strokeStyle='#bc54fd95';ctx.lineWidth=1.4;
      for(let i=-16;i<=16;i++){ctx.beginPath();ctx.moveTo(cx+i*width*.014,horizon);ctx.lineTo(cx+i*width*.17,height);ctx.stroke()}
      for(let i=0;i<23;i++){let d=wrap(i/23+t*.054),y=horizon+d*d*(height-horizon);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke()}
    }else if(effect==='stars'){
      bg('#030717','#01020a');
      // MeviDarts star-flight perspective, deterministic seeds keep it smooth.
      for(const p of stars){
        const z=wrap(p.z-t*.053)*.96+.04;
        const x=cx+p.x*width*.29/z,y=cy+p.y*height*.30/z;
        if(x<0||x>width||y<0||y>height)continue;
        ctx.fillStyle='rgba(193,225,255,'+(1-z*.65)+')';
        ctx.beginPath();ctx.arc(x,y,Math.min(3.4,.4/z),0,Math.PI*2);ctx.fill();
      }
      glow(cx+Math.sin(t*.09)*width*.09,cy,size*.34,'#413f8c24');
    }else if(effect==='nebula'){
      bg('#02040e','#070416');
      ctx.globalCompositeOperation='lighter';
      // MeviDarts showcase nebula: slow translucent radial fields.
      for(let i=0;i<12;i++){
        const x=cx+Math.sin(t*.13+i*1.43)*width*.38;
        const y=cy+Math.cos(t*.19+i*1.71)*height*.39;
        const r=size*(.14+seed(i+77)*.23),color=i%3===0?'#ba34b337':i%3===1?'#276fcd3d':'#e36b9c2c';
        glow(x,y,r,color);
      }
      for(let i=0;i<85;i++){
        const x=seed(i*4+9)*width,y=seed(i*4+10)*height;
        ctx.fillStyle='rgba(222,231,255,'+(.15+Math.sin(t*.7+i)*.13)+')';
        ctx.fillRect(x,y,1.2,1.2);
      }
      ctx.globalCompositeOperation='source-over';
    }
  }
  function frame(now){
    if(!active||document.hidden)return;
    if(!previousFrame||now-previousFrame>=33){
      previousFrame=now;
      const t=(now-begin)/1000;
      const effect=config.effect==='auto'?CYCLE[Math.floor(t/24)%CYCLE.length]:config.effect;
      try{draw(effect,t)}catch(err){console.warn('MeviCar Screensaver:',err);ctx=null}
    }
    if(ctx)frameId=requestAnimationFrame(frame);
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
    if(ctx&&!reducedMotion){
      measure();begin=performance.now();previousFrame=0;frameId=requestAnimationFrame(frame);
    }else if(ctx){
      measure();const effect=config.effect==='auto'?CYCLE[0]:config.effect;draw(effect,0);
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
      if(e.cancelable&&e.type!=='pointermove'&&e.type!=='mousemove')e.preventDefault();
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
  window.addEventListener('resize',()=>{if(active&&ctx)measure()});
  schedule();
})();
