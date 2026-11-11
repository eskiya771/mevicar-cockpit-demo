import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Expose closure functions only inside this VM; the shipped app adds no test API.
const source=readFileSync(new URL('../tv.js',import.meta.url),'utf8');
const instrumented=source.replace('global.meviTVHTML=html;',
 'global.testDiagnostics={moviReport,moviLogText,moviTrackReport,moviSourceReport,click,setRoot:value=>{root=value;}};global.meviTVHTML=html;');
let clipboard='';
const box={textContent:''};
const win={document:{}};
runInNewContext(instrumented,{
 window:win,document:win.document,URL,
 localStorage:{getItem:()=>null},
 navigator:{clipboard:{writeText:value=>{clipboard=value;}}},
 console:{info(){},error(){}}
});
const api=win.testDiagnostics;
api.setRoot({querySelector:()=>box});
api.moviReport('Engine: experimental','info','engine');
api.moviSourceReport({player:{getReadDiagnostics:()=>({
 revision:'mevitv-mkv-size-2',fileSizeBytes:1570800962,
 demuxerFileSizeBytes:1570800962,bufferCapacityBytes:50*1048576,
 headContentLength:'0',sizeSource:'range'
})}});
api.moviTrackReport({
 video:[{codec:'h264',width:1920,height:1080},null],
 audio:[{codec:'aac',language:'deu'}],subtitle:[],chapters:[{title:'Chapter'}]
});
for(let i=0;i<100;i++)api.moviReport('Range-Ende '+i);
const log=api.moviLogText();
assert.match(log,/Engine: experimental/);
assert.match(log,/Datei\/Demuxer: 1570800962\/1570800962 Bytes/);
assert.match(log,/HTTP-Puffer: 50\.0 MiB/);
assert.match(log,/HEAD-Length: 0.*Größe per range.*Patch mevitv-mkv-size-2/);
assert.match(log,/Video-Tracks: h264 1920x1080 · insgesamt 2 Tracks/);
assert.match(log,/Audio-Tracks: aac deu/);
assert.equal(log.split('\n').length,74);
assert.equal(log.split('Engine: experimental').length,2);
assert.doesNotMatch(log,/Range-Ende 0\n/);
assert.equal(box.textContent,log);
api.click({target:{closest:()=>({dataset:{act:'movi-copy-log'}})}});
assert.equal(clipboard,log);

api.moviReport('Private https://provider.invalid/user/token/film.mkv','info','privacy');
for(let i=0;i<80;i++)api.moviReport('Next '+i);
assert.match(api.moviLogText(),/\[URL entfernt\]/);
assert.doesNotMatch(api.moviLogText(),/provider\.invalid|user\/token/);
api.moviTrackReport([{type:'video',codecName:'hevc'},null]);
assert.match(api.moviLogText(),/Video-Tracks: hevc · insgesamt 1 Tracks/);
api.moviSourceReport({player:{}});
assert.match(api.moviLogText(),/HTTP-Quelldiagnose nicht verfügbar/);
console.log('TV Movi diagnostics OK: actual HTTP metrics, object/array tracks, persistent sanitized context, clipboard and older players.');
