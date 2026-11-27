/* Shared Web/APK app shell. The renderer is loaded only when this app opens. */
(function () {
  'use strict';
  const effects = ['Laser Valley', 'Black Hole', 'Hyperdrive', 'Solar Storm', 'Neon City', 'Quantum Reactor', 'Crystal Garden', 'Fractal Bloom', 'Gravity Waves'];
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const state = { effect: 0, auto: !reduced, paused: !!reduced, speed: 1, quality: 'auto', time: 0 };
  let active = null;
  function html() {
    return `<section class="d3-root" aria-label="3D Demo"><div class="d3-stage"></div>
      <header class="d3-heading"><div><span class="d3-eyebrow">MEVICAR · 3D EXPERIENCE</span><h2>Neon Universe</h2></div><div class="d3-heading-actions"><span class="d3-badge">LIVE 3D</span><button type="button" class="d3-layout-btn" data-action="immersive" title="Vollbild öffnen" aria-label="Vollbild öffnen"><span aria-hidden="true">⛶</span><span class="d3-layout-label">Vollbild</span></button></div></header>
      <div class="d3-caption"><span class="d3-index">01 / 09</span><strong class="d3-name">Laser Valley</strong><span class="d3-hint">Ziehen verändert die Perspektive</span><div class="d3-switcher"><button type="button" data-action="prev" aria-label="Vorheriger Effekt">‹</button><button type="button" data-action="next" aria-label="Nächster Effekt">›</button></div></div>
      <div class="d3-message" role="status">3D-Szene wird geladen …</div>
      <div class="d3-panel"><div class="d3-effects" role="group" aria-label="3D Effekt">${effects.map((name, i) => `<button type="button" data-effect="${i}" aria-pressed="false"><span>0${i + 1}</span>${name}</button>`).join('')}</div>
      <div class="d3-controls"><button type="button" data-action="pause">Pause</button><button type="button" data-action="auto" aria-pressed="false">Auto-Show</button><label>Tempo <select aria-label="Animationstempo" data-control="speed"><option value="0.5">0,5×</option><option value="1">1×</option><option value="1.5">1,5×</option><option value="2">2×</option></select></label><label>Qualität <select aria-label="Grafikqualität" data-control="quality"><option value="auto">Auto</option><option value="eco">Sparsam</option><option value="high">Hoch</option></select></label></div></div>
    </section>`;
  }
  function paint(session) {
    if (active !== session) return;
    const root = session.root;
    const layoutButton = root.querySelector('[data-action="immersive"]');
    const layoutLabel = session.immersive ? 'Vollbild beenden' : '3D-Animation im Vollbild anzeigen';
    layoutButton.title = layoutLabel;
    layoutButton.setAttribute('aria-label', layoutLabel);
    layoutButton.innerHTML = session.immersive
      ? '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg><span class="d3-layout-label">Schließen</span>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5"/></svg><span class="d3-layout-label">Vollbild</span>';
    root.querySelectorAll('[data-effect]').forEach((button, i) => button.setAttribute('aria-pressed', String(i === state.effect)));
    root.querySelector('.d3-name').textContent = effects[state.effect];
    root.querySelector('.d3-index').textContent = `${String(state.effect + 1).padStart(2, '0')} / ${String(effects.length).padStart(2, '0')}`;
    if (session.lastEffect !== state.effect) {
      session.lastEffect = state.effect;
      root.querySelector(`[data-effect="${state.effect}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
    root.querySelector('[data-action="pause"]').textContent = state.paused ? '▶ Weiter' : 'Ⅱ Pause';
    root.querySelector('[data-action="pause"]').setAttribute('aria-pressed', String(state.paused));
    root.querySelector('[data-action="auto"]').setAttribute('aria-pressed', String(state.auto));
    root.querySelector('[data-control="speed"]').value = String(state.speed);
    root.querySelector('[data-control="quality"]').value = state.quality;
    root.querySelector('.d3-badge').textContent = session.failed ? '3D INAKTIV' : state.paused ? 'PAUSIERT' : state.auto ? 'AUTO · 20 S' : 'LIVE 3D';
  }
  // Move the existing canvas into the document overlay instead of remounting
  // WebGL. This also fills iPhone PWAs, where element.requestFullscreen is unavailable.
  function setImmersive(session, enabled) {
    if (active !== session || session.immersive === enabled) return;
    if (enabled) {
      if (!session.host?.isConnected) return;
      session.immersive = true;
      session.root.classList.add('d3-immersive');
      document.body.appendChild(session.root);
    } else {
      session.immersive = false;
      session.root.classList.remove('d3-immersive');
      if (session.host?.isConnected) session.host.appendChild(session.root);
      else session.root.remove();
    }
    paint(session);
    session.renderer?.resize();
  }
  function unmount() {
    if (!active) return;
    const old = active;
    if (old.immersive) setImmersive(old, false);
    active = null;
    old.events.abort(); old.renderer?.dispose();
  }
  async function mount() {
    unmount();
    const root = document.querySelector('.d3-root');
    if (!root) return;
    const session = active = { root, host: root.parentElement, immersive: false, events: new AbortController(), renderer: null };
    const signal = session.events.signal;
    paint(session);
    root.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.effect !== undefined) {
        state.effect = Number(button.dataset.effect); state.auto = false;
        session.renderer?.select(state.effect);
      } else if (button.dataset.action === 'prev' || button.dataset.action === 'next') {
        const step = button.dataset.action === 'next' ? 1 : -1;
        state.effect = (state.effect + step + effects.length) % effects.length;
        state.auto = false; session.renderer?.select(state.effect);
      } else if (button.dataset.action === 'pause') state.paused = !state.paused;
      else if (button.dataset.action === 'auto') { state.auto = !state.auto; session.renderer?.resetAuto(); }
      else if (button.dataset.action === 'retry') { mount(); return; }
      else if (button.dataset.action === 'immersive') { setImmersive(session, !session.immersive); return; }
      paint(session); session.renderer?.refresh();
    }, { signal });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && session.immersive) setImmersive(session, false);
    }, { signal });
    root.addEventListener('change', event => {
      if (event.target.dataset.control === 'speed') state.speed = Number(event.target.value);
      if (event.target.dataset.control === 'quality') { state.quality = event.target.value; session.renderer?.resize(); }
    }, { signal });
    const message = root.querySelector('.d3-message');
    message.hidden = false; message.textContent = '3D-Szene wird geladen …';
    const fail = reason => {
      if (active !== session) return;
      session.renderer?.dispose(); session.renderer = null; session.failed = true; paint(session);
      message.hidden = false;
      message.innerHTML = (reason === 'load' ? '3D-Szene konnte nicht geladen werden.' : '3D-Grafik ist gerade nicht verfügbar. WebGL 2 wird benötigt.') + '<button type="button" data-action="retry">Erneut versuchen</button>';
    };
    try {
      const { createDemo } = await import('./demo3d-scene.mjs').catch(error => { console.warn('MeviCar 3D Demo (Laden):', error); fail('load'); return {}; });
      if (!createDemo) return;
      if (active !== session || !root.isConnected) return;
      session.renderer = createDemo(root.querySelector('.d3-stage'), state, () => paint(session), fail);
      message.hidden = true;
    } catch (error) { console.warn('MeviCar 3D Demo:', error); fail(); }
  }
  window.MeviDemo3D = { html, mount, unmount };
})();
