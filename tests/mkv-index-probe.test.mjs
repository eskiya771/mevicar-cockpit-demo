import assert from 'node:assert/strict';
import { inspectMkvIndex } from '../mkv-index-probe.mjs';
const id=(...a)=>a;
const num=(n,bytes=4)=>Array.from({length:bytes},(_,i)=>(n/256**(bytes-i-1))&255);
function eb(idBytes,payload){
 if(payload.length>=127)throw Error('Test fixture too large');
 return [...idBytes,0x80|payload.length,...payload];
}
const seekheadId=id(0x11,0x4d,0x9b,0x74),infoId=id(0x15,0x49,0xa9,0x66),cuesId=id(0x1c,0x53,0xbb,0x6b);
const position=pos=>eb(id(0x53,0xac),num(pos));
function seek(pos){return eb(id(0x4d,0xbb),[...eb(id(0x53,0xab),cuesId),...position(pos)]);}
const info=eb(infoId,eb(id(0x2a,0xd7,0xb1),num(1000000)));
function cue(time,relative){return eb(id(0xbb),[
 ...eb(id(0xb3),num(time,2)),
 ...eb(id(0xb7),eb(id(0xf1),num(relative)))
]);}
const cues=eb(cuesId,[...cue(1000,200000),...cue(4000,800000)]);
let header=eb(seekheadId,seek(0));
const cueOffset=header.length+info.length;
header=eb(seekheadId,seek(cueOffset));
const segmentContent=[...header,...info,...cues];
const segment=[0x18,0x53,0x80,0x67,0x01,0xff,0xff,0xff,0xff,0xff,0xff,0xff,...segmentContent]; // unknown-sized segment
const file=new Uint8Array([...eb(id(0x1a,0x45,0xdf,0xa3),[]),...segment,...new Array(1024).fill(0)]);
const segmentDataStart=eb(id(0x1a,0x45,0xdf,0xa3),[]).length+12;
const calls=[];
const read=async(start,len)=>{calls.push([start,len]);return file.subarray(start,start+len)};
const result=await inspectMkvIndex(read,file.length,6000);
assert.equal(result.state,'found',JSON.stringify(result));
assert.equal(result.entries,2);
assert.equal(result.nearest.timeSeconds,4);
assert.equal(result.nearest.bytePosition,segmentDataStart+800000);
assert.equal(result.targetSeconds,4500);
assert.equal(result.requests,2);
const noCues=new Uint8Array([...eb(id(0x1a,0x45,0xdf,0xa3),[]),...segment.slice(0,12),...info,...new Array(100).fill(0)]);
const noResult=await inspectMkvIndex(async(s,n)=>noCues.subarray(s,s+n),noCues.length,6000);
assert.equal(noResult.state,'unknown');
assert.match(noResult.detail,/kein Cues-Verweis/);
assert.rejects(()=>inspectMkvIndex(read,0,6000),/Dateigröße unbekannt/);
console.log('MKV index probe: valid Cues, 75% seek target, unknown-index diagnostics passed');
