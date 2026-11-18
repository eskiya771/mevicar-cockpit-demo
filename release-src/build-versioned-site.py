#!/usr/bin/env python3
# Ported directly from verified v0.6.4 Pages build. Run with cwd=web/.
# BUILD_NUMBER and BUILD_SHA must be explicitly provided by the calling build.
import os, json, pathlib
build = int(os.environ['BUILD_NUMBER'])
version = pathlib.Path('VERSION').read_text().strip()
info = {'version': version, 'build': build, 'commit': os.environ['BUILD_SHA']}
html = pathlib.Path('index.html').read_text()
assert '__MEVICAR_BUILD__' in html, 'Build placeholder missing'
html = html.replace('__MEVICAR_BUILD__', json.dumps(info, ensure_ascii=False))
# Critical: bundle theme CSS into the versioned HTML. An installed PWA may
# otherwise receive a fresh HTML shell with an outdated, cache-first CSS
# asset, collapsing the SVG launcher into small black default buttons.
css_link = '<link rel="stylesheet" href="./themes.css">'
assert css_link in html, 'Theme CSS link missing'
theme_css = pathlib.Path('themes.css').read_text()
assert '.app-home-grid' in theme_css and '.app-illustration' in theme_css
html = html.replace(css_link, '<style id="mevicar-versioned-themes">' + theme_css + '</style>')
# Bundle Settings typography atomically with the HTML build; otherwise
# Android's cache-first WebView can retain tiny settings controls.
settings_css_link = '<link rel="stylesheet" href="./credential-settings.css">'
assert settings_css_link in html, 'Credential settings stylesheet missing'
settings_css = pathlib.Path('credential-settings.css').read_text()
assert '.mevi-cred-form' in settings_css and '.settings-tabs button' in settings_css
html = html.replace(settings_css_link, '<style id="mevicar-versioned-credentials">' + settings_css + '</style>')
# Bundle the credentials JavaScript together with the displayed build.
# Otherwise a cache-first PWA may load the current HTML (build number)
# but execute old Settings logic from the previous service worker cache.
credentials_script = '<script src="./credential-settings.js"></script>'
assert credentials_script in html, 'Credential settings JavaScript tag missing'
credentials_js = pathlib.Path('credential-settings.js').read_text()
assert 'MeviCredentials' in credentials_js and 'HA_WEB_TOKEN_KEY' in credentials_js
assert '</script' not in credentials_js.lower(), 'Credential script may not close inline HTML'
html = html.replace(credentials_script, '<script id="mevicar-versioned-credentials-script">' + credentials_js + '</script>')
saver_css_link = '<link rel="stylesheet" href="./screensaver.css">'
saver_js_tag = '<script src="./screensaver.js"></script>'
assert saver_css_link in html and saver_js_tag in html, 'Screensaver assets missing'
saver_css = pathlib.Path('screensaver.css').read_text()
saver_js = pathlib.Path('screensaver.js').read_text()
assert '#mevi-saver' in saver_css and 'meviSaverPreview' in saver_js
html = html.replace(saver_css_link, '<style id="mevicar-screensaver-styles">' + saver_css + '</style>')
# Keep the media player JS/CSS in the same versioned HTML as the cockpit.
media_css_link = '<link rel="stylesheet" href="./mevimedia.css">'
media_script_tag = '<script src="./mevimedia.js"></script>'
assert media_css_link in html and media_script_tag in html, 'MeviMedia files missing'
media_css = pathlib.Path('mevimedia.css').read_text()
media_js = pathlib.Path('mevimedia.js').read_text()
assert '.mm-shell' in media_css and 'meviMediaHTML' in media_js
html = html.replace(media_css_link, '<style id="mevicar-media-styles">' + media_css + '</style>')
html = html.replace(media_script_tag, '<script id="mevicar-media-script">' + media_js + '</script>')
# Spotify remote control is part of the same versioned shell.
nav_css_link = '<link rel="stylesheet" href="./navigation-google.css">'
nav_script_tag = '<script src="./navigation-google.js"></script>'
assert nav_css_link in html and nav_script_tag in html, 'Navigation assets missing'
nav_css = pathlib.Path('navigation-google.css').read_text()
nav_js = pathlib.Path('navigation-google.js').read_text()
assert 'MeviGoogleNav' in nav_js and '.mg-map' in nav_css
html = html.replace(nav_css_link, '<style id="mevicar-navigation-styles">' + nav_css + '</style>')
html = html.replace(nav_script_tag, '<script id="mevicar-navigation-script">' + nav_js + '</script>')
# Shared trip strip: the APK's own WebView and browser use identical markup.
trip_css_tag = '<link rel="stylesheet" href="./nav-trip.css">'
trip_js_tag = '<script src="./nav-trip.js"></script>'
assert trip_css_tag in html and trip_js_tag in html, 'Shared trip-strip assets missing'
trip_css = pathlib.Path('nav-trip.css').read_text()
trip_js = pathlib.Path('nav-trip.js').read_text()
assert '.mevi-trip' in trip_css and 'MeviNavTrip' in trip_js
assert '</script' not in trip_js.lower(), 'Trip JS cannot close its inline element'
html = html.replace(trip_css_tag, '<style id="mevicar-trip-styles">' + trip_css + '</style>')
html = html.replace(trip_js_tag, '<script id="mevicar-trip-script">' + trip_js + '</script>')
# Shared route detail calculations use the same JS code in Web and Android.
route_details_tag = '<script src="./nav-route-details.js"></script>'
assert route_details_tag in html, 'Shared route details missing'
route_details_js = pathlib.Path('nav-route-details.js').read_text()
assert 'MeviNavRouteDetails' in route_details_js and '</script' not in route_details_js.lower()
html = html.replace(route_details_tag,
    '<script id="mevicar-route-detail-script">' + route_details_js + '</script>')
