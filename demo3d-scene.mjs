import * as THREE from './vendor/three-0.170.0/three.module.min.js';
import { createExtraScenes } from './demo3d-extra.mjs';

// One renderer, one visible scene. All geometry is procedural and stays offline.
export function createDemo(host, state, onChange, onFailure) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'low-power' });
  renderer.setClearColor(0x02030c); renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(52, 1, .1, 160);
  const world = new THREE.Scene();
  const events = new AbortController(); const { signal } = events;
  let group, tick, frame = 0, last = 0, autoTime = 0, disposed = false, low = false, slow = 0;
  let yaw = 0, pitch = 0, pointer = null, distance = 11;
  const geometries = new Set(), materials = new Set();
  const glowCanvas = document.createElement('canvas'); glowCanvas.width = glowCanvas.height = 64;
  const ctx = glowCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'rgba(255,255,255,1)'); gradient.addColorStop(.12,'rgba(255,255,255,.9)'); gradient.addColorStop(.35,'rgba(255,255,255,.18)'); gradient.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0,0,64,64);
  const glow = new THREE.CanvasTexture(glowCanvas);
  const geo = value => (geometries.add(value), value);
  const mat = value => (materials.add(value), value);
  const basic = (color, opacity = 1) => mat(new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  const mesh = (geometry, material, parent = group) => { const object = new THREE.Mesh(geo(geometry), material); parent.add(object); return object; };
  function halo(color, size, parent = group) {
    const sprite = new THREE.Sprite(mat(new THREE.SpriteMaterial({ map: glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .8 })));
    sprite.scale.setScalar(size); parent.add(sprite); return sprite;
  }
  function stars(count) {
    const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const r = 7 + Math.random() * 24;
      const a = Math.random() * Math.PI * 2;
      positions[i*3] = Math.cos(a)*r; positions[i*3+1] = (Math.random()-.5)*22; positions[i*3+2] = Math.sin(a)*r;
      color.setHSL(.56 + Math.random()*.24, .8, .5 + Math.random()*.3);
      color.toArray(colors,i*3);
    }
    const geometry = geo(new THREE.BufferGeometry());
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3)); geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    const object = new THREE.Points(geometry,mat(new THREE.PointsMaterial({ size: .065, map: glow, vertexColors:true, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false })));
    group.add(object); return object;
  }
  function clearScene() { world.clear(); geometries.forEach(g=>g.dispose()); materials.forEach(m=>m.dispose()); geometries.clear(); materials.clear(); }
  // Surface animation runs on the GPU. Meshes and buffers stay fixed between frames.
  function surface(geometry, fragment, { additive = false, vertex = '' } = {}) {
    const material = mat(new THREE.ShaderMaterial({
      uniforms: { clock: { value: 0 } },
      side: THREE.DoubleSide,
      transparent: additive,
      depthWrite: !additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `
        uniform float clock;
        varying vec3 local;
        varying vec2 coords;
        void main() {
          vec3 p = position;
          coords = uv;
          ${vertex}
          local = p;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
        }`,
      fragmentShader: `
        uniform float clock;
        varying vec3 local;
        varying vec2 coords;
        float filament(float phase, float width) {
          float d = abs(sin(phase));
          return exp(-d * d / max(width, fwidth(phase) * fwidth(phase)));
        }
        void main() {
          ${fragment}
          #include <colorspace_fragment>
        }`
    }));
    return mesh(geometry, material);
  }

  function laserValley() {
    distance = 10;
    stars(1900);
    const land = new THREE.PlaneGeometry(72, 86, 144, 128);
    land.rotateX(-Math.PI / 2);
    land.translate(0, -2.6, -31);
    const terrain = surface(land, `
      vec2 cell = local.xz * .78;
      vec2 lines = abs(fract(cell - .5) - .5) / max(fwidth(cell), vec2(.001));
      float grid = exp(-min(lines.x, lines.y) * 1.2);
      float sweep = exp(-pow(sin(local.z * .13 + clock * 1.35) * 3., 2.));
      vec3 color = mix(vec3(.008,.009,.04), vec3(.065,.012,.13), clamp(local.y * .17 + .4, 0., 1.));
      vec3 neon = mix(vec3(.01,.65,1.), vec3(.95,.025,.35), smoothstep(3.,10.,abs(local.x)));
      gl_FragColor = vec4(color + neon * grid * (.3 + sweep) * exp(-abs(local.z) * .022), 1.);
    `, { vertex: `
      float z = p.z - clock * 2.;
      float ridge = sin(p.x * .72 + z * .21) + .55 * cos(z * .61 - p.x * .36);
      p.y += smoothstep(2.4, 11., abs(p.x)) * (3.4 + ridge * 2.1);
    ` });
    const sun = surface(new THREE.CircleGeometry(6.7, 96), `
      float stripes = smoothstep(-.16,.12,sin(coords.y*105. + clock*.65) + (coords.y-.35)*4.);
      if (stripes < .05) discard;
      gl_FragColor = vec4(mix(vec3(1.,.025,.18),vec3(1.,.77,.09),coords.y)*stripes,1.);
    `);
    sun.position.set(0, 4.5, -24);
    halo(0xff345a, 23).position.copy(sun.position);
    const fans = [];
    const ray = new THREE.ConeGeometry(.48, 13, 14, 1, true);
    ray.translate(0, -6.5, 0);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const beam = mesh(ray, basic(i % 3 ? 0x29e8ff : 0xff358f, .12));
        beam.position.set(side * (3.6 + i * .23), -2.4, 2 - i * 1.8);
        beam.rotation.order = 'YXZ';
        fans.push({beam, side, i});
      }
    }
    return t => {
      terrain.material.uniforms.clock.value = sun.material.uniforms.clock.value = t;
      for (const {beam, side, i} of fans) {
        beam.rotation.set(Math.PI + .27 * Math.cos(t*.63 + i*.19), t*.21, side * (.52 + .45*Math.sin(t*.89+i*.36)));
      }
    };
  }

  function blackHole() {
    distance = 10;
    stars(6000);
    const disk = surface(new THREE.RingGeometry(1.22, 5.8, 160, 16), `
      float r = length(local.xy);
      float a = atan(local.y,local.x);
      float phase = 5.*a + 16.*log(r) - clock*3./sqrt(r);
      float gas = .5+.5*sin(r*37. + 2.*sin(phase) + sin(3.*a-clock+r*9.));
      float swirls = .5+.5*cos(phase + 1.2*sin(phase*2.));
      float falloff = exp(-(r-1.22)*.55) * (1.-smoothstep(4.2,5.8,r));
      vec3 color = mix(vec3(.97,.16,.025),vec3(1.,.84,.44),gas*gas);
      gl_FragColor = vec4(color*(.28+gas*.8+swirls*.3), falloff);
    `, { additive: true });
    disk.rotation.set(-1.35, .02, 0);
    mesh(new THREE.SphereGeometry(1.34, 64, 40), mat(new THREE.MeshBasicMaterial({color:0x020106})));
    const lens = surface(new THREE.RingGeometry(1.32, 2.42, 144), `
      float r = length(local.xy);
      float a = atan(local.y,local.x);
      float warp = r - 1.38 - .13*(.5+.5*sin(a));
      float band = exp(-abs(warp)*10.);
      float ripple = .55+.45*sin(warp*140. + 3.*sin(a*7.-clock*1.7));
      gl_FragColor = vec4(mix(vec3(1.,.22,.045),vec3(1.,.93,.72),band), band*(.45+.55*ripple));
    `, { additive: true });
    group.rotation.z = -.21;
    return t => {
      disk.material.uniforms.clock.value = lens.material.uniforms.clock.value = t;
      disk.rotation.x = -1.34 + .12*Math.sin(t*.24);
    };
  }

  function hyperspace() {
    distance = 1;
    const path = new THREE.CylinderGeometry(4, 4, 116, 96, 110, true);
    path.rotateX(Math.PI/2);
    path.translate(0,0,-50);
    const tunnel = surface(path, `
      float depth = -local.z;
      float a = coords.x * 6.2831853;
      float track = a*6. + depth*.17 + .8*sin(depth*.12-clock*.7);
      float runner = depth*.17 + clock*3. + .48*sin(track);
      float rail = filament(track,.004);
      float pulse = filament(runner,.012);
      float tile = filament(a*18.+depth*.2,.01);
      vec3 hue = mix(vec3(.015,.55,1.),vec3(.86,.025,.52),.5+.5*sin(track*.5));
      vec3 c = hue*(.025 + .9*rail + .58*pulse + .13*tile) + vec3(.6,.82,1.)*rail*pulse;
      gl_FragColor = vec4(mix(vec3(.035,.008,.105),c,exp(-max(depth,0.)*.024)),1.);
    `, { vertex: `
      float z = p.z;
      p.xy += vec2(sin(z*.056 + clock*.42), cos(z*.073+clock*.35)) * smoothstep(0.,32.,-z)*5.;
    ` });
    return t => { tunnel.material.uniforms.clock.value=t; tunnel.rotation.z=.16*Math.sin(t*.32); };
  }

  function solarStorm() {
    distance = 8;
    stars(3500);
    const star = surface(new THREE.SphereGeometry(1.95, 96, 64), `
      vec3 p = normalize(local);
      vec3 q = p*5. + vec3(clock*.19,0.,-clock*.13);
      for(int i=0; i<3; i++) q += .62*sin(q.yzx*1.62 + float(i) + clock*.17);
      float fold = sin(q.x*3. + cos(q.z*3.) + sin(q.y*4.));
      float veins = exp(-abs(fold)*6.);
      float hot = .5+.5*sin(q.x+q.y*1.8+q.z);
      vec3 c = mix(vec3(.24,.009,.003),vec3(1.,.36,.018),hot) + vec3(1.,.72,.18)*veins;
      gl_FragColor = vec4(c,1.);
    `);
    halo(0xff5414, 8.8);
    const loops = [];
    for (let i=0; i<16; i++) {
      const base = new THREE.Group();
      base.rotation.set(i*.84, i*2.399, i*.45);
      group.add(base);
      const points = [];
      for (let j=0; j<=44; j++) {
        const a = j*Math.PI/44;
        points.push(new THREE.Vector3(Math.cos(a)*.67,1.7+Math.sin(a)*(1+i%4*.22),.24*Math.sin(2*a)));
      }
      const strand = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),54,.021,6,false),basic(0xffa147,.88),base);
      loops.push(strand);
    }
    return t => {
      star.material.uniforms.clock.value=t;
      group.rotation.y=t*.14;
      loops.forEach((strand,i)=>{
        strand.scale.y=.93+.14*Math.sin(t*1.12+i);
        strand.rotation.y=.55*Math.sin(t*.57+i);
      });
    };
  }

  const extraScenes = createExtraScenes({ THREE, geo, mat, basic, mesh, halo, stars, surface,
    getGroup: () => group, setView: (d, p = 0, y = 0) => { distance = d; pitch = p; yaw = y; } });
  const scenes = [laserValley, blackHole, hyperspace, solarStorm, ...extraScenes];

  function select(effect) {
    if (disposed) return;
    clearScene();
    state.effect = effect;
    autoTime = yaw = pitch = 0;
    group = new THREE.Group();
    world.add(group);
    tick = scenes[effect]();
    onChange();
    render();
  }
  function resize() {
    if(disposed)return;
    const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);
    const cap=state.quality==='eco'?.8:state.quality==='high'?1.75:low?.85:1.25;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,cap,Math.sqrt(2200000/(w*h))));
    renderer.setSize(w,h,false); camera.aspect=w/h;camera.updateProjectionMatrix();render();
  }
  function render() {
    if(disposed||!group)return;
    tick(state.time);
    const drift = state.effect === 2 ? 0 : Math.sin(state.time * .22) * .11;
    const d=distance*(camera.aspect<1.1?1.35:1);
    camera.position.set(Math.sin(yaw + drift)*d, Math.sin(pitch)*d+(state.effect===2?0:1), Math.cos(yaw + drift)*d);
    camera.lookAt(0,state.effect===2?0:-.2,state.effect===2?-25:0);
    renderer.render(world,camera);
  }
  function loop(now) {
    frame=0;if(disposed||document.hidden||state.paused)return;
    const raw=last?now-last:16;last=now;const delta=Math.min(raw/1000,.05);
    state.time+=delta*state.speed;
    if(state.auto){autoTime+=delta;if(autoTime>=20)select((state.effect+1)%scenes.length);}
    if(state.quality==='auto'&&!low){slow=raw>35?slow+1:Math.max(0,slow-1);if(slow>70){low=true;resize();}}
    render(); frame=requestAnimationFrame(loop);
  }
  function refresh() {
    cancelAnimationFrame(frame);frame=0;last=0;
    if(!disposed&&!document.hidden&&!state.paused)frame=requestAnimationFrame(loop);
    else if(!disposed&&!document.hidden)render();
  }
  function dispose() {
    if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer.disconnect();events.abort();
    clearScene();glow.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();
  }
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();if(!disposed)onFailure();},{signal});
  host.addEventListener('pointerdown',event=>{pointer={id:event.pointerId,x:event.clientX,y:event.clientY};host.setPointerCapture(event.pointerId);},{signal});
  host.addEventListener('pointermove',event=>{if(!pointer||pointer.id!==event.pointerId)return;yaw+=(event.clientX-pointer.x)*.004;pitch=Math.max(-.65,Math.min(.65,pitch+(event.clientY-pointer.y)*.004));pointer.x=event.clientX;pointer.y=event.clientY;if(state.paused)render();},{signal});
  const release=()=>{pointer=null;};host.addEventListener('pointerup',release,{signal});host.addEventListener('pointercancel',release,{signal});
  document.addEventListener('visibilitychange',refresh,{signal});
  const observer=new ResizeObserver(resize);observer.observe(host);
  try { select(state.effect);resize();refresh(); } catch(error) { dispose();throw error; }
  return {select,resize,refresh,dispose,resetAuto(){autoTime=0;}};
}
