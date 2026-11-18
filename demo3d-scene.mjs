import * as THREE from './vendor/three-0.170.0/three.module.min.js';

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
  function stars(count, galaxy = false) {
    const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const r = galaxy ? Math.pow(Math.random(), .6) * 8 : 7 + Math.random() * 24;
      const a = galaxy ? (i % 5) / 5 * Math.PI * 2 + r * .55 + (Math.random() - .5) * .6 : Math.random() * Math.PI * 2;
      positions[i*3] = Math.cos(a)*r; positions[i*3+1] = galaxy ? (Math.random()-.5)*(.2+r*.09) : (Math.random()-.5)*22; positions[i*3+2] = Math.sin(a)*r;
      color.setHSL(galaxy ? .52 + r*.025 : .56 + Math.random()*.24, .8, .5 + Math.random()*.3);
      color.toArray(colors,i*3);
    }
    const geometry = geo(new THREE.BufferGeometry());
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3)); geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    const object = new THREE.Points(geometry,mat(new THREE.PointsMaterial({ size: galaxy ? .11 : .065, map: glow, vertexColors:true, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false })));
    group.add(object); return object;
  }
  function ring(radius, tube, color, parent = group) { return mesh(new THREE.TorusGeometry(radius,tube,8,96),basic(color),parent); }
  function clearScene() { world.clear(); geometries.forEach(g=>g.dispose()); materials.forEach(m=>m.dispose()); geometries.clear(); materials.clear(); }
  function select(effect) {
    if(disposed)return;
    clearScene(); state.effect = effect; autoTime = 0;
    group = new THREE.Group(); world.add(group); yaw = 0; pitch = 0;
    if (effect === 0) {
      distance = 12;
      stars(1500);
      const grid = new THREE.GridHelper(60,60,0x3a1b80,0x112746); grid.position.y = -2.8; group.add(grid); geometries.add(grid.geometry); materials.add(grid.material);
      const nucleus = new THREE.Group(); group.add(nucleus);
      const knot = mesh(new THREE.TorusKnotGeometry(1.15,.025,220,8,2,3),basic(0x72fff4),nucleus);
      const orbit = ring(1.75,.018,0xb866ff,nucleus); orbit.rotation.x = .8;
      halo(0x722bff,5,nucleus);
      const beams = [];
      const cylinder = geo(new THREE.CylinderGeometry(.018,.018,1,6));
      const up = new THREE.Vector3(0,1,0), dir = new THREE.Vector3(), end = new THREE.Vector3();
      for(let i=0;i<20;i++) {
        const pivot = new THREE.Vector3((i-9.5)*.57,-2.7,-1);
        const color = new THREE.Color().setHSL(.48+(i/20)*.35,1,.65);
        const beam = new THREE.Mesh(cylinder,basic(color,.7)); group.add(beam);
        const haze = new THREE.Mesh(cylinder,basic(color,.035)); group.add(haze);
        const foot = halo(color,.7); foot.position.copy(pivot);
        beams.push({beam,haze,pivot});
      }
      tick = t => {
        knot.rotation.set(t*.19,t*.27,0); orbit.rotation.y=t*.3;
        nucleus.position.y=.15+Math.sin(t*.5)*.3;
        beams.forEach(({beam,haze,pivot},i)=>{
          end.set(Math.sin(t*.38+i*.33)*8,5.5+Math.sin(t*.4+i*.7)*2,-5+Math.cos(t*.23+i*.5)*5);
          dir.copy(end).sub(pivot);const length=dir.length();dir.normalize();
          beam.position.copy(pivot).add(end).multiplyScalar(.5);beam.quaternion.setFromUnitVectors(up,dir);beam.scale.y=length;
          haze.position.copy(beam.position);haze.quaternion.copy(beam.quaternion);haze.scale.set(14,length,14);
        });
      };
    } else if(effect === 1) {
      distance=13; const galaxy=stars(16000,true); stars(1300);
      const core=halo(0xafdfff,3.5); const warm=halo(0xffb5fc,1.4); warm.position.y=.1;
      group.rotation.x=.45;
      tick=t=>{ galaxy.rotation.y=t*.065;core.material.opacity=.65+Math.sin(t*.8)*.1; };
    } else if(effect === 2) {
      distance=3.5; stars(1600);
      const rings=[];
      for(let i=0;i<42;i++) {
        const color=new THREE.Color().setHSL(.5+i*.009,1,.6);
        const hoop=mesh(new THREE.TorusGeometry(4.2,.025,6,6),basic(color));
        rings.push(hoop);
      }
      tick=t=>rings.forEach((hoop,i)=>{
        const z=-((i*2.2-t*5)%92+92)%92;
        hoop.position.set(Math.sin(z*.035+t*.3)*1.5,Math.cos(z*.035+t*.3)*1.1,z);
        hoop.rotation.z=z*.035+t*.1;hoop.material.opacity=Math.max(.06,1+z/100);hoop.material.transparent=true;
      });
    } else {
      distance=10; stars(2500);
      const core=mesh(new THREE.IcosahedronGeometry(1.4,2),mat(new THREE.MeshBasicMaterial({color:0x74f5ff,wireframe:true,transparent:true,opacity:.7,blending:THREE.AdditiveBlending})));
      halo(0x614aff,5);halo(0x50ffe3,2.5);
      const orbits=Array.from({length:7},(_,i)=>{const r=ring(2+i*.19,.016,new THREE.Color().setHSL(.48+i*.047,1,.65));r.rotation.set(i*.48,i*.63,0);return r;});
      const count=3500,positions=new Float32Array(count*3);
      for(let i=0;i<count;i++) {const a=Math.random()*Math.PI*2,b=Math.acos(2*Math.random()-1),r=3+Math.random()*2;positions.set([r*Math.sin(b)*Math.cos(a),r*Math.cos(b),r*Math.sin(b)*Math.sin(a)],i*3);}
      const geometry=geo(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
      const particles=new THREE.Points(geometry,mat(new THREE.PointsMaterial({size:.055,map:glow,color:0xa18aff,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false})));group.add(particles);
      tick=t=>{ core.rotation.set(t*.12,t*.21,0);core.scale.setScalar(1+Math.sin(t*1.2)*.08);particles.rotation.y=-t*.07;orbits.forEach((r,i)=>{r.rotation.x=t*.15+i*.48;r.rotation.y=t*(i%2?-.13:.13)+i*.63;}); };
    }
    onChange(); render();
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
    const d=distance*(camera.aspect<1.1?1.35:1);
    camera.position.set(Math.sin(yaw)*d, Math.sin(pitch)*d+(state.effect===1?5:1), Math.cos(yaw)*d);
    camera.lookAt(0,state.effect===2?0:-.2,state.effect===2?-25:0);
    renderer.render(world,camera);
  }
  function loop(now) {
    frame=0;if(disposed||document.hidden||state.paused)return;
    const raw=last?now-last:16;last=now;const delta=Math.min(raw/1000,.05);
    state.time+=delta*state.speed;
    if(state.auto){autoTime+=delta;if(autoTime>=20)select((state.effect+1)%4);}
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
