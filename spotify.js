/* MeviCar Next – Spotify Connect remote control.
   Controls the user's active Spotify device through the Spotify Web API.
   OAuth Authorization Code + PKCE only: no backend, no client secret, tokens stay local. */
(function () {
  'use strict';

  const API = 'https://api.spotify.com/v1';
  const ACCOUNTS = 'https://accounts.spotify.com';
  const SCOPES = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'user-library-read',
    'user-library-modify',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-read-recently-played'
  ].join(' ');
  const KEYS = {
    client: 'mevicar-spotify-client-v1',
    token: 'mevicar-spotify-token-v1',
    history: 'mevicar-spotify-history-v1',
    device: 'mevicar-spotify-device-v1',
    auth: 'mevicar-spotify-auth-v1'
  };
  const KINDS = new Set(['track', 'album', 'playlist', 'artist', 'show', 'episode']);
  const BROWSE_DEFS = {
    playlists: { label: 'Playlists', path: '/me/playlists?limit=50', pick: d => d?.items || [], map: mapPlaylist },
    tracks: { label: 'Favoriten', path: '/me/tracks?limit=50', pick: d => d?.items || [], map: x => mapTrack(x?.track) },
    albums: { label: 'Alben', path: '/me/albums?limit=50', pick: d => d?.items || [], map: x => mapAlbum(x?.album) },
    shows: { label: 'Podcasts', path: '/me/shows?limit=50', pick: d => d?.items || [], map: x => mapShow(x?.show) },
    recent: { label: 'Zuletzt', path: '/me/player/recently-played?limit=20', pick: d => d?.items || [], map: x => mapTrack(x?.track) }
  };
  const SEARCH_GROUPS = [
    ['tracks', 'Titel', 'music'],
    ['albums', 'Alben', 'disc'],
    ['artists', 'Interpreten', 'mic'],
    ['playlists', 'Playlists', 'list'],
    ['shows', 'Podcasts', 'podcast'],
    ['episodes', 'Podcast-Folgen', 'podcast']
  ];
  const ICONS = {
    spotify: '<circle cx="12" cy="12" r="9.2"/><path d="M7.2 9.4c3.4-1.1 7.1-.7 9.7.9M7.8 12.5c2.8-.9 5.8-.5 8 .8M8.5 15.5c2.2-.7 4.5-.4 6.2.6"/>',
    play: '<path d="m8 5 12 7-12 7Z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
    next: '<path d="m5 4 11 8-11 8Z" fill="currentColor" stroke="none"/><path d="M19 4v16" stroke-width="3"/>',
    prev: '<path d="m19 4-11 8 11 8Z" fill="currentColor" stroke="none"/><path d="M5 4v16" stroke-width="3"/>',
    shuffle: '<path d="M3 7h3c5 0 6 10 12 10h3M18 14l3 3-3 3M3 17h3c1 0 2-.5 3-2M14 9c1-1.5 2-2 4-2h3M18 4l3 3-3 3"/>',
    repeat: '<path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>',
    heart: '<path d="M20.8 4.6a5.3 5.3 0 0 0-7.4 0L12 6l-1.4-1.4a5.3 5.3 0 0 0-7.4 7.4L12 21l8.8-9a5.3 5.3 0 0 0 0-7.4Z"/>',
    search: '<circle cx="10.8" cy="10.8" r="7.2"/><path d="m16 16 5.5 5.5"/>',
    music: '<path d="M9 18V5l12-3v13"/><path d="M9 8l12-3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="15" r="3"/>',
    disc: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2"/><path d="M12 2a10 10 0 0 1 10 10"/>',
    folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1"/>',
    podcast: '<circle cx="12" cy="11" r="2.5"/><path d="M8.5 18.5a7 7 0 1 1 7 0M5 21a11 11 0 1 1 14 0"/>',
    devices: '<rect x="2" y="5" width="15" height="11" rx="2"/><path d="M6 20h7M9.5 16v4M19 9h3v9h-3z"/>',
    queue: '<path d="M4 6h11M4 12h11M4 18h7M18 12v8M15 17h6"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-1.5 5.5"/><path d="M20 4v7h-7"/>',
    settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1-2.9 2.9-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21h-4v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1-2.9-2.9.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3v-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1 2.9-2.9.1.1a1.6 1.6 0 0 0 1.8.3 1.6 1.6 0 0 0 1-1.5V3h4v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1 2.9 2.9-.1.1a1.6 1.6 0 0 0-.3 1.8 1.6 1.6 0 0 0 1.5 1h.1v4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>',
    back: '<path d="m15 4-8 8 8 8M8 12h13"/>',
    external: '<path d="M14 4h6v6M20 4l-8 8M19 14v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    volume: '<path d="M3 9v6h4l5 4V5L7 9ZM16 8c2 1 2 7 0 8M19 5c4 3 4 11 0 14"/>',
    alert: '<path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 17.5v.5"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="m5 5 14 14M19 5 5 19"/>'
  };
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeArg = s => encodeURIComponent(String(s)).replace(/'/g, '%27');
  const decodeArg = s => decodeURIComponent(s);
  const icon = id => '<svg class="sp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[id] || ICONS.music) + '</svg>';
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function fmtMs(ms) {
    const total = Number(ms);
    if (!Number.isFinite(total) || total < 0) return '–:––';
    const seconds = Math.floor(total / 1000);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
  }
  function typeLabel(kind) {
    return { track: 'Titel', album: 'Album', playlist: 'Playlist', artist: 'Interpret', show: 'Podcast', episode: 'Podcast-Folge', collection: 'Bibliothek' }[kind] || 'Spotify';
  }
  function imageUrl(images) {
    const list = Array.isArray(images) ? images : [];
    const hit = list.find(x => x && typeof x.url === 'string' && x.url.startsWith('https://'));
    return hit ? hit.url : '';
  }
  function readJson(storage, key, otherwise) {
    try {
      const raw = storage.getItem(key);
      if (!raw) return otherwise;
      return JSON.parse(raw) ?? otherwise;
    } catch { return otherwise; }
  }
  function writeJson(storage, key, value) {
    try { storage.setItem(key, JSON.stringify(value)); } catch { /* storage can be blocked */ }
  }
  function readClientId() {
    try { return String(localStorage.getItem(KEYS.client) || '').trim(); } catch { return ''; }
  }
  function validClientId(value) { return /^[A-Za-z0-9]{8,64}$/.test(value); }
  function readDeviceId() {
    try { return String(localStorage.getItem(KEYS.device) || '').trim(); } catch { return ''; }
  }
  function rememberDevice(id) {
    const value = String(id || '').trim();
    if (!value) return;
    try { localStorage.setItem(KEYS.device, value); } catch { /* storage can be blocked */ }
  }
  function readToken() {
    const token = readJson(localStorage, KEYS.token, null);
    if (!token || typeof token.access_token !== 'string' || !token.access_token) return null;
    return {
      access_token: token.access_token,
      refresh_token: typeof token.refresh_token === 'string' ? token.refresh_token : '',
      expires_at: Number(token.expires_at) || 0,
      scope: typeof token.scope === 'string' ? token.scope : '',
      token_type: token.token_type || 'Bearer'
    };
  }
  function saveToken(data) {
    const previous = readToken();
    const token = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || previous?.refresh_token || '',
      expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
      scope: data.scope || previous?.scope || '',
      token_type: data.token_type || 'Bearer'
    };
    writeJson(localStorage, KEYS.token, token);
    st.token = token;
    return token;
  }
  function clearToken() {
    try { localStorage.removeItem(KEYS.token); } catch { /* ignore */ }
    st.token = null;
  }
  function maskClient(value) {
    const text = String(value || '');
    if (!text) return '—';
    if (text.length <= 10) return text.slice(0, 2) + '…' + text.slice(-2);
    return text.slice(0, 4) + '…' + text.slice(-4);
  }
  function redirectUri() {
    let path = location.pathname || '/';
    path = path.replace(/\/index\.html$/i, '/');
    if (!path.endsWith('/')) path += '/';
    return location.origin + path;
  }
  function parseLink(raw) {
    const value = String(raw || '').trim();
    const direct = /^spotify:(track|album|playlist|artist|show|episode):([A-Za-z0-9]{22})$/.exec(value);
    if (direct) return { uri: value, kind: direct[1] };
    let url;
    try { url = new URL(value); } catch { return null; }
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host !== 'open.spotify.com' && host !== 'play.spotify.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'intl' || /^intl-[a-z-]+$/i.test(parts[0] || '')) parts.shift();
    const [kind, id] = parts;
    if (!KINDS.has(kind) || !/^[A-Za-z0-9]{22}$/.test(id || '')) return null;
    return { uri: 'spotify:' + kind + ':' + id, kind };
  }
  function mapTrack(track) {
    if (!track || (!track.uri && !track.id)) return null;
    return {
      kind: 'track', uri: track.uri || ('spotify:track:' + track.id), id: track.id || '',
      title: track.name || 'Unbekannter Titel',
      meta: (track.artists || []).map(a => a?.name).filter(Boolean).join(', ') || 'Unbekannter Interpret',
      album: track.album?.name || '',
      image: imageUrl(track.album?.images) || imageUrl(track.images),
      duration: Number.isFinite(track.duration_ms) ? track.duration_ms : null
    };
  }
  function mapEpisode(episode) {
    if (!episode || (!episode.uri && !episode.id)) return null;
    return {
      kind: 'episode', uri: episode.uri || ('spotify:episode:' + episode.id), id: episode.id || '',
      title: episode.name || 'Podcast-Folge',
      meta: episode.show?.name || 'Podcast',
      album: episode.show?.name || '',
      image: imageUrl(episode.images) || imageUrl(episode.show?.images),
      duration: Number.isFinite(episode.duration_ms) ? episode.duration_ms : null
    };
  }
  function mapAlbum(album) {
    if (!album || (!album.uri && !album.id)) return null;
    return {
      kind: 'album', uri: album.uri || ('spotify:album:' + album.id), id: album.id || '',
      title: album.name || 'Album',
      meta: (album.artists || []).map(a => a?.name).filter(Boolean).join(', ') || 'Album',
      album: '', image: imageUrl(album.images),
      duration: null
    };
  }
  function mapArtist(artist) {
    if (!artist || (!artist.uri && !artist.id)) return null;
    return {
      kind: 'artist', uri: artist.uri || ('spotify:artist:' + artist.id), id: artist.id || '',
      title: artist.name || 'Interpret', meta: 'Interpret', album: '',
      image: imageUrl(artist.images), duration: null
    };
  }
  function mapPlaylist(playlist) {
    if (!playlist || (!playlist.uri && !playlist.id)) return null;
    const count = playlist.items?.total ?? playlist.tracks?.total;
    return {
      kind: 'playlist', uri: playlist.uri || ('spotify:playlist:' + playlist.id), id: playlist.id || '',
      title: playlist.name || 'Playlist',
      meta: (playlist.owner?.display_name || 'Spotify') + (Number.isFinite(count) ? ' · ' + count + ' Titel' : ''),
      album: '', image: imageUrl(playlist.images), duration: null
    };
  }
  function mapShow(show) {
    if (!show || (!show.uri && !show.id)) return null;
    return {
      kind: 'show', uri: show.uri || ('spotify:show:' + show.id), id: show.id || '',
      title: show.name || 'Podcast', meta: 'Podcast', album: '',
      image: imageUrl(show.images), duration: null
    };
  }
  function normalizeSearch(data) {
    return {
      tracks: (data?.tracks?.items || []).map(mapTrack).filter(Boolean),
      albums: (data?.albums?.items || []).map(mapAlbum).filter(Boolean),
      artists: (data?.artists?.items || []).map(mapArtist).filter(Boolean),
      playlists: (data?.playlists?.items || []).map(mapPlaylist).filter(Boolean),
      shows: (data?.shows?.items || []).map(mapShow).filter(Boolean),
      episodes: (data?.episodes?.items || []).map(mapEpisode).filter(Boolean)
    };
  }

  const st = {
    clientId: readClientId(),
    token: readToken(),
    profile: null,
    profileLoading: false,
    player: null,
    playerLoaded: false,
    playerAt: 0,
    progressBase: 0,
    devices: [],
    devicesOpen: false,
    devicesLoading: false,
    devicesError: '',
    pendingPlay: null,
    queue: null,
    queueOpen: false,
    queueLoading: false,
    queueError: '',
    liked: null,
    likedUri: '',
    tab: 'now',
    browse: 'playlists',
    browseData: {},
    browseLoading: false,
    browseError: '',
    query: '',
    results: null,
    searchLoading: false,
    searchError: '',
    voiceListening: false,
    voiceError: '',
    history: readJson(localStorage, KEYS.history, []),
    accountOpen: false,
    confirmReset: false,
    authError: '',
    authLoading: false,
    error: '',
    notice: '',
    mounted: false,
    pollBlockedUntil: 0
  };
  if (!Array.isArray(st.history)) st.history = [];
  if (st.token && !st.clientId) { clearToken(); }

  let pollTimer = null;
  let tickTimer = null;
  let pollBusy = false;
  let refreshing = null;
  let searchTimer = null;
  let searchSerial = 0;
  let voiceRecognition = null;
  let voiceSerial = 0;
  let noticeTimer = null;
  let globalsBound = false;

  function makeError(message, code, status) {
    const error = new Error(message);
    error.code = code || 'api';
    error.status = status || 0;
    return error;
  }
  function toNetworkError(cause) {
    const error = makeError(cause?.name === 'AbortError' ? 'Zeitüberschreitung' : 'Netzwerkfehler', 'network');
    return error;
  }
  function errorText(error) {
    if (!error) return '';
    if (error.status === 403 && /premium/i.test(error.message || '')) return 'Spotify Premium erforderlich: Wiedergabesteuerung ist nur mit Premium möglich.';
    if (error.code === 'no-device') return 'Kein aktives Spotify-Gerät gefunden. Öffne Spotify auf iPhone, PC oder DeX und starte einen Titel.';
    if (error.code === 'rate-limit') return 'Spotify drosselt die Anfragen. Bitte kurz warten.';
    if (error.code === 'auth') return 'Spotify-Sitzung abgelaufen. Bitte erneut verbinden.';
    if (error.code === 'network') return 'Spotify ist nicht erreichbar. Prüfe die Internetverbindung.';
    if (error.code === 'forbidden') return 'Spotify hat diese Aktion eingeschränkt.';
    return 'Spotify: ' + (error.message || 'Unbekannter Fehler');
  }
  function authErrorText(response) {
    if (!response) return 'Spotify-Anmeldung fehlgeschlagen.';
    if (response.error === 'invalid_grant') return 'Spotify-Anmeldung abgelaufen. Bitte erneut verbinden.';
    return response.error_description || response.error || 'Spotify-Anmeldung fehlgeschlagen.';
  }

  function randomString(bytes) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const data = new Uint8Array(bytes);
    window.crypto.getRandomValues(data);
    let out = '';
    for (const byte of data) out += alphabet[byte % alphabet.length];
    return out;
  }
  function base64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function codeChallenge(verifier) {
    const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return base64Url(digest);
  }
  function cleanCallbackUrl(url) {
    for (const key of ['code', 'state', 'error', 'error_description']) url.searchParams.delete(key);
    const query = url.searchParams.toString();
    try {
      history.replaceState(null, '', url.pathname + (query ? '?' + query : '') + url.hash);
    } catch { /* ignore */ }
  }

  async function connect(showDialog) {
    st.authError = '';
    const clientId = readClientId();
    if (!clientId) {
      st.accountOpen = false;
      st.authError = 'Bitte zuerst eine Spotify Client ID speichern.';
      rerender();
      return;
    }
    if (!window.crypto?.subtle) {
      st.authError = 'Spotify-Anmeldung benötigt HTTPS und einen aktuellen Browser.';
      rerender();
      return;
    }
    try {
      const verifier = randomString(64);
      const state = randomString(24);
      const redirect = redirectUri();
      const challenge = await codeChallenge(verifier);
      writeJson(sessionStorage, KEYS.auth, { verifier, state, redirect, at: Date.now() });
      const url = new URL(ACCOUNTS + '/authorize');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('scope', SCOPES);
      url.searchParams.set('redirect_uri', redirect);
      url.searchParams.set('state', state);
      url.searchParams.set('code_challenge_method', 'S256');
      url.searchParams.set('code_challenge', challenge);
      if (showDialog === true) url.searchParams.set('show_dialog', 'true');
      location.assign(url.toString());
    } catch (error) {
      st.authError = 'Spotify-Anmeldung konnte nicht gestartet werden: ' + (error.message || error);
      rerender();
    }
  }

  async function refreshToken() {
    const current = readToken();
    const clientId = readClientId();
    if (!current?.refresh_token || !clientId) throw makeError('Keine gültige Spotify-Sitzung.', 'auth');
    let response;
    try {
      response = await fetch(ACCOUNTS + '/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: current.refresh_token,
          client_id: clientId
        })
      });
    } catch (error) { throw toNetworkError(error); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      if (data.error === 'invalid_grant') clearToken();
      throw makeError(authErrorText(data), 'auth', response.status);
    }
    saveToken({ ...data, refresh_token: data.refresh_token || current.refresh_token });
    return st.token;
  }

  async function accessToken() {
    if (!st.token) throw makeError('Nicht mit Spotify verbunden.', 'auth');
    if (Date.now() < (st.token.expires_at || 0) - 60000) return st.token.access_token;
    if (!refreshing) {
      refreshing = refreshToken().finally(() => { refreshing = null; });
    }
    try { await refreshing; } catch (error) {
      if (error.code === 'auth') clearToken();
      throw error;
    }
    if (!st.token) throw makeError('Spotify-Sitzung abgelaufen.', 'auth');
    return st.token.access_token;
  }

  async function apiFetch(path, token, options) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const headers = { Authorization: 'Bearer ' + token };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    try {
      return await fetch(API + path, {
        method: options.method || 'GET',
        headers,
        body: options.body,
        signal: controller.signal,
        cache: 'no-store'
      });
    } finally { clearTimeout(timeout); }
  }

  async function api(path, options = {}) {
    let token = await accessToken();
    let response;
    try {
      response = await apiFetch(path, token, options);
    } catch (error) { throw toNetworkError(error); }
    if (response.status === 401) {
      st.token.expires_at = 0;
      refreshing = null;
      token = await accessToken();
      try { response = await apiFetch(path, token, options); } catch (error) { throw toNetworkError(error); }
    }
    if (response.status === 204) return null;
    const text = await response.text();
    let data = null;
    if (text) { try { data = JSON.parse(text); } catch { data = null; } }
    if (response.ok) return data;
    const message = data?.error?.message || data?.error_description || (typeof data?.error === 'string' ? data.error : '') || ('HTTP ' + response.status);
    let code = 'api';
    if (response.status === 401) code = 'auth';
    else if (response.status === 403) code = /premium/i.test(message) ? 'premium' : 'forbidden';
    else if (response.status === 404) code = /device/i.test(message) ? 'no-device' : 'not-found';
    else if (response.status === 429) code = 'rate-limit';
    const error = makeError(message, code, response.status);
    if (code === 'rate-limit') {
      const retry = Number(response.headers.get('Retry-After')) || 10;
      error.retryAfter = retry;
      st.pollBlockedUntil = Date.now() + retry * 1000;
    }
    if (code === 'auth') clearToken();
    throw error;
  }

  async function handleCallback() {
    const url = new URL(location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const oauthError = url.searchParams.get('error');
    const description = url.searchParams.get('error_description');
    if (!code && !oauthError) return false;
    const saved = readJson(sessionStorage, KEYS.auth, null);
    cleanCallbackUrl(url);
    try { sessionStorage.removeItem(KEYS.auth); } catch { /* ignore */ }
    if (oauthError) {
      st.authError = oauthError === 'access_denied' ? 'Spotify-Verbindung wurde abgebrochen.' : ('Spotify: ' + (description || oauthError));
      returnToAudio();
      return true;
    }
    if (!saved || !state || saved.state !== state || !saved.verifier) {
      st.authError = 'Spotify-Sicherheitsprüfung fehlgeschlagen. Bitte erneut verbinden.';
      returnToAudio();
      return true;
    }
    st.authLoading = true;
    returnToAudio();
    try {
      const response = await fetch(ACCOUNTS + '/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: saved.redirect || redirectUri(),
          client_id: readClientId(),
          code_verifier: saved.verifier
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.access_token) throw makeError(authErrorText(data), 'auth', response.status);
      saveToken(data);
      st.authError = '';
      st.accountOpen = false;
      st.tab = 'now';
      setNotice('Mit Spotify verbunden.');
      rerender();
      await Promise.allSettled([loadProfile(), poll(true)]);
      rerender();
    } catch (error) {
      st.authError = 'Anmeldung fehlgeschlagen: ' + errorText(error);
      rerender();
    } finally {
      st.authLoading = false;
      rerender();
    }
    return true;
  }
  function returnToAudio() {
    if (typeof window.selectAudioSource === 'function') window.selectAudioSource('spotify');
    if (typeof window.openApp === 'function') window.openApp('audio');
    rerender();
  }

  function rerender() {
    if (typeof window.render === 'function') window.render();
    else { paintNow(); paintBrowse(); paintSearch(); paintBanner(); }
  }
  function setNotice(text, ms = 4500) {
    st.notice = String(text || '');
    st.error = '';
    paintBanner();
    clearTimeout(noticeTimer);
    if (st.notice) {
      noticeTimer = setTimeout(() => {
        if (st.notice === text) { st.notice = ''; paintBanner(); }
      }, ms);
    }
  }
  function handleApiError(error, fromPoll) {
    st.error = errorText(error);
    st.notice = '';
    if (error.code === 'auth') {
      clearToken();
      st.player = null;
      st.profile = null;
      st.authError = errorText(error);
      st.accountOpen = false;
      rerender();
      return;
    }
    if (error.code === 'no-device') {
      st.player = null;
      st.playerLoaded = true;
      st.devicesOpen = true;
      loadDevices().catch(() => {});
    }
    if (fromPoll) {
      paintBanner();
      if (error.code === 'no-device') paintNow();
    } else rerender();
  }

  function sourceMarkup() {
    return '<div class="sp-sources" role="group" aria-label="Audioquelle">' +
      [['radio', 'Radio', 'music'], ['spotify', 'Spotify', 'spotify'], ['media', 'Medien', 'folder']].map(([id, label, glyph]) =>
        '<button type="button" class="sp-source' + (id === 'spotify' ? ' active' : '') + '" data-source="' + id + '" aria-label="' + esc(label) + '" aria-pressed="' + (id === 'spotify') + '" title="' + esc(label) + '" onclick="selectAudioSource(\'' + id + '\')">' + icon(glyph) + '<span>' + esc(label) + '</span></button>'
      ).join('') + '</div>';
  }
  function topMarkup() {
    const account = st.profile?.display_name || st.profile?.id || 'Verbunden';
    return '<div class="sp-top">' +
      '<div class="sp-identity"><span class="sp-eyebrow">SPOTIFY CONNECT</span><span class="sp-heading">SPOTIFY <em>REMOTE</em></span></div>' +
      '<div class="sp-top-actions">' + sourceMarkup() +
      (st.token ? '<span class="sp-account" title="Verbundenes Spotify-Konto"><span class="sp-dot"></span><span id="sp-account-name">' + esc(account) + '</span></span>' : '') +
      (st.token ? '<button type="button" class="sp-icon-button" aria-label="Spotify aktualisieren" title="Aktualisieren" onclick="meviSpotifyRefresh()">' + icon('refresh') + '</button>' : '') +
      '<button type="button" class="sp-icon-button" aria-label="' + (st.accountOpen ? 'Zurück zur Wiedergabe' : 'Spotify-Konto und Einrichtung') + '" title="' + (st.accountOpen ? 'Zurück' : 'Konto') + '" onclick="meviSpotifyAccount()">' + icon(st.accountOpen ? 'back' : 'settings') + '</button>' +
      '</div></div>';
  }
  function bannerMarkup() {
    const text = st.error || st.notice;
    return '<div class="sp-banner' + (st.error ? ' is-error' : '') + '" id="sp-banner" role="status" ' + (text ? '' : 'hidden') + '>' + icon(st.error ? 'alert' : 'check') + '<span>' + esc(text) + '</span></div>';
  }
  function tabsMarkup() {
    return '<div class="sp-tabs" role="tablist" aria-label="Spotify-Ansichten">' +
      [['now', 'Jetzt', 'disc'], ['browse', 'Durchsuchen', 'list'], ['search', 'Suche', 'search']].map(([id, label, glyph]) =>
        '<button type="button" class="sp-tab' + (st.tab === id ? ' selected' : '') + '" role="tab" data-tab="' + id + '" aria-selected="' + (st.tab === id) + '" onclick="meviSpotifyTab(\'' + id + '\')">' + icon(glyph) + '<span>' + esc(label) + '</span></button>'
      ).join('') + '</div>';
  }
  function onboardingMarkup() {
    const redirect = redirectUri();
    const hasClient = !!st.clientId;
    return '<div class="sp-onboard">' +
      '<div class="sp-onboard-head"><span class="sp-onboard-icon">' + icon('spotify') + '</span><div>' +
      '<span class="sp-eyebrow">SPOTIFY CONNECT // REMOTE</span><h2>Spotify im Cockpit steuern</h2>' +
      '<p>Die PWA steuert ein aktives Spotify-Gerät über die Web API. Die Musik läuft weiter in der Spotify-App, nicht im Browser. Spotify Premium ist erforderlich.</p></div></div>' +
      (st.authError ? '<div class="sp-alert" role="alert">' + icon('alert') + '<span>' + esc(st.authError) + '</span></div>' : '') +
      (st.notice ? '<div class="sp-alert is-ok">' + icon('check') + '<span>' + esc(st.notice) + '</span></div>' : '') +
      '<div class="sp-setup">' +
      '<div class="sp-step"><span class="sp-step-num">1</span><div><strong>Spotify-App bereithalten</strong><p>Öffne Spotify auf iPhone, PC oder DeX und starte einen Titel, damit ein Gerät aktiv ist.</p><button type="button" class="sp-linkbtn" onclick="meviSpotifyOpen()">Spotify öffnen' + icon('external') + '</button></div></div>' +
      '<div class="sp-step"><span class="sp-step-num">2</span><div><strong>Redirect-URI hinterlegen</strong><p>Im Spotify Developer Dashboard unter Edit Settings als Redirect URI eintragen. Sie muss exakt übereinstimmen.</p><div class="sp-copy"><input id="sp-redirect" type="text" readonly value="' + esc(redirect) + '" onclick="this.select()" aria-label="Spotify Redirect-URI"><button type="button" onclick="meviSpotifyCopyRedirect()" aria-label="Redirect-URI kopieren" title="Kopieren">' + icon('copy') + '</button></div><a class="sp-linkbtn" href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">Developer Dashboard' + icon('external') + '</a></div></div>' +
      '<div class="sp-step"><span class="sp-step-num">3</span><div><strong>Client ID eintragen</strong><p>Die Client ID ist öffentlich. Ein Client Secret wird nicht benötigt und nicht gespeichert.</p><div class="sp-client"><input id="sp-client-id" type="text" inputmode="text" autocomplete="off" spellcheck="false" placeholder="Spotify Client ID" value="' + esc(st.clientId) + '" aria-label="Spotify Client ID" onkeydown="if(event.key===\'Enter\'){event.preventDefault();meviSpotifySaveClient(this.value)}"><button type="button" onclick="meviSpotifySaveClient(document.getElementById(\'sp-client-id\').value)">Speichern</button></div></div></div>' +
      '</div>' +
      '<div class="sp-onboard-actions"><button type="button" class="sp-primary" onclick="meviSpotifyConnect()" ' + (!hasClient || st.authLoading ? 'disabled' : '') + '>' + icon('spotify') + (st.authLoading ? 'Verbinde …' : 'Mit Spotify verbinden') + '</button>' +
      (hasClient ? '<span class="sp-fine">Client ID: ' + esc(maskClient(st.clientId)) + '</span>' : '') + '</div>' +
      '<p class="sp-fine">Kein Passwort und kein Client Secret. Access- und Refresh-Token bleiben lokal in diesem Browser. Dev Mode: maximal 5 Nutzer, der App-Inhaber braucht Premium. Auf iPhone kann die Anmeldung aus einer installierten PWA heraus in Safari landen; dann die Verbindung in Safari herstellen.</p>' +
      '</div>';
  }
  function accountMarkup() {
    const profile = st.profile || {};
    const name = profile.display_name || profile.id || 'Spotify-Konto';
    return '<div class="sp-account">' +
      '<div class="sp-account-head"><button type="button" class="sp-back" onclick="meviSpotifyAccount()">' + icon('back') + '<span>Zurück</span></button><span class="sp-eyebrow">SPOTIFY KONTO</span></div>' +
      '<div class="sp-account-body">' +
      '<div class="sp-account-profile"><span class="sp-account-avatar">' + icon('spotify') + '</span><div><strong id="sp-account-display">' + esc(name) + '</strong><small id="sp-account-id">' + esc(profile.id || 'Spotify Connect') + '</small></div></div>' +
      '<div class="sp-account-row"><span>Client ID</span><code>' + esc(maskClient(st.clientId)) + '</code></div>' +
      '<div class="sp-account-row"><span>Redirect-URI</span><div class="sp-copy"><input id="sp-redirect" type="text" readonly value="' + esc(redirectUri()) + '" onclick="this.select()" aria-label="Spotify Redirect-URI"><button type="button" onclick="meviSpotifyCopyRedirect()" aria-label="Redirect-URI kopieren" title="Kopieren">' + icon('copy') + '</button></div></div>' +
      (st.confirmReset ? '<div class="sp-alert" role="alert">' + icon('alert') + '<span>Client ID und Spotify-Token wirklich aus diesem Browser löschen?</span></div>' : '') +
      '<div class="sp-account-actions">' +
      (st.confirmReset
        ? '<button type="button" class="sp-primary" onclick="meviSpotifyResetClient(true)">Ja, löschen</button><button type="button" onclick="meviSpotifyResetClient(false)">Abbrechen</button>'
        : '<button type="button" class="sp-primary" onclick="meviSpotifyConnect(true)">Neu verbinden</button><button type="button" onclick="meviSpotifyDisconnect()">Spotify trennen</button><button type="button" onclick="meviSpotifyResetClient()">Client ID ändern</button>') +
      '</div>' +
      '<p class="sp-fine">Die Verbindung nutzt OAuth PKCE ohne Backend. Access- und Refresh-Token liegen ausschließlich im lokalen Speicher dieses Browsers. Beim Trennen bleiben nur die Client ID und die Suchhistorie erhalten.</p>' +
      '</div></div>';
  }
  function html(compact) {
    const connected = !!st.token;
    let content;
    if (!connected) content = onboardingMarkup();
    else if (st.accountOpen) content = accountMarkup();
    else content = '<div class="sp-body">' +
      '<section class="sp-pane sp-now-pane" aria-label="Aktuelle Wiedergabe"><div id="sp-now-region">' + nowMarkup() + '</div></section>' +
      '<section class="sp-pane sp-browse-pane" aria-label="Spotify durchsuchen"><div id="sp-browse-region">' + browseMarkup() + '</div></section>' +
      '<section class="sp-pane sp-search-pane" aria-label="Spotify suchen"><div id="sp-search-region">' + searchMarkup() + '</div></section>' +
      '</div>';
    return '<section class="sp-shell' + (compact ? ' is-compact' : '') + '" data-tab="' + st.tab + '" data-state="' + (connected ? (st.accountOpen ? 'account' : 'ready') : 'setup') + '" aria-label="Spotify Fernsteuerung">' +
      topMarkup() + (connected && !st.accountOpen ? bannerMarkup() + tabsMarkup() : '') + content + '</section>';
  }

  function nowMarkup() {
    if (!st.playerLoaded && !st.player && !st.error) {
      return '<div class="sp-empty"><span class="sp-spinner" aria-hidden="true"></span><strong>Wiedergabestatus wird geladen</strong><p>Spotify Connect wird abgefragt.</p><button type="button" onclick="meviSpotifyRefresh()">' + icon('refresh') + 'Aktualisieren</button></div>';
    }
    if (!st.player) return noDeviceMarkup();
    const player = st.player;
    const item = player.item;
    if (!item) {
      return '<div class="sp-empty">' + icon('spotify') + '<strong>Spotify spielt gerade keinen Titel</strong><p>Werbung oder unbekannter Inhalt. Öffne Spotify und starte einen Titel.</p><div class="sp-empty-actions"><button type="button" onclick="meviSpotifyLoadDevices()">' + icon('devices') + 'Geräte</button><button type="button" onclick="meviSpotifyOpen()">' + icon('external') + 'Spotify öffnen</button></div>' + (st.devicesOpen ? devicesMarkup() : '') + '</div>';
    }
    const episode = item.type === 'episode';
    const uri = item.uri || '';
    const duration = Number(item.duration_ms) || 0;
    const progress = clamp(Number(player.progress_ms) || 0, 0, duration || Number.MAX_SAFE_INTEGER);
    const pct = duration ? Math.round(progress / duration * 1000) : 0;
    const art = imageUrl(episode ? (item.images || item.show?.images) : item.album?.images);
    const title = item.name || 'Spotify';
    const artists = episode ? (item.show?.name || 'Podcast') : ((item.artists || []).map(a => a?.name).filter(Boolean).join(', ') || 'Unbekannter Interpret');
    const album = episode ? (item.show?.name || '') : (item.album?.name || '');
    const contextType = player.context?.type;
    const disallows = player.actions?.disallows || {};
    const disabled = key => disallows[key] ? 'disabled' : '';
    const repeat = player.repeat_state || 'off';
    const repeatTitle = repeat === 'track' ? 'Titel wiederholen' : repeat === 'context' ? 'Kontext wiederholen' : 'Wiederholen aus';
    const repeatGlyph = repeat === 'track' ? '1' : '';
    const playing = !!player.is_playing;
    return '<div class="sp-now">' +
      '<span class="sp-art' + (art ? ' has-image' : '') + '" aria-hidden="true">' + (art ? '<img src="' + esc(art) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : icon(episode ? 'podcast' : 'music')) + '</span>' +
      '<div class="sp-meta"><div class="sp-now-eyebrow">' + (playing ? 'JETZT LÄUFT' : 'PAUSIERT') + ' · ' + esc(typeLabel(contextType || (episode ? 'episode' : 'track'))) + (player.device?.name ? ' · ' + esc(player.device.name) : '') + '</div>' +
      '<div class="sp-title" title="' + esc(title) + '">' + esc(title) + '</div>' +
      '<div class="sp-artist">' + esc(artists) + '</div>' +
      (album ? '<div class="sp-album">' + esc(album) + '</div>' : '') + '</div>' +
      '<div class="sp-progress"><input class="sp-seek" id="sp-seek" type="range" min="0" max="1000" value="' + pct + '" style="--seek:' + (pct / 10) + '%" aria-label="Wiedergabeposition" oninput="meviSpotifySeekPreview(this.value)" onchange="meviSpotifySeek(this.value)" ' + disabled('seeking') + '>' +
      '<div class="sp-times"><span id="sp-elapsed">' + fmtMs(progress) + '</span><span id="sp-duration">' + fmtMs(duration) + '</span></div></div>' +
      '<div class="sp-transport">' +
      '<button type="button" id="sp-shuffle" class="' + (player.shuffle_state ? 'is-on' : '') + '" aria-label="Shuffle" aria-pressed="' + !!player.shuffle_state + '" title="Zufällige Reihenfolge" onclick="meviSpotifyShuffle()" ' + disabled('toggling_shuffle') + '>' + icon('shuffle') + '</button>' +
      '<button type="button" aria-label="Vorheriger Titel" title="Zurück" onclick="meviSpotifyPrev()" ' + disabled('skipping_prev') + '>' + icon('prev') + '</button>' +
      '<button type="button" id="sp-play" class="sp-primary" aria-label="' + (playing ? 'Pause' : 'Abspielen') + '" title="' + (playing ? 'Pause' : 'Abspielen') + '" onclick="meviSpotifyToggle()" ' + disabled(playing ? 'pausing' : 'resuming') + '>' + icon(playing ? 'pause' : 'play') + '</button>' +
      '<button type="button" aria-label="Nächster Titel" title="Weiter" onclick="meviSpotifyNext()" ' + disabled('skipping_next') + '>' + icon('next') + '</button>' +
      '<button type="button" id="sp-repeat" class="' + (repeat !== 'off' ? 'is-on' : '') + '" aria-label="' + repeatTitle + '" aria-pressed="' + (repeat !== 'off') + '" title="' + repeatTitle + '" onclick="meviSpotifyRepeat()" ' + disabled('toggling_repeat_context') + '>' + icon('repeat') + (repeatGlyph ? '<span class="sp-repeat-one">' + repeatGlyph + '</span>' : '') + '</button>' +
      '</div>' +
      '<div class="sp-tools">' +
      (episode ? '<button type="button" class="sp-tool" title="15 Sekunden zurück" onclick="meviSpotifySeekBy(-15000)">' + icon('clock') + '<span>−15 s</span></button>' : '') +
      (episode ? '<button type="button" class="sp-tool" title="15 Sekunden vor" onclick="meviSpotifySeekBy(15000)">' + icon('clock') + '<span>+15 s</span></button>' : '') +
      '<button type="button" class="sp-tool' + (st.liked === true ? ' is-on' : '') + '" aria-pressed="' + (st.liked === true) + '" title="' + (st.liked === true ? 'Aus der Spotify-Bibliothek entfernen' : 'Zur Spotify-Bibliothek hinzufügen') + '" onclick="meviSpotifyLike()" ' + (uri ? '' : 'disabled') + '>' + icon('heart') + '<span>Gefällt mir</span></button>' +
      '<button type="button" class="sp-tool' + (st.queueOpen ? ' is-on' : '') + '" aria-pressed="' + !!st.queueOpen + '" title="Warteschlange" onclick="meviSpotifyToggleQueue()">' + icon('queue') + '<span>Warteschlange</span></button>' +
      '<button type="button" class="sp-tool' + (st.devicesOpen ? ' is-on' : '') + '" aria-pressed="' + !!st.devicesOpen + '" title="Geräte" onclick="meviSpotifyToggleDevices()">' + icon('devices') + '<span>Geräte</span></button>' +
      '<button type="button" class="sp-tool" title="Spotify öffnen" onclick="meviSpotifyOpen()">' + icon('external') + '<span>Spotify</span></button>' +
      '</div>' +
      ((st.devicesOpen || st.queueOpen) ? '<div class="sp-drawers">' + (st.devicesOpen ? devicesMarkup() : '') + (st.queueOpen ? queueMarkup() : '') + '</div>' : '') +
      '</div>';
  }
  function noDeviceMarkup() {
    return '<div class="sp-empty">' + icon('devices') + '<strong>Kein aktives Spotify-Gerät</strong><p>Öffne Spotify auf iPhone, PC oder DeX und starte einen Titel. Danach hier aktualisieren.</p>' +
      '<div class="sp-empty-actions"><button type="button" onclick="meviSpotifyLoadDevices()">' + icon('devices') + 'Geräte suchen</button><button type="button" onclick="meviSpotifyOpen()">' + icon('external') + 'Spotify öffnen</button><button type="button" onclick="meviSpotifyRefresh()">' + icon('refresh') + 'Aktualisieren</button></div>' +
      (st.devicesOpen ? devicesMarkup() : '') + '</div>';
  }
  function devicesMarkup() {
    const active = st.devices.find(d => d?.is_active);
    return '<div class="sp-drawer"><div class="sp-drawer-head"><strong>Spotify-Geräte</strong><button type="button" class="sp-icon-button" aria-label="Geräte aktualisieren" title="Aktualisieren" onclick="meviSpotifyLoadDevices()">' + icon('refresh') + '</button></div>' +
      (st.devicesLoading && !st.devices.length ? '<p class="sp-drawer-note">Geräte werden gesucht …</p>' : '') +
      (st.devicesError ? '<p class="sp-drawer-note is-error">' + esc(st.devicesError) + '</p>' : '') +
      (st.devices.length ? st.devices.map(device => {
        const type = { Computer: 'Computer', Smartphone: 'Smartphone', Speaker: 'Lautsprecher', TV: 'TV', Automobile: 'Auto' }[device.type] || device.type || 'Gerät';
        return '<div class="sp-device' + (device.is_active ? ' is-active' : '') + '"><span class="sp-device-icon">' + icon(device.type === 'Computer' ? 'disc' : 'devices') + '</span><span class="sp-device-text"><strong>' + esc(device.name || 'Spotify-Gerät') + '</strong><small>' + esc(type) + (Number.isFinite(device.volume_percent) ? ' · ' + device.volume_percent + ' %' : '') + '</small></span>' +
          (device.is_active ? '<span class="sp-pill">Aktiv</span>' : '<button type="button" class="sp-device-action" onclick="meviSpotifyTransfer(\'' + safeArg(device.id) + '\')">Hierher</button>') + '</div>';
      }).join('') : (st.devicesLoading ? '' : '<p class="sp-drawer-note">Keine Geräte gefunden. Öffne Spotify und starte einen Titel.</p>')) +
      (active && Number.isFinite(active.volume_percent) ? '<label class="sp-volume">' + icon('volume') + '<span class="visually-hidden">Lautstärke</span><input type="range" min="0" max="100" value="' + active.volume_percent + '" onchange="meviSpotifyVolume(this.value)" aria-label="Spotify-Lautstärke"><span>' + active.volume_percent + ' %</span></label>' : '') +
      '</div>';
  }
  function queueMarkup() {
    const current = st.queue?.currently_playing;
    const upcoming = Array.isArray(st.queue?.queue) ? st.queue.queue.slice(0, 12) : [];
    const queueItem = item => item?.type === 'episode' ? mapEpisode(item) : mapTrack(item);
    return '<div class="sp-drawer"><div class="sp-drawer-head"><strong>Warteschlange</strong><button type="button" class="sp-icon-button" aria-label="Warteschlange aktualisieren" title="Aktualisieren" onclick="meviSpotifyLoadQueue()">' + icon('refresh') + '</button></div>' +
      (st.queueLoading && !st.queue ? '<p class="sp-drawer-note">Warteschlange wird geladen …</p>' : '') +
      (st.queueError ? '<p class="sp-drawer-note is-error">' + esc(st.queueError) + '</p>' : '') +
      (current ? '<div class="sp-queue-now">' + icon('play') + '<span><small>JETZT</small><strong>' + esc(queueItem(current)?.title || 'Unbekannt') + '</strong></span></div>' : '') +
      (upcoming.length ? upcoming.map((raw, index) => {
        const item = queueItem(raw);
        if (!item) return '';
        return '<div class="sp-queue-row"><span class="sp-queue-index">' + (index + 1) + '</span><span class="sp-queue-text"><strong>' + esc(item.title) + '</strong><small>' + esc(item.meta) + '</small></span><span class="sp-queue-time">' + (item.duration ? fmtMs(item.duration) : '') + '</span></div>';
      }).join('') : (st.queueLoading ? '' : '<p class="sp-drawer-note">Die Warteschlange ist leer.</p>')) +
      '</div>';
  }

  function browseMarkup() {
    return '<div class="sp-browse"><div class="sp-pane-head"><div class="sp-chips" role="tablist" aria-label="Spotify-Bereiche">' +
      Object.entries(BROWSE_DEFS).map(([id, def]) => '<button type="button" role="tab" class="sp-chip' + (st.browse === id ? ' selected' : '') + '" data-browse="' + id + '" aria-selected="' + (st.browse === id) + '" onclick="meviSpotifyBrowse(\'' + id + '\')">' + esc(def.label) + '</button>').join('') +
      '</div><button type="button" class="sp-icon-button" aria-label="Bereich aktualisieren" title="Aktualisieren" onclick="meviSpotifyReloadBrowse()">' + icon('refresh') + '</button></div>' +
      '<div class="sp-scroll" id="sp-browse-list">' + browseListMarkup() + '</div></div>';
  }
  function browseListMarkup() {
    const cache = st.browseData[st.browse];
    if (st.browseLoading && !cache) return '<div class="sp-list-loading"><span class="sp-spinner"></span><span>Spotify-Bibliothek wird geladen …</span></div>';
    if (st.browseError && !cache) return '<div class="sp-empty small">' + icon('alert') + '<strong>Nicht geladen</strong><p>' + esc(st.browseError) + '</p><button type="button" onclick="meviSpotifyReloadBrowse()">Erneut versuchen</button></div>';
    const items = cache?.items || [];
    if (!items.length) return '<div class="sp-empty small">' + icon('list') + '<strong>Noch nichts gespeichert</strong><p>In Spotify gespeicherte oder zuletzt gehörte Inhalte erscheinen hier.</p></div>';
    return '<div class="sp-rows">' + items.map((item, index) => rowMarkup(item, 'browse', index)).join('') + '</div>' + (st.browseLoading ? '<div class="sp-list-loading small"><span class="sp-spinner"></span><span>Aktualisiere …</span></div>' : '');
  }
  function rowMarkup(item, group, index) {
    const queueable = item.kind === 'track' || item.kind === 'episode';
    return '<div class="sp-row"><button type="button" class="sp-row-main" onclick="meviSpotifyPlayStored(\'' + group + '\',' + index + ')" aria-label="' + esc(item.title + ' abspielen') + '">' +
      '<span class="sp-row-art">' + (item.image ? '<img src="' + esc(item.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : icon(item.kind === 'episode' || item.kind === 'show' ? 'podcast' : item.kind === 'playlist' ? 'list' : item.kind === 'album' ? 'disc' : item.kind === 'artist' ? 'mic' : 'music')) + '</span>' +
      '<span class="sp-row-text"><strong>' + esc(item.title) + '</strong><small>' + esc(item.meta) + '</small></span>' +
      (item.duration ? '<span class="sp-row-time">' + fmtMs(item.duration) + '</span>' : '') +
      '<span class="sp-row-play">' + icon('play') + '</span></button>' +
      (queueable ? '<button type="button" class="sp-row-queue" aria-label="' + esc(item.title + ' zur Warteschlange') + '" title="Zur Warteschlange" onclick="meviSpotifyQueueStored(\'' + group + '\',' + index + ')">' + icon('plus') + '</button>' : '') +
      '</div>';
  }
  function searchMarkup() {
    const voiceSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    const voiceLabel = st.voiceListening ? 'Sprachsuche beenden' : (voiceSupported ? 'Sprachsuche starten' : 'Sprachsuche im Browser nicht verfügbar');
    return '<div class="sp-search">' +
      '<div class="sp-search-entry"><label class="sp-search-box">' + icon('search') + '<input id="sp-search-input" type="search" spellcheck="false" autocomplete="off" placeholder="Titel, Alben, Podcasts suchen …" aria-label="Spotify durchsuchen" value="' + esc(st.query) + '" oninput="meviSpotifySearchInput(this.value)" onkeydown="if(event.key===\'Enter\'){event.preventDefault();meviSpotifySearchNow(this.value)}"></label>' +
      '<button type="button" class="sp-voice-button' + (st.voiceListening ? ' is-listening' : '') + '" aria-label="' + voiceLabel + '" title="' + voiceLabel + '" aria-pressed="' + st.voiceListening + '" onclick="meviSpotifyVoice()" ' + (voiceSupported ? '' : 'disabled') + '>' + icon('mic') + '</button></div>' +
      '<p class="sp-voice-feedback" id="sp-voice-feedback" role="status" ' + (st.voiceListening || st.voiceError ? '' : 'hidden') + '>' + esc(st.voiceError || 'Ich höre zu …') + '</p>' +
      '<div class="sp-history" id="sp-search-history">' + historyMarkup() + '</div>' +
      '<div class="sp-linkrow"><label class="sp-linkbox">' + icon('link') + '<input id="sp-link" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="Spotify-Link oder spotify:track:…" aria-label="Spotify-Link einfügen" onkeydown="if(event.key===\'Enter\'){event.preventDefault();meviSpotifyPlayLink(false)}"></label><button type="button" class="sp-link-play" onclick="meviSpotifyPlayLink(false)" title="Link abspielen">' + icon('play') + '<span>Abspielen</span></button><button type="button" class="sp-link-queue" onclick="meviSpotifyPlayLink(true)" aria-label="Link zur Warteschlange" title="Zur Warteschlange">' + icon('plus') + '</button></div>' +
      '<div class="sp-results" id="sp-search-results">' + resultsMarkup() + '</div></div>';
  }
  function historyMarkup() {
    if (st.query.trim() || !st.history.length) return '';
    return '<span class="sp-history-label">Zuletzt</span>' + st.history.map(query => '<button type="button" class="sp-history-chip" onclick="meviSpotifyUseHistory(\'' + safeArg(query) + '\')">' + esc(query) + '</button>').join('') +
      '<button type="button" class="sp-history-clear" aria-label="Suchverlauf löschen" title="Suchverlauf löschen" onclick="meviSpotifyClearHistory()">' + icon('close') + '</button>';
  }
  function resultsMarkup() {
    const query = st.query.trim();
    if (!query) return '<div class="sp-search-hint">' + icon('search') + '<strong>Spotify durchsuchen</strong><p>Suche nach Titeln, Alben, Interpreten, Playlists oder Podcasts. Höchstens 10 Treffer je Bereich.</p></div>';
    if (st.searchLoading && !st.results) return '<div class="sp-list-loading"><span class="sp-spinner"></span><span>Suche läuft …</span></div>';
    if (st.searchError) return '<div class="sp-empty small">' + icon('alert') + '<strong>Suche fehlgeschlagen</strong><p>' + esc(st.searchError) + '</p><button type="button" onclick="meviSpotifySearchNow(document.getElementById(\'sp-search-input\').value)">Erneut versuchen</button></div>';
    if (!st.results) return '<div class="sp-search-hint">' + icon('search') + '<strong>Bereit</strong><p>Tippe einen Suchbegriff ein.</p></div>';
    let out = '';
    for (const [key, label, glyph] of SEARCH_GROUPS) {
      const items = st.results[key] || [];
      if (!items.length) continue;
      out += '<div class="sp-group-title">' + icon(glyph) + esc(label) + '<span>' + items.length + '</span></div>';
      out += items.map((item, index) => rowMarkup(item, key, index)).join('');
    }
    return out || '<div class="sp-empty small">' + icon('search') + '<strong>Keine Treffer</strong><p>Versuche einen anderen Suchbegriff.</p></div>';
  }

  function paintBanner() {
    const el = $('sp-banner');
    if (!el) return;
    const text = st.error || st.notice;
    el.hidden = !text;
    el.className = 'sp-banner' + (st.error ? ' is-error' : '');
    const span = el.querySelector('span');
    if (span) span.textContent = text;
  }
  function paintNow() { const el = $('sp-now-region'); if (el) el.innerHTML = nowMarkup(); }
  function paintBrowse() { const el = $('sp-browse-region'); if (el) el.innerHTML = browseMarkup(); }
  function paintSearch() {
    const results = $('sp-search-results');
    if (results) results.innerHTML = resultsMarkup();
    const history = $('sp-search-history');
    if (history) history.innerHTML = historyMarkup();
  }
  function paintTabs() {
    document.querySelectorAll('.sp-tab').forEach(button => {
      const selected = button.dataset.tab === st.tab;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    const shell = document.querySelector('.sp-shell');
    if (shell) shell.dataset.tab = st.tab;
  }
  function paintProfile() {
    const name = st.profile?.display_name || st.profile?.id || 'Verbunden';
    const top = $('sp-account-name'); if (top) top.textContent = name;
    const display = $('sp-account-display'); if (display) display.textContent = name;
    const id = $('sp-account-id'); if (id) id.textContent = st.profile?.id || 'Spotify Connect';
  }

  const browseSerial = {};

  function setTab(tab) {
    if (!['now', 'browse', 'search'].includes(tab)) return;
    if (tab !== 'search' && st.voiceListening) stopVoice();
    st.tab = tab;
    paintTabs();
    if (tab === 'browse') {
      const cache = st.browseData[st.browse];
      if (!cache) loadBrowse(false);
    }
    if (tab === 'search' && st.query.trim() && !st.results) runSearch(st.query, false);
  }
  function setBrowse(key) {
    if (!BROWSE_DEFS[key]) return;
    st.browse = key;
    st.browseError = '';
    paintBrowse();
    const cache = st.browseData[key];
    if (!cache || Date.now() - cache.at > 300000) loadBrowse(false);
  }
  async function loadBrowse(force) {
    const key = st.browse;
    const def = BROWSE_DEFS[key];
    if (!def || !st.token) return;
    const cache = st.browseData[key];
    if (!force && cache && Date.now() - cache.at < 300000) return;
    const serial = (browseSerial[key] = (browseSerial[key] || 0) + 1);
    st.browseLoading = true;
    st.browseError = '';
    if (st.browse === key) paintBrowse();
    try {
      const data = await api(def.path);
      const items = (def.pick(data) || []).map(def.map).filter(Boolean);
      st.browseData[key] = { items, at: Date.now() };
    } catch (error) {
      if (browseSerial[key] === serial && st.browse === key) st.browseError = errorText(error);
    } finally {
      if (browseSerial[key] !== serial) return;
      st.browseLoading = false;
      if (st.browse === key) paintBrowse();
    }
  }
  function refreshBrowse() { loadBrowse(true); }

  function storedItem(group, index) {
    if (group === 'browse') return st.browseData[st.browse]?.items?.[index] || null;
    return st.results?.[group]?.[index] || null;
  }
  function playStored(group, index) {
    const item = storedItem(group, index);
    if (!item) return;
    if (group !== 'browse' && st.query.trim()) addHistory(st.query.trim());
    playItem(item);
  }
  function queueStored(group, index) {
    const item = storedItem(group, index);
    if (!item) return;
    queueItem(item);
  }

  // Browser speech recognition is optional and starts only after a direct tap.
  // Safari or installed PWAs may not expose this API; manual search remains available.
  function paintVoice() {
    const button = document.querySelector('.sp-voice-button');
    if (button) {
      const label = st.voiceListening ? 'Sprachsuche beenden' : 'Sprachsuche starten';
      button.classList.toggle('is-listening', st.voiceListening);
      button.setAttribute('aria-pressed', String(st.voiceListening));
      button.setAttribute('aria-label', label);
      button.title = label;
    }
    const feedback = $('sp-voice-feedback');
    if (feedback) {
      feedback.hidden = !st.voiceListening && !st.voiceError;
      feedback.textContent = st.voiceError || (st.voiceListening ? 'Ich höre zu …' : '');
    }
  }
  function stopVoice(silent = true) {
    voiceSerial++;
    const recognition = voiceRecognition;
    voiceRecognition = null;
    st.voiceListening = false;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.abort(); } catch { /* browser already stopped */ }
    }
    if (silent) st.voiceError = '';
    paintVoice();
  }
  function voice() {
    if (st.voiceListening) { stopVoice(); return; }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      st.voiceError = 'Spracherkennung in diesem Browser nicht verfügbar. Bitte tippen.';
      paintVoice();
      return;
    }
    stopVoice();
    const serial = ++voiceSerial;
    let recognition;
    try {
      recognition = new Recognition();
      recognition.lang = 'de-DE';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.continuous = false;
      voiceRecognition = recognition;
      st.voiceError = '';
      st.voiceListening = true;
      recognition.onresult = event => {
        if (serial !== voiceSerial) return;
        const transcript = String(event.results?.[0]?.[0]?.transcript || '').trim();
        if (!transcript) {
          st.voiceError = 'Nichts verstanden. Bitte erneut versuchen.';
          st.voiceListening = false;
          paintVoice();
          return;
        }
        stopVoice();
        setTab('search');
        searchNow(transcript); // existing Spotify search API and search history
        paintVoice();
      };
      recognition.onerror = event => {
        if (serial !== voiceSerial) return;
        const messages = {
          'not-allowed': 'Mikrofonzugriff verweigert. Bitte Berechtigung prüfen.',
          'service-not-allowed': 'Spracherkennung ist auf diesem Gerät gesperrt.',
          'no-speech': 'Keine Sprache erkannt. Bitte erneut versuchen.',
          'audio-capture': 'Kein Mikrofon verfügbar.',
          'network': 'Spracherkennung benötigt eine Netzwerkverbindung.',
          'language-not-supported': 'Deutsche Spracherkennung nicht verfügbar.'
        };
        st.voiceError = messages[event.error] || 'Spracherkennung fehlgeschlagen. Bitte tippen.';
        st.voiceListening = false;
        voiceRecognition = null;
        paintVoice();
      };
      recognition.onend = () => {
        if (serial !== voiceSerial) return;
        voiceRecognition = null;
        if (st.voiceListening) st.voiceError = 'Keine Sprache erkannt. Bitte erneut versuchen.';
        st.voiceListening = false;
        paintVoice();
      };
      recognition.start();
      paintVoice();
    } catch {
      voiceRecognition = null;
      st.voiceListening = false;
      st.voiceError = 'Spracherkennung konnte nicht gestartet werden.';
      paintVoice();
    }
  }
  function searchInput(value) {
    st.query = String(value || '').slice(0, 120);
    clearTimeout(searchTimer);
    const query = st.query.trim();
    st.results = null;
    st.searchError = '';
    if (!query) {
      st.searchLoading = false;
      paintSearch();
      return;
    }
    st.searchLoading = true;
    paintSearch();
    searchTimer = setTimeout(() => runSearch(query, false), 420);
  }
  function searchNow(value) {
    const query = String(value || '').trim().slice(0, 120);
    st.query = query;
    const input = $('sp-search-input');
    if (input && input.value !== query) input.value = query;
    clearTimeout(searchTimer);
    if (!query) { st.results = null; st.searchLoading = false; paintSearch(); return; }
    runSearch(query, true);
  }
  async function runSearch(query, remember) {
    const text = String(query || '').trim();
    if (!text || !st.token) return;
    const serial = ++searchSerial;
    st.searchLoading = true;
    st.searchError = '';
    if (!st.results) paintSearch();
    try {
      const params = new URLSearchParams({ q: text, type: 'track,album,artist,playlist,show,episode', limit: '10' });
      const data = await api('/search?' + params.toString());
      if (serial !== searchSerial || st.query.trim() !== text) return;
      st.results = normalizeSearch(data);
      if (remember) addHistory(text);
    } catch (error) {
      if (serial !== searchSerial) return;
      st.searchError = errorText(error);
    } finally {
      if (serial === searchSerial) {
        st.searchLoading = false;
        paintSearch();
      }
    }
  }
  function addHistory(query) {
    const text = String(query || '').trim().slice(0, 120);
    if (!text) return;
    st.history = [text, ...st.history.filter(item => item.toLocaleLowerCase('de') !== text.toLocaleLowerCase('de'))].slice(0, 8);
    writeJson(localStorage, KEYS.history, st.history);
    const history = $('sp-search-history');
    if (history) history.innerHTML = historyMarkup();
  }
  function useHistory(encoded) {
    const query = decodeArg(encoded);
    st.query = query;
    const input = $('sp-search-input');
    if (input) input.value = query;
    addHistory(query);
    runSearch(query, false);
  }
  function clearHistory() {
    st.history = [];
    try { localStorage.removeItem(KEYS.history); } catch { /* ignore */ }
    paintSearch();
  }

  async function playItem(item) {
    if (!item?.uri) return;
    const body = item.kind === 'track' || item.kind === 'episode' ? { uris: [item.uri] } : { context_uri: item.uri };
    try {
      window.meviMediaStopForSource?.('spotify');
      const target = await playbackDevice();
      if (!target.id) {
        st.pendingPlay = { body, title: item.title, at: Date.now() };
        st.error = '';
        await loadDevices();
        setNotice(target.devices.length
          ? 'Mehrere Geräte gefunden. „Hierher“ startet die Wiedergabe.'
          : 'Kein Spotify-Gerät gefunden. Öffne Spotify und starte einen Titel.');
        return;
      }
      await api('/me/player/play?device_id=' + encodeURIComponent(target.id), { method: 'PUT', body: JSON.stringify(body) });
      rememberDevice(target.id);
      st.pendingPlay = null;
      st.error = '';
      setNotice('Wiedergabe: ' + item.title);
      st.playerLoaded = true;
      await sleep(350);
      await poll(true);
      rerender();
    } catch (error) { handleApiError(error); }
  }
  async function queueItem(item) {
    if (!item?.uri) return;
    if (item.kind !== 'track' && item.kind !== 'episode') {
      st.error = 'Nur Titel und Podcast-Folgen lassen sich zur Warteschlange hinzufügen.';
      paintBanner();
      return;
    }
    try {
      await api('/me/player/queue?' + new URLSearchParams({ uri: item.uri }).toString(), { method: 'POST' });
      setNotice('Zur Warteschlange: ' + item.title);
      const link = $('sp-link'); if (link) link.value = '';
      if (st.queueOpen) { await loadQueue(); paintNow(); }
    } catch (error) { handleApiError(error); }
  }
  async function toggle() {
    const player = st.player;
    if (!player) return;
    const wasPlaying = !!player.is_playing;
    try {
      await api(wasPlaying ? '/me/player/pause' : '/me/player/play', { method: 'PUT' });
      if (!wasPlaying) window.meviMediaStopForSource?.('spotify');
      player.is_playing = !wasPlaying;
      st.playerAt = Date.now();
      st.progressBase = Number(player.progress_ms) || 0;
      st.error = '';
      paintBanner();
      paintNow();
      setTimeout(() => poll(true), 450);
    } catch (error) { handleApiError(error); }
  }
  async function skip(direction) {
    try {
      await api('/me/player/' + direction, { method: 'POST' });
      if (st.player) { st.player.progress_ms = 0; st.progressBase = 0; st.playerAt = Date.now(); }
      st.error = '';
      await sleep(300);
      await poll(true);
      paintNow();
    } catch (error) { handleApiError(error); }
  }
  function seekPreview(value) {
    const player = st.player;
    const duration = Number(player?.item?.duration_ms) || 0;
    if (!duration) return;
    const ms = clamp(Number(value) || 0, 0, 1000) / 1000 * duration;
    const elapsed = $('sp-elapsed');
    if (elapsed) elapsed.textContent = fmtMs(ms);
    const seek = $('sp-seek');
    if (seek) seek.style.setProperty('--seek', (clamp(Number(value) || 0, 0, 1000) / 10) + '%');
  }
  async function seek(value) {
    const player = st.player;
    const duration = Number(player?.item?.duration_ms) || 0;
    if (!duration) return;
    const ms = Math.round(clamp(Number(value) || 0, 0, 1000) / 1000 * duration);
    try {
      await api('/me/player/seek?position_ms=' + ms, { method: 'PUT' });
      player.progress_ms = ms;
      st.progressBase = ms;
      st.playerAt = Date.now();
      st.error = '';
      tickProgress(true);
      setTimeout(() => poll(true), 450);
    } catch (error) { handleApiError(error); }
  }
  async function seekBy(delta) {
    const player = st.player;
    const duration = Number(player?.item?.duration_ms) || 0;
    const base = Number(st.progressBase) || 0;
    const ms = clamp(base + (Number(delta) || 0), 0, duration || Number.MAX_SAFE_INTEGER);
    try {
      await api('/me/player/seek?position_ms=' + Math.round(ms), { method: 'PUT' });
      player.progress_ms = ms;
      st.progressBase = ms;
      st.playerAt = Date.now();
      tickProgress(true);
      setTimeout(() => poll(true), 450);
    } catch (error) { handleApiError(error); }
  }
  async function shuffle() {
    if (!st.player) return;
    try {
      const next = !st.player.shuffle_state;
      await api('/me/player/shuffle?state=' + String(next), { method: 'PUT' });
      st.player.shuffle_state = next;
      paintNow();
    } catch (error) { handleApiError(error); }
  }
  async function repeat() {
    if (!st.player) return;
    const sequence = { off: 'context', context: 'track', track: 'off' };
    const next = sequence[st.player.repeat_state || 'off'] || 'off';
    try {
      await api('/me/player/repeat?state=' + next, { method: 'PUT' });
      st.player.repeat_state = next;
      paintNow();
    } catch (error) { handleApiError(error); }
  }
  async function libraryContains(uri) {
    const data = await api('/me/library/contains?' + new URLSearchParams({ uris: uri }).toString());
    return Array.isArray(data) && data[0] === true;
  }
  async function syncLiked(item) {
    if (!item?.uri) return;
    const uri = item.uri;
    try {
      const liked = await libraryContains(uri);
      if (st.player?.item?.uri !== uri) return;
      st.liked = liked;
      st.likedUri = uri;
      paintNow();
    } catch { /* like state is optional, do not surface a poll error */ }
  }
  async function likeCurrent() {
    const item = st.player?.item;
    if (!item?.uri) return;
    try {
      let liked = st.likedUri === item.uri ? st.liked : null;
      if (liked === null) liked = await libraryContains(item.uri);
      await api('/me/library', { method: liked ? 'DELETE' : 'PUT', body: JSON.stringify({ uris: [item.uri] }) });
      st.liked = !liked;
      st.likedUri = item.uri;
      setNotice(st.liked ? 'Zur Spotify-Bibliothek hinzugefügt.' : 'Aus der Spotify-Bibliothek entfernt.');
      paintNow();
    } catch (error) { handleApiError(error); }
  }
  async function loadQueue() {
    if (!st.token) return;
    st.queueLoading = true;
    st.queueError = '';
    paintNow();
    try { st.queue = await api('/me/player/queue'); }
    catch (error) { st.queueError = errorText(error); }
    finally { st.queueLoading = false; paintNow(); }
  }
  function toggleQueue() {
    st.queueOpen = !st.queueOpen;
    if (st.queueOpen) loadQueue();
    else paintNow();
  }
  async function fetchDevices() {
    const data = await api('/me/player/devices');
    st.devices = Array.isArray(data?.devices) ? data.devices : [];
    return st.devices;
  }
  async function loadDevices() {
    if (!st.token) return st.devices;
    st.devicesOpen = true;
    st.devicesLoading = true;
    st.devicesError = '';
    paintNow();
    try {
      await fetchDevices();
    } catch (error) { st.devicesError = errorText(error); }
    finally { st.devicesLoading = false; paintNow(); }
    return st.devices;
  }
  function toggleDevices() {
    st.devicesOpen = !st.devicesOpen;
    if (st.devicesOpen) loadDevices();
    else paintNow();
  }
  // Spotify only marks a device active while it plays. Prefer the last device the
  // cockpit used, then an already active one, then a single available device.
  // With several idle devices the user must pick one explicitly.
  function pickDevice(devices) {
    const remembered = readDeviceId();
    return devices.find(device => device?.id && device.id === remembered)
      || devices.find(device => device?.is_active)
      || (devices.length === 1 ? devices[0] : null);
  }
  async function playbackDevice() {
    if (st.player?.device?.id) return { id: st.player.device.id, devices: st.devices };
    if (!st.devices.length) { try { await fetchDevices(); } catch { /* keep empty */ } }
    return { id: pickDevice(st.devices)?.id || '', devices: st.devices };
  }
  function pendingPlayback() {
    const pending = st.pendingPlay;
    if (!pending) return null;
    if (Date.now() - pending.at > 120000) { st.pendingPlay = null; return null; }
    return pending;
  }
  async function transferDevice(encoded) {
    const id = decodeArg(encoded);
    const pending = pendingPlayback();
    try {
      await api('/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [id], play: pending ? true : (st.player ? !!st.player.is_playing : true) }) });
      rememberDevice(id);
      st.devicesOpen = false;
      if (pending) {
        st.pendingPlay = null;
        await api('/me/player/play?device_id=' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(pending.body) });
        setNotice('Wiedergabe: ' + pending.title);
      } else {
        setNotice('Wiedergabe auf das Gerät umgestellt.');
      }
      await sleep(350);
      await poll(true);
      if (!st.player) { await sleep(600); await poll(true); }
      rerender();
    } catch (error) { handleApiError(error); }
  }
  async function setVolume(value) {
    const volume = Math.round(clamp(Number(value) || 0, 0, 100));
    try {
      await api('/me/player/volume?volume_percent=' + volume, { method: 'PUT' });
      const active = st.devices.find(device => device.is_active);
      if (active) active.volume_percent = volume;
      if (st.player?.device) st.player.device.volume_percent = volume;
      setNotice('Spotify-Lautstärke ' + volume + ' %.');
      paintNow();
    } catch (error) { handleApiError(error); }
  }
  async function refresh() {
    if (!st.token) return;
    st.pollBlockedUntil = 0;
    try {
      await Promise.allSettled([poll(true), loadProfile(), st.accountOpen ? null : loadBrowse(true)]);
      st.error = '';
      setNotice('Spotify aktualisiert.', 1800);
      rerender();
    } catch (error) { handleApiError(error); }
  }
  async function loadProfile() {
    if (!st.token || st.profileLoading) return;
    st.profileLoading = true;
    try {
      const profile = await api('/me');
      if (profile && typeof profile === 'object') {
        st.profile = profile;
        paintProfile();
      }
    } catch (error) {
      if (error.code === 'auth') handleApiError(error);
    } finally { st.profileLoading = false; }
  }

  function playerSignature(player) {
    if (!player) return 'none';
    const disallows = player.actions?.disallows || {};
    return [
      player.item?.uri || '',
      player.item?.duration_ms || 0,
      player.is_playing ? '1' : '0',
      player.shuffle_state || '',
      player.repeat_state || '',
      player.device?.id || '',
      Object.keys(disallows).filter(key => disallows[key]).sort().join(',')
    ].join('|');
  }
  async function poll(force) {
    if (!st.token || pollBusy) return;
    if (!force && (document.hidden || Date.now() < st.pollBlockedUntil)) return;
    pollBusy = true;
    const previous = st.player;
    const previousSignature = playerSignature(previous);
    try {
      const data = await api('/me/player');
      st.player = data || null;
      if (data?.device?.id) rememberDevice(data.device.id);
      st.playerLoaded = true;
      st.playerAt = Date.now();
      st.progressBase = Number(data?.progress_ms) || 0;
      st.error = '';
      if (!data) {
        st.liked = null;
        st.likedUri = '';
        if (previous || !$('sp-now-region')?.querySelector('.sp-empty')) paintNow();
        else paintNow();
      } else {
        const signature = playerSignature(data);
        if (signature !== previousSignature) paintNow();
        else tickProgress();
        const uri = data.item?.uri || '';
        if (uri && uri !== st.likedUri) {
          st.liked = null;
          st.likedUri = uri;
          syncLiked(data.item);
        }
        if (st.queueOpen && (data.item?.uri || '') !== (previous?.item?.uri || '')) loadQueue();
      }
      paintBanner();
    } catch (error) {
      if (error.code === 'auth') { handleApiError(error, true); return; }
      if (error.code === 'no-device' || error.code === 'not-found') {
        st.player = null;
        st.playerLoaded = true;
        st.devicesOpen = true;
        st.liked = null;
        st.likedUri = '';
        loadDevices().catch(() => {});
      }
      handleApiError(error, true);
      paintNow();
    } finally { pollBusy = false; }
  }
  function tickProgress(force) {
    const player = st.player;
    if (!player?.item) return;
    const duration = Number(player.item.duration_ms) || 0;
    const base = Number(st.progressBase) || 0;
    const elapsed = player.is_playing ? base + Math.max(0, Date.now() - st.playerAt) : base;
    const clamped = duration ? Math.min(elapsed, duration) : elapsed;
    const seek = $('sp-seek');
    if (seek && (force || document.activeElement !== seek)) {
      const pct = duration ? Math.round(clamped / duration * 1000) : 0;
      seek.value = String(pct);
      seek.style.setProperty('--seek', (pct / 10) + '%');
    }
    const elapsedEl = $('sp-elapsed');
    if (elapsedEl) elapsedEl.textContent = fmtMs(clamped);
    const durationEl = $('sp-duration');
    if (durationEl) durationEl.textContent = fmtMs(duration);
  }

  function saveClient(value) {
    const id = String(value || '').trim();
    if (!validClientId(id)) {
      st.authError = 'Bitte eine gültige Spotify Client ID eintragen (8–64 Buchstaben oder Ziffern).';
      rerender();
      return;
    }
    if (st.clientId && st.clientId !== id) clearAuthState();
    try { localStorage.setItem(KEYS.client, id); } catch { /* ignore */ }
    st.clientId = id;
    st.authError = '';
    setNotice('Client ID gespeichert. Jetzt mit Spotify verbinden.');
    rerender();
  }
  function resetClient(force) {
    if (force === false) { st.confirmReset = false; rerender(); return; }
    if (force !== true) { st.confirmReset = true; rerender(); return; }
    clearAuthState();
    try { localStorage.removeItem(KEYS.client); } catch { /* ignore */ }
    st.clientId = '';
    st.confirmReset = false;
    st.accountOpen = false;
    st.authError = '';
    setNotice('Client ID entfernt. Eine neue Einrichtung ist nötig.');
    rerender();
  }
  function clearAuthState() {
    clearToken();
    st.player = null;
    st.playerLoaded = false;
    st.profile = null;
    st.devices = [];
    st.devicesOpen = false;
    st.devicesLoading = false;
    st.queue = null;
    st.queueOpen = false;
    st.liked = null;
    st.likedUri = '';
    st.browseData = {};
    st.browseError = '';
    st.results = null;
    st.searchLoading = false;
    st.searchError = '';
    st.query = '';
    st.pendingPlay = null;
    st.confirmReset = false;
    try { localStorage.removeItem(KEYS.device); } catch { /* ignore */ }
  }
  function disconnect() {
    clearAuthState();
    st.accountOpen = false;
    st.authError = '';
    setNotice('Spotify getrennt. Die Client ID bleibt gespeichert.');
    rerender();
  }
  function account() {
    st.accountOpen = !st.accountOpen;
    st.confirmReset = false;
    rerender();
  }
  function openSpotify() {
    const link = document.createElement('a');
    link.href = 'https://open.spotify.com';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
  async function copyRedirect() {
    const text = redirectUri();
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Redirect-URI kopiert.');
    } catch {
      const input = $('sp-redirect');
      if (input) { input.focus(); input.select(); }
      setNotice('Bitte die markierte Redirect-URI manuell kopieren.');
    }
  }
  function playLink(queue) {
    const input = $('sp-link');
    const parsed = parseLink(input?.value);
    if (!parsed) {
      st.error = 'Kein gültiger Spotify-Link. Erlaubt sind open.spotify.com-Links und spotify:-URIs.';
      paintBanner();
      return;
    }
    const kind = parsed.kind;
    const item = {
      kind, uri: parsed.uri,
      title: kind === 'track' ? 'Spotify-Titel' : kind === 'episode' ? 'Podcast-Folge' : typeLabel(kind)
    };
    if (queue) queueItem(item);
    else playItem(item);
  }
  function pauseForSource(target) {
    if (target === 'spotify' || !st.token || !st.player?.is_playing) return;
    api('/me/player/pause', { method: 'PUT' }).then(() => {
      if (st.player) st.player.is_playing = false;
      paintNow();
      paintBanner();
    }).catch(() => { /* best effort when switching to local audio */ });
  }

  function bindGlobals() {
    if (globalsBound) return;
    globalsBound = true;
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && st.mounted) poll(true);
    });
    window.addEventListener('online', () => {
      st.pollBlockedUntil = 0;
      if (st.mounted) poll(true);
    });
    window.addEventListener('offline', () => {
      if (st.mounted) { st.error = 'Offline: Spotify benötigt eine Internetverbindung.'; paintBanner(); }
    });
  }
  function mount() {
    bindGlobals();
    const shell = document.querySelector('.sp-shell');
    if (!shell || !st.token) { unmount(); return; }
    st.mounted = true;
    if (!pollTimer) pollTimer = setInterval(() => poll(false), 3000);
    if (!tickTimer) tickTimer = setInterval(() => tickProgress(), 500);
    poll(false);
    if (!st.profile) loadProfile();
    const cache = st.browseData[st.browse];
    if (!cache) loadBrowse(false);
  }
  function unmount() {
    if (st.voiceListening || voiceRecognition) stopVoice();
    if (pollTimer) clearInterval(pollTimer);
    if (tickTimer) clearInterval(tickTimer);
    pollTimer = null;
    tickTimer = null;
    st.mounted = false;
  }
  function debug() {
    return {
      client: !!st.clientId,
      connected: !!st.token,
      tab: st.tab,
      browse: st.browse,
      browseCount: st.browseData[st.browse]?.items?.length || 0,
      player: st.player ? {
        playing: !!st.player.is_playing,
        title: st.player.item?.name || '',
        device: st.player.device?.name || '',
        progress: Number(st.player.progress_ms) || 0
      } : null,
      devices: st.devices.length,
      pendingPlay: !!st.pendingPlay,
      queue: Array.isArray(st.queue?.queue) ? st.queue.queue.length : 0,
      liked: st.liked,
      results: st.results ? Object.fromEntries(Object.entries(st.results).map(([key, value]) => [key, value.length])) : null,
      mounted: st.mounted,
      polling: !!pollTimer,
      error: st.error,
      notice: st.notice
    };
  }

  Object.assign(window, {
    meviSpotifyHTML: html,
    meviSpotifyMount: mount,
    meviSpotifyUnmount: unmount,
    meviSpotifyConnect: showDialog => connect(showDialog === true),
    meviSpotifySaveClient: saveClient,
    meviSpotifyResetClient: resetClient,
    meviSpotifyDisconnect: disconnect,
    meviSpotifyAccount: account,
    meviSpotifyRefresh: refresh,
    meviSpotifyTab: setTab,
    meviSpotifyBrowse: setBrowse,
    meviSpotifyReloadBrowse: refreshBrowse,
    meviSpotifySearchInput: searchInput,
    meviSpotifySearchNow: searchNow,
    meviSpotifyVoice: voice,
    meviSpotifyUseHistory: useHistory,
    meviSpotifyClearHistory: clearHistory,
    meviSpotifyPlayStored: playStored,
    meviSpotifyQueueStored: queueStored,
    meviSpotifyToggle: toggle,
    meviSpotifyNext: () => skip('next'),
    meviSpotifyPrev: () => skip('previous'),
    meviSpotifySeek: seek,
    meviSpotifySeekPreview: seekPreview,
    meviSpotifySeekBy: seekBy,
    meviSpotifyShuffle: shuffle,
    meviSpotifyRepeat: repeat,
    meviSpotifyLike: likeCurrent,
    meviSpotifyToggleQueue: toggleQueue,
    meviSpotifyLoadQueue: loadQueue,
    meviSpotifyToggleDevices: toggleDevices,
    meviSpotifyLoadDevices: loadDevices,
    meviSpotifyTransfer: transferDevice,
    meviSpotifyVolume: setVolume,
    meviSpotifyPlayLink: playLink,
    meviSpotifyOpen: openSpotify,
    meviSpotifyCopyRedirect: copyRedirect,
    meviSpotifyPauseForSource: pauseForSource,
    meviSpotifyParseLink: parseLink,
    meviSpotifyDebug: debug,
    MeviSpotify: {
      parseLink,
      redirectUri,
      formatTime: fmtMs,
      typeLabel,
      scopes: SCOPES,
      apiBase: API,
      accountsBase: ACCOUNTS
    }
  });

  handleCallback().catch(error => {
    st.authError = 'Anmeldung fehlgeschlagen: ' + errorText(error);
    rerender();
  });
})();
