/* Additional procedural MeviCar 3D worlds.
 * All effects share the parent renderer, resource tracking and animation clock.
 * No external assets or network access required. */
export function createExtraScenes({ THREE, geo, mat, basic, mesh, halo, stars, surface, getGroup, setView }) {
  const TAU = Math.PI * 2;
  const noise = (a, b) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); };
  const instance = (geometry, material, count) => {
    const object = new THREE.InstancedMesh(geo(geometry), mat(material), count);
    object.frustumCulled = false;
    getGroup().add(object);
    return object;
  };

  function neonCity() {
    setView(21, .42, .3);
    stars(1450);
    const floor = new THREE.PlaneGeometry(49, 49);
    floor.rotateX(-Math.PI / 2); floor.translate(0, -1.82, 0);
    const road = surface(floor,
      'vec2 q=local.xz/2.55; vec2 f=abs(fract(q)-.5); float lanes=exp(-min(f.x,f.y)*115.);' +
      'float flow=pow(.5+.5*sin(local.z*.95+clock*2.5),12.);' +
      'vec3 base=vec3(.012,.016,.055); vec3 c=base+vec3(.02,.48,1.)*lanes*(.22+.9*flow);' +
      'gl_FragColor=vec4(c,1.);');
    const lots = [];
    for (let x=-7; x<=7; x++) for (let z=-7; z<=7; z++) {
      if (x===0 || z===0 || (Math.abs(x)===1 && Math.abs(z)<3)) continue;
      const r = noise(x, z), h = 1.2 + Math.pow(r, 2.3) * 8.8;
      lots.push({x:x*2.55,z:z*2.55,h,kind:noise(z,x)});
    }
    const blocks = instance(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({color:0x223d74}), lots.length);
    const trims = instance(new THREE.BoxGeometry(1.015, 1, 1.015),
      new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.75,blending:THREE.AdditiveBlending,depthWrite:false}), lots.length*3);
    const dummy = new THREE.Object3D(), shade = new THREE.Color();
    lots.forEach(({x,z,h,kind},i)=>{
      dummy.position.set(x,-1.82+h*.5,z); dummy.scale.set(1.25,h,1.25); dummy.rotation.set(0,0,0);
      dummy.updateMatrix(); blocks.setMatrixAt(i,dummy.matrix);
      shade.setHSL(.59+kind*.2,.68,.11+kind*.12); blocks.setColorAt(i,shade);
      for(let b=0;b<3;b++){
        dummy.position.y=-1.82+h*(.25+b*.25);
        dummy.scale.set(1.3,.035,1.3); dummy.updateMatrix();
        const k=i*3+b;trims.setMatrixAt(k,dummy.matrix);
        shade.setHSL(kind>.7?.88:.51+kind*.15,.96,.52);trims.setColorAt(k,shade);
      }
    });
    blocks.instanceMatrix.needsUpdate=true; trims.instanceMatrix.needsUpdate=true;
    const drones = Array.from({length:9},(_,i)=>{
      const dot=halo(i%2?0xff3bd4:0x27efff,1.1);return {dot,i};
    });
    return t=>{
      road.material.uniforms.clock.value=t;
      const group=getGroup();group.rotation.y=.08*Math.sin(t*.12);
      drones.forEach(({dot,i})=>{
        const a=t*(.24+i*.025)+i*TAU/9, radius=4+(i%3)*4;
        dot.position.set(Math.cos(a)*radius,2.4+(i%5)*1.25+Math.sin(t*1.7+i)*.3,Math.sin(a)*radius);
      });
    };
  }

  function quantumReactor() {
    setView(10,.17,.15);stars(1900);
    const core=surface(new THREE.SphereGeometry(1.72,72,48),
      'vec3 p=normalize(local);vec3 v=p*8.+vec3(clock*.8,-clock*.5,clock*.24);' +
      'for(int i=0;i<3;i++){v+=.47*sin(v.yzx*1.8+float(i)*2.1+clock*.36);}' +
      'float fil=exp(-abs(sin(v.x*2.6+sin(v.z*2.5)))*7.);' +
      'float heat=.5+.5*sin(v.y*2.8+v.x*1.7+clock*1.7);' +
      'vec3 c=mix(vec3(.015,.035,.3),vec3(.04,.9,1.),heat)+vec3(1.,.19,.72)*fil;' +
      'gl_FragColor=vec4(c,1.);');
    halo(0x22dfff,7.5);
    const rings=[];
    for(let i=0;i<6;i++){
      const ring=mesh(new THREE.TorusGeometry(2.45+i*.37,.016+i%2*.012,8,144),
        basic(i%3===0?0xff44c8:i%3===1?0x2decff:0xeee8ff,.84));
      ring.rotation.set(i*.58,i*.73,i*.94);rings.push(ring);
    }
    const knots=[];
    for(let i=0;i<3;i++){
      const knot=mesh(new THREE.TorusKnotGeometry(2.75+i*.19,.026,240,5,2,5),
        basic(i===0?0x21caff:i===1?0xff42c5:0x7557ff,.65));
      knot.rotation.set(i*1.4,i*.8,.3);knots.push(knot);
    }
    const orbs=Array.from({length:16},(_,i)=>({dot:halo(i%3?0x38eaff:0xff58cb,.4+(i%4)*.16),i}));
    return t=>{
      core.material.uniforms.clock.value=t;
      rings.forEach((ring,i)=>{ring.rotation.x=i*.58+t*(.11+i*.013);ring.rotation.y=i*.73-t*(.17+i*.02);});
      knots.forEach((k,i)=>{k.rotation.z=t*(i%2?.22:-.26);k.rotation.y=t*.11+i*.8;});
      orbs.forEach(({dot,i})=>{
        const a=t*(.43+i*.012)+i*TAU/16;
        dot.position.set(Math.cos(a)*(3.2+i%3*.27),Math.sin(a*1.8+i)*1.65,Math.sin(a)*(3.2+i%3*.27));
      });
    };
  }

  function crystalGarden() {
    setView(14,.4,.2);stars(2100);
    const plane=new THREE.PlaneGeometry(32,32);
    plane.rotateX(-Math.PI/2);plane.translate(0,-1.8,0);
    const ground=surface(plane,
      'float r=length(local.xz);float rings=exp(-pow(sin(r*3.4-clock*1.3),2.)*18.);' +
      'vec2 cell=abs(fract(local.xz*.7)-.5);float g=exp(-min(cell.x,cell.y)*28.);' +
      'vec3 c=vec3(.009,.017,.065)+rings*vec3(.12,.42,.72)*exp(-r*.12)+g*vec3(.09,.03,.22);' +
      'gl_FragColor=vec4(c,1.);');
    const crystals=instance(new THREE.ConeGeometry(.5,1,5),new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide}),120);
    const dummy=new THREE.Object3D(),shade=new THREE.Color();
    for(let i=0;i<120;i++){
      const a=i*2.399963, r=Math.sqrt((i+.5)/120)*10.8;
      const h=.65+noise(i,31)*3.7+(r<3?1.6:0);
      dummy.position.set(Math.cos(a)*r,-1.8+h*.5,Math.sin(a)*r);
      dummy.scale.set(.55+noise(i,13)*.7,h,.55+noise(i,19)*.7);
      dummy.rotation.set(0,a,noise(i,17)*.18);dummy.updateMatrix();
      crystals.setMatrixAt(i,dummy.matrix);
      shade.setHSL(.5+noise(i,77)*.32,.93,.26+noise(i,27)*.35);crystals.setColorAt(i,shade);
    }
    crystals.instanceMatrix.needsUpdate=true;
    const halos=[];
    for(let i=0;i<9;i++){
      const ring=mesh(new THREE.TorusGeometry(2+i*.95,.024,6,100),basic(i%2?0xa83cff:0x29eaff,.65));
      ring.rotation.x=Math.PI/2;ring.position.y=-1.65+i*.014;halos.push(ring);
    }
    const shards=[];
    for(let i=0;i<28;i++){
      const shard=mesh(new THREE.OctahedronGeometry(.18+noise(i,43)*.35,0),
        basic(i%3?0x4eefff:0xf54fff,.55));
      shards.push({shard,i});
    }
    halo(0x744cff,7).position.set(0,1.1,0);
    return t=>{
      ground.material.uniforms.clock.value=t;
      getGroup().rotation.y=t*.05;
      halos.forEach((h,i)=>{h.scale.setScalar(1+.045*Math.sin(t*.75+i));});
      shards.forEach(({shard,i})=>{
        const a=t*(.16+i%4*.03)+i*TAU/28,r=2.5+(i%6)*1.38;
        shard.position.set(Math.cos(a)*r,.2+(i%5)*.58+Math.sin(t+i)*.4,Math.sin(a)*r);
        shard.rotation.set(t*.37+i,t*.23,0);
      });
    };
  }

  function fractalBloom() {
    setView(11,.12,.16);stars(1300);
    const flower=surface(new THREE.IcosahedronGeometry(2.12,5),
      'vec3 p=normalize(local);float a=atan(p.y,p.x);float b=acos(clamp(p.z,-1.,1.));' +
      'float f=sin(a*12.+clock*.6)*cos(b*18.-clock*.8);' +
      'float veins=exp(-pow(sin(a*18.+b*24.+4.*f-clock),2.)*14.);' +
      'float glow=.5+.5*sin(b*16.+a*8.-clock*1.4);' +
      'vec3 c=mix(vec3(.09,.012,.39),vec3(.96,.06,.65),glow)+vec3(.2,.96,1.)*veins;' +
      'gl_FragColor=vec4(c,1.);');
    halo(0xff3fdb,7.5);
    const shards=instance(new THREE.IcosahedronGeometry(.22,0),
      new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.84,blending:THREE.AdditiveBlending,depthWrite:false}),112);
    const dummy=new THREE.Object3D(),shade=new THREE.Color();
    for(let i=0;i<112;i++){
      shade.setHSL(.49+(i%9)/30,.95,.6);shards.setColorAt(i,shade);
    }
    const shells=[];
    for(let i=0;i<3;i++){
      const shell=mesh(new THREE.IcosahedronGeometry(3.4+i*.58,2),
        mat(new THREE.MeshBasicMaterial({color:i===1?0xff33d4:0x38bbff,wireframe:true,transparent:true,opacity:.14,blending:THREE.AdditiveBlending,depthWrite:false})));
      shells.push(shell);
    }
    return t=>{
      flower.material.uniforms.clock.value=t;
      flower.rotation.set(t*.1,t*.15,t*.045);
      shells.forEach((s,i)=>{s.rotation.set(t*(.12+i*.07),t*(i%2?-.1:.17),t*.07);});
      for(let i=0;i<112;i++){
        const a=i*2.399963+t*(.18+i%4*.013),v=(i+.5)/112;
        const z=1-2*v,r=Math.sqrt(Math.max(0,1-z*z));
        const rad=3.6+Math.sin(t*.9+i)*.38+(i%5)*.2;
        dummy.position.set(Math.cos(a)*r*rad,Math.sin(a)*r*rad,z*rad);
        dummy.rotation.set(t*.8+i,t*.6,0);dummy.scale.setScalar(.7+(i%5)*.18);
        dummy.updateMatrix();shards.setMatrixAt(i,dummy.matrix);
      }
      shards.instanceMatrix.needsUpdate=true;
    };
  }

  function gravityWaves() {
    setView(13,.4,.24);stars(900);
    const sheets=[];
    for(let i=0;i<3;i++){
      const plane=new THREE.PlaneGeometry(25,36,92,116);
      plane.rotateX(-Math.PI/2);plane.translate(0,-1.9+i*.35,-4);
      const layer=surface(plane,
        'float wave=sin(local.x*.95+local.z*.45-clock*1.8)+cos(local.z*.71-clock*.8);' +
        'float rings=exp(-pow(sin(length(local.xz)*2.6-clock*1.5),2.)*27.);' +
        'float lines=exp(-pow(sin(local.x*3.1+wave*1.3),2.)*39.);' +
        'vec3 c=vec3(.012,.02,.095)+vec3(.02,.66,1.)*lines+vec3(.94,.05,.65)*rings*.7;' +
        'gl_FragColor=vec4(c,1.);',
        {additive:i>0,vertex:
          'p.y+=sin(p.x*.57+clock*1.1)*.95+cos(p.z*.48-clock*.72)*1.05+' +
          '.48*sin((p.x+p.z)*.9+clock*1.4);'});
      sheets.push(layer);
    }
    const rings=[];
    for(let i=0;i<7;i++){
      const ring=mesh(new THREE.TorusGeometry(1+i*.36,.014,6,140),
        basic(i%2?0xff47cd:0x4cefff,.65));
      ring.position.set(0,1.2,0);ring.rotation.set(i*.39,i*.6,i*.19);rings.push(ring);
    }
    halo(0x265fff,8).position.set(0,-.8,-5);
    return t=>{
      sheets.forEach((s,i)=>{s.material.uniforms.clock.value=t+i*.57;});
      rings.forEach((ring,i)=>{
        ring.rotation.y=t*(.13+i*.02)+i*.6;
        ring.rotation.x=i*.39+t*.1;
        ring.position.y=1.2+Math.sin(t*.62+i*.45)*.6;
      });
    };
  }
  return [neonCity, quantumReactor, crystalGarden, fractalBloom, gravityWaves];
}
