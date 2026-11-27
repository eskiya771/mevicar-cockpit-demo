/* Ported without changing renderer logic from eskiya771/mevidarts/client/js/effects-parallax.js for MeviCar Next screensaver. */
/* global window */
(() => {
    'use strict';
    const WIDTH = 480, HEIGHT = 270;
    const SCENES = [
        ['parallax-hills', 'Pixel-H\u00fcgel'],
        ['parallax-forest', 'Zauberwald'],
        ['parallax-city', 'Cyber-City'],
        ['parallax-desert', 'W\u00fcstenreise'],
        ['parallax-space', 'Space-Shooter'],
    ];
    // Fixed logical pixels and seeded scenery: no asset downloads or mutable scene state.
    const seed = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
    function ridge(ctx, time, speed, baseline, amplitude, color, jagged = false) {
        const step = jagged ? 32 : 4;
        const offset = time * speed;
        ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0, HEIGHT);
        for (let x = -step; x <= WIDTH + step; x += step) {
            const world = x + offset;
            const y = baseline - amplitude * (.5 + .32 * Math.sin(world / 69) + .18 * Math.sin(world / 27));
            ctx.lineTo(x, Math.round(y));
        }
        ctx.lineTo(WIDTH, HEIGHT); ctx.closePath(); ctx.fill();
    }
    function objects(ctx, time, speed, spacing, draw) {
        const offset = time * speed;
        const first = Math.floor(offset / spacing);
        for (let i = first - 1; i <= first + Math.ceil(WIDTH / spacing) + 1; i++) draw(Math.round(i * spacing - offset), i);
    }
    function stars(ctx, time, speed, color, count) {
        ctx.fillStyle = color;
        for (let i = 0; i < count; i++) {
            const x = ((seed(i * 3) * WIDTH - time * speed) % WIDTH + WIDTH) % WIDTH;
            ctx.fillRect(Math.floor(x), Math.floor(seed(i * 3 + 1) * 220), i % 7 === 0 ? 2 : 1, 1);
        }
    }
    function draw(ctx, time, scene) {
        ctx.save(); ctx.clearRect(0, 0, WIDTH, HEIGHT);
        const forest = scene === 'parallax-forest', city = scene === 'parallax-city';
        const desert = scene === 'parallax-desert', space = scene === 'parallax-space';
        ctx.fillStyle = space ? '#090b24' : city ? '#160e31' : forest ? '#122a3a' : desert ? '#edaa79' : '#79c9dd';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        if (space || city || forest) stars(ctx, time, 1.5, '#a4bad3', 60);
        if (!space) {
            ctx.fillStyle = city ? '#ff849f' : forest ? '#d4f2ca' : desert ? '#ffe2a1' : '#fff0ba';
            ctx.beginPath(); ctx.arc(365, 59, desert ? 29 : 19, 0, Math.PI * 2); ctx.fill();
        }
        if (space) {
            stars(ctx, time, 9, '#89b2ef', 45); stars(ctx, time, 28, '#eff8ff', 24);
            ctx.fillStyle = '#51477a'; ctx.beginPath(); ctx.arc(365 - Math.sin(time * .01) * 14, 92, 49, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#6f6091'; ctx.fillRect(325, 76, 75, 7); ctx.fillRect(319, 90, 91, 5); ctx.fillRect(327, 108, 68, 4);
            objects(ctx, time, 20, 130, (x, i) => {
                const y = 180 + seed(i) * 55;
                ctx.fillStyle = '#41415d'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 17, y - 13); ctx.lineTo(x + 36, y - 5); ctx.lineTo(x + 43, y + 13); ctx.lineTo(x + 16, y + 20); ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#61617b'; ctx.fillRect(x + 13, y - 3, 8, 6);
            });
            const sy = 115 + Math.sin(time * .9) * 22;
            ctx.fillStyle = '#ffb75e'; ctx.fillRect(82 - Math.floor(time * 12) % 4, sy + 5, 15, 6);
            ctx.fillStyle = '#ecf5ef'; ctx.fillRect(96, sy, 27, 16); ctx.fillRect(116, sy + 5, 20, 6);
            ctx.fillStyle = '#65d8ef'; ctx.fillRect(108, sy + 2, 11, 5);
            ctx.fillStyle = '#ac7fe0'; ctx.fillRect(98, sy - 6, 10, 6); ctx.fillRect(98, sy + 16, 10, 6);
        } else if (city) {
            [ [4, '#292345', 115], [11, '#36305a', 158], [25, '#151d3a', 216] ].forEach(([speed, color, base], layer) => {
                objects(ctx, time, speed, 34, (x, i) => {
                    const h = 25 + Math.floor(seed(i + layer * 50) * 77);
                    ctx.fillStyle = color; ctx.fillRect(x, base - h, 29, HEIGHT - base + h);
                    ctx.fillRect(x + 7, base - h - 6, 2, 6);
                    for (let row = 0; row < h / 9 - 1; row++) for (let col = 0; col < 3; col++) {
                        if (seed(i * 17 + row * 3 + col) > .4) { ctx.fillStyle = layer === 2 ? '#ed75bd' : '#8b83be'; ctx.fillRect(x + 4 + col * 8, base - h + 7 + row * 9, 3, 3); }
                    }
                    if (layer === 2 && i % 3 === 0) { ctx.fillStyle = '#59e8d5'; ctx.fillRect(x + 3, base - h + 17, 20, 5); }
                });
            });
            ctx.fillStyle = '#101529'; ctx.fillRect(0, 242, WIDTH, 28);
            objects(ctx, time, 55, 44, x => { ctx.fillStyle = '#d98cc8'; ctx.fillRect(x, 255, 23, 2); });
        } else if (forest) {
            ridge(ctx, time, 3, 147, 45, '#214052');
            [ [7, 175, '#244f59'], [17, 214, '#1b4046'], [37, 267, '#0c292d'] ].forEach(([speed, base, color], layer) => {
                objects(ctx, time, speed, 34 + layer * 13, (x, i) => {
                    const h = 40 + seed(i + layer * 13) * 65;
                    ctx.fillStyle = color; ctx.fillRect(x + 10, base - h, 5 + layer * 2, h);
                    for (let j = 0; j < 3; j++) { const top = base - h - 16 + j * 18; ctx.beginPath(); ctx.moveTo(x + 13, top); ctx.lineTo(x - 9 - j * 4, top + 40); ctx.lineTo(x + 35 + j * 4, top + 40); ctx.closePath(); ctx.fill(); }
                });
                ridge(ctx, time, speed, base + 9, 13, color);
            });
            for (let i = 0; i < 18; i++) { ctx.fillStyle = '#d5efa9'; ctx.fillRect(seed(i) * WIDTH + Math.sin(time * .5 + i) * 8, 170 + seed(i + 9) * 80 + Math.cos(time * .7 + i) * 5, 1, 2); }
        } else {
            ridge(ctx, time, 3, 142, 68, desert ? '#b97579' : '#709ca7', true);
            ridge(ctx, time, 9, 187, 62, desert ? '#d98a67' : '#488a8a');
            ridge(ctx, time, 22, 225, 49, desert ? '#edb477' : '#39775e');
            if (desert) {
                objects(ctx, time, 36, 115, (x, i) => {
                    const y = 230 + seed(i) * 15; ctx.fillStyle = '#694f52';
                    ctx.fillRect(x + 8, y - 34, 7, 36); ctx.fillRect(x, y - 23, 9, 6); ctx.fillRect(x, y - 32, 5, 10); ctx.fillRect(x + 15, y - 16, 10, 6); ctx.fillRect(x + 21, y - 27, 5, 15);
                });
            } else {
                objects(ctx, time, 5, 125, (x, i) => { const y = 32 + seed(i) * 30; ctx.fillStyle = '#d9eef0'; ctx.fillRect(x, y, 38, 8); ctx.fillRect(x + 8, y - 7, 23, 8); });
                objects(ctx, time, 36, 85, (x, i) => {
                    const y = 233 + seed(i) * 12; ctx.fillStyle = '#235743'; ctx.fillRect(x + 8, y - 25, 4, 28);
                    ctx.beginPath(); ctx.moveTo(x + 10, y - 48); ctx.lineTo(x - 9, y - 12); ctx.lineTo(x + 30, y - 12); ctx.closePath(); ctx.fill();
                });
            }
            ridge(ctx, time, 47, 276, 22, desert ? '#a86c57' : '#244d3b');
            objects(ctx, time, 47, 24, (x, i) => { ctx.fillStyle = desert ? '#d79769' : '#70a563'; ctx.fillRect(x, 258 + seed(i) * 10, 7, 2); });
        }
        ctx.restore();
    }
    window.MevidartsParallax = Object.freeze({ scenes: SCENES, width: WIDTH, height: HEIGHT, draw });
})();
