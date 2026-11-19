/* Car HiFi follows the active MeviCar player or a user-approved audio input. */
(() => {
  'use strict';
  const names = ['Classic VFD', 'Spiegelband', 'Peak Line', 'Neonring', 'Oszilloskop',
    'Wasserfall', 'Twin VU', 'Bassmembran', 'Dot Matrix', 'Bergkamm'];
  const bands = 48;
  const key = 'mevicar-spectrum-effect';
  let effect = 0;
  try { const n = Number(localStorage.getItem(key)); if (Number.isInteger(n) && names[n]) effect = n; } catch {}
  let session, playbackContext;
  const sources = new WeakMap();
  const canShare = () => typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  const isIOS = /iPhone|iPad|iPod/.test(String(navigator.userAgent||'')) ||
    (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const isPlaying = player => !!player && player.paused === false && player.readyState >= 2;
  // This is a playback-timed visual EFFECT, never PCM/FFT data. Spotify's
  // protected SDK audio is not exposed to third-party Web Audio analysis.
  function syncSpectrum(s, state, now, dt) {
    const track=String(state.track||'');
    let seed=2166136261;
    for(let i=0;i<track.length;i++)seed=Math.imul(seed^track.charCodeAt(i),16777619)>>>0;
    const progress=(Number(state.progressMs)||0)/1000;
    // Repeatable motion aligned to the track's reported playhead.
    // Nominal beat rate varies with track identity, but isn't actual BPM.
    const nominalBpm=98+(seed%57),phase=progress*nominalBpm/60;
    const beat=Math.pow(Math.max(0,Math.cos(2*Math.PI*phase)),9);
    const off=Math.sin(progress*2.35+(seed%79));
    const variation=(x,t)=>Math.sin(x*12.9898+t*78.233+seed*.000001)*43758.5453%1;
    for(let i=0;i<bands;i++){
      const t=i/(bands-1);
      const bass=Math.pow(1-t,1.75);
      const wave=Math.abs(Math.sin(progress*(2.2+i*.045)+i*.59+off*.35));
      const treble=Math.abs(Math.cos(progress*(5+i*.13)+i*1.32));
      const shift=Math.abs(variation(i,Math.floor(progress*6))) * .17;
      const target=state.playing?clamp((.18+.34*wave+.14*treble+shift+.38*beat*bass)*(.84-.34*t)):0;
      const easing=state.playing?Math.min(1,dt*14):Math.min(1,dt*8);
      s.levels[i]+=(target-s.levels[i])*easing;
      s.peaks[i]=Math.max(s.levels[i],s.peaks[i]-dt*.39);
    }
    for(let j=0;j<s.wave.length;j++){
      const a=j/s.wave.length;
      s.wave[j]=Math.round(128+(state.playing?42:0)*
        (Math.sin((a*12+progress*1.9)*2*Math.PI)*
         .67+Math.sin((a*29-progress*.65)*2*Math.PI)*.33));
    }
    s.head=(s.head+1)%s.history.length;s.history[s.head].set(s.levels);
  }
  function playbackSyncState(s, now) {
    const owner=window.meviSpectrumSource?.();
    if(owner==='spotify'){
      window.meviSpotifySpectrumPoll?.();
      const state=window.meviSpotifySpectrumState?.();
      return state?.available ? state : {source:'spotify',playing:false,available:false};
    }
    // When a radio station denies CORS, we can synchronize animation to its
    // actual play/pause state but must not call that a frequency measurement.
    if(owner==='radio' && !s.node){
      const player=window.meviSpectrumPlayer?.();
      return {source:'radio',playing:isPlaying(player),available:!!player,
        track:player?.currentSrc||player?.src||'radio',
        progressMs:Math.max(0,now-(s.radioEpoch||now)),durationMs:0};
    }
    return null;
  }
  function releasePlayer(player) {
    const source = sources.get(player);
    if (!source) return;
    if (session?.tapSource === source) disposeInput(session);
    source.disconnect();
    sources.delete(player);
  }
  const clamp = n => Math.min(1, Math.max(0, n));
  const options = () => names.map((name, i) => `<option value="${i}"${i === effect ? ' selected' : ''}>${name}</option>`).join('');
  function html() {
    return `<section class="sp-unit" aria-label="Car HiFi Spectrum Analyser">
      <header class="sp-top"><div><h2>Car HiFi</h2><small>Spectrum Analyser</small></div><span class="sp-status"></span></header>
      <div class="sp-display"><canvas aria-label="Musikvisualisierung"></canvas><div class="sp-notice" role="status"></div></div>
      <div class="sp-controls"><div class="sp-selector"><button data-act="prev" aria-label="Vorheriger Effekt">‹</button>
      <select aria-label="Visualisierungseffekt">${options()}</select><button data-act="next" aria-label="Nächster Effekt">›</button><span class="sp-count"></span></div>
      <div class="sp-inputs"><button data-act="media">Direkt</button>${canShare() ? '<button data-act="tab">Tab-Ton</button>' : ''}<button data-act="file">Datei öffnen</button><button data-act="mic">Mikrofon</button></div></div>
      <input type="file" accept="audio/*,.flac,.m4a,.opus" hidden></section>`;
  }
  function analyzer(context) {
    const node = context.createAnalyser();
    node.fftSize = 4096; node.smoothingTimeConstant = .67; node.minDecibels = -85; node.maxDecibels = -16;
    return node;
  }
  function disposeInput(s) {
    ++s.request; s.lastSignal = null;
    if (s.capture) {
      s.capture.stream.getTracks().forEach(t => t.stop());
      s.capture.input?.disconnect(); s.capture.context.close().catch(() => {}); s.capture = null;
    }
    if (s.pendingContext) { s.pendingContext.close().catch(() => {}); s.pendingContext = null; }
    if (s.tapSource) { s.tapSource.disconnect(s.node); s.tapSource = null; }
    s.node = null; s.levels.fill(0); s.peaks.fill(0); s.wave.fill(128); s.history.forEach(row => row.fill(0));
  }
  function stop() {
    if (!session) return;
    const s = session; session = null;
    cancelAnimationFrame(s.frame); s.events.abort(); disposeInput(s);
  }
  function message(s, value) {
    if (s.notice.textContent !== value) s.notice.textContent = value;
  }
  function indicator(s, value, live) {
    if (s.status.textContent !== value) s.status.textContent = value;
    s.status.dataset.live = String(live);
  }
  function syncControls(s) {
    s.root.querySelector('select').value = String(effect);
    s.root.querySelector('.sp-count').textContent = String(effect + 1).padStart(2, '0') + ' / 10';
    for (const mode of ['mic','media','tab']) s.root.querySelector('[data-act="'+mode+'"]')?.setAttribute('aria-pressed', String(s.mode === mode));
  }
  function select(s, value) {
    effect = (value + names.length) % names.length;
    try { localStorage.setItem(key, String(effect)); } catch {}
    syncControls(s);
    if (s.g) draw(s, s.canvas.clientWidth, s.canvas.clientHeight);
  }
  function contextType() { return window.AudioContext || window.webkitAudioContext; }
  async function connect(s, mode) {
    disposeInput(s); s.mode = mode; s.error = ''; syncControls(s);
    const id = s.request, current = () => session === s && s.request === id;
    if (mode === 'media') {
      s.player = window.meviSpectrumPlayer?.();
      s.owner = window.meviSpectrumSource?.();
      s.radioEpoch = performance.now();
    }
    const Context = contextType();
    // Spotify does not expose PCM or FFT bins, but its *playback clock* can
    // drive the display without an AudioContext or microphone permission.
    if(mode==='media'&&s.owner==='spotify')return;
    if (!Context) {
      if(mode==='media'&&s.owner==='radio')return; // truthful playback-sync fallback
      s.error = 'Audioanalyse ist in diesem Browser nicht verfügbar.';return;
    }
    try {
      if (mode === 'media') {
        const player = s.player;
        if (!player || !(player.src.startsWith('blob:') || (s.owner === 'radio' && player.crossOrigin === 'anonymous'))) return;
        playbackContext ||= new Context();
        // Call resume directly during Auto's tap. Don't await a promise that
        // iOS can leave pending while no user activation is available.
        // Routing media through a suspended AudioContext can mute playback.
        // Await activation before inserting the audio element into the graph.
        // On iOS the pending promise is retried by tapping "Auto"; stale
        // connections are discarded via the current() request guard.
        await playbackContext.resume();
        if (!current() || player !== window.meviSpectrumPlayer?.()) return;
        if(playbackContext.state!=='running'){
          s.error='Für die Radio-Frequenzanalyse einmal „Direkt“ antippen.';
          return;
        }
        let source = sources.get(player);
        if (!source) {
          source = playbackContext.createMediaElementSource(player);
          source.connect(playbackContext.destination);
          sources.set(player, source);
        }
        s.node = analyzer(playbackContext);
        source.connect(s.node);
        s.tapSource = source;
      } else {
        const tab = mode === 'tab';
        const context = s.pendingContext = new Context();
        const ready = context.resume();
        ready.catch(() => {});
        const stream = tab
          ? await navigator.mediaDevices.getDisplayMedia({video:true, audio:true})
          : await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
        if (!current()) { stream.getTracks().forEach(t => t.stop()); return; }
        if (!stream.getAudioTracks().length) {
          stream.getTracks().forEach(t => t.stop());
          disposeInput(s); s.mode = ''; syncControls(s);
          s.error = 'Kein Ton freigegeben. Tab-Ton wählen und „Tab-Audio teilen“ aktivieren.';
          return;
        }
        s.pendingContext = null;
        s.capture = { context, stream };
        const input = s.capture.input = context.createMediaStreamSource(stream); s.node = analyzer(context); input.connect(s.node);
        await ready;
        if (!current()) return;
        for (const track of stream.getTracks()) track.addEventListener('ended', () => {
          if (!current()) return;
          disposeInput(s); s.mode = ''; s.error = 'Audiofreigabe beendet. Quelle erneut wählen.'; syncControls(s);
        }, {once:true});
      }
      if (current()) updateRanges(s);
    } catch (e) {
      if (!current()) return;
      disposeInput(s); s.mode = ''; syncControls(s);
      s.error = mode === 'tab' ? 'Tab-Ton nicht verfügbar. Tab mit Audio freigeben oder Mikrofon wählen.' : mode === 'mic' && e.name === 'NotAllowedError' ? 'Mikrofonfreigabe fehlt. Zugriff erlauben oder eine Musikdatei öffnen.' :
        e.name === 'NotFoundError' ? 'Kein Mikrofon gefunden. Wähle eine Musikdatei.' : 'Audioeingang nicht verfügbar. Quelle erneut wählen.';
    }
  }
  function updateRanges(s) {
    const hz = s.node.context.sampleRate / s.node.fftSize;
    const max = Math.min(18000, s.node.context.sampleRate / 2);
    for (let i = 0; i <= bands; i++) s.edges[i] = Math.min(s.node.frequencyBinCount - 1, Math.round(32 * (max/32) ** (i/bands) / hz));
  }
  function sample(s, dt) {
    if(s.sync && !s.node){syncSpectrum(s,s.sync,performance.now(),dt);return}
    const node = s.node;
    if (node) { node.getByteFrequencyData(s.freq); node.getByteTimeDomainData(s.wave); }
    for (let i = 0; i < bands; i++) {
      let v = 0;
      if (node) for (let k = s.edges[i]; k < Math.max(s.edges[i]+1,s.edges[i+1]); k++) v = Math.max(v,s.freq[k]/255);
      s.levels[i] = v;
      s.peaks[i] = Math.max(v,s.peaks[i]-dt*.38);
    }
    if (node) {
      s.head = (s.head + 1) % s.history.length;
      s.history[s.head].set(s.levels);
    }
  }
  function draw(s, w, h) {
    const g = s.g, v = s.levels, p = s.peaks;
    const left = Math.min(46, w*.057), top = Math.min(33,h*.12), W = w-2*left, H = h-2*top;
    if (W<2 || H<2) return;
    g.fillStyle='#051011'; g.fillRect(0,0,w,h);
    g.save(); g.translate(left,top);
    const line = (x,y,X,Y,color,width=1) => {g.beginPath();g.moveTo(x,y);g.lineTo(X,Y);g.strokeStyle=color;g.lineWidth=width;g.stroke();};
    const circle = (x,y,r,color,stroke=0) => {g.beginPath();g.arc(x,y,Math.max(.1,r),0,Math.PI*2);if(stroke){g.strokeStyle=color;g.lineWidth=stroke;g.stroke();}else{g.fillStyle=color;g.fill();}};
    const label = (str,x,y,align='left') => {g.fillStyle='#77968d';g.font='10px ui-monospace, monospace';g.textAlign=align;g.fillText(str,x,y);};
    const color = t => t>.86?'#ff8c60':t>.68?'#f4ca69':'#70e9b5';
    for(let i=0;i<=8;i++)line(W*i/8,0,W*i/8,H,'#142726');
    for(let i=0;i<=4;i++)line(0,H*i/4,W,H*i/4,'#19302d');
    const x = i => W*i/(bands-1), step = W/bands;
    const mean = (a,b) => {let total=0;for(let i=a;i<b;i++)total+=v[i];return total/(b-a);};
    const cx=W/2,cy=H/2,R=Math.min(W,H);
    if ([0,1,2,5,8,9].includes(effect) && top>=14) {
      const maxHz = s.node ? Math.min(18000,s.node.context.sampleRate/2) : 18000;
      for (const f of [32,125,500,2000,8000]) label(f>=1000?f/1000+'k':String(f),W*Math.log(f/32)/Math.log(maxHz/32),H+13);
      label('Hz',W,H+13,'right');
    }
    if(effect===0 || effect===8) {
      const rows=Math.max(8,Math.min(effect===0?30:20,Math.floor(H/(effect===0?6:10))));
      for(let i=0;i<bands;i++) for(let j=0;j<rows;j++){
        const on=(j+.5)/rows<=v[i], peak=p[i]>.025 && j===Math.min(rows-1,Math.floor(p[i]*rows));
        const tone=peak?'#f9f6d5':on?(effect===8?'hsl('+(184+i*2)+',85%,64%)':color(j/rows)):'#102621';
        const y=H-(j+1)*H/rows;
        if(effect===8)circle((i+.5)*step,y+H/rows/2,Math.min(step,H/rows)*.31,tone);
        else {g.fillStyle=tone;g.fillRect(i*step+step*.09,y,step*.82,Math.max(1,H/rows*.75));}
      }
    } else if(effect===1) {
      const grad=g.createLinearGradient(0,0,0,H);grad.addColorStop(0,'#f0d381');grad.addColorStop(.5,'#72ebcd');grad.addColorStop(1,'#3683cf');g.fillStyle=grad;
      for(let i=0;i<bands;i++){const a=Math.max(1,v[i]*cy);g.fillRect(i*step+1,cy-a,Math.max(1,step-2),2*a);}
    } else if(effect===2) {
      for(const [data,tone,fill] of [[p,'#dfb86b',false],[v,'#76f6c3',true]]){
        g.beginPath();data.forEach((n,i)=>i?g.lineTo(x(i),H-n*H):g.moveTo(0,H-n*H));g.strokeStyle=tone;g.lineWidth=2;g.stroke();
        if(fill){g.lineTo(W,H);g.lineTo(0,H);g.closePath();const grad=g.createLinearGradient(0,0,0,H);grad.addColorStop(0,'#4bd49d99');grad.addColorStop(1,'#4bd49d09');g.fillStyle=grad;g.fill();}
      }
    } else if(effect===3) {
      const base=R*.24;circle(cx,cy,base-2,'#32665d',1);
      for(let i=0;i<bands*2;i++){const bin=i<bands?i:bands*2-i-1,a=i*Math.PI/bands-Math.PI/2,r=base+2+v[bin]*R*.24;
        line(cx+Math.cos(a)*base,cy+Math.sin(a)*base,cx+Math.cos(a)*r,cy+Math.sin(a)*r,'hsl('+(153+bin*2.4)+',81%,65%)',Math.max(2,R*.012));}
    } else if(effect===4) {
      let start=0;for(let i=1;i<1024;i++)if(s.wave[i-1]<128 && s.wave[i]>=128){start=i;break;}
      g.beginPath();for(let i=0;i<1024;i++){const y=cy-(s.wave[start+i]-128)/128*cy; i?g.lineTo(W*i/1023,y):g.moveTo(0,y);}
      g.strokeStyle='#8afacd';g.lineWidth=2;g.stroke();
    } else if(effect===5 || effect===9) {
      const rows=s.history.length;
      for(let j=0;j<rows;j++){const values=s.history[(s.head+1+j)%rows], y=j*H/rows;
        if(effect===5){values.forEach((n,i)=>{if(n<.025)return;g.fillStyle='hsl('+(235-205*n)+',85%,'+(10+n*57)+'%)';g.fillRect(i*step,y,step+.3,H/rows+.4);});}
        else if(j%3===0){const k=.54+.46*j/rows, base=H*(.26+.74*j/rows);g.beginPath();
          values.forEach((n,i)=>{const X=cx+(x(i)-cx)*k,Y=base-n*H*.26*k;i?g.lineTo(X,Y):g.moveTo(X,Y);});
          g.strokeStyle='hsl('+(203-52*j/rows)+',65%,'+(25+40*j/rows)+'%)';g.lineWidth=1.5;g.stroke();}
      }
    } else if(effect===6) {
      for(const [i,a,title] of [[0,mean(0,16),'BASS'],[1,mean(16,48),'MITTEN / HÖHEN']]){
        const X=W*(i === 1 ? .75 : .25), base=H*.81, radius=Math.min(W*.24,H*.70), angle=t=>Math.PI*(1.17+.66*t);
        for(let j=0;j<=24;j++){const t=j/24,cos=Math.cos(angle(t)),sin=Math.sin(angle(t));line(X+cos*radius*.85,base+sin*radius*.85,X+cos*radius,base+sin*radius,color(t),2);}
        const ang=angle(clamp(a));line(X,base,X+Math.cos(ang)*radius*.83,base+Math.sin(ang)*radius*.83,'#ffc17c',3);circle(X,base,4,'#d3e3cf');label(title,X,H*.98,'center');}
    } else if(effect===7) {
      const bass=mean(0,14), r=R*(.30+.10*bass);
      const grad=g.createRadialGradient(cx,cy,r*.14,cx,cy,r);grad.addColorStop(0,'#51706b');grad.addColorStop(.53,'#142420');grad.addColorStop(.82,'#304f45');grad.addColorStop(1,'#0b1515');
      circle(cx,cy,r,grad);for(let i=0;i<5;i++)circle(cx,cy,r*(.70+.068*i),'rgba(131,222,180,'+(.15+bass*.48)+')',1.5);
      circle(cx,cy,r*.34,'#142824');circle(cx,cy,r*.34,'#8de9be',2);circle(cx,cy,R*.45,'#32433e',2);
    }
    g.restore();
  }
  function mount() {
    const root=document.querySelector('.sp-unit'); if(!root)return;
    const s=session || {events:new AbortController(),request:0,mode:'media',error:'',sync:null,levels:new Float32Array(bands),peaks:new Float32Array(bands),edges:new Uint16Array(bands+1),
      wave:new Uint8Array(4096).fill(128),freq:new Uint8Array(2048),history:Array.from({length:48},()=>new Float32Array(bands)),head:0};
    const fresh=!session;session=s;cancelAnimationFrame(s.frame);
    s.root=root;s.canvas=root.querySelector('canvas');s.g=s.canvas.getContext('2d');s.notice=root.querySelector('.sp-notice');s.status=root.querySelector('.sp-status');syncControls(s);
    if(fresh){
      document.addEventListener('visibilitychange',()=>{if(document.hidden && s.mode==='mic'){disposeInput(s);s.mode='';s.error='Mikrofon pausiert. Zum Starten erneut antippen.';syncControls(s);}}, {signal:s.events.signal});
      window.addEventListener('pagehide',stop,{signal:s.events.signal});
      connect(s,'media');
    }
    root.onclick=e=>{
      const action=e.target.closest('[data-act]')?.dataset.act;
      if(action==='prev'||action==='next')select(s,effect+(action==='next'?1:-1));
      else if(action==='file')root.querySelector('input').click();
      else if((action==='mic'||action==='tab')&&s.mode===action)connect(s,'media');
      else if(action==='media' && s.mode==='media' && s.owner==='media' && s.node?.context.state==='running')window.meviMediaToggle?.();
      else if(action==='media'||action==='mic'||action==='tab')connect(s,action);
    };
    root.querySelector('select').onchange=e=>select(s,Number(e.target.value));
    root.querySelector('input').onchange=async e=>{
      const file=e.target.files[0];if(!file)return;
      if(await window.meviSpectrumPlayFile?.(file)){if(session===s)connect(s,'media');}
      else if(session===s)s.error='Diese Audiodatei wird nicht unterstützt.';
    };
    let last=0;
    function frame(now) {
      if(session!==s)return;
      s.frame=requestAnimationFrame(frame);if(document.hidden||now-last<30)return;
      const dt=Math.min(.15,(now-last)/1000);last=now;
      const c=s.canvas,w=c.clientWidth,h=c.clientHeight,dpr=Math.min(2,window.devicePixelRatio||1);
      if(w<1||h<1)return;
      const owner=window.meviSpectrumSource?.(),player=window.meviSpectrumPlayer?.();
      if(s.mode==='media'&&(s.owner!==owner||s.player!==player)){
        s.sync=null;connect(s,'media');
      }
      s.sync=s.mode==='media'?playbackSyncState(s,now):null;
      if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}
      s.g.setTransform(dpr,0,0,dpr,0,0);sample(s,dt);draw(s,w,h);
      const automatic=s.mode==='media',radio=owner==='radio',spotify=owner==='spotify';
      const running=s.node?.context.state==='running';
      const playing=automatic ? isPlaying(player) : !!s.capture;
      const directLive=!!(running&&playing);
      const syncLive=!!(s.sync?.available&&s.sync.playing);
      const live=directLive||syncLive;
      const mediaButton = s.root.querySelector('[data-act=media]');
      const caption = automatic && owner === 'media' && running ? (playing?'Pause':'Abspielen') : 'Direkt';
      if (mediaButton.textContent !== caption) mediaButton.textContent = caption;
      indicator(s, syncLive ? (spotify?'Spotify · Sync-Animation':'Radio · Sync-Animation') :
        directLive ? (s.mode==='mic'?'Mikrofon live':s.mode==='tab'?'Tab-Ton live':radio?'Radio FFT':'Medien FFT') :
        'Bereit', live);
      let hint = '';
      if (syncLive){
        hint=''; // the header explicitly labels the non-FFT animation
      } else if (live && s.mode === 'tab') {
        if (s.freq.some(value => value > 0)) s.lastSignal = now;
        s.lastSignal ??= now;
        if (now - s.lastSignal > 3000) hint = 'Kein hörbares Tab-Signal. Wiedergabe und Audiofreigabe prüfen.';
      } else if (!live) {
        if (s.mode === 'tab' || s.mode === 'mic') hint = 'Audioeingang wird verbunden …';
        else if (automatic && player && playbackContext?.state === 'suspended') hint = 'Für die Analyse auf Direkt tippen.';
        else if (automatic && owner === 'spotify') hint = 'Spotify-Player starten und auf diesem Gerät abspielen. Für Spotify gibt es keine direkten FFT-Daten.';
        else if (automatic && radio && player && player.crossOrigin !== 'anonymous') hint = 'Dieser Sender erlaubt keine FFT-Auslesung. Automatischer Wiedergabe-Sync verfügbar.';
        else if (automatic && radio) hint = player ? 'Warte auf Radiosignal …' : 'Radio starten oder andere Quelle wählen.';
        else hint = s.node ? 'Wiedergabe pausiert.' : 'Radio starten, Musikdatei öffnen oder Mikrofon wählen.';
      }
      message(s,s.error || hint);
    }
    s.frame=requestAnimationFrame(frame);
  }
  function status(){
    if(!session)return {active:false,source:'',mode:'',fft:false,sync:false,playing:false,level:0};
    const s=session,source=window.meviSpectrumSource?.()||'';
    const playing=!!(s.sync?.playing || (s.node && isPlaying(s.player)));
    return {active:true,source,mode:s.mode,fft:!!s.node,
      sync:!!s.sync?.available,playing,
      level:s.levels.reduce((sum,v)=>sum+v,0)/bands};
  }
  window.MeviSpectrum={html,mount,stop,releasePlayer,isActive:()=>!!session,status};
})();
