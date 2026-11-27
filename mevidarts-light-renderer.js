/* Original MeviDarts 35-effect renderer, adapted only for an embeddable canvas API.
 * Rendering code in renderAtmosphere/renderExtra/render comes from
 * eskiya771/mevidarts/client/js/effects.js without changes.
 * Dependencies: mevidarts-parallax.js and mevidarts-showcase.js.
 */
(function(){
 'use strict';
 const EFFECTS = [['aurora', 'Polarlicht'], ['stars', 'Sternenflug'], ['matrix', 'Matrix'], ['plasma', 'Plasma'], ['orbits', 'Lichtspuren'], ['waves', 'Wellen'], ['fireworks', 'Feuerwerk'], ['kaleidoscope', 'Kaleidoskop'], ['lava', 'Lava'], ['network', 'Partikelnetz'], ['tunnel', 'Retro-Tunnel'], ['dvd', 'DVD'], ['bubbles', 'Seifenblasen'], ['snow', 'Schneefall'], ['fireflies', 'Gl\u00fchw\u00fcrmchen'], ['confetti', 'Konfetti'], ['spiral', 'Hypnospirale'], ['eclipse', 'Sonnenfinsternis'], ['grid', 'Neonraster'], ['rainbow', 'Regenbogen'], ...window.MevidartsParallax.scenes, ...window.MevidartsShowcase.scenes];
 function create(canvas){
   if(!canvas||!canvas.getContext)throw Error('MeviDarts canvas missing');
   const ctx=canvas.getContext('2d',{alpha:false});
   if(!ctx)throw Error('2D canvas unavailable');
   let effect='aurora',width=1,height=1,time=0,lastTouchPulse=-Infinity;
   const showcase=window.MevidartsShowcase.create();
   const showcaseIds=new Set(window.MevidartsShowcase.scenes.map(([id])=>id));
   const stars=Array.from({length:220},()=>({x:Math.random()*2-1,y:Math.random()*2-1,z:Math.random()+.02}));
   const parallax=window.MevidartsParallax;
   const sceneCanvas=document.createElement('canvas');
   sceneCanvas.width=parallax.width;sceneCanvas.height=parallax.height;
   const sceneContext=sceneCanvas.getContext('2d');
   const buffer=document.createElement('canvas');
   buffer.width=160;buffer.height=90;
   const pixels=buffer.getContext('2d'),image=pixels.createImageData(160,90);
    const ATMOSPHERE = ['bubbles', 'snow', 'fireflies', 'confetti', 'spiral', 'eclipse', 'grid', 'rainbow'];
    const PARTICLE_COUNT = 90;
    const particleSeeds = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        x: (Math.sin(i * 127.1 + 31) * 43758.5453) % 1,
        phase: i * 2.39996,
        scale: .4 + (i % 13) / 13,
    }));
    const wrap = value => ((value % 1) + 1) % 1;
    function renderAtmosphere() {
        const size = Math.min(width, height);
        if (['bubbles', 'snow', 'fireflies', 'confetti'].includes(effect)) {
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                const p = particleSeeds[i];
                const rising = effect === 'bubbles';
                const x = wrap(p.x + Math.sin(time * .2 + p.phase) * .035) * width;
                const y = wrap(i / PARTICLE_COUNT + time * (rising ? -.025 : .035) * p.scale) * (height + 80) - 40;
                const hue = (i * 37 + time * 5) % 360;
                if (effect === 'bubbles') {
                    const radius = size * .025 * p.scale;
                    const gradient = ctx.createRadialGradient(x - radius * .3, y - radius * .3, 0, x, y, radius);
                    gradient.addColorStop(0, 'hsla(' + hue + ',90%,85%,.18)');
                    gradient.addColorStop(.8, 'hsla(' + hue + ',90%,70%,.02)');
                    gradient.addColorStop(1, 'hsla(' + hue + ',90%,80%,.65)');
                    ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
                    ctx.strokeStyle = '#ffffff80'; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.arc(x, y, radius * .78, -2.6, -1.4); ctx.stroke();
                } else if (effect === 'snow') {
                    ctx.fillStyle = 'rgba(220,240,255,' + (.3 + p.scale * .45) + ')';
                    ctx.beginPath(); ctx.arc(x, y, p.scale * 2.5, 0, Math.PI * 2); ctx.fill();
                } else if (effect === 'fireflies') {
                    const fy = wrap(i / PARTICLE_COUNT + Math.sin(time * .13 + p.phase) * .12) * height;
                    const radius = 5 + p.scale * 7;
                    const glow = ctx.createRadialGradient(x, fy, 0, x, fy, radius);
                    const alpha = .2 + .6 * Math.pow(.5 + .5 * Math.sin(time * 1.3 + p.phase), 2);
                    glow.addColorStop(0, 'rgba(225,255,150,' + alpha + ')'); glow.addColorStop(1, 'rgba(150,255,60,0)');
                    ctx.fillStyle = glow; ctx.fillRect(x - radius, fy - radius, radius * 2, radius * 2);
                } else {
                    ctx.save(); ctx.translate(x, y); ctx.rotate(time * p.scale + p.phase);
                    ctx.fillStyle = 'hsl(' + hue + ',85%,65%)';
                    ctx.fillRect(-4, -6, 8 * Math.cos(time * 2 + p.phase), 12 * p.scale); ctx.restore();
                }
            }
        } else if (effect === 'spiral') {
            ctx.save(); ctx.translate(width / 2, height / 2);
            const radius = Math.hypot(width, height) / 2;
            for (let arm = 0; arm < 5; arm++) {
                ctx.beginPath();
                for (let step = 0; step <= 320; step++) {
                    const r = step / 320 * radius;
                    const angle = step / 320 * Math.PI * 5 + arm * Math.PI * 2 / 5 - time * .35;
                    const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
                    if (step === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.strokeStyle = 'hsla(' + (arm * 60 + time * 8) + ',85%,65%,.65)'; ctx.lineWidth = size * .015; ctx.stroke();
            }
            ctx.restore();
        } else if (effect === 'eclipse') {
            const x = width / 2, y = height / 2, radius = size * .2;
            const halo = ctx.createRadialGradient(x, y, radius * .85, x, y, radius * 2.8);
            halo.addColorStop(0, '#ffddae'); halo.addColorStop(.12, '#ffb65a80'); halo.addColorStop(.5, '#ce5d2220'); halo.addColorStop(1, '#03061100');
            ctx.fillStyle = halo; ctx.fillRect(0, 0, width, height);
            ctx.save(); ctx.translate(x, y);
            for (let i = 0; i < 100; i++) {
                const angle = i * Math.PI * 2 / 100 + time * .015;
                const reach = radius * (1.25 + .2 * Math.sin(i * 7 + time * .4));
                ctx.strokeStyle = 'rgba(255,195,115,.18)'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius); ctx.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach); ctx.stroke();
            }
            ctx.fillStyle = '#02040a'; ctx.beginPath(); ctx.arc(Math.sin(time * .12) * radius * .06, 0, radius * .98, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        } else if (effect === 'grid') {
            const horizon = height * .42;
            const sky = ctx.createLinearGradient(0, 0, 0, height);
            sky.addColorStop(0, '#09051d'); sky.addColorStop(.42, '#31113d'); sky.addColorStop(1, '#030611');
            ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = '#ff7997'; ctx.beginPath(); ctx.arc(width / 2, horizon * .68, size * .12, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#b15afa90'; ctx.lineWidth = 1.5;
            for (let i = -12; i <= 12; i++) {
                ctx.beginPath(); ctx.moveTo(width / 2 + i * width * .015, horizon); ctx.lineTo(width / 2 + i * width * .18, height); ctx.stroke();
            }
            for (let i = 0; i < 24; i++) {
                const depth = wrap(i / 24 + time * .06);
                const y = horizon + depth * depth * (height - horizon);
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
            }
        } else if (effect === 'rainbow') {
            for (let i = 0; i < 70; i++) {
                const x = width * i / 70;
                const gradient = ctx.createLinearGradient(0, 0, 0, height);
                const hue = i * 360 / 70 + time * 12;
                gradient.addColorStop(0, 'hsla(' + hue + ',85%,60%,0)'); gradient.addColorStop(.5, 'hsla(' + hue + ',85%,60%,.8)'); gradient.addColorStop(1, 'hsla(' + hue + ',85%,60%,0)');
                ctx.fillStyle = gradient;
                const offset = Math.sin(i * .15 + time * .5) * height * .2;
                ctx.fillRect(x, offset, width / 70 + 1, height);
            }
        }
    }
    function renderExtra() {
        const size = Math.min(width, height);
        if (effect === 'fireworks') {
            // Deterministic bursts keep pause, resize and tempo independent of frame rate.
            for (let burst = 0; burst < 5; burst++) {
                const age = (time + burst * .83) % 4.2;
                const generation = Math.floor((time + burst * .83) / 4.2);
                const seed = burst * 37 + generation * 19;
                const x = width * (.18 + (.5 + .5 * Math.sin(seed * 7)) * .64);
                const y = height * (.18 + (.5 + .5 * Math.cos(seed * 3)) * .34);
                if (age < .7) {
                    ctx.strokeStyle = '#ffe4bd'; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.moveTo(x, height - (height - y) * age / .7);
                    ctx.lineTo(x, height - (height - y) * age / .7 + 30); ctx.stroke();
                } else {
                    const t = age - .7;
                    for (let i = 0; i < 64; i++) {
                        const angle = i * Math.PI * 2 / 64;
                        const velocity = size * (.12 + .055 * Math.sin(i * 13 + seed));
                        const distance = velocity * (1 - Math.exp(-t));
                        ctx.strokeStyle = 'hsla(' + (seed * 11 + i / 4) + ',95%,70%,' + Math.max(0, 1 - t / 3.5) + ')';
                        ctx.beginPath();
                        ctx.moveTo(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance + t * t * size * .025);
                        ctx.lineTo(x + Math.cos(angle) * distance * .93, y + Math.sin(angle) * distance * .93 + t * t * size * .025); ctx.stroke();
                    }
                }
            }
        } else if (effect === 'kaleidoscope') {
            ctx.save(); ctx.translate(width / 2, height / 2); ctx.rotate(time * .08);
            ctx.globalCompositeOperation = 'lighter';
            for (let sector = 0; sector < 12; sector++) {
                ctx.save(); ctx.rotate(sector * Math.PI / 6);
                for (let i = 0; i < 9; i++) {
                    const radius = size * (.12 + i * .035);
                    const angle = Math.sin(time * .3 + i * .7) * .22;
                    ctx.fillStyle = 'hsla(' + (i * 32 + time * 10) + ',85%,60%,.2)';
                    ctx.beginPath(); ctx.ellipse(Math.cos(angle) * radius, Math.sin(angle) * radius, size * .085, size * .025, time * .2 + i, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            }
            ctx.restore();
        } else if (effect === 'lava') {
            // Small pixel buffer gives merging metaballs without a full-resolution pixel loop.
            const balls = Array.from({ length: 7 }, (_, i) => ({
                x: 80 + Math.sin(time * (.13 + i * .012) + i * 4) * 52,
                y: 45 + Math.cos(time * (.19 + i * .009) + i * 2) * 32,
            }));
            for (let y = 0; y < 90; y++) for (let x = 0; x < 160; x++) {
                let field = 0;
                for (const b of balls) field += 95 / (Math.pow(x - b.x, 2) + Math.pow(y - b.y, 2) + 1);
                const glow = Math.max(0, Math.min(1, (field - .65) * 3));
                const i = (y * 160 + x) * 4;
                image.data[i] = 15 + glow * 235; image.data[i + 1] = 5 + glow * (35 + Math.min(field, 3) * 28);
                image.data[i + 2] = 25 + glow * 55; image.data[i + 3] = 255;
            }
            pixels.putImageData(image, 0, 0); ctx.drawImage(buffer, 0, 0, width, height);
        } else if (effect === 'network') {
            const points = Array.from({ length: 65 }, (_, i) => ({
                x: (.5 + .46 * Math.sin(i * 17 + time * (.06 + i % 5 * .01))) * width,
                y: (.5 + .46 * Math.cos(i * 11 + time * (.08 + i % 3 * .01))) * height,
            }));
            const reach = size * .23;
            points.forEach((p, i) => {
                for (let j = i + 1; j < points.length; j++) {
                    const q = points[j], distance = Math.hypot(p.x - q.x, p.y - q.y);
                    if (distance < reach) {
                        ctx.strokeStyle = 'rgba(95,200,245,' + (1 - distance / reach) * .4 + ')';
                        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
                    }
                }
                ctx.fillStyle = '#b5f5ff'; ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
            });
        } else if (effect === 'tunnel') {
            ctx.save(); ctx.translate(width / 2, height / 2);
            for (let i = 27; i >= 0; i--) {
                const depth = (i + time * 3) % 28;
                const radius = size * .025 * Math.pow(1.17, depth);
                ctx.save(); ctx.rotate(time * .12 + depth * .055);
                ctx.strokeStyle = 'hsla(' + (190 + depth * 5 + time * 9) + ',90%,65%,' + Math.min(1, depth / 5) + ')';
                ctx.lineWidth = 1 + depth / 15; ctx.strokeRect(-radius, -radius, radius * 2, radius * 2); ctx.restore();
            }
            ctx.restore();
        } else if (effect === 'dvd') {
            const logoWidth = Math.min(240, width * .4), logoHeight = logoWidth * .42;
            const bounce = (value, limit) => limit * (1 - Math.abs(value % 2 - 1));
            const tx = time * 70 / Math.max(1, width - logoWidth), ty = time * 53 / Math.max(1, height - logoHeight);
            const x = bounce(tx, width - logoWidth), y = bounce(ty, height - logoHeight);
            ctx.save(); ctx.translate(x + logoWidth / 2, y + logoHeight / 2);
            ctx.fillStyle = 'hsl(' + ((Math.floor(tx) + Math.floor(ty)) * 77 + 160) + ',85%,65%)';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'italic 900 ' + logoWidth * .42 + 'px system-ui';
            ctx.fillText('DVD', 0, -logoHeight * .1);
            ctx.beginPath(); ctx.ellipse(0, logoHeight * .3, logoWidth * .46, logoHeight * .055, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        }
    }
    function render(dt) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = effect === 'orbits' ? 'rgba(3,6,17,.12)' : '#030611'; ctx.fillRect(0, 0, width, height);
        if (showcaseIds.has(effect)) {
            showcase.draw(ctx, width, height, time, effect);
        } else if (effect.startsWith('parallax-')) {
            parallax.draw(sceneContext, time, effect);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(sceneCanvas, 0, 0, width, height);
            ctx.imageSmoothingEnabled = true;
        } else if (ATMOSPHERE.includes(effect)) {
            renderAtmosphere();
        } else if (['fireworks', 'kaleidoscope', 'lava', 'network', 'tunnel', 'dvd'].includes(effect)) {
            renderExtra();
        } else if (effect === 'stars') {
            for (const s of stars) {
                s.z -= dt * .18; if (s.z <= .02) s.z += 1;
                ctx.fillStyle = `rgba(195,225,255,${1 - s.z * .7})`;
                ctx.beginPath(); ctx.arc(width / 2 + s.x * width * .35 / s.z, height / 2 + s.y * height * .35 / s.z, Math.min(4, .7 / s.z), 0, Math.PI * 2); ctx.fill();
            }
        } else if (effect === 'matrix') {
            const size = 24, rows = Math.ceil(height / size) + 14; ctx.font = '20px monospace';
            for (let col = 0; col < Math.ceil(width / size); col++) {
                const head = (time * (5 + Math.sin(col * 9) * 2) + col * 17) % rows;
                for (let j = 0; j < 14; j++) {
                    const row = (head - j + rows) % rows;
                    ctx.fillStyle = j === 0 ? '#d6ffeb' : `rgba(55,230,137,${(1 - j / 14) * .75})`;
                    ctx.fillText(String.fromCharCode(0x30a0 + ((col * 13 + Math.floor(row) * 7 + Math.floor(time * 3)) % 90)), col * size, row * size);
                }
            }
        } else if (effect === 'plasma') {
            for (let y = 0; y < 90; y++) for (let x = 0; x < 160; x++) {
                const v = Math.sin(x / 19 + time * .6) + Math.sin(y / 12 - time * .4) + Math.sin(Math.hypot(x - 80 + Math.sin(time / 3) * 30, y - 45) / 12 - time);
                const i = (y * 160 + x) * 4;
                image.data[i] = 100 + 95 * Math.sin(v + time * .2); image.data[i + 1] = 65 + 60 * Math.sin(v + 2); image.data[i + 2] = 150 + 100 * Math.cos(v + 1); image.data[i + 3] = 255;
            }
            pixels.putImageData(image, 0, 0); ctx.drawImage(buffer, 0, 0, width, height);
        } else if (effect === 'orbits') {
            ctx.globalCompositeOperation = 'lighter'; const radius = Math.min(width, height) * .34;
            for (let i = 0; i < 80; i++) {
                const p = i / 80 * Math.PI * 2;
                ctx.fillStyle = `hsla(${i * 3 + time * 12},85%,65%,.8)`;
                ctx.beginPath(); ctx.arc(width / 2 + Math.sin(time * .43 + p) * radius * Math.cos(time * .13 + p * 2), height / 2 + Math.cos(time * .37 + p * 3) * radius, 2.5, 0, Math.PI * 2); ctx.fill();
            }
        } else {
            const aurora = effect === 'aurora', lines = aurora ? 65 : 36;
            for (let i = 0; i < lines; i++) {
                ctx.beginPath();
                for (let x = 0; x <= width + 12; x += 12) {
                    const y = height * .5 + Math.sin(x / (width * .28) + time * .25 + i * .03) * height * .17 + Math.sin(x / (width * .12) - time * .4 + i * .08) * height * .07 + (i - lines / 2) * height / (aurora ? 180 : 100);
                    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.strokeStyle = `hsla(${aurora ? 155 + i * 1.6 + Math.sin(time / 8) * 25 : 185 + i * 3},80%,65%,${aurora ? .12 : .5})`;
                ctx.lineWidth = aurora ? height / 100 : 1.5; ctx.stroke();
            }
        }
        ctx.globalCompositeOperation = 'source-over';
    }

   function resize(w,h,ratio){
     width=Math.max(1,w);height=Math.max(1,h);
     const scale=Math.min(1.5,Math.max(.5,ratio||1));
     canvas.width=Math.round(width*scale);
     canvas.height=Math.round(height*scale);
     ctx.setTransform(scale,0,0,scale,0,0);
     ctx.clearRect(0,0,width,height);
   }
   function draw(id,t,dt){
     if(!EFFECTS.some(entry=>entry[0]===id))return;
     if(effect!==id){
       effect=id;showcase.reset();lastTouchPulse=-Infinity;
       ctx.clearRect(0,0,width,height);
     }
     time=t;
     // MeviDarts Touch-Magie normally responds to pointer trails. The ambient
     // saver must exit on touch, so emit gentle synthetic pulses while visible.
     if(id==='touch'&&t-lastTouchPulse>=.35){
       const x=.5+Math.sin(t*.37)*.27,y=.5+Math.cos(t*.29)*.23;
       showcase.touch(x,y,t);lastTouchPulse=t;
     }
     render(Math.max(0,Math.min(.05,dt||0)));
   }
   return Object.freeze({resize,draw,touch:(x,y,t)=>showcase.touch(x,y,t),reset:()=>{showcase.reset();lastTouchPulse=-Infinity}});
 }
 window.MevidartsLightRenderer=Object.freeze({effects:EFFECTS,create});
})();