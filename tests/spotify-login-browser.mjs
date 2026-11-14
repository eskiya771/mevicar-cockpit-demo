// Real-browser test for the Spotify login flow of the Android hybrid app.
//
// The node smoke tests load spotify.js with a mocked DOM and a no-op render().
// This test runs the real index.html in Chromium and checks what the user
// sees: after the OAuth callback the setup screen must be replaced by the
// library, and a page reload must not ask for a new login.
//
// Android is simulated by a fake MeviNativeBridge; Spotify's token endpoint
// and Web API are answered by route mocks. No real account, no network to
// Spotify, no DRM playback. It does not replace the device test.
//
// Run:  npm install --no-save playwright   (or playwright-core + installed Chrome)
//       node tests/spotify-login-browser.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

let chromium;
for (const name of ['playwright', 'playwright-core']) {
  try { ({ chromium } = await import(name)); break; } catch { /* try next */ }
}
if (!chromium) {
  console.log('SKIPPED spotify-login-browser: Playwright is not installed (npm install --no-save playwright)');
  process.exit(process.env.CI ? 1 : 0);
}

const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.join(ROOT, name === '/' ? 'index.html' : name);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  let body = fs.readFileSync(file);
  if (path.basename(file) === 'index.html') body = Buffer.from(body.toString('utf8').replace(/__MEVICAR_BUILD__/g, '999'));
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port + '/';

const CODE = 'browser-test-code-SECRET';
const ACCESS = 'browser-access-SECRET';
const REFRESH = 'browser-refresh-SECRET';

// Runs in the page before any app script: a minimal stand-in for Android.
// The held callback lives in sessionStorage so that it survives a reload the
// same way Android keeps it across a WebView reload.
function fakeAndroid() {
  if (!localStorage.getItem('mevicar-spotify-client-v1')) localStorage.setItem('mevicar-spotify-client-v1', 'browsertestclient0001');
  const log = name => {
    const list = JSON.parse(sessionStorage.getItem('__bridgeLog') || '[]');
    list.push(name); sessionStorage.setItem('__bridgeLog', JSON.stringify(list));
  };
  const bridge = {
    postMessage(raw) {
      let req; try { req = JSON.parse(raw); } catch { return; }
      log(req.action);
      let reply = { id: req.id, ok: false, error: 'unsupported' };
      if (req.action === 'spotify.authorize') {
        sessionStorage.setItem('__authorizeUrl', String(req.url || ''));
        reply = { id: req.id, ok: true };
      }
      if (req.action === 'spotify.callback.pull') {
        const held = sessionStorage.getItem('__heldCallback') || '';
        reply = { id: req.id, ok: true, ...(held ? { callback: held } : {}) };
      }
      if (req.action === 'spotify.callback.ack') {
        const held = sessionStorage.getItem('__heldCallback') || '';
        const acknowledged = !!held && new URL(held).searchParams.get('state') === req.state;
        if (acknowledged) sessionStorage.removeItem('__heldCallback');
        reply = { id: req.id, ok: true, acknowledged };
      }
      setTimeout(() => { if (typeof bridge.onmessage === 'function') bridge.onmessage({ data: JSON.stringify(reply) }); }, 0);
    }
  };
  window.MeviNativeBridge = bridge;
}

const json = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

