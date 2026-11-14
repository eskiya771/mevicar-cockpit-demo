import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const css=read('tv.css');
const window={document:{}};
runInNewContext(read('tv.js'),{window,localStorage:{getItem:()=>null}});
const markup=window.meviTVHTML();
// Structural guard only. Real dimensions, scrolling and playback are checked by
// tv-visual-layout.mjs against the generated Pages artifact before deployment.
const normalCSS=css.split('/* Full-display MeviTV inside Android WebView')[0];
assert.doesNotMatch(normalCSS,/position:fixed/,'Normal TV must stay in its host beside the MeviCar dock');
assert.doesNotMatch(normalCSS,/\.dock[^}]*\{/,'Normal TV must not restyle the shared dock');
assert.match(css,/html\.mevi-tv-theater \.shell/,'Fullscreen theater may expand to the whole viewport');
assert.match(css,/\.cockpit \.full>\.tv-root>\.tv-library\{\s*display:flex/);
assert.match(css,/\.cockpit \.full>\.tv-root>\.tv-player\{display:flex/);
assert.match(css,/\.tv-xtream-item\{flex:0 0 auto;min-height:48px/);
assert.match(css,/margin-right:env\(safe-area-inset-right,0px\)/);
assert.match(css,/margin-bottom:env\(safe-area-inset-bottom,0px\)/);
const player=markup.slice(markup.indexOf('<section class="tv-player">'));
assert(player.indexOf('class="tv-actions"')<player.indexOf('class="tv-stage"'));
assert(player.indexOf('class="tv-settings"')<player.indexOf('class="tv-stage"'));
assert.equal((markup.match(/data-act="xtream"/g)||[]).length,1);
assert(markup.indexOf('class="tv-xtream-search"')<markup.indexOf('class="tv-xtream-group"'));
assert.match(markup,/aria-label="IPTV-Einstellungen"/);
assert(!markup.slice(0,markup.indexOf('<section class="tv-player">')).includes('class="tv-xtream-tabs"'));
assert(player.includes('class="tv-xtream-tabs"'));
assert(player.includes('aria-label="TV-Programm öffnen"'));
assert.match(read('index.html'),/<link rel="stylesheet" href="\.\/tv\.css">/);
assert.match(read('.github/workflows/quality.yml'),/node tests\/tv-visual-layout.mjs/);
console.log('MeviTV structure: shared dock, simultaneous full-screen panes, controls above video, safe-area spacing.');
