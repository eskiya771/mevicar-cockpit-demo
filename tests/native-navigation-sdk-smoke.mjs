import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const sdk=read('native-navigation/MeviNavigationActivity.java');
const bridge=read('native-navigation/MeviNativeNavigationPlugin.java');
const installer=read('scripts/install-native-navigation.py');
const workflow=read('.github/workflows/android-apk.yml');
const platform=read('meviplatform.js');
const nav=read('navigation-google.js');
for(const fragment of ['NavigationApi.setApiKey','NavigationApi.getNavigator','Waypoint.builder()','setDestination(','startGuidance()','stopGuidance()','onDestroy()']){
 assert.ok(sdk.includes(fragment), 'Missing native guidance operation '+fragment);
}
assert.match(bridge, /@CapacitorPlugin\(name="MeviNativeNavigation"\)/);
assert.match(bridge, /call.getDouble\("lat"\)/);
assert.match(installer, /registerPlugin\(MeviNativeNavigationPlugin.class\)/);
assert.match(installer, /navigation:7\.9\.0/);
assert.match(installer, /ACCESS_FINE_LOCATION/);
assert.match(workflow, /python3 scripts\/install-native-navigation.py/);
assert.match(platform, /MeviNativeNavigation.start/);
assert.match(nav, /MeviPlatform.navigation.nativeRoute\(selected\)/);
console.log('Native Navigation SDK source wiring checks passed (not a device or Gradle build)');