async function runFlow(browser, { name, callbackPrefix }) {
  const context = await browser.newContext({ viewport: { width: 915, height: 412 }, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.addInitScript(fakeAndroid);
  const tokenBodies = [];
  await context.route(url => !url.href.startsWith(base), route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'accounts.spotify.com' && url.pathname === '/api/token') {
      tokenBodies.push(route.request().postData() || '');
      return json(route, { access_token: ACCESS, refresh_token: REFRESH, expires_in: 3600, token_type: 'Bearer',
        scope: 'streaming user-read-playback-state user-modify-playback-state user-library-read' });
    }
    if (url.hostname === 'api.spotify.com') {
      if (url.pathname === '/v1/me') return json(route, { display_name: 'Browser Test', product: 'premium', id: 'tester' });
      if (url.pathname === '/v1/me/player') return route.fulfill({ status: 204, body: '' });
      return json(route, { items: [], total: 0 });
    }
    return route.abort();   // maps, fonts, Spotify SDK: not part of this test
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const shellState = () => page.evaluate(() => document.querySelector('.sp-shell')?.dataset.state || '');
  const openSpotify = async () => {
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.meviSpotifyConnect === 'function' && typeof window.selectAudioSource === 'function');
    await page.evaluate(() => { window.launch('audio'); window.selectAudioSource('spotify'); });
    await page.waitForSelector('.sp-shell');
  };

  await openSpotify();
  assert.equal(await shellState(), 'setup', name + ': first start must show the setup screen');

  // The user taps the real, visible login button.
  const login = page.locator('.sp-onboard-actions .sp-primary');
  await login.scrollIntoViewIfNeeded();
  await login.click();
  await page.waitForFunction(() => !!sessionStorage.getItem('__authorizeUrl'));
  const authorize = new URL(await page.evaluate(() => sessionStorage.getItem('__authorizeUrl')));
  assert.equal(authorize.origin + authorize.pathname, 'https://accounts.spotify.com/authorize');
  assert.equal(authorize.searchParams.get('response_type'), 'code');
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(authorize.searchParams.get('code_challenge'), name + ': PKCE challenge missing');
  assert.equal(authorize.searchParams.get('redirect_uri'), 'mevicarnext://spotify-callback');
  assert.equal(authorize.searchParams.has('client_secret'), false);
  assert.equal(new URL(page.url()).href, base, name + ': the WebView must stay on the MeviCar page');
  const state = authorize.searchParams.get('state');

  // Spotify redirects to the deep link; Android holds it and sends a
  // secret-free hint. The web app must fetch and process it.
  await page.evaluate(([callback]) => {
    sessionStorage.setItem('__heldCallback', callback);
    window.meviSpotifyNativeStage('Build 99 · Spotify-Rückruf liegt bereit');
  }, [callbackPrefix + '?code=' + CODE + '&state=' + state]);

  await page.waitForFunction(() => {
    const value = document.querySelector('.sp-shell')?.dataset.state;
    return !!value && value !== 'setup';
  }, null, { timeout: 8000 }).catch(() => {});
  assert.equal(await shellState(), 'ready', name + ': the app stayed on the login screen after the callback');
  assert.equal(await page.locator('.sp-onboard-actions').count(), 0, name + ': setup UI still visible');

  assert.equal(tokenBodies.length, 1, name + ': the one-time code must be exchanged exactly once');
  const exchange = new URLSearchParams(tokenBodies[0]);
  assert.equal(exchange.get('grant_type'), 'authorization_code');
  assert.equal(exchange.get('code'), CODE);
  assert.ok(exchange.get('code_verifier'), name + ': PKCE verifier missing');
  assert.equal(exchange.has('client_secret'), false);

  await page.waitForFunction(() => !sessionStorage.getItem('__heldCallback'), null, { timeout: 5000 }).catch(() => {});
  const bridgeLog = JSON.parse(await page.evaluate(() => sessionStorage.getItem('__bridgeLog') || '[]'));
  assert.equal(bridgeLog.filter(entry => entry === 'spotify.callback.ack').length, 1, name + ': exactly one acknowledgement');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('__heldCallback')), null, name + ': Android still holds the code');

  // Nothing secret in what the user (or a screenshot) can see.
  const visible = await page.evaluate(() => document.body.innerText + JSON.stringify(window.meviSpotifyDebug()));
  for (const secret of [CODE, ACCESS, REFRESH, state, exchange.get('code_verifier')]) {
    assert.equal(visible.includes(secret), false, name + ': page or diagnostics show a secret value');
  }

  // App restart: the stored session must be used, no second login.
  await openSpotify();
  assert.equal(await shellState(), 'ready', name + ': reload asked for a new login');
  assert.equal(tokenBodies.length, 1, name + ': reload must not exchange or refresh anything');

  assert.deepEqual(pageErrors, [], name + ': uncaught page errors');
  await context.close();
}

let browser;
try { browser = await chromium.launch({ headless: true }); }
catch { browser = await chromium.launch({ headless: true, channel: 'chrome' }); }
const failures = [];
try {
  for (const flow of [
    { name: 'callback without slash', callbackPrefix: 'mevicarnext://spotify-callback' },
    { name: 'callback with slash', callbackPrefix: 'mevicarnext://spotify-callback/' }
  ]) {
    try { await runFlow(browser, flow); console.log('  ok   ' + flow.name); }
    catch (error) { failures.push(flow.name); console.log('  FAIL ' + flow.name + '\n       ' + String(error.message).split('\n')[0]); }
  }
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.error('Spotify login (real browser): ' + failures.length + ' flow(s) failed');
  process.exit(1);
}
console.log('Spotify login (real browser): setup -> authorize -> callback -> library, reload keeps session OK');
