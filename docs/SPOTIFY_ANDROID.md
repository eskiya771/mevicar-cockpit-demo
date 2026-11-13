# MeviCar Next – Spotify Android Integration

**Code integration, not a device-verified playback claim.** Classic remains unchanged.

## Shared UI

`eskiya771/mevicar-cockpit-demo/spotify.js` remains the Spotify frontend in both the PWA and the Android app. It retains:
- Spotify Premium OAuth Authorization Code + PKCE
- Library, playlists, albums, artists, podcasts, search, history
- Play, pause, skip, seek, shuffle/repeat, likes, queue, volume and media source switching
- Player metadata via the Spotify Web API

The **web browser** uses the Spotify Web Playback SDK and its own Spotify Connect player. The **Android APK** uses the official Spotify App Remote v0.8.0 to delegate playback to the installed Spotify app. The JS frontend routes commands through the origin-checked `MeviNativeBridge`. This avoids a second UI and avoids assuming WebView supports DRM/Spotify streaming.

## One-time Spotify Developer Dashboard setup

Use the same Spotify Client ID already configured in **MeviCar Next → Settings → Zugänge → Spotify Client-ID**, subject to Spotify developer permissions.

Register:
- APK Android application ID: `de.mevicar.next`
- SHA-1 fingerprint corresponding to the **actual signing certificate** of the APK
- Redirect URI: `mevicarnext://spotify-callback`
- Existing web redirect remains `https://eskiya771.github.io/mevicar-cockpit-demo/`

Both redirects must be entered verbatim. The release SHA-1 differs from the debug signing certificate's SHA-1. The application is presently built as a debug preview; device auth still requires real Spotify app and valid registration.

## Security and lifecycle

- Spotify account login is intercepted and launched in an **external** browser, not an Android WebView.
- The Spotify OAuth response is delivered back through a scoped Android deep link and forwarded only to the trusted GitHub Pages document.
- The original PKCE verifier and state check remain in `spotify.js`. Neither tokens nor Spotify password are sent to App Remote native bridge.
- Native controller accepts a typed allowlist of Spotify URI actions and controls the installed Spotify app.
- Native controller disconnects during Activity destruction.
- For Spotify playback, the Spotify Android app must be installed and logged in.
- WebView retains the same browser-local OAuth tokens as the existing web app. These are **not** currently migrated into Android Keystore; avoid calling this a native-encrypted Spotify token store.

## Build

GitHub Actions downloads Spotify's official 0.8.0 AAR from a pinned GitHub release and checks exact asset size. For a local Gradle build, place the same AAR at `app/libs/spotify-app-remote-release-0.8.0.aar`. Gradle also includes the Gson dependency, as in Classic.

## Still to test on Android

OAuth/browser callback and process restoration; Spotify app authorization; playback, queue, shuffle, repeat, background audio, audio focus, reconnection after Android lifecycle changes, source switching and DeX layouts.
