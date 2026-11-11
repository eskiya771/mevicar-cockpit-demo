import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

export const officialBase='./vendor/movi-mevitv-mkv-size-2/';
export function verifyOfficialMovi(){
 const folder=new URL('../vendor/movi-mevitv-mkv-size-2/',import.meta.url);
 const manifest=JSON.parse(readFileSync(new URL('movi-build.json',folder),'utf8'));
 assert.equal(manifest.revision,'mevitv-mkv-size-2');
 assert.equal(manifest.upstream,'8bd0b50d7cdfcef635e015ea93e365876088969d');
 for(const name of ['element.slim.global.js','movi.wasm']){
  const bytes=readFileSync(new URL(name,folder));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.files[name].sha256,name+' checksum');
  assert.equal(bytes.length,manifest.files[name].bytes,name+' size');
  if(name.endsWith('.wasm'))assert(WebAssembly.validate(bytes),'Valid standalone WASM');
  else assert(bytes.includes(Buffer.from(manifest.revision)),'Confirmed size/seek revision in JS');
 }
 assert.match(readFileSync(new URL('LICENSE.txt',folder),'utf8'),/Apache License/);
 return manifest;
}
