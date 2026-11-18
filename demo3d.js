/* Shared Web/APK app shell. The renderer is loaded only when this app opens. */
(function () {
  'use strict';
  const effects = ['Laser-Show', 'Galaxie', 'Neon-Tunnel', 'Energiekern'];
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const state = { effect: 0, auto: !reduced, paused: !!reduced, speed: 1, quality: 'auto', time: 0 };
  let active = null;
  function html() {
    return `<section class="d3-root" aria-label="3D Demo"><div class="d3-stage"></div>
      <header class="d3-heading"><div><span class="d3-eyebrow">MEVICAR · 3D EXPERIENCE</span><h2>Neon Universe</h2></div><span class="d3-badge">LIVE 3D</span></header>
      <div class="d3-caption"><span class="d3-index">01 / 04</span><strong class="d3-name">Laser-Show</strong><span class="d3-hint">Ziehen verändert die Perspektive</span></div>
      <div class="d3-message" role="status">3D-Szene wird geladen …</div>
      <div class="d3-panel"><div class="d3-effects" role="group" aria-label="3D Effekt">${effects.map((name, i) => `<button type="button" data-effect="${i}" aria-pressed="false"><span>0${i + 1}</span>${name}</button>`).join('')}</div>
      <div class="d3-controls"><button type="button" data-action="pause">Pause</button><button type="button" data-action="auto" aria-pressed="false">Auto-Show</button><label>Tempo <select aria-label="Animationstempo" data-control="speed"><option value="0.5">0,5×</option><option value="1">1×</option><option value="1.5">1,5×</option><option value="2">2×</option></select></label><label>Qualität <select aria-label="Grafikqualität" data-control="quality"><option value="auto">Auto</option><option value="eco">Sparsam</option><option value="high">Hoch</option></select></label></div></div>
    </section>`;
  }
  function paint(session) {
    if (active !== session) return;
    const root = session.root;
    root.querySelectorAll('[data-effect]').forEach((button, i) => button.setAttribute('aria-pressed', String(i === state.effect)));
    root.querySelector('.d3-name').textContent = effects[state.effect];
    root.querySelector('.d3-index').textContent = `0${state.effect + 1} / 04`;
    root.querySelector('[data-action="pause"]').textContent = state.paused ? '▶ Weiter' : 'Ⅱ Pause';
    root.querySelector('[data-action="pause"]').setAttribute('aria-pressed', String(state.paused));
    root.querySelector('[data-action="auto"]').setAttribute('aria-pressed', String(state.auto));
    root.querySelector('[data-control="speed"]').value = String(state.speed);
    root.querySelector('[data-control="quality"]').value = state.quality;
    root.querySelector('.d3-badge').textContent = session.failed ? '3D INAKTIV' : state.paused ? 'PAUSIERT' : state.auto ? 'AUTO · 20 S' : 'LIVE 3D';
  }
  function unmount() {
    if (!active) return;
    const old = active; active = null;
    old.events.abort(); old.renderer?.dispose();
  }
  async function mount() {
    unmount();
    const root = document.querySelector('.d3-root');
    if (!root) return;
    const session = active = { root, events: new AbortController(), renderer: null };
    const signal = session.events.signal;
    paint(session);
    root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.effect !== undefined) {
        state.effect = Number(button.dataset.effect); state.auto = false;
        session.renderer?.select(state.effect);
      } else if (button.dataset.action === 'pause') state.paused = !state.paused;
      else if (button.dataset.action === 'auto') { state.auto = !state.auto; session.renderer?.resetAuto(); }
      else if (button.dataset.action === 'retry') { mount(); return; }
      paint(session); session.renderer?.refresh();
    }, { signal });
    root.addEventListener('change', event => {
      if (event.target.dataset.control === 'speed') state.speed = Number(event.target.value);
      if (event.target.dataset.control === 'quality') { state.quality = event.target.value; session.renderer?.resize(); }
    }, { signal });
    const message = root.querySelector('.d3-message');
    message.hidden = false; message.textContent = '3D-Szene wird geladen …';
    const fail = () => {
      if (active !== session) return;
      session.renderer?.dispose(); session.renderer = null; session.failed = true; paint(session);
      message.hidden = false;
      message.innerHTML = '3D-Grafik ist gerade nicht verfügbar. WebGL 2 wird benötigt.<button type="button" data-action="retry">Erneut versuchen</button>';
    };
    try {
      const { createDemo } = await import('./demo3d-scene.mjs');
      if (active !== session || !root.isConnected) return;
      session.renderer = createDemo(root.querySelector('.d3-stage'), state, () => paint(session), fail);
      message.hidden = true;
    } catch (error) { console.warn('MeviCar 3D Demo:', error); fail(); }
  }
  window.MeviDemo3D = { html, mount, unmount };
})();