# A native-only data bridge client: loaded but not opted in until full UI/Places parity.
android_book_tag = '<script src="./navigation-android-book.js"></script>'
assert android_book_tag in html, 'Native address-book client not linked'
android_book_js = pathlib.Path('navigation-android-book.js').read_text()
assert 'MeviNativeBook' in android_book_js and 'navigation.book.apply' in android_book_js
assert '</script' not in android_book_js.lower()
html = html.replace(android_book_tag, '<script id="mevicar-android-addressbook-script">' + android_book_js + '</script>')
android_places_tag = '<script src="./navigation-android-places.js"></script>'
assert android_places_tag in html, 'Native Places client not linked'
android_places_js = pathlib.Path('navigation-android-places.js').read_text()
assert 'MeviAndroidPlaces' in android_places_js and 'navigation.places.search' in android_places_js
assert '</script' not in android_places_js.lower()
html = html.replace(android_places_tag, '<script id="mevicar-android-places-script">' + android_places_js + '</script>')
android_provider_tag = '<script src="./navigation-android-provider.js"></script>'
assert android_provider_tag in html, 'Shared native provider not linked'
android_provider_js = pathlib.Path('navigation-android-provider.js').read_text()
assert 'MeviSharedNavigationProvider' in android_provider_js and 'MeviAndroidSharedNav' in android_provider_js
assert '</script' not in android_provider_js.lower()
html = html.replace(android_provider_tag, '<script id="mevicar-native-ui-provider-script">' + android_provider_js + '</script>')
# Shared search and address book must travel atomically with the new build.
shared_script = '<script src="./navigation-shared-core.js"></script>'
parity_script = '<script src="./nav-web-parity.js"></script>'
parity_css_link = '<link rel="stylesheet" href="./nav-web-parity.css">'
assert shared_script in html and parity_script in html and parity_css_link in html
shared_js = pathlib.Path('navigation-shared-core.js').read_text()
parity_js = pathlib.Path('nav-web-parity.js').read_text()
parity_css = pathlib.Path('nav-web-parity.css').read_text()
assert 'MeviNavigationShared' in shared_js and 'MeviWebNavParity' in parity_js
assert '.mg-parity-shade' in parity_css
assert all('</script' not in js.lower() for js in (shared_js, parity_js))
html = html.replace(shared_script, '<script id="mevicar-shared-navigation-script">' + shared_js + '</script>')
html = html.replace(parity_script, '<script id="mevicar-navigation-parity-script">' + parity_js + '</script>')
html = html.replace(parity_css_link, '<style id="mevicar-navigation-parity-styles">' + parity_css + '</style>')
# Home Assistant: bundle the dashboard and REST client in the same versioned shell.
weather_css_link = '<link rel="stylesheet" href="./weather-next.css">'
assert weather_css_link in html, 'Weather wrapper stylesheet missing'
weather_css = pathlib.Path('weather-next.css').read_text()
assert '.weather-host' in weather_css
assert 'weather/weather.html' in html, 'Live Classic weather iframe missing'
html = html.replace(weather_css_link, '<style id="mevicar-weather-styles">' + weather_css + '</style>')
# Road Assist is part of the live route view, with HA camera state in-memory.
ra_css_link = '<link rel="stylesheet" href="./roadassist.css">'
ra_script_tag = '<script src="./roadassist.js"></script>'
assert ra_css_link in html and ra_script_tag in html, 'Road Assist assets missing'
ra_css = pathlib.Path('roadassist.css').read_text()
ra_js = pathlib.Path('roadassist.js').read_text()
assert '.mevi-ra-overlay' in ra_css and 'MeviRoadAssist' in ra_js
html = html.replace(ra_css_link, '<style id="mevicar-roadassist-styles">' + ra_css + '</style>')
html = html.replace(ra_script_tag, '<script id="mevicar-roadassist-script">' + ra_js + '</script>')
youtube_css_link = '<link rel="stylesheet" href="./youtube.css">'
youtube_script_tag = '<script src="./youtube.js"></script>'
assert youtube_css_link in html and youtube_script_tag in html, 'YouTube assets missing'
youtube_css = pathlib.Path('youtube.css').read_text()
youtube_js = pathlib.Path('youtube.js').read_text()
assert '.mevi-youtube-shell' in youtube_css and 'MeviYouTube' in youtube_js
html = html.replace(youtube_css_link, '<style id="mevicar-youtube-styles">' + youtube_css + '</style>')
html = html.replace(youtube_script_tag, '<script id="mevicar-youtube-script">' + youtube_js + '</script>')
stocks_css_link = '<link rel="stylesheet" href="./stocks.css">'
stocks_script_tag = '<script src="./stocks.js"></script>'
assert stocks_css_link in html and stocks_script_tag in html, 'Stocks assets missing'
stocks_css = pathlib.Path('stocks.css').read_text()
stocks_js = pathlib.Path('stocks.js').read_text()
assert '.mevi-stocks' in stocks_css and 'MeviStocks' in stocks_js
html = html.replace(stocks_css_link, '<style id="mevicar-stocks-styles">' + stocks_css + '</style>')
html = html.replace(stocks_script_tag, '<script id="mevicar-stocks-script">' + stocks_js + '</script>')
whatsapp_css_link = '<link rel="stylesheet" href="./whatsapp.css">'
whatsapp_script_tag = '<script src="./whatsapp.js"></script>'
assert whatsapp_css_link in html and whatsapp_script_tag in html, 'WhatsApp assets missing'
whatsapp_css = pathlib.Path('whatsapp.css').read_text()
whatsapp_js = pathlib.Path('whatsapp.js').read_text()
assert '.mevi-wa-shell' in whatsapp_css and 'MeviWhatsApp' in whatsapp_js
html = html.replace(whatsapp_css_link, '<style id="mevicar-whatsapp-styles">' + whatsapp_css + '</style>')
html = html.replace(whatsapp_script_tag, '<script id="mevicar-whatsapp-script">' + whatsapp_js + '</script>')
calendar_css_link = '<link rel="stylesheet" href="./calendar.css">'
calendar_script_tag = '<script src="./calendar.js"></script>'
assert calendar_css_link in html and calendar_script_tag in html, 'Calendar assets missing'
cal_css = pathlib.Path('calendar.css').read_text()
cal_js = pathlib.Path('calendar.js').read_text()
assert '.mevi-cal-shell' in cal_css and 'MeviCalendar' in cal_js
html = html.replace(calendar_css_link, '<style id="mevicar-calendar-styles">' + cal_css + '</style>')
html = html.replace(calendar_script_tag, '<script id="mevicar-calendar-script">' + cal_js + '</script>')
ha_css_link = '<link rel="stylesheet" href="./homeassistant.css">'
ha_script_tag = '<script src="./homeassistant.js"></script>'
assert ha_css_link in html and ha_script_tag in html, 'Home Assistant assets missing'
ha_css = pathlib.Path('homeassistant.css').read_text()
ha_js = pathlib.Path('homeassistant.js').read_text()
assert '.ha-shell' in ha_css and 'MeviHA' in ha_js
html = html.replace(ha_css_link, '<style id="mevicar-homeassistant-styles">' + ha_css + '</style>')
html = html.replace(ha_script_tag, '<script id="mevicar-homeassistant-script">' + ha_js + '</script>')
spotify_css_link = '<link rel="stylesheet" href="./spotify.css">'
spotify_script_tag = '<script src="./spotify.js"></script>'
assert spotify_css_link in html and spotify_script_tag in html, 'Spotify assets missing'
spotify_css = pathlib.Path('spotify.css').read_text()
spotify_js = pathlib.Path('spotify.js').read_text()
assert '.sp-shell' in spotify_css and 'meviSpotifyHTML' in spotify_js
html = html.replace(spotify_css_link, '<style id="mevicar-spotify-styles">' + spotify_css + '</style>')
html = html.replace(spotify_script_tag, '<script id="mevicar-spotify-script">' + spotify_js + '</script>')
# Lichtshow is an independent live app using the already bundled MeviDarts renderer.
lightshow_css_link = '<link rel="stylesheet" href="./lightshow.css">'
lightshow_script_tag = '<script src="./lightshow.js"></script>'
assert lightshow_css_link in html and lightshow_script_tag in html, 'Lichtshow assets missing'
lightshow_css = pathlib.Path('lightshow.css').read_text()
lightshow_js = pathlib.Path('lightshow.js').read_text()
assert '.lightshow-app' in lightshow_css and 'meviLightshowMount' in lightshow_js
html = html.replace(lightshow_css_link, '<style id="mevicar-lightshow-styles">' + lightshow_css + '</style>')
html = html.replace(lightshow_script_tag, '<script id="mevicar-lightshow-script">' + lightshow_js + '</script>')
speed_css_link = '<link rel="stylesheet" href="./speedometer.css">'
speed_script_tag = '<script src="./speedometer.js"></script>'
assert speed_css_link in html and speed_script_tag in html, 'Speedometer assets missing'
speed_css = pathlib.Path('speedometer.css').read_text()
speed_js = pathlib.Path('speedometer.js').read_text()
assert '.tacho-app' in speed_css and 'meviSpeedHTML' in speed_js and 'meviSpeedIngest' in speed_js
html = html.replace(speed_css_link, '<style id="mevicar-speedometer-styles">' + speed_css + '</style>')
html = html.replace(speed_script_tag, '<script id="mevicar-speedometer-script">' + speed_js + '</script>')
# Keep all five responsive viewport profiles within the atomic HTML build.
profiles_css_link = '<link rel="stylesheet" href="./display-profiles.css">'
assert profiles_css_link in html, 'Display profile link missing'
profiles_css = pathlib.Path('display-profiles.css').read_text()
assert 'DeX 1920x1200' in profiles_css and '1920x720' in profiles_css
html = html.replace(profiles_css_link, '<style id="mevicar-display-profiles">' + profiles_css + '</style>')
html = html.replace(saver_js_tag, '<script id="mevicar-screensaver-script">' + saver_js + '</script>')
# Bundle the full original MeviDarts library in dependency order.
# Inlining prevents the PWA from mixing mismatched cached JS versions.
for name in ('mevidarts-parallax', 'mevidarts-showcase', 'mevidarts-light-renderer'):
    script_tag = '<script src="./' + name + '.js"></script>'
    assert script_tag in html, 'Missing MeviDarts dependency: ' + name
    source = pathlib.Path(name + '.js').read_text()
    assert len(source) > 2000, 'MeviDarts source incomplete: ' + name
    html = html.replace(script_tag, '<script id="' + name + '">' + source + '</script>')
