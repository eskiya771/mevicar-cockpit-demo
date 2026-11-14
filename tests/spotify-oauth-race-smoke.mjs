// Regression test for the Android hybrid OAuth hand-over (one-time code).
//
// Unlike spotify-android-smoke.mjs this harness answers bridge requests
// asynchronously and lets the test decide when (and how) Spotify's token
// endpoint responds. That makes overlapping deliveries observable:
//   - Android may hand over the callback by push (evaluateJavascript) and the
//     web app may pull it over the WebMessage bridge at the same time.
//   - The authorization code is a one-time value. Android must only be told to
//     drop it once the web app has a definitive result.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('spotify.js', 'utf8');
const REDIRECT = 'mevicarnext://spotify-callback';
const SECRET_CODE = 'one-time-code-SECRET';
const SECRET_VERIFIER = 'pkce-verifier-SECRET';
const SECRET_ACCESS = 'access-token-SECRET';
const SECRET_REFRESH = 'refresh-token-SECRET';
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
async function settle(rounds = 6) { for (let i = 0; i < rounds; i++) await tick(); }

function harness({ pending, bridgeCallback = '', token = null } = {}) {
  const saved = { 'mevicar-spotify-client-v1': 'testclient1234' };
  if (pending) saved['mevicar-spotify-auth-v1'] = JSON.stringify(pending);
  if (token) saved['mevicar-spotify-token-v1'] = JSON.stringify(token);
  const session = {};
  const timeline = [];
  const tokenCalls = [];
  let activeCallback = bridgeCallback;
  const store = values => ({
    getItem: key => values[key] ?? null,
    setItem(key, value) { values[key] = String(value); },
    removeItem(key) { delete values[key]; }
  });
  const origin = 'https://eskiya771.github.io';
  const loc = { href: origin + '/mevicar-cockpit-demo/', origin, pathname: '/mevicar-cockpit-demo/' };
  const bridge = {
    postMessage(raw) {
      const req = JSON.parse(raw);
      timeline.push('bridge:' + req.action);
      let reply = null;
      if (req.action === 'spotify.callback.pull') {
        reply = { id: req.id, ok: true, ...(activeCallback ? { callback: activeCallback } : {}) };
      }
      if (req.action === 'spotify.callback.ack') {
        // Mirrors MainActivity.acknowledgeSpotifyCallback: a matching state
        // drops the retained one-time code for good.
        const held = activeCallback ? new URL(activeCallback).searchParams.get('state') : '';
        const acknowledged = !!held && held === req.state;
        if (acknowledged) { activeCallback = ''; timeline.push('android:code-dropped'); }
        reply = { id: req.id, ok: true, acknowledged };
      }
      // Real WebMessage replies are asynchronous.
      if (reply) setTimeout(() => {
        if (typeof bridge.onmessage === 'function') bridge.onmessage({ data: JSON.stringify(reply) });
      }, 0);
    }
  };
  const window = { MeviNativeBridge: bridge, render() {}, addEventListener() {} };
  const document = {
    hidden: false,
    getElementById() { return null; },
    querySelector() { return null; },
    addEventListener() {}
  };
  const response = (data, status = 200) => ({
    ok: status >= 200 && status < 300, status, headers: { get() { return null; } },
    json: async () => data, text: async () => JSON.stringify(data)
  });
  const fakeFetch = (url, options) => {
    const address = String(url);
    if (address.endsWith('/api/token')) {
      timeline.push('token:request');
      return new Promise((resolve, reject) => {
        tokenCalls.push({
          body: String(options?.body || ''),
          succeed() {
            timeline.push('token:response');
            resolve(response({
              access_token: SECRET_ACCESS, refresh_token: SECRET_REFRESH,
              expires_in: 3600, scope: 'streaming user-read-playback-state'
            }));
          },
          networkFail() {
            timeline.push('token:network-error');
            reject(new TypeError('Failed to fetch'));
          },
          reject(status, error) {
            timeline.push('token:http-' + status);
            resolve(response({ error, error_description: 'rejected' }, status));
          }
        });
      });
    }
    if (address.endsWith('/v1/me')) return Promise.resolve(response({ display_name: 'Test' }));
    return Promise.resolve(response({}));
  };
  // Real timers, but never keep the Node process alive for bridge timeouts.
  const timeout = (fn, ms) => { const t = setTimeout(fn, Math.min(Number(ms) || 0, 50)); t.unref?.(); return t; };
  new Function('window', 'document', 'navigator', 'localStorage', 'sessionStorage',
    'location', 'history', 'fetch', 'URL', 'TextEncoder', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'AbortController', source)(
    window, document, {}, store(saved), store(session), loc, { replaceState() {} },
    fakeFetch, URL, TextEncoder, timeout, clearTimeout, () => 1, () => {}, AbortController
  );
  const count = name => timeline.filter(entry => entry === name).length;
  return {
    window, saved, timeline, tokenCalls, count,
    connected: () => window.meviSpotifyDebug().connected,
    heldByAndroid: () => activeCallback,
    // The native stage is the nudge Android sends after receiving the deep
    // link; the web app answers it with a bridge pull.
    nudge: () => window.meviSpotifyNativeStage('Build 99 · Spotify-Code von Android empfangen'),
    push: uri => window.meviSpotifyAcceptNativeCallback(uri)
  };
}
const freshPending = state => ({ state, verifier: SECRET_VERIFIER, at: Date.now(), redirect: REDIRECT });
const callbackFor = state => REDIRECT + '?code=' + SECRET_CODE + '&state=' + state;

