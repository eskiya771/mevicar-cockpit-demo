import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('index.html','utf8');
const inline=html.slice(html.indexOf('<script>')+'<script>'.length,html.indexOf('</script>'));
assert(inline.includes('const CURRENT_BUILD=__MEVICAR_BUILD__'), 'Web build placeholder stays in template');
assert(inline.includes('window.meviSetNativeBuild'), 'Native build callback missing');
// Android build 65 changed versionName from 0.5.3-native-preview to 0.6.0.
// The Web UI must accept BOTH, otherwise the hybrid APK is wrongly labeled WEB.
const begin=inline.indexOf('window.meviSetNativeBuild=function(info){');
const end=inline.indexOf('};\nconst RELEASE_NOTES=',begin);
assert(begin>=0 && end>begin,'Native build callback could not be isolated');
const nativeCallback=inline.slice(begin,end+2);
const nativeContext={
  window:{},document:{querySelector:()=>null},
  initBuild:()=>{},setPlatformLabel:()=>{}
};
vm.runInNewContext('let NATIVE_BUILD=null;'+nativeCallback+
  ';window.getNativeBuild=()=>NATIVE_BUILD;',nativeContext);
nativeContext.window.meviSetNativeBuild({version:'0.6.0',build:65,commit:'signed'});
assert.equal(nativeContext.window.getNativeBuild().build,65,'Android 0.6.0 APK must be recognized');
nativeContext.window.meviSetNativeBuild({version:'0.5.3-native-preview',build:64,commit:'legacy'});
assert.equal(nativeContext.window.getNativeBuild().build,64,'Older APK versions must still be recognized');
nativeContext.window.meviSetNativeBuild({version:'invalid',build:900,commit:'bad'});
assert.equal(nativeContext.window.getNativeBuild().build,64,'Invalid native version must be rejected');
assert(inline.includes("NATIVE_BUILD?'APP':'WEB'"), 'Launcher must identify App vs Web');
assert(inline.includes('setPlatformLabel()'), 'Android callback must update visible platform labels');
assert(html.includes('id="meviPlatformHeader"'), 'Main header must identify current platform');
assert(inline.includes("NATIVE_BUILD?'Web '"), 'Android/Web status must distinguish builds');
assert(inline.includes('Pages-Build ') && inline.includes('APK-Build '), 'Version title must distinguish sources');
assert(inline.includes('versionStatus()'), 'Settings must show both sources');
assert(inline.includes("window.addEventListener('load',()=>checkForUpdateImpl(true))"), 'Web build must be checked automatically on launch');
assert(inline.includes("url.searchParams.get('v')!==String(latestBuild)"), 'Startup refresh must avoid infinite reload loops');
assert(readFileSync('VERSION','utf8').trim().match(/^\d+\.\d+\.\d+$/));
new vm.Script(inline.replace('__MEVICAR_BUILD__',JSON.stringify({version:'0.5.3',build:53,commit:'abcdef123456'})),{filename:'index.html'});
console.log('Separate Web and Android version labels: OK');
