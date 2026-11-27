/* global window, document, requestAnimationFrame, cancelAnimationFrame */
(() => {
    'use strict';
    window.createWeatherScene = canvas => {
        const ctx = canvas.getContext('2d');
        const PARTICLES = 90, RATIO_LIMIT = 1.5;
        let width = 1, height = 1, kind = 'cloud', isDay = true, time = 0, last = 0, frame = 0;
        let paused = true; // Calm cockpit by default; motion can be enabled explicitly.
        function render() {
            ctx.clearRect(0, 0, width, height);
            const x = width * .8, y = height * .2, size = Math.min(width, height);
            if (kind === 'sun' || kind === 'clear') {
                const glow = ctx.createRadialGradient(x, y, 0, x, y, size * .6);
                glow.addColorStop(0, isDay ? '#f4cc6c25' : '#a9c6ed17'); glow.addColorStop(1, 'transparent'); ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
                ctx.fillStyle = isDay ? '#f7df9d35' : '#d0e0fa25'; ctx.beginPath(); ctx.arc(x, y, size * .1, 0, Math.PI * 2); ctx.fill();
                if (!isDay) for (let i = 0; i < 60; i++) { ctx.fillStyle = 'rgba(200,225,255,' + (.15 + .15 * Math.sin(i + time * .3)) + ')'; ctx.fillRect((Math.sin(i * 17) * .5 + .5) * width, (Math.cos(i * 23) * .5 + .5) * height, 1.5, 1.5); }
            }
            if (kind !== 'clear') for (let i = 0; i < 6; i++) {
                const xx = ((i / 6 + time * .003) % 1) * (width + 400) - 200, yy = height * (.08 + i % 3 * .15);
                const cloud = ctx.createRadialGradient(xx, yy, 0, xx, yy, size * .45);
                cloud.addColorStop(0, kind === 'rain' || kind === 'storm' ? '#6086ae15' : '#acc9e00d'); cloud.addColorStop(1, 'transparent');
                ctx.fillStyle = cloud; ctx.fillRect(xx - size * .45, yy - size * .45, size * .9, size * .9);
            }
            if (['rain', 'storm', 'snow'].includes(kind)) for (let i = 0; i < PARTICLES; i++) {
                const xx = ((Math.sin(i * 17) * .5 + .5 - time * .008) % 1 + 1) % 1 * width;
                const yy = ((i / PARTICLES + time * (kind === 'snow' ? .018 : .2)) % 1) * height;
                ctx.strokeStyle = '#9ec7f02a'; ctx.fillStyle = '#daedff40'; ctx.lineWidth = 1;
                if (kind === 'snow') { ctx.beginPath(); ctx.arc(xx + Math.sin(time + i) * 12, yy, 1 + i % 3, 0, Math.PI * 2); ctx.fill(); }
                else { ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx - 3, yy + 12); ctx.stroke(); }
            }
        }
        function tick(now) {
            if (paused || document.hidden) { frame = 0; last = 0; return; }
            if (last) time += Math.min(.05, (now - last) / 1000);
            last = now; render(); frame = requestAnimationFrame(tick);
        }
        function sync() { cancelAnimationFrame(frame); frame = 0; last = 0; if (!paused && !document.hidden) frame = requestAnimationFrame(tick); }
        function resize() {
            width = window.innerWidth; height = window.innerHeight;
            const ratio = Math.min(window.devicePixelRatio || 1, RATIO_LIMIT);
            canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); render();
        }
        window.addEventListener('resize', resize); document.addEventListener('visibilitychange', sync);
        resize(); sync();
        return {
            setWeather(next, day) { kind = next; isDay = day; render(); },
            toggle() { paused = !paused; sync(); return paused; },
            get paused() { return paused; },
        };
    };
})();