const failures = [];
async function scenario(name, run) {
  try { await run(); console.log('  ok   ' + name); }
  catch (error) { failures.push(name); console.log('  FAIL ' + name + '\n       ' + String(error.message).split('\n')[0]); }
}

await scenario('overlapping push + pull: no ack before the token exchange finished', async () => {
  const h = harness({ pending: freshPending('race-state-0001'), bridgeCallback: callbackFor('race-state-0001') });
  await settle();                       // startup pull already started the exchange
  const pushed = h.push(callbackFor('race-state-0001')); // Android retries by push
  h.nudge();                            // ...and nudges another pull
  await settle(10);
  assert.equal(h.tokenCalls.length, 1, 'one-time code must be exchanged exactly once');
  assert.equal(h.count('bridge:spotify.callback.ack'), 0,
    'Android was told to drop the code while the token exchange was still running');
  assert.notEqual(h.heldByAndroid(), '', 'Android must still hold the code');
  h.tokenCalls[0].succeed();
  await pushed; await settle(10);
  assert.equal(h.connected(), true);
  assert.equal(h.count('bridge:spotify.callback.ack'), 1, 'exactly one acknowledgement');
  assert.ok(h.timeline.indexOf('bridge:spotify.callback.ack') > h.timeline.indexOf('token:response'));
  assert.equal(h.heldByAndroid(), '');
  assert.equal(h.saved['mevicar-spotify-auth-v1'], undefined, 'PKCE request consumed');
});

await scenario('network failure during exchange: code and PKCE request survive, retry succeeds', async () => {
  const h = harness({ pending: freshPending('retry-state-0001'), bridgeCallback: callbackFor('retry-state-0001') });
  await settle();
  assert.equal(h.tokenCalls.length, 1);
  h.tokenCalls[0].networkFail();
  await settle(10);
  assert.equal(h.connected(), false);
  assert.equal(h.count('bridge:spotify.callback.ack'), 0,
    'a transport error is not a definitive result; Android must keep the code');
  assert.ok(h.saved['mevicar-spotify-auth-v1'], 'PKCE request must survive a transport error');
  h.nudge();
  await settle(10);
  assert.equal(h.tokenCalls.length, 2, 'the next pull must retry the exchange');
  h.tokenCalls[1].succeed();
  await settle(10);
  assert.equal(h.connected(), true);
  assert.equal(h.count('bridge:spotify.callback.ack'), 1);
  assert.equal(h.heldByAndroid(), '');
});