# Native Tacho Next is bundled into the versioned shell like the other apps.
tn_css_link = '<link rel="stylesheet" href="./tacho-next.css">'
tn_js_tag = '<script src="./tacho-next.js"></script>'
assert tn_css_link in html and tn_js_tag in html, 'Native Tacho Next assets missing'
tn_css = pathlib.Path('tacho-next.css').read_text()
tn_js = pathlib.Path('tacho-next.js').read_text()
assert '.tn-gauges' in tn_css and 'meviTachoNextMount' in tn_js
html = html.replace(tn_css_link, '<style id="mevicar-tacho-next-styles">' + tn_css + '</style>')
html = html.replace(tn_js_tag, '<script id="mevicar-tacho-next-script">' + tn_js + '</script>')
sudoku_css_link = '<link rel="stylesheet" href="./sudoku.css">'
sudoku_js_tag = '<script src="./sudoku.js"></script>'
assert sudoku_css_link in html and sudoku_js_tag in html, 'Sudoku assets missing'
sudoku_css = pathlib.Path('sudoku.css').read_text()
sudoku_js = pathlib.Path('sudoku.js').read_text()
assert '.sdk-board' in sudoku_css and 'meviSudokuMount' in sudoku_js
html = html.replace(sudoku_css_link, '<style id="mevicar-sudoku-styles">' + sudoku_css + '</style>')
html = html.replace(sudoku_js_tag, '<script id="mevicar-sudoku-script">' + sudoku_js + '</script>')
html = html.replace('<link rel="stylesheet" href="./tetris.css">', '<style>' + pathlib.Path('tetris.css').read_text() + '</style>')
html = html.replace('<script src="./tetris.js"></script>', '<script>' + pathlib.Path('tetris.js').read_text() + '</script>')
guilt_css = '<link rel="stylesheet" href="./weristschuld.css">'
guilt_js = '<script src="./weristschuld.js"></script>'
assert guilt_css in html and guilt_js in html, 'Wer ist schuld? assets missing'
html = html.replace(guilt_css, '<style id="mevicar-bottle-game-style">' + pathlib.Path('weristschuld.css').read_text() + '</style>')
html = html.replace(guilt_js, '<script id="mevicar-bottle-game-script">' + pathlib.Path('weristschuld.js').read_text() + '</script>')
html = html.replace('<link rel="stylesheet" href="./tv.css">', '<style>' + pathlib.Path('tv.css').read_text() + '</style>')
html = html.replace('<script src="./xtream.js"></script>', '<script>' + pathlib.Path('xtream.js').read_text() + '</script>')
html = html.replace('<script src="./tv.js"></script>', '<script>' + pathlib.Path('tv.js').read_text() + '</script>')
# Fixed UTF-8/LF output: the bundle bytes must not depend on the build platform.
pathlib.Path('dist/index.html').write_text(html, encoding='utf-8', newline='\n')
pathlib.Path('dist/build-info.json').write_text(json.dumps(info))
# Public proxy release manifest: no anonymous GitHub API requests needed
# by Synology clients (which otherwise hit the 60 requests/hour limit).
proxy = json.loads(pathlib.Path('bridge/release.json').read_text())
assert isinstance(proxy['build'], int) and proxy['build'] > 0
assert isinstance(proxy['version'], str)
pathlib.Path('dist/proxy-release.json').write_text(json.dumps({
    'version': proxy['version'], 'build': proxy['build'], 'sha': os.environ['BUILD_SHA']
}))
