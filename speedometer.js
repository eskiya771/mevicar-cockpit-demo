/* MeviCar Next premium speedometer.
   Two analog gauges, GPS trip, compass and a clearly marked demo mode.
   Odometer and RPM stay empty until a real vehicle source is ingested. */
(function () {
  'use strict';

  const SPEED_MAX = 220;
  const RPM_MAX = 8000;
  const RPM_RED = 6500;
  const SWEEP = 240;
  const ZERO = -120;
  const TRIP_KEY = 'mevicar-tacho-trip-v1';
  const DIRS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];

  function needleAngle(value, max) {
    const n = Number(value);
    const limit = Number(max);
    if (!Number.isFinite(n) || !Number.isFinite(limit) || limit <= 0) return ZERO;
    const clamped = Math.min(limit, Math.max(0, n));
    return ZERO + (clamped / limit) * SWEEP;
  }

  function clampReading(value, max) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.min(max, n);
  }

  function cardinal(deg) {
    if (!Number.isFinite(deg)) return null;
    const n = ((deg % 360) + 360) % 360;
    return DIRS[Math.round(n / 45) % 8];
  }

  function haversineKm(a, b) {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lon - a.lon) * Math.PI / 180;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function acceptTrackPoint(prev, point) {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return { ok: false, reason: 'invalid' };
    if (Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) return { ok: false, reason: 'invalid' };
    if (point.accuracy != null && !(point.accuracy >= 0 && point.accuracy <= 80)) return { ok: false, reason: 'accuracy' };
    if (!prev) return { ok: true, km: 0 };
    if (!Number.isFinite(point.time) || !Number.isFinite(prev.time) || point.time <= prev.time) return { ok: false, reason: 'time' };
    const km = haversineKm(prev, point);
    const hours = (point.time - prev.time) / 3600000;
    if (!(hours > 0) || km / hours > 230) return { ok: false, reason: 'spike' };
    if (km < 0.003) return { ok: true, km: 0 };
    return { ok: true, km };
  }

  function approach(current, target, dt, reduced) {
    const from = Number.isFinite(current) ? current : 0;
    const to = Number.isFinite(target) ? target : 0;
    if (reduced || !Number.isFinite(dt) || dt <= 0) return to;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 9);
    return from + (to - from) * k;
  }

  function demoFrame(phaseSeconds) {
    const t = Number.isFinite(phaseSeconds) ? phaseSeconds : 0;
    const speedKmh = Math.max(0, Math.min(SPEED_MAX, 86 + Math.sin(t * 0.37) * 70 + Math.sin(t * 1.1) * 8));
    const rpm = Math.max(0, Math.min(RPM_MAX, 1100 + speedKmh * 34 + Math.sin(t * 1.7) * 350));
    const headingDeg = ((t * 12) % 360 + 360) % 360;
    return { speedKmh, rpm, headingDeg, tripPerSecondKm: speedKmh / 3600 };
  }

  function speedMarks() {
    return Array.from({ length: SPEED_MAX / 20 + 1 }, (_, i) => i * 20);
  }

  function rpmMarks() {
    return Array.from({ length: RPM_MAX / 1000 + 1 }, (_, i) => i * 1000);
  }

  function emptyModel(mode) {
    return {
      speedKmh: null,
      rpm: null,
      odometerKm: null,
      tripKm: 0,
      headingDeg: null,
      gpsAccuracyM: null,
      altitudeM: null,
      source: { speed: 'unavailable', rpm: 'unavailable', odometer: 'unavailable', trip: 'unavailable', heading: 'unavailable' },
      mode: mode || 'live'
    };
  }

  function formatFixed(value, digits) {
    if (!Number.isFinite(value)) return '—';
    return value.toFixed(digits).replace('.', ',');
  }

  function formatInt(value) {
    if (!Number.isFinite(value)) return '—';
    return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function polar(value, max, radius) {
    const a = needleAngle(value, max) * Math.PI / 180;
    return [120 + radius * Math.sin(a), 120 - radius * Math.cos(a)];
  }

  function arc(from, to, max, radius) {
    const a0 = needleAngle(from, max) * Math.PI / 180;
    const a1 = needleAngle(to, max) * Math.PI / 180;
    const [x0, y0] = polar(from, max, radius);
    const [x1, y1] = polar(to, max, radius);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return 'M ' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A ' + radius + ' ' + radius + ' 0 ' + large + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2);
  }

  function gaugeSvg(opts) {
    const marks = opts.step >= 1000 ? rpmMarks() : speedMarks();
    const ticks = marks.map(function (value) {
      const [x1, y1] = polar(value, opts.max, 98);
      const [x2, y2] = polar(value, opts.max, 88);
      const [lx, ly] = polar(value, opts.max, 76);
      const red = opts.redFrom != null && value >= opts.redFrom;
      const label = opts.step >= 1000 ? String(value / 1000) : String(value);
      return '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" class="tacho-tick' + (red ? ' is-red' : '') + '"/>' +
        '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" class="tacho-num' + (red ? ' is-red' : '') + '">' + label + '</text>';
    }).join('');
    const red = opts.redFrom == null ? '' : '<path class="tacho-redzone" d="' + arc(opts.redFrom, opts.max, opts.max, 102) + '"/>';
    return '<svg viewBox="0 0 240 240" role="img" aria-label="' + opts.label + '">' +
      '<defs><radialGradient id="' + opts.face + '" cx="50%" cy="42%" r="68%"><stop class="tacho-stop-hi" offset="0"/><stop class="tacho-stop-mid" offset="70%"/><stop offset="100%" stop-color="#03070c"/></radialGradient></defs>' +
      '<circle cx="120" cy="120" r="116" class="tacho-bezel"/><circle cx="120" cy="120" r="106" fill="url(#' + opts.face + ')"/>' +
      '<path class="tacho-track" d="' + arc(0, opts.max, opts.max, 102) + '"/>' + red + ticks +
      '<ellipse class="tacho-glint" cx="92" cy="68" rx="46" ry="18"/>' +
      (opts.unitNote ? '<text x="120" y="206" class="tacho-scale-note">' + opts.unitNote + '</text>' : '') +
      '<g id="' + opts.needleId + '" class="tacho-needle" transform="rotate(-120 120 120)"><polygon points="120,28 115.5,124 120,132 124.5,124"/><circle cx="120" cy="120" r="7"/></g>' +
      '</svg>';
  }

  function readTrip() {
    try {
      const saved = JSON.parse(localStorage.getItem(TRIP_KEY) || '{}');
      if (Number.isFinite(saved.tripKm) && saved.tripKm >= 0 && saved.tripKm < 100000) return saved.tripKm;
    } catch (err) { /* private mode or blocked storage */ }
    return 0;
  }

  function writeTrip(km) {
    try { localStorage.setItem(TRIP_KEY, JSON.stringify({ tripKm: km })); } catch (err) { /* ignore */ }
  }

  const live = emptyModel('live');
  live.tripKm = readTrip();
  const demo = emptyModel('demo');
  let mode = 'live';
  let phase = 0;
  let root = null;
  let observer = null;
  let raf = 0;
  let lastFrame = 0;
  let shownSpeed = 0;
  let shownRpm = 0;
  let shownHeading = 0;
  let headingReady = false;
  let gpsWatch = null;
  let gpsWanted = false;
  let lastPoint = null;
  let orientOn = false;
  let compassWanted = false;
  let reduced = false;

  function reducedMotion() {
    try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (err) { return false; }
  }

  function view() {
    return mode === 'demo' ? demo : live;
  }

  function html(compact) {
    const speed = gaugeSvg({
      max: SPEED_MAX, step: 20, needleId: 'tachoSpeedNeedle', face: 'tachoFaceSpeed',
      label: 'Tachometer 0 bis 220 km/h'
    });
    const rpm = gaugeSvg({
      max: RPM_MAX, step: 1000, redFrom: RPM_RED, needleId: 'tachoRpmNeedle', face: 'tachoFaceRpm',
      label: 'Drehzahlmesser 0 bis 8000 U/min', unitNote: '×1000'
    });
    return '<section class="tacho-app' + (compact ? ' is-compact' : '') + '" data-layout="' + (compact ? 'split' : 'full') + '" data-speed-max="220" data-rpm-max="8000" aria-label="Premium-Tacho">' +
      '<header class="tacho-status"><span id="tachoMode" class="tacho-badge">LIVE</span><span id="tachoStatus">GPS nicht gestartet</span><span id="tachoSources">RPM · keine OBD</span></header>' +
      '<div class="tacho-cluster">' +
        '<div class="tacho-dial tacho-dial-speed"><div class="tacho-hero"><b id="tachoSpeedValue">—</b><span>km/h</span><small id="tachoSpeedSource">keine Daten</small></div>' + speed + '</div>' +
        '<div class="tacho-dial tacho-dial-rpm"><div class="tacho-rpm-readout"><b id="tachoRpmValue">—</b><small id="tachoRpmUnit">keine OBD</small></div>' + rpm + '</div>' +
        (!compact ? ('<div class="tacho-compass"><svg viewBox="0 0 80 80" role="img" aria-label="Kompass"><circle cx="40" cy="40" r="27" class="tacho-compass-ring"/><polygon points="40,1 43.5,7 36.5,7" class="tacho-lubber"/><g id="tachoCompassRot"><line x1="59" y1="21" x2="56" y2="24" class="tacho-compass-tick"/><line x1="59" y1="59" x2="56" y2="56" class="tacho-compass-tick"/><line x1="21" y1="59" x2="24" y2="56" class="tacho-compass-tick"/><line x1="21" y1="21" x2="24" y2="24" class="tacho-compass-tick"/><polygon points="40,16 45,40 40,35 35,40" class="tacho-north"/><polygon points="40,64 35,40 40,45 45,40" class="tacho-south"/><text x="40" y="10" class="tacho-compass-n">N</text><text x="70" y="40" class="tacho-compass-c">O</text><text x="40" y="70" class="tacho-compass-c">S</text><text x="10" y="40" class="tacho-compass-c">W</text></g></svg>' +
        '<div><b id="tachoHeading">—</b><small id="tachoCardinal">keine Daten</small></div></div>') : '') +
      '</div>' +
      '<footer class="tacho-info">' +
        '<div class="tacho-stat"><span>GESAMT</span><strong id="tachoOdo">245.377 km</strong><small id="tachoOdoSource">Beispielwert</small></div>' +
        '<div class="tacho-stat"><span>TRIP</span><strong id="tachoTrip">0,0</strong><small id="tachoTripSource">—</small></div>' +
        (compact ? ('<div class="tacho-compass"><svg viewBox="0 0 80 80" role="img" aria-label="Kompass"><circle cx="40" cy="40" r="27" class="tacho-compass-ring"/><polygon points="40,1 43.5,7 36.5,7" class="tacho-lubber"/><g id="tachoCompassRot"><line x1="59" y1="21" x2="56" y2="24" class="tacho-compass-tick"/><line x1="59" y1="59" x2="56" y2="56" class="tacho-compass-tick"/><line x1="21" y1="59" x2="24" y2="56" class="tacho-compass-tick"/><line x1="21" y1="21" x2="24" y2="24" class="tacho-compass-tick"/><polygon points="40,16 45,40 40,35 35,40" class="tacho-north"/><polygon points="40,64 35,40 40,45 45,40" class="tacho-south"/><text x="40" y="10" class="tacho-compass-n">N</text><text x="70" y="40" class="tacho-compass-c">O</text><text x="40" y="70" class="tacho-compass-c">S</text><text x="10" y="40" class="tacho-compass-c">W</text></g></svg>' +
        '<div><b id="tachoHeading">—</b><small id="tachoCardinal">keine Daten</small></div></div>') : '') +
        '<div class="tacho-actions">' +
          '<button type="button" id="tachoGps" onclick="meviSpeedGps(true)">GPS</button>' +
          '<button type="button" onclick="meviSpeedGps(false)">Stop</button>' +
          '<button type="button" onclick="meviSpeedCompass()">Kompass</button>' +
          '<button type="button" id="tachoTripReset" onclick="meviSpeedResetTrip()">Trip</button>' +
          '<button type="button" id="tachoDemo" aria-pressed="false" onclick="meviSpeedToggleDemo()">Demo</button>' +
        '</div></footer></section>';
  }

  function setNeedle(id, angle) {
    const node = document.getElementById(id);
    if (node) node.setAttribute('transform', 'rotate(' + angle.toFixed(2) + ' 120 120)');
  }

  function text(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function sourceLabel(kind) {
    if (kind === 'gps') return 'GPS';
    if (kind === 'sensor') return 'Sensor';
    if (kind === 'obd') return 'OBD';
    if (kind === 'demo') return 'DEMO';
    return 'keine Daten';
  }

  function paint() {
    if (!root || !root.isConnected) return;
    const model = view();
    const speedKnown = Number.isFinite(model.speedKmh);
    const rpmKnown = Number.isFinite(model.rpm);
    const headingKnown = Number.isFinite(model.headingDeg);
    root.classList.toggle('is-demo', mode === 'demo');
    root.dataset.mode = mode;
    const speedDial = root.querySelector('.tacho-dial-speed');
    const rpmDial = root.querySelector('.tacho-dial-rpm');
    if (speedDial) speedDial.classList.toggle('is-unavailable', !speedKnown);
    if (rpmDial) rpmDial.classList.toggle('is-unavailable', !rpmKnown);
    text('tachoSpeedValue', speedKnown ? String(Math.round(shownSpeed)) : '—');
    text('tachoSpeedSource', sourceLabel(model.source.speed));
    text('tachoRpmValue', rpmKnown ? formatInt(shownRpm) : '—');
    text('tachoRpmUnit', rpmKnown ? (mode === 'demo' ? 'DEMO · U/min' : 'U/min · ' + sourceLabel(model.source.rpm)) : 'keine OBD');
    text('tachoOdo', '245.377 km');
    text('tachoOdoSource', 'Beispielwert');
    text('tachoTrip', formatFixed(model.tripKm, 1));
    text('tachoTripSource', model.source.trip === 'unavailable' ? (model.tripKm > 0 ? 'gespeichert' : '—') : sourceLabel(model.source.trip) + ' · km');
    text('tachoHeading', headingKnown ? Math.round(((shownHeading % 360) + 360) % 360) + '°' : '—');
    text('tachoCardinal', headingKnown ? (cardinal(shownHeading) + ' · ' + sourceLabel(model.source.heading)) : 'keine Daten');
    text('tachoMode', mode === 'demo' ? 'DEMO' : 'LIVE');
    const status = document.getElementById('tachoStatus');
    if (status) {
      if (mode === 'demo') status.textContent = 'Demo · keine Fahrzeugdaten';
      else if (!gpsWanted) status.textContent = 'GPS nicht gestartet';
      else status.textContent = live.gpsAccuracyM == null ? 'Warte auf GPS' : 'GPS ±' + Math.round(live.gpsAccuracyM) + ' m';
    }
    text('tachoSources', rpmKnown && model.source.rpm !== 'demo' ? 'RPM · ' + sourceLabel(model.source.rpm) : (mode === 'demo' ? 'RPM · DEMO' : 'RPM · keine OBD'));
    setNeedle('tachoSpeedNeedle', needleAngle(speedKnown ? shownSpeed : 0, SPEED_MAX));
    setNeedle('tachoRpmNeedle', needleAngle(rpmKnown ? shownRpm : 0, RPM_MAX));
    const rose = document.getElementById('tachoCompassRot');
    if (rose && headingKnown) rose.setAttribute('transform', 'rotate(' + (-shownHeading).toFixed(2) + ' 40 40)');
    const gpsBtn = document.getElementById('tachoGps');
    if (gpsBtn) gpsBtn.setAttribute('aria-pressed', String(gpsWanted && mode !== 'demo'));
    const demoBtn = document.getElementById('tachoDemo');
    if (demoBtn) {
      demoBtn.setAttribute('aria-pressed', String(mode === 'demo'));
      demoBtn.textContent = mode === 'demo' ? 'Demo aus' : 'Demo';
    }
    const chip = document.getElementById('gpsSignalIcon');
    if (chip) chip.dataset.state = mode === 'demo' ? 'demo' : (gpsWanted && live.gpsAccuracyM != null ? 'on' : 'off');
  }

  function settle() {
    const model = view();
    return Math.abs((Number.isFinite(model.speedKmh) ? model.speedKmh : 0) - shownSpeed) < 0.4 &&
      Math.abs((Number.isFinite(model.rpm) ? model.rpm : 0) - shownRpm) < 8 &&
      (!Number.isFinite(model.headingDeg) || Math.abs(model.headingDeg - shownHeading) < 0.6);
  }

  function frame(now) {
    raf = 0;
    if (!root || !root.isConnected || document.hidden) return;
    const dt = lastFrame ? Math.min(0.08, Math.max(0, (now - lastFrame) / 1000)) : 0.016;
    lastFrame = now;
    if (mode === 'demo') {
      phase += dt;
      const sample = demoFrame(phase);
      demo.speedKmh = sample.speedKmh;
      demo.rpm = sample.rpm;
      demo.headingDeg = sample.headingDeg;
      demo.tripKm += sample.tripPerSecondKm * dt;
      demo.source = { speed: 'demo', rpm: 'demo', odometer: 'unavailable', trip: 'demo', heading: 'demo' };
      demo.mode = 'demo';
      demo.odometerKm = null;
    }
    const model = view();
    shownSpeed = approach(shownSpeed, Number.isFinite(model.speedKmh) ? model.speedKmh : 0, dt, reduced);
    shownRpm = approach(shownRpm, Number.isFinite(model.rpm) ? model.rpm : 0, dt, reduced);
    if (Number.isFinite(model.headingDeg)) {
      if (!headingReady) { shownHeading = model.headingDeg; headingReady = true; }
      else {
        let delta = ((model.headingDeg - shownHeading + 540) % 360) - 180;
        shownHeading = approach(shownHeading, shownHeading + delta, dt, reduced);
      }
    }
    paint();
    if (mode === 'demo' || !settle()) raf = requestAnimationFrame(frame);
  }

  function kick() {
    reduced = reducedMotion();
    if (!root || !root.isConnected || document.hidden) { paint(); return; }
    if (!raf) {
      lastFrame = 0;
      raf = requestAnimationFrame(frame);
    }
  }

  function stopAnimation() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastFrame = 0;
  }

  function applyFix(coords, timestamp) {
    const point = {
      lat: coords.latitude,
      lon: coords.longitude,
      accuracy: coords.accuracy,
      time: timestamp || Date.now()
    };
    const verdict = acceptTrackPoint(lastPoint, point);
    live.gpsAccuracyM = Number.isFinite(coords.accuracy) ? coords.accuracy : null;
    live.altitudeM = Number.isFinite(coords.altitude) ? coords.altitude : null;
    if (Number.isFinite(coords.speed)) {
      live.speedKmh = clampReading(coords.speed * 3.6, 400);
      live.source.speed = 'gps';
    } else if (verdict.ok) {
      live.speedKmh = 0;
      live.source.speed = 'gps';
    }
    if (Number.isFinite(coords.heading) && coords.heading >= 0 && live.source.heading !== 'sensor') {
      live.headingDeg = coords.heading;
      live.source.heading = 'gps';
    }
    if (verdict.ok) {
      lastPoint = point;
      if (verdict.km > 0) {
        live.tripKm += verdict.km;
        live.source.trip = 'gps';
        writeTrip(live.tripKm);
      } else if (live.source.trip === 'unavailable') live.source.trip = 'gps';
    }
    if (mode !== 'demo') kick();
    else paint();
  }

  function startGps() {
    gpsWanted = true;
    if (!navigator.geolocation) {
      live.source.speed = 'unavailable';
      const status = document.getElementById('tachoStatus');
      if (status && mode !== 'demo') status.textContent = 'GPS nicht verfügbar';
      paint();
      return;
    }
    if (gpsWatch != null) { paint(); return; }
    gpsWatch = navigator.geolocation.watchPosition(function (pos) {
      applyFix(pos.coords, pos.timestamp);
    }, function () {
      live.source.speed = 'unavailable';
      gpsWanted = false;
      if (gpsWatch != null) navigator.geolocation.clearWatch(gpsWatch);
      gpsWatch = null;
      const status = document.getElementById('tachoStatus');
      if (status && mode !== 'demo') status.textContent = 'GPS nicht verfügbar';
      paint();
    }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 });
    paint();
  }

  function stopGps() {
    gpsWanted = false;
    if (gpsWatch != null && navigator.geolocation) navigator.geolocation.clearWatch(gpsWatch);
    gpsWatch = null;
    live.speedKmh = null;
    live.gpsAccuracyM = null;
    if (live.source.speed === 'gps') live.source.speed = 'unavailable';
    kick();
  }

  function onOrientation(event) {
    let heading = null;
    if (typeof event.webkitCompassHeading === 'number') heading = event.webkitCompassHeading;
    else if (event.absolute && typeof event.alpha === 'number') heading = (360 - event.alpha) % 360;
    if (!Number.isFinite(heading)) return;
    live.headingDeg = (heading + 360) % 360;
    live.source.heading = 'sensor';
    if (mode !== 'demo') kick();
  }

  function attachCompass() {
    if (orientOn || !('DeviceOrientationEvent' in window)) return;
    window.addEventListener('deviceorientation', onOrientation, true);
    orientOn = true;
  }

  async function startCompass() {
    compassWanted = true;
    if (!('DeviceOrientationEvent' in window)) {
      const status = document.getElementById('tachoStatus');
      if (status && mode !== 'demo') status.textContent = 'Kein Kompasssensor';
      return;
    }
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const perm = await DeviceOrientationEvent.requestPermission();
        if (perm !== 'granted') { compassWanted = false; return; }
      }
    } catch (err) { compassWanted = false; return; }
    attachCompass();
  }

  function detachCompass() {
    if (!orientOn) return;
    window.removeEventListener('deviceorientation', onOrientation, true);
    orientOn = false;
  }

  function toggleDemo() {
    if (mode === 'demo') {
      mode = 'live';
      headingReady = false;
      shownSpeed = Number.isFinite(live.speedKmh) ? live.speedKmh : 0;
      shownRpm = Number.isFinite(live.rpm) ? live.rpm : 0;
    } else {
      mode = 'demo';
      phase = 0;
      demo.tripKm = 0;
      demo.odometerKm = null;
      demo.rpm = 0;
      demo.speedKmh = 0;
      headingReady = false;
    }
    kick();
  }

  function resetTrip() {
    if (mode === 'demo') {
      demo.tripKm = 0;
      paint();
      return;
    }
    live.tripKm = 0;
    live.source.trip = gpsWanted ? 'gps' : 'unavailable';
    lastPoint = null;
    writeTrip(0);
    paint();
  }

  function ingest(partial) {
    if (!partial || typeof partial !== 'object') return;
    if (Number.isFinite(partial.rpm) && partial.rpm >= 0) {
      live.rpm = Math.min(RPM_MAX * 1.05, partial.rpm);
      live.source.rpm = 'obd';
    }
    if (Number.isFinite(partial.odometerKm) && partial.odometerKm >= 0) {
      live.odometerKm = partial.odometerKm;
      live.source.odometer = 'obd';
    }
    if (partial.sourceSpeed && Number.isFinite(partial.speedKmh) && partial.speedKmh >= 0) {
      live.speedKmh = clampReading(partial.speedKmh, 400);
      live.source.speed = partial.sourceSpeed;
    }
    if (mode !== 'demo') kick();
    else paint();
  }

  function measure() {
    if (!root || !root.isConnected) return;
    const bounds = root.getBoundingClientRect();
    const tight = bounds.width > 0 && (bounds.width < 460 || bounds.height < 430);
    // Tall split hosts (DeX, Full HD next to the map) stack both dials so they can use the full width.
    const tall = !tight && root.dataset.layout === 'split' && bounds.height > bounds.width * 1.25;
    root.classList.toggle('is-tight', tight);
    root.classList.toggle('is-tall', tall);
    if (root.dataset.layout !== 'split') root.dataset.layout = tight ? 'tight' : 'full';
  }

  function unmount() {
    stopAnimation();
    detachCompass();
    if (gpsWatch != null && navigator.geolocation) navigator.geolocation.clearWatch(gpsWatch);
    gpsWatch = null;
    if (observer) { observer.disconnect(); observer = null; }
    root = null;
  }

  function mount() {
    const next = document.querySelector('.tacho-app');
    if (!next) { unmount(); return; }
    if (root === next) return;
    unmount();
    root = next;
    reduced = reducedMotion();
    shownSpeed = 0;
    shownRpm = 0;
    headingReady = false;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(root);
    }
    measure();
    paint();
    if (gpsWanted) startGps();
    if (compassWanted && !(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function')) attachCompass();
    kick();
  }

  function onVisibility() {
    if (document.hidden) stopAnimation();
    else kick();
  }

  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', onVisibility);

  window.MeviSpeedometer = {
    SPEED_MAX: SPEED_MAX,
    RPM_MAX: RPM_MAX,
    needleAngle: needleAngle,
    clampReading: clampReading,
    cardinal: cardinal,
    haversineKm: haversineKm,
    acceptTrackPoint: acceptTrackPoint,
    approach: approach,
    demoFrame: demoFrame,
    speedMarks: speedMarks,
    rpmMarks: rpmMarks,
    emptyModel: emptyModel
  };
  window.meviSpeedHTML = html;
  window.meviSpeedMount = mount;
  window.meviSpeedUnmount = unmount;
  window.meviSpeedGps = function (on) { if (on) startGps(); else stopGps(); };
  window.meviSpeedCompass = startCompass;
  window.meviSpeedToggleDemo = toggleDemo;
  window.meviSpeedResetTrip = resetTrip;
  window.meviSpeedIngest = ingest;
  window.meviSpeedPaint = paint;
  window.meviSpeedDebug = function () {
    return {
      mounted: !!(root && root.isConnected),
      mode: mode,
      animating: !!raf,
      gps: gpsWanted,
      watch: gpsWatch,
      compass: orientOn,
      live: live,
      demo: demo,
      view: view()
    };
  };
})();
