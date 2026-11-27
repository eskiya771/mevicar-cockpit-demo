/* global window */
(function () {
    'use strict';
    const HOUR = 3600, RAIN_MM = 0.1, RISK_PERCENT = 50;
    const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
    const partsFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    function key(epoch) { return dateFormat.format(new Date(epoch * 1000)); }
    function midnight(date) {
        const [year, month, day] = date.split('-').map(Number);
        const target = Date.UTC(year, month - 1, day);
        let guess = target;
        for (let i = 0; i < 3; i++) {
            const p = Object.fromEntries(partsFormat.formatToParts(new Date(guess)).map(x => [x.type, x.value]));
            const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
            guess += target - local;
        }
        return guess / 1000;
    }
    function nextDate(date) {
        const [year, month, day] = date.split('-').map(Number);
        return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
    }
    function day(hourly, date) {
        const start = midnight(date), end = midnight(nextDate(date));
        const unique = new Map();
        (hourly.time || []).forEach((t, i) => {
            if (!Number.isFinite(t) || t <= start || t - HOUR >= end) return;
            const amount = hourly.precipitation?.[i], probability = hourly.precipitation_probability?.[i];
            if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(probability) || probability < 0 || probability > 100) return;
            unique.set(t, { start: Math.max(start, t - HOUR), end: Math.min(end, t), amount, probability });
        });
        const slots = [...unique.values()].sort((a, b) => a.start - b.start);
        const windows = []; let current = null, covered = 0, total = 0, probability = null;
        for (const slot of slots) {
            covered += slot.end - slot.start; total += slot.amount;
            probability = Math.max(probability ?? 0, slot.probability);
            if (slot.amount < RAIN_MM && slot.probability < RISK_PERCENT) { current = null; continue; }
            const expected = slot.amount >= RAIN_MM;
            if (!current || current.end !== slot.start || current.expected !== expected) {
                current = { start: slot.start, end: slot.end, amount: 0, probability: 0, expected }; windows.push(current);
            }
            current.end = slot.end; current.amount += slot.amount; current.probability = Math.max(current.probability, slot.probability);

        }
        return { date, start, end, windows, complete: covered >= end - start, probability, total: slots.length ? total : null };
    }
    const api = Object.freeze({ day, key, midnight, nextDate, HOUR, RAIN_MM, RISK_PERCENT });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else window.WeatherRain = api;
})();