await scenario('Spotify rejects the code: definitive error is acknowledged once, no retry loop', async () => {
  const h = harness({ pending: freshPending('deny-state-00001'), bridgeCallback: callbackFor('deny-state-00001') });
  await settle();
  h.tokenCalls[0].reject(400, 'invalid_grant');
  await settle(10);
  assert.equal(h.connected(), false);
  assert.equal(h.count('bridge:spotify.callback.ack'), 1);
  assert.equal(h.saved['mevicar-spotify-auth-v1'], undefined);
  h.nudge(); await settle(10);
  h.push(callbackFor('deny-state-00001')); await settle(10);
  assert.equal(h.tokenCalls.length, 1, 'a rejected code must never be sent again');
});

await scenario('stale Android callback never touches a newer PKCE request', async () => {
  const h = harness({ pending: freshPending('new-state-000001'), bridgeCallback: callbackFor('old-state-000001') });
  await settle(10);
  assert.equal(h.tokenCalls.length, 0);
  assert.equal(h.count('bridge:spotify.callback.ack'), 1, 'stale callback is released');
  assert.equal(JSON.parse(h.saved['mevicar-spotify-auth-v1']).state, 'new-state-000001');
  assert.equal(h.connected(), false);
});

await scenario('leftover callback is released even when a session already exists', async () => {
  const h = harness({
    bridgeCallback: callbackFor('left-state-00001'),
    token: { access_token: 'existing', refresh_token: 'existing-r', expires_at: Date.now() + 3600e3, scope: 'streaming' }
  });
  h.nudge();
  await settle(10);
  assert.equal(h.tokenCalls.length, 0);
  assert.equal(h.heldByAndroid(), '', 'Android must not keep an obsolete code forever');
});

await scenario('diagnostics never contain the code, verifier or tokens', async () => {
  const h = harness({ pending: freshPending('diag-state-00001'), bridgeCallback: callbackFor('diag-state-00001') });
  await settle();
  h.tokenCalls[0].succeed();
  await settle(10);
  const visible = JSON.stringify(h.window.meviSpotifyDebug()) +
    String(h.saved['mevicar-spotify-diagnostic-v1'] || '') +
    Object.entries(h.saved).filter(([key]) => /diag/i.test(key)).map(([, value]) => value).join('') +
    h.window.meviSpotifyHTML(false);
  for (const secret of [SECRET_CODE, SECRET_VERIFIER, SECRET_ACCESS, SECRET_REFRESH, 'diag-state-00001']) {
    assert.equal(visible.includes(secret), false, 'diagnostics leak a secret value');
  }
  const log = h.window.meviSpotifyDebug().oauthLog;
  assert.ok(Array.isArray(log) && log.length >= 3, 'debug() must expose the OAuth event log');
});

const expiredToken = () => ({ access_token: 'old', refresh_token: 'keep-me', expires_at: Date.now() - 1000, scope: 'streaming' });

await scenario('transient refresh failure (HTTP 503) keeps the session and refresh token', async () => {
  const h = harness({ token: expiredToken() });
  h.window.meviSpotifyRefresh();
  await settle(10);
  assert.ok(h.tokenCalls.length >= 1, 'startup must try to refresh the expired token');
  assert.match(h.tokenCalls[0].body, /grant_type=refresh_token/);
  h.tokenCalls[0].reject(503, 'server_error');
  await settle(10);
  assert.equal(h.connected(), true, 'a Spotify outage must not log the user out');
  assert.equal(JSON.parse(h.saved['mevicar-spotify-token-v1']).refresh_token, 'keep-me');
});

await scenario('refresh rejected with invalid_grant ends the session', async () => {
  const h = harness({ token: expiredToken() });
  h.window.meviSpotifyRefresh();
  await settle(10);
  h.tokenCalls[0].reject(400, 'invalid_grant');
  await settle(10);
  assert.equal(h.connected(), false);
  assert.equal(h.saved['mevicar-spotify-token-v1'], undefined);
});

if (failures.length) {
  console.error('Spotify OAuth hand-over: ' + failures.length + ' scenario(s) violated');
  process.exit(1);
}
console.log('Spotify OAuth hand-over: single owner, ack only after definitive result, transport retry, no secrets OK');
