import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const spotify = fs.readFileSync('spotify.js','utf8');
const settings = fs.readFileSync('credential-settings.js','utf8');
new vm.Script(spotify,{filename:'spotify.js'});

// The original Web App is still the source of truth for its Spotify features.
for (const feature of [
  'Web Playback SDK','user-library-read','playlist-read-private','playlist-read-collaborative',
  'user-read-recently-played','user-library-modify','function startWebPlayer',
  'function loadBrowse','function queueItem','function playItem',
  'function setVolume','function likeCurrent'
]) {
  assert(spotify.includes(feature),'Missing Web App Spotify feature: '+feature);
}
// APK uses the same account interface plus a distinct native audio backend.
for (const feature of [
  "const NATIVE_REDIRECT = 'mevicarnext://spotify-callback'",
  'if (androidSpotify()) return NATIVE_REDIRECT',
  "meviSpotifyAcceptNativeCallback: uri => handleCallback(uri)",
  "nativeRequest('spotify.connect'",
  "nativeRequest('spotify.play'",
  "nativeRequest('spotify.queue'",
  "nativeRequest('spotify.seek'",
  "nativeRequest('spotify.shuffle'",
  "nativeRequest('spotify.repeat'",
  "nativeRequest('spotify.disconnect'"
]) {
  assert(spotify.includes(feature),'Missing Android Spotify integration: '+feature);
}
assert(spotify.includes('if (!nativeCallback) cleanCallbackUrl(url)'), 'Custom Android callback must not alter the HTTPS history');
assert(spotify.includes('saved.state !== state'), 'PKCE state check required');
assert(spotify.includes('code_verifier: saved.verifier'), 'PKCE exchange required');
assert(spotify.includes('if (androidSpotify()) { await connectNative(); return; }'),'Native playback must not start Web Playback SDK');
assert(spotify.includes('st.nativeConnected') && spotify.includes('st.webDeviceId'),'Preserve native and browser player state');
assert(!spotify.includes('localStorage.setItem(ANDROID_REDIRECT'), 'Redirect URI is not a secret');
assert(settings.includes('meviSpotifySaveClient'), 'Client ID still configured exclusively under Settings');
console.log('Spotify Next Android parity: Web API, native routing and PKCE contract checks passed');
