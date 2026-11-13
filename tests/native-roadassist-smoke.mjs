import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const engine=read('native-navigation/MeviRoadAssistNative.java');
const plugin=read('native-navigation/MeviNativeNavigationPlugin.java');
const activity=read('native-navigation/MeviNavigationActivity.java');
const installer=read('scripts/install-native-navigation.py');
const ha=read('homeassistant.js'),nav=read('navigation-google.js'),platform=read('meviplatform.js');
for(const term of [
  'getRouteSegments()', 'getLatLngs()', 'addRouteChangedListener',
  'getRoadSnappedLocationProvider', 'removeLocationListener',
  'CAMERA_CORRIDOR_METERS=35.0', 'GPS_CORRIDOR_METERS=100.0',
  'EARLY_METERS=500.0', 'FINAL_METERS=35.0',
  'MAX_HA_AGE_MS', 'MAX_GPS_AGE_MS', 'source','blitzer_',
  'getAccuracy()>50','getResponseCode()!=200','setInstanceFollowRedirects(false)',
  'shutdownNow()', 'tts.shutdown()', 'System.currentTimeMillis()-lastReceived',
  'TextToSpeech.QUEUE_ADD'
]) assert.ok(engine.includes(term), 'Missing Classic native Road Assist guard: '+term);
assert.match(activity,/roadAssist\.attach\(value\)/);
assert.match(activity,/roadAssist\.setGuiding\(true\)/);
assert.match(activity,/roadAssist\.stop\(\)/);
assert.match(activity,/Blitzer-Routenscan/);
assert.match(activity,/setPositiveButton\("Scan starten"/);
assert.match(activity,/roadAssist\.scanOnDemand\(\)/);
assert.match(activity,/roadAssist\.toggleVoice\(\)/);
for(const term of [
  'public void scanOnDemand()', 'sampleRoute', 'mevicar_route_scan',
  'blitzer/refresh_controls?return_response', 'config_entry_id',
  'version!=routeVersion', 'confirmed', 'MAX_CAMERAS',
  'Thread.sleep(900)', 'apiObject('
]) assert.ok(engine.includes(term),'Missing opt-in native scanner: '+term);
assert.match(plugin,/haConfigId/);
assert.match(plugin,/radarEnabled/);
assert.match(plugin,/radarVoice/);
assert.match(read('roadassist.js'),/nativeConfig:/);
assert.match(platform,/haConfigId:haSession\?\.configId/);
assert.match(installer,/MeviRoadAssistNative\.java/);
assert.match(plugin,/takeRadarSession/);
assert.match(plugin,/haOrigin/);
assert.match(plugin,/getRawUserInfo/);
assert.match(ha,/function launchNativeWithRadar\(destination\)/);
assert.match(ha,/state\.connected&&state\.token/);
assert.match(platform,/haOrigin:haSession\?\.origin/);
assert.match(nav,/MeviHA\.launchNativeWithRadar\(selected\)/);
assert.doesNotMatch(activity,/putExtra\([^\n]*(?:token|haToken)/i);
assert.doesNotMatch(plugin,/putExtra\([^\n]*(?:token|haToken)/i);
assert.doesNotMatch(engine,/SharedPreferences|localStorage|hardcoded/i);
console.log('Native Home Assistant → Google Navigation SDK Road Assist wiring and security checks passed');
