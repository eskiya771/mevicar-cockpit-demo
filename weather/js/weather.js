/* global window, document, AbortController */
(() => {
    'use strict';
    const LOCATION = Object.freeze({ latitude: 49.71216, longitude: 10.895, timezone: 'Europe/Berlin' });
    const REFRESH_MS = 15 * 60 * 1000, TIMEOUT_MS = 12000, STALE_SECONDS = 60 * 60;
    const FORECAST_DAYS = 7;
    const params = new URLSearchParams({ ...LOCATION, timeformat: 'unixtime', forecast_days: String(FORECAST_DAYS),
        current: 'temperature_2m,apparent_temperature,is_day,weather_code,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
        hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,is_day',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max',
    });
    const API = 'https://api.open-meteo.com/v1/forecast?' + params;
    const $ = id => document.getElementById(id);
    const scene = window.createWeatherScene($('weather-scene'));
    const number = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
    const clock = new Intl.DateTimeFormat('de-DE', { timeZone: LOCATION.timezone, hour: '2-digit', minute: '2-digit' });
    const weekday = new Intl.DateTimeFormat('de-DE', { timeZone: LOCATION.timezone, weekday: 'short', day: '2-digit', month: '2-digit' });
    const RAIN_DAYS = 3, WINDOWS_PER_PAGE = 2, HOURLY_SLOTS = 6;
    const planner = window.WeatherRain;
    document.querySelectorAll('button[data-view]').forEach(button => button.addEventListener('click', () => {
        document.querySelector('main').dataset.view = button.dataset.view;
        document.querySelectorAll('button[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
        if (button.dataset.view === 'map' && !$('weather-map').getAttribute('src')) setLayer('wind');
    }));
    let data = null, fetchedAt = 0, refreshTimer = 0, activeRequest = null, failed = false, resumePending = false;
    function value(v, unit = '') { return Number.isFinite(v) ? number.format(v) + unit : '—'; }
    function at(v, formatter = clock) { return Number.isFinite(v) ? formatter.format(new Date(v * 1000)) : '—'; }
    function weather(code, day = true) {
        if (code === 0) return [day ? 'Sonnig' : 'Klarer Himmel', day ? '☀️' : '🌙', day ? 'sun' : 'clear'];
        if (code === 1) return ['Überwiegend klar', day ? '🌤️' : '🌙', 'sun'];
        if (code === 2) return ['Wolkig', '⛅', 'cloud'];
        if (code === 3) return ['Bedeckt', '☁️', 'cloud'];
        if ([45, 48].includes(code)) return ['Nebel', '🌫️', 'cloud'];
        if ([51, 53, 55, 56, 57].includes(code)) return ['Nieselregen', '🌦️', 'rain'];
        if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ['Regen', '🌧️', 'rain'];
        if ([71, 73, 75, 77, 85, 86].includes(code)) return ['Schnee', '🌨️', 'snow'];
        if ([95, 96, 99].includes(code)) return ['Gewitter', '⛈️', 'storm'];
        return ['Wetterlage unbekannt', '◌', 'cloud'];
    }
    // Shared line-art symbols: fixed geometry, no remote images or emoji fonts.
    function weatherGraphic(code, day = true) {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('class', 'weather-icon');
        svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '3'); svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
        function path(d, color) {
            const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d);
            if (color) p.setAttribute('stroke', color); svg.append(p);
        }
        if (!Number.isFinite(code)) { path('M38 35a14 14 0 0 1 27 5c0 10-15 11-15 22M50 74v1'); return svg; }
        const kind = weather(code, day)[2];
        if (code <= 1 && !day) {
            path('M65 15a35 35 0 1 0 21 54A31 31 0 0 1 65 15Z');
            path('M77 19v10M72 24h10M85 39v6M82 42h6', '#8a2be2');
        } else if (code === 0) {
            const circle = document.createElementNS(ns, 'circle');
            circle.setAttribute('cx', '50');circle.setAttribute('cy', '50');circle.setAttribute('r', '21');svg.append(circle);
            path('M50 9v10M50 81v10M9 50h10M81 50h10M21 21l7 7M72 72l7 7M21 79l7-7M72 28l7-7', '#ffd166');
        } else {
            if (code === 1 || code === 2) path('M30 39a17 17 0 1 1 30-12M28 12l-4-6M44 7V1M17 28H9M61 13l5-6', '#ffd166');
            path('M25 64a17 17 0 1 1 3-34 23 23 0 0 1 44 5 15 15 0 1 1 3 29Z');
            if (kind === 'rain') path('M30 75l-5 11M50 75l-5 11M70 75l-5 11', '#8a2be2');
            if (kind === 'storm') path('M55 68L43 83h12l-8 13', '#ff00ff');
            if (kind === 'snow') path('M30 74v16M23 78l14 8M23 86l14-8M67 74v16M60 78l14 8M60 86l14-8', '#8a2be2');
            if (code === 45 || code === 48) path('M19 76h62M29 86h42', '#8a2be2');
        }
        return svg;
    }
    function status() {
        if (!data) return;
        const age = Math.max(0, Math.floor((Date.now() / 1000 - data.current.time) / 60));
        const stale = age * 60 > STALE_SECONDS;
        $('status').dataset.state = failed || stale ? 'stale' : 'ready';
        $('status').textContent = (failed ? 'Aktualisierung fehlgeschlagen · letzter ' : stale ? 'Veralteter ' : '') + 'Modellstand ' + at(data.current.time) + ' Uhr · vor ' + age + ' Min.';
    }
    function validate(d) {
        if (!d || !d.current || !Number.isFinite(d.current.temperature_2m) || !Number.isFinite(d.current.time)) throw new Error('current');
        for (const [section, fields] of [
            ['hourly', ['temperature_2m', 'precipitation_probability', 'precipitation', 'weather_code', 'is_day']],
            ['daily', ['temperature_2m_max', 'temperature_2m_min', 'weather_code', 'sunrise', 'sunset', 'precipitation_probability_max']],
        ]) {
            const series = d[section];
            if (!series || !Array.isArray(series.time) || !series.time.length || !series.time.every(Number.isFinite)) throw new Error(section);
            for (const key of fields) if (!Array.isArray(series[key]) || series[key].length !== series.time.length) throw new Error(key);
        }
        return d;
    }
    function element(tag, text, className) {
        const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el;
    }
    function icon(code, day) { const info = weather(code, day); const el = element('span', null, 'icon'); el.append(weatherGraphic(code, day)); el.setAttribute('role', 'img'); el.setAttribute('aria-label', info[0]); return el; }
    const shortDisplay = window.matchMedia("(max-height: 499px), (max-width: 599px) and (max-height: 740px)");
    shortDisplay.addEventListener("change", () => { if (data) renderRainDays(); });
    let renderedDate = "";
    function renderRainDays() {
        const windowsPerPage = shortDisplay.matches ? 1 : WINDOWS_PER_PAGE;
        const root = $('rain-days'); root.replaceChildren();
        const nowSec = Date.now() / 1000, today = planner.key(nowSec);
        let date = today;
        for (let day = 0; day < RAIN_DAYS; day++) {
            const plan = planner.day(data.hourly, date);
            const passed = day === 0 ? plan.windows.filter(win => win.end <= nowSec).length : 0;
            if (passed) plan.windows = plan.windows.filter(win => win.end > nowSec);
            const dailyIndex = data.daily.time.findIndex(t => planner.key(t) === date);
            const card = element('article', null, 'rain-day card');
            card.dataset.date = date;
            const title = dayTitle(day, plan.start);
            const heading = element('div', null, 'rain-day-heading');
            heading.append(element('h3', title), element('time', at(plan.start, weekday)));
            const stats = element('div', null, 'rain-stats');
            const temperatures = element('strong', value(data.daily.temperature_2m_max[dailyIndex], '\u00b0'));
            temperatures.append(element('small', ' / ' + value(data.daily.temperature_2m_min[dailyIndex], '\u00b0')));
            stats.append(temperatures, element('span', value(plan.probability, ' % Regenrisiko')));
            const list = element('div', null, 'rain-windows');
            if (!plan.windows.length) {
                list.append(element('strong', passed ? 'Kein weiterer Regen' : plan.complete ? 'Voraussichtlich trocken' : 'Keine vollst\u00e4ndige Prognose', 'dry-message'));
                list.append(element('p', passed ? 'F\u00fcr den Rest des Tages ist keine Regenphase im Stundenmodell erwartet.' : plan.complete ? 'Keine Regenphase im Stundenmodell erwartet.' : 'Stundenwerte fehlen. Bitte sp\u00e4ter aktualisieren.'));
            }
            const rows = plan.windows.map(win => {
                const row = element('div', null, 'rain-window');
                const endLabel = win.end === plan.end ? '24:00' : at(win.end);
                row.append(element('strong', (win.start <= nowSec ? 'jetzt' : at(win.start)) + ' \u2013 ' + endLabel + ' Uhr'), element('span', (win.expected ? 'Regen erwartet' : 'Regen m\u00f6glich') + ' \u00b7 ' + value(win.probability, ' %')));
                list.append(row); return row;
            });
            card.append(heading, stats, list);
            if (!plan.complete && plan.windows.length) card.append(element('p', 'Unvollst\u00e4ndige Stundenprognose', 'incomplete'));
            if (rows.length > windowsPerPage) {
                let page = 0;
                const pager = element('div', null, 'rain-pager');
                const prev = element('button', '\u2039'), next = element('button', '\u203a'), counter = element('span');
                prev.type = next.type = 'button';
                prev.setAttribute('aria-label', title + ': vorherige Regenzeiten'); next.setAttribute('aria-label', title + ': weitere Regenzeiten');
                function update() {
                    rows.forEach((row, i) => { row.hidden = i < page * windowsPerPage || i >= (page + 1) * windowsPerPage; });
                    prev.disabled = page === 0; next.disabled = (page + 1) * windowsPerPage >= rows.length;
                    counter.textContent = (page * windowsPerPage + 1) + '\u2013' + Math.min(rows.length, (page + 1) * windowsPerPage) + ' von ' + rows.length + ' Zeitfenstern';
                }
                prev.addEventListener('click', () => { page--; update(); }); next.addEventListener('click', () => { page++; update(); });
                pager.append(prev, counter, next); card.append(pager); update();
            }
            root.append(card);
            date = planner.nextDate(date);
        }
        const selector = element('div', null, 'rain-day-selector'); selector.setAttribute('role', 'group'); selector.setAttribute('aria-label', 'Tag der Regenplanung');
        root.querySelectorAll('.rain-day').forEach((card, i) => {
            const b = element('button', dayTitle(i, planner.midnight(card.dataset.date)));
            b.type = 'button'; b.setAttribute('aria-pressed', String(i === 0));
            b.addEventListener('click', () => { root.dataset.day = String(i); selector.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); }); selector.append(b);
        });
        root.dataset.day = '0'; root.append(selector);
    }
    function dayTitle(offset, start) { return offset === 0 ? 'Heute' : offset === 1 ? 'Morgen' : offset === 2 ? '\u00dcbermorgen' : at(start, weekday); }
    let renderedHour = 0;
    function renderHourly() {
        const h = data.hourly, nowSec = Date.now() / 1000, hourStart = Math.floor(nowSec / planner.HOUR) * planner.HOUR;
        const today = planner.key(nowSec), dayEnd = planner.midnight(planner.nextDate(today));
        const todayIndex = data.daily.time.findIndex(t => planner.key(t) === today);
        $('sun').textContent = todayIndex < 0 ? '\u2014' : '\u2191 ' + at(data.daily.sunrise[todayIndex]) + ' \u00b7 \u2193 ' + at(data.daily.sunset[todayIndex]);
        const upcoming = h.time.map((t, i) => ({ t, i })).filter(({ t }) => Number.isFinite(t) && t >= hourStart);
        const todayOnly = upcoming.filter(({ t }) => t <= dayEnd);
        let picks;
        if (todayOnly.length >= HOURLY_SLOTS) {
            picks = Array.from({ length: HOURLY_SLOTS }, (_, k) => todayOnly[Math.round(k * (todayOnly.length - 1) / (HOURLY_SLOTS - 1))]);
            $('hourly-title').textContent = 'HEUTE IM VERLAUF';
        } else { picks = upcoming.slice(0, HOURLY_SLOTS); $('hourly-title').textContent = 'N\u00c4CHSTE STUNDEN'; }
        const root = $('hourly'); root.replaceChildren();
        if (!picks.length) { root.append(element('p', 'Keine Stundenwerte verf\u00fcgbar.')); return; }
        picks.forEach(({ t, i }, k) => {
            const slot = element('div', null, 'hour');
            const wet = h.precipitation[i] >= planner.RAIN_MM || h.precipitation_probability[i] >= planner.RISK_PERCENT;
            if (k === 0) slot.classList.add('now'); if (!wet) slot.classList.add('dry');
            const label = element('time', k === 0 ? 'jetzt' : t === dayEnd ? '24:00' : at(t)); label.dateTime = new Date(t * 1000).toISOString();
            slot.append(label, icon(h.weather_code[i], h.is_day[i] === 1), element('strong', value(h.temperature_2m[i], '\u00b0')),
                element('span', value(h.precipitation_probability[i], ' %')));
            root.append(slot);
        });
        renderedHour = hourStart;
    }
    function render() {
        const c = data.current, d = data.daily, info = weather(c.weather_code, c.is_day === 1);
        document.body.dataset.weather = info[2]; scene.setWeather(info[2], c.is_day === 1);
        $('temperature').textContent = value(c.temperature_2m, '\u00b0'); $('condition').textContent = info[0]; $('weather-symbol').replaceChildren(weatherGraphic(c.weather_code, c.is_day === 1));
        $('feels').textContent = 'Gef\u00fchlt ' + value(c.apparent_temperature, ' \u00b0C');
        const today = planner.key(Date.now() / 1000), todayIndex = d.time.findIndex(t => planner.key(t) === today);
        $('maximum').textContent = value(d.temperature_2m_max[todayIndex], '\u00b0'); $('minimum').textContent = value(d.temperature_2m_min[todayIndex], '\u00b0');
        $('today-risk').textContent = value(d.precipitation_probability_max[todayIndex], ' %');
        const directions = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
        const direction = Number.isFinite(c.wind_direction_10m) ? directions[Math.round(c.wind_direction_10m / 45) % 8] : '';
        $('wind').textContent = value(c.wind_speed_10m, ' km/h') + ' ' + direction;
        $('gusts').textContent = 'B\u00f6en ' + value(c.wind_gusts_10m, ' km/h');
        renderedDate = today; renderHourly(); renderRainDays();
        const daily = $('daily'); daily.replaceChildren();
        d.time.map((t, i) => ({ t, i })).filter(({ t }) => planner.key(t) >= today).slice(0, FORECAST_DAYS).forEach(({ t, i }, index) => {
            const card = element('article', null, 'day'), range = element('div', value(d.temperature_2m_max[i], '\u00b0'), 'range');
            range.append(element('span', value(d.temperature_2m_min[i], '\u00b0')));
            const description = weather(d.weather_code[i], true);
            card.append(element('time', index === 0 && planner.key(t) === today ? 'Heute' : at(t, weekday)), icon(d.weather_code[i], true), element('span', description[0], 'day-condition'), range, element('strong', value(d.precipitation_probability_max[i], ' %'), 'day-risk'), element('small', 'Regenrisiko')); daily.append(card);
        });
        status();
    }
    async function refresh() {
        if (activeRequest || document.hidden) return;
        window.clearTimeout(refreshTimer);
        const controller = new AbortController(); activeRequest = controller;
        const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS); $('refresh').disabled = true;
        if (!data) { $('status').textContent = 'Verbinde mit Open-Meteo …'; $('status').dataset.state = 'loading'; }
        try {
            const response = await fetch(API, { signal: controller.signal });
            if (!response.ok) throw new Error('http');
            const next = validate(await response.json());
            if (controller.signal.aborted) return;
            data = next; fetchedAt = Date.now(); failed = false; render();
        } catch {
            if (document.hidden) return;
            failed = true;
            if (data) status();
            else { $('status').textContent = 'Wetterdaten nicht erreichbar. Erneut versuchen mit ↻.'; $('status').dataset.state = 'error'; $('condition').textContent = 'Gerade keine Wetterdaten'; $('feels').textContent = 'Internetverbindung oder Wetterdienst prüfen.'; }
        } finally {
            window.clearTimeout(timeout); activeRequest = null; $('refresh').disabled = false;
            if (!document.hidden && resumePending) { resumePending = false; refresh(); }
            else if (!document.hidden) refreshTimer = window.setTimeout(refresh, REFRESH_MS);
        }
    }
    function setLayer(layer) {
        if (!['wind', 'rain', 'temp'].includes(layer)) return;
        const map = new URL('https://embed.windy.com/embed.html');
        map.search = new URLSearchParams({ type: 'map', location: 'coordinates', lat: String(LOCATION.latitude), lon: String(LOCATION.longitude), zoom: '9', level: 'surface', overlay: layer, product: 'ecmwf', metricTemp: '°C', metricRain: 'mm', metricWind: 'km/h', marker: 'true' });
        $('weather-map').src = map.href;
        document.querySelectorAll('[data-layer]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.layer === layer)));
    }
    document.querySelectorAll('[data-layer]').forEach(b => b.addEventListener('click', () => setLayer(b.dataset.layer)));
    $('refresh').addEventListener('click', refresh);
    $('fullscreen').addEventListener('click', async () => {
        try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
        catch { $('status').textContent = 'Vollbild ist in diesem Browser nicht verfügbar.'; }
    });
    document.addEventListener('fullscreenchange', () => { $('fullscreen').textContent = document.fullscreenElement ? 'Vollbild beenden' : 'Vollbild'; });
    function motionLabel() { $('motion').textContent = scene.paused ? 'Animation fortsetzen' : 'Animation pausieren'; $('motion').setAttribute('aria-pressed', String(scene.paused)); }
    $('motion').addEventListener('click', () => { scene.toggle(); motionLabel(); }); motionLabel();
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { window.clearTimeout(refreshTimer); if (activeRequest) activeRequest.abort(); }
        else if (activeRequest && activeRequest.signal.aborted) resumePending = true;
        else if (!data || failed || Date.now() - fetchedAt >= REFRESH_MS) refresh();
        else refreshTimer = window.setTimeout(refresh, Math.max(0, REFRESH_MS - (Date.now() - fetchedAt)));
    });
    function tickClock() { $('clock').textContent = clock.format(new Date()) + ' · ' + weekday.format(new Date()); if (data && planner.key(Date.now() / 1000) !== renderedDate) render(); else if (data && Math.floor(Date.now() / 1000 / planner.HOUR) * planner.HOUR !== renderedHour) { renderHourly(); renderRainDays(); } status(); }
    tickClock(); window.setInterval(tickClock, 30000); refresh();
})();

