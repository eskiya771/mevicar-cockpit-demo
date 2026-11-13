import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
for (const name of ['credential-settings.js','native-updates.js']) {
 new vm.Script(fs.readFileSync(name,'utf8'),{filename:name});
}
const html=fs.readFileSync('index.html','utf8');
const inline=html.slice(html.indexOf('<script>')+8,html.indexOf('</script>'));
new vm.Script(inline.replace('__MEVICAR_BUILD__',JSON.stringify({version:'0.5.3',build:1,commit:'abc'})),{filename:'index.html'});
assert(html.includes('setSettingsTab(\\\'updates\\\')')||html.includes('APK-Updates'));
assert(html.includes('native-updates.js') && html.includes('native-updates.css'));
const creds=fs.readFileSync('credential-settings.js','utf8');
assert(creds.includes("nativeCall('settings.set','githubToken',v)"));
assert(creds.includes("nativeCall('settings.clear','githubToken')"));
assert(!creds.includes("localStorage.setItem('githubToken'"));
const js=fs.readFileSync('native-updates.js','utf8');
for(const name of ['update.status','update.channel','update.check','update.download','update.install','update.cancel','update.permission']){
 assert(js.includes(name),'Missing updater action '+name);
}
assert(js.includes("data.type==='progress'"));
assert(js.includes('state.available'));
assert(!js.includes('Authorization:')&&!js.includes('Bearer '),'Native-only GitHub token');
for(const name of ['pages','quality']){
 const yaml=fs.readFileSync('.github/workflows/'+name+'.yml','utf8');
 assert(yaml.includes('native-updates.js native-updates.css'),'Deployed assets missing');
 assert(yaml.includes('node tests/native-updates-smoke.mjs'),'Test not executed');
}
console.log('APK update UI, native protocol, and token isolation: OK');
