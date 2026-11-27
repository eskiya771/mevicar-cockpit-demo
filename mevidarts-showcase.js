/* Ported without changing renderer logic from eskiya771/mevidarts/client/js/effects-showcase.js for MeviCar Next screensaver. */
/* global window */
(() => {
    'use strict';
    const scenes = [
        ['synthwave', 'Synthwave-Fahrt'], ['underwater', 'Unterwasserwelt'],
        ['blackhole', 'Schwarzes Loch'], ['raincity', 'Pixel-Regenstadt'],
        ['nebula', 'Weltraum-Nebel'], ['glass', 'Glas-Labyrinth'],
        ['japan', 'Japanische Nacht'], ['darts', 'Darts-Galaxie'],
        ['touch', 'Touch-Magie'], ['islands', 'Retro-Spielwelt'],
    ];
    const TAU = Math.PI * 2, MAX_TOUCHES = 80, TOUCH_LIFETIME = 4;
    const seed = n => { const v = Math.sin(n * 127.1 + 37) * 43758.5453; return v - Math.floor(v); };
    const wrap = n => (n % 1 + 1) % 1;
    function circle(c, x, y, r, color) { c.fillStyle = color; c.beginPath(); c.arc(x, y, Math.max(0, r), 0, TAU); c.fill(); }
    function line(c, x, y, xx, yy, color, width = 1) { c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(x, y); c.lineTo(xx, yy); c.stroke(); }
    function glow(c, x, y, r, color) {
        const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, 'transparent');
        c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    function sky(c, w, h, top, bottom) { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, top); g.addColorStop(1, bottom); c.fillStyle = g; c.fillRect(0, 0, w, h); }
    function stars(c, w, h, t, count = 140) {
        for (let i = 0; i < count; i++) circle(c, wrap(seed(i) - t * (.002 + i % 3 * .002)) * w, seed(i + 400) * h, .6 + seed(i + 99) * 1.2, '#c5d7ef');
    }
    function create() {
        let touches = [];
        function touch(x, y, time) {
            touches.push({ x, y, time, hue: touches.length * 43 + time * 25 });
            if (touches.length > MAX_TOUCHES) touches.shift();
        }
        function draw(c, w, h, t, id) {
            const s = Math.min(w, h), cx = w / 2, cy = h / 2;
            c.save();
            if (id === 'synthwave') {
                sky(c, w, h, '#100c32', '#823765');
                circle(c, cx, h * .32, s * .17, '#ff987b');
                c.fillStyle = '#321340';
                for (let i = 0; i < 7; i++) c.fillRect(cx - s * .18, h * .32 + i * s * .022, s * .36, 3 + i * 1.5);
                for (let side = -1; side <= 1; side += 2) {
                    c.fillStyle = '#21133e'; c.beginPath(); c.moveTo(cx, h * .54);
                    for (let i = 0; i <= 12; i++) c.lineTo(cx + side * i * w / 18, h * (.51 - seed(i + 13) * .18));
                    c.lineTo(side < 0 ? 0 : w, h); c.closePath(); c.fill();
                }
                c.fillStyle = '#100f29'; c.beginPath(); c.moveTo(cx - w * .025, h * .51); c.lineTo(cx + w * .025, h * .51); c.lineTo(w * .9, h); c.lineTo(w * .1, h); c.closePath(); c.fill();
                for (const side of [-1, 1]) line(c, cx + side * w * .025, h * .51, cx + side * w * .4, h, '#eb64e7', 3);
                for (let i = 0; i < 18; i++) {
                    const z = wrap(i / 18 + t * .12), depth = z * z;
                    const y = h * (.51 + depth * .49), scale = .08 + depth;
                    c.fillStyle = '#ffd5f1'; c.fillRect(cx - 2 * scale, y, 4 * scale, 18 * scale);
                    for (const side of [-1, 1]) {
                        const x = cx + side * (w * .06 + depth * w * .58), trunk = h * .25 * scale;
                        line(c, x, y, x - side * 12 * scale, y - trunk, '#080d23', 7 * scale);
                        for (let leaf = 0; leaf < 5; leaf++) {
                            const a = -Math.PI + leaf * Math.PI / 4;
                            line(c, x - side * 12 * scale, y - trunk, x + Math.cos(a) * 40 * scale, y - trunk + Math.sin(a) * 25 * scale + 14 * scale, '#12182d', 6 * scale);
                        }
                    }
                }
            } else if (id === 'underwater') {
                sky(c, w, h, '#09667d', '#020c25');
                for (let i = 0; i < 8; i++) {
                    c.fillStyle = 'rgba(100,230,245,.035)'; c.beginPath(); const x = (i / 7 + Math.sin(t * .09 + i) * .05) * w;
                    c.moveTo(x, 0); c.lineTo(x + w * .22, h); c.lineTo(x - w * .04, h); c.closePath(); c.fill();
                }
                for (let i = 0; i < 12; i++) {
                    const x = wrap(seed(i) + Math.sin(t * .1 + i) * .06) * w, y = wrap(seed(i + 15) - t * .014) * (h + 150) - 75, r = s * (.025 + seed(i + 20) * .035);
                    glow(c, x, y, r * 2.6, 'rgba(127,143,255,.16)');
                    c.fillStyle = 'rgba(155,185,255,.35)'; c.beginPath(); c.ellipse(x, y, r, r * .65, 0, Math.PI, TAU); c.fill();
                    for (let j = 0; j < 5; j++) {
                        c.strokeStyle = 'rgba(163,205,255,.45)'; c.lineWidth = 1.3; c.beginPath();
                        for (let k = 0; k <= 18; k++) { const xx = x + (j - 2) * r * .3 + Math.sin(k * .3 + t * 1.5 + j) * r * .17, yy = y + k / 18 * r * 2.3; if (!k) c.moveTo(xx, yy); else c.lineTo(xx, yy); } c.stroke();
                    }
                }
                for (let i = 0; i < 38; i++) {
                    const x = wrap(seed(i + 150) + t * .025) * (w + 60) - 30, y = h * (.3 + seed(i + 210) * .42) + Math.sin(t + i) * 10;
                    c.fillStyle = '#63bcc8'; c.beginPath(); c.ellipse(x, y, 6, 2.5, 0, 0, TAU); c.fill(); c.beginPath(); c.moveTo(x - 5, y); c.lineTo(x - 10, y - 4); c.lineTo(x - 10, y + 4); c.fill();
                }
                for (let i = 0; i < 35; i++) { c.strokeStyle = '#8de3ea60'; c.beginPath(); c.arc(seed(i * 8) * w, wrap(seed(i) - t * .035) * h, 1 + seed(i + 20) * 3, 0, TAU); c.stroke(); }
            } else if (id === 'blackhole') {
                sky(c, w, h, '#050512', '#100922'); stars(c, w, h, t);
                glow(c, cx, cy, s * .45, '#8e3f5020');
                for (let i = 0; i < 1600; i++) {
                    const r = s * (.13 + seed(i) * .29), a = i * 2.39996 + t * (.13 + .2 * (1 - r / s));
                    const x = Math.cos(a) * r, y = Math.sin(a) * r * .25;
                    if (y < 0 || Math.hypot(x, y) > s * .125) circle(c, cx + x, cy + y, .6 + seed(i + 6) * 1.2, 'hsla(' + (20 + seed(i + 4) * 35) + ',100%,75%,.65)');
                }
                c.strokeStyle = '#ffdbaf'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, s * .13, 0, TAU); c.stroke(); circle(c, cx, cy, s * .124, '#010108');
                for (let i = 0; i < 80; i++) {
                    const a = i / 80 * TAU + t * .04, r = s * (.15 + seed(i + 300) * .42);
                    c.strokeStyle = '#c3d4ff60'; c.beginPath(); c.ellipse(cx, cy, r, r, 0, a, a + .015 + .06 * s / (r * 10)); c.stroke();
                }
            } else if (id === 'raincity') {
                sky(c, w, h, '#080c25', '#302145');
                const unit = Math.max(2, Math.floor(s / 160)), ground = h * .73;
                for (let layer = 0; layer < 3; layer++) for (let i = -1; i < 18; i++) {
                    const bw = w / 14, x = i * bw - (t * (2 + layer * 4) % bw), bh = h * (.15 + seed(i + layer * 33) * .38);
                    c.fillStyle = ['#20243f', '#171d36', '#10142c'][layer]; c.fillRect(Math.floor(x / unit) * unit, ground - bh + layer * 24, bw - unit, bh + 40);
                    for (let j = 0; j < 12; j++) if (seed(i * 32 + j + layer) > .5) { c.fillStyle = layer === 2 ? '#e561be' : '#667fa1'; c.fillRect(x + bw * .3, ground - bh + j * 15 + layer * 24, unit * 2, unit); }
                    if (layer === 2 && i % 3 === 0) {
                        const signY = ground - bh * .6; c.fillStyle = i % 2 ? '#53eddb' : '#f275d8'; c.fillRect(x + 4, signY, bw * .65, 14);
                        for (let k = 0; k < 14; k++) { c.globalAlpha = (1 - k / 14) * .25; c.fillRect(x + Math.sin(k + t) * 8, ground + k * h * .019, bw * .7, unit); } c.globalAlpha = 1;
                    }
                }
                for (let i = 0; i < 240; i++) {
                    const x = wrap(seed(i) - t * .09) * w, y = wrap(seed(i + 500) + t * .6) * h;
                    line(c, x, y, x - 4, y + 15, '#bad9ff35');
                }
                for (let i = 0; i < 24; i++) { const a = wrap(t * .5 + seed(i)); c.strokeStyle = 'rgba(156,189,255,' + (1 - a) * .2 + ')'; c.beginPath(); c.ellipse(seed(i + 90) * w, h * (.8 + seed(i) * .2), a * 25, a * 5, 0, 0, TAU); c.stroke(); }
            } else if (id === 'nebula') {
                sky(c, w, h, '#07051b', '#130c25');
                c.globalCompositeOperation = 'lighter';
                for (let i = 0; i < 26; i++) {
                    const x = wrap(seed(i) - t * .008 * (1 + i % 3)) * (w + s) - s / 2, y = seed(i + 70) * h + Math.sin(t * .08 + i) * s * .08;
                    glow(c, x, y, s * (.2 + seed(i + 40) * .3), i % 3 === 0 ? '#a34db455' : i % 3 === 1 ? '#3879ca60' : '#d75b8e48');
                }
                for (let i = 0; i < 75; i++) {
                    const x = wrap(seed(i + 700) - t * .012) * w;
                    const y = h * (.5 + Math.sin(x / w * 7 + t * .05) * .19 + (seed(i + 900) - .5) * .3);
                    glow(c, x, y, s * (.04 + seed(i + 800) * .13), i % 2 ? '#b267d51c' : '#6ca9dd20');
                }
                stars(c, w, h, t, 200); c.globalCompositeOperation = 'source-over';
            } else if (id === 'glass') {
                sky(c, w, h, '#030718', '#0c1331');
                const vanishX = cx + Math.sin(t * .15) * w * .1, vanishY = cy + Math.cos(t * .11) * h * .08;
                for (let i = 27; i >= 0; i--) {
                    const z = wrap(i / 28 + t * .045), r = s * .03 * Math.pow(25, z), angle = t * .08 + i * .08;
                    c.save(); c.translate(vanishX, vanishY); c.rotate(angle);
                    c.fillStyle = 'hsla(' + (185 + i * 7) + ',80%,65%,.025)'; c.strokeStyle = 'hsla(' + (185 + i * 7) + ',90%,75%,' + z * .7 + ')'; c.lineWidth = 1 + z * 2;
                    c.beginPath(); for (let j = 0; j < 6; j++) { const a = j / 6 * TAU; if (!j) c.moveTo(Math.cos(a) * r, Math.sin(a) * r); else c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill(); c.stroke(); c.restore();
                }
            } else if (id === 'japan') {
                sky(c, w, h, '#11162f', '#625077'); circle(c, w * .7, h * .22, s * .075, '#f8e5d6'); glow(c, w * .7, h * .22, s * .2, '#e8ccd315');
                for (let layer = 0; layer < 3; layer++) {
                    c.fillStyle = ['#35324e', '#282c47', '#1c243c'][layer]; c.beginPath(); c.moveTo(0, h * .61);
                    for (let x = 0; x <= w + 10; x += 10) c.lineTo(x, h * (.52 + layer * .035) - Math.pow(Math.max(0, Math.sin(x / w * 6 + layer)), 3) * h * .22);
                    c.lineTo(w, h * .64); c.lineTo(0, h * .64); c.fill();
                }
                c.fillStyle = '#121f39'; c.fillRect(0, h * .64, w, h * .36);
                for (let i = 0; i < 65; i++) { const y = h * (.65 + i / 65 * .35), length = (1 - i / 80) * s * .12; line(c, w * .7 - length + Math.sin(i * 3 + t) * 10, y, w * .7 + length, y, 'rgba(245,207,200,' + (.12 - i / 800) + ')'); }
                c.strokeStyle = '#19192d'; c.lineWidth = s * .025; c.beginPath(); c.moveTo(0, h * .76); c.bezierCurveTo(w * .12, h * .5, w * .05, h * .2, w * .44, h * .16); c.stroke();
                for (let i = 0; i < 190; i++) { const x = seed(i) * w * .45, y = h * (.1 + seed(i + 190) * .22); circle(c, x, y, 2 + seed(i + 5) * 5, i % 2 ? '#c98ba7' : '#e6afc5'); }
                for (let i = 0; i < 65; i++) { const x = wrap(seed(i) + t * .025) * w, y = wrap(seed(i + 7) + t * .035) * h; c.save(); c.translate(x, y); c.rotate(t + i); c.fillStyle = '#efb5d0b0'; c.beginPath(); c.ellipse(0, 0, 3, 1.5, 0, 0, TAU); c.fill(); c.restore(); }
            } else if (id === 'darts') {
                sky(c, w, h, '#05091d', '#14102b'); stars(c, w, h, t);
                const dissolve = Math.pow(.5 + .5 * Math.sin(t * .35), 3);
                c.save(); c.translate(cx, cy); c.scale(1, .8 + Math.sin(t * .2) * .16); c.rotate(t * .08);
                for (let ring = 0; ring < 7; ring++) for (let i = 0; i < 180; i++) {
                    const a = i / 180 * TAU, r = s * (.04 + ring * .047), spread = dissolve * seed(i + ring * 13) * s * .28;
                    circle(c, Math.cos(a) * (r + spread), Math.sin(a) * (r + spread), 1.1, 'hsla(' + (ring % 2 ? 170 : 330) + ',90%,70%,.75)');
                }
                for (let segment = 0; segment < 20; segment++) for (let j = 0; j < 25; j++) { const a = segment / 20 * TAU, r = s * (.08 + j / 25 * .25); circle(c, Math.cos(a) * r * (1 + dissolve * .4), Math.sin(a) * r * (1 + dissolve * .4), .7, '#9eb7ed'); }
                circle(c, 0, 0, s * .012, '#f86b9d'); c.restore();
            } else if (id === 'touch') {
                sky(c, w, h, '#070b22', '#161232');
                // Idle swirls keep this scene alive without interaction.
                for (let i = 0; i < 6; i++) glow(c, cx + Math.sin(t * .17 + i) * w * .35, cy + Math.cos(t * .21 + i * 2) * h * .3, s * .25, 'hsla(' + (i * 60 + t * 10) + ',90%,60%,.12)');
                touches = touches.filter(p => t - p.time < TOUCH_LIFETIME);
                for (const p of touches) {
                    const age = Math.max(0, t - p.time), r = (age * .15 + .015) * s;
                    glow(c, p.x * w, p.y * h, s * .14, 'hsla(' + p.hue + ',95%,65%,' + (1 - age / TOUCH_LIFETIME) * .4 + ')');
                    for (let j = 0; j < 3; j++) { c.strokeStyle = 'hsla(' + (p.hue + j * 20) + ',90%,75%,' + (1 - age / TOUCH_LIFETIME) * .65 + ')'; c.lineWidth = 2; c.beginPath(); c.arc(p.x * w, p.y * h, r + j * 10, age + j, age + j + TAU * .8); c.stroke(); }
                }
            } else if (id === 'islands') {
                sky(c, w, h, '#6677b4', '#c7bfdb');
                for (let layer = 0; layer < 3; layer++) for (let i = 0; i < 6; i++) {
                    const depth = .4 + layer * .3, iw = s * .3 * depth, x = wrap(i / 6 - t * .012 * depth) * (w + iw) - iw;
                    const y = h * (.25 + layer * .22) + Math.sin(i * 7) * h * .06;
                    c.fillStyle = ['#817ba3', '#626a91', '#404c72'][layer]; c.beginPath(); c.moveTo(x, y); c.lineTo(x + iw, y); c.lineTo(x + iw * .6, y + iw * .55); c.lineTo(x + iw * .3, y + iw * .35); c.closePath(); c.fill();
                    c.fillStyle = layer === 2 ? '#4e9a7e' : '#86b5ac'; c.fillRect(x, y - 5 * depth, iw, 8 * depth);
                    c.fillStyle = '#b5e7f09a'; c.fillRect(x + iw * .66, y, iw * .12, h * .35);
                    for (let drop = 0; drop < 12; drop++) { const yy = y + wrap(drop / 12 + t * .3) * h * .35; c.fillStyle = '#d9fbff8a'; c.fillRect(x + iw * .67, yy, iw * .09, 2 * depth); }
                    c.fillStyle = '#244c5a'; c.fillRect(x + iw * .2, y - 25 * depth, 4 * depth, 25 * depth); circle(c, x + iw * .22, y - 29 * depth, 15 * depth, '#438a7b');
                    const walker = x + (wrap(t * .08 + seed(i)) * .6 + .1) * iw;
                    c.fillStyle = '#ffe0b0'; c.fillRect(walker, y - 13 * depth, 5 * depth, 4 * depth); c.fillStyle = '#e47e93'; c.fillRect(walker, y - 9 * depth, 5 * depth, 7 * depth);
                    c.fillStyle = '#27394d'; c.fillRect(walker + Math.sin(t * 8) * 2 * depth, y - 2 * depth, 3 * depth, 3 * depth);
                }
            }
            c.restore();
        }
        return { draw, touch, reset: () => { touches = []; } };
    }
    window.MevidartsShowcase = Object.freeze({ scenes, create });
})();
