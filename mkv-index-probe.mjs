/* Read-only, bounded Matroska SeekHead/Cues diagnostic. No media decoding or URL logging. */
const IDS={segment:0x18538067,seekhead:0x114d9b74,seek:0x4dbb,seekid:0x53ab,seekposition:0x53ac,info:0x1549a966,timestampScale:0x2ad7b1,cues:0x1c53bb6b,cuepoint:0xbb,cuetime:0xb3,cuetrackpositions:0xb7,cueclusterposition:0xf1};
const LIMIT=4*1024*1024;
function vint(a,p,strip){
 if(p>=a.length)return null;
 let mask=128,n=1;while(n<=8&&!(a[p]&mask)){mask>>=1;n++;}
 if(n>8||p+n>a.length)return null;
 const unknown=strip&&(a[p]&(~mask))===(mask-1)&&Array.from(a.subarray(p+1,p+n)).every(x=>x===255);
 let value=strip?(a[p]&(~mask)):(a[p]);for(let j=1;j<n;j++)value=value*256+a[p+j];
 if(!Number.isSafeInteger(value)&&!unknown)return null;
 return {value:unknown?0:value,n,unknown};
}
function field(a,p){
 const id=vint(a,p,false);if(!id)return null;
 const size=vint(a,p+id.n,true);if(!size)return null;
 const start=p+id.n+size.n,end=size.unknown?Infinity:start+size.value;
 if(!Number.isSafeInteger(start)||(!size.unknown&&!Number.isSafeInteger(end)))return null;
 return {id:id.value,start,end,size:size.value,unknown:size.unknown};
}
function *children(a,start,end,limit=20000){
 let p=start,count=0;const stop=Math.min(end,a.length);
 while(p<stop&&count++<limit){
  const e=field(a,p);if(!e||e.unknown||e.end>stop||e.end<=p)break;
  yield e;p=e.end;
 }
}
function number(a,e){if(!e||e.end-e.start>8)return null;let n=0;for(let i=e.start;i<e.end;i++)n=n*256+a[i];return Number.isSafeInteger(n)?n:null;}
function header(a){const seg=[...children(a,0,a.length)].find(e=>e.id===IDS.segment);
 // Unknown-length Segment is common: scan EBML header top-level manually.
 if(seg)return seg;
 let p=0;while(p<a.length){const e=field(a,p);if(!e)break;if(e.id===IDS.segment)return e;if(e.unknown||e.end>a.length)break;p=e.end;}
 return null;
}
function seekTarget(a,seek){
 let id=null,pos=null;
 for(const e of children(a,seek.start,seek.end)){
  if(e.id===IDS.seekid)id=number(a,e);
  if(e.id===IDS.seekposition)pos=number(a,e);
 }
 return id!==null&&pos!==null?{id,pos}:null;
}
export async function inspectMkvIndex(read,size,duration){
 if(!Number.isSafeInteger(size)||size<16)throw Error('Dateigröße unbekannt');
 let bytes=0,requests=0;
 async function get(start,len){
  if(!Number.isSafeInteger(start)||start<0||start>=size||len<1)throw Error('Ungültiger Dateibereich');
  if(bytes+len>LIMIT)throw Error('Diagnose-Leselimit erreicht (4 MiB)');
  const data=await read(start,Math.min(len,size-start));const a=data instanceof Uint8Array?data:new Uint8Array(data);
  bytes+=a.byteLength;requests++;return a;
 }
 const a=await get(0,Math.min(524288,size));
 const segment=header(a);
 if(!segment)return {state:'unavailable',detail:'Segment-Header in den ersten 512 KiB nicht gefunden',requests,bytes};
 const dataStart=segment.start;
 let cues=null,scale=1000000,seekheads=0;
 // Only parse complete top-level elements seen in the bounded head read.
 for(let p=dataStart,seen=0;p<a.length&&seen++<1000;){
  const e=field(a,p);if(!e||e.unknown||e.end>a.length||e.end<=p)break;
  if(e.id===IDS.info){
   for(const child of children(a,e.start,e.end))if(child.id===IDS.timestampScale)scale=number(a,child)||scale;
  }
  if(e.id===IDS.seekhead){
   seekheads++;
   for(const entry of children(a,e.start,e.end))if(entry.id===IDS.seek){
    const target=seekTarget(a,entry);
    if(target?.id===IDS.cues)cues=dataStart+target.pos;
   }
  }
  if(e.id===IDS.cues){cues=p;break;}
  if(e.id===0x1f43b675)break; // Cluster: do not scan video data.
  p=e.end;
 }
 if(cues===null)return {state:'unknown',detail:'Im gelesenen Dateikopf kein Cues-Verweis gefunden (kein Nachweis, dass Cues fehlen)',requests,bytes,seekheads};
 if(cues<0||cues>=size)return {state:'invalid',detail:'Cues-Offset außerhalb der Datei',requests,bytes,cues};
 const cu=await get(cues,Math.min(1024*1024,size-cues,LIMIT-bytes));
 const cue=field(cu,0);
 if(!cue||cue.id!==IDS.cues)return {state:'invalid',detail:'Cues-Verweis zeigt nicht auf einen lesbaren Cues-Header',requests,bytes,cues};
 const entries=[],available=Math.min(cue.end,cu.length);
 for(const e of children(cu,cue.start,available)){
  if(e.id!==IDS.cuepoint)continue;
  let time=null,position=null;
  for(const ch of children(cu,e.start,e.end)){
   if(ch.id===IDS.cuetime)time=number(cu,ch);
   if(ch.id===IDS.cuetrackpositions){
    for(const v of children(cu,ch.start,ch.end))if(v.id===IDS.cueclusterposition&&position===null)position=number(cu,v);
   }
  }
  if(time!==null&&position!==null)entries.push({timeSeconds:time*scale/1e9,bytePosition:dataStart+position});
 }
 const target=Number.isFinite(duration)&&duration>0?duration*0.75:null;
 const nearest=target===null?null:entries.filter(e=>e.timeSeconds<=target).at(-1)||null;
 return {state:entries.length?'found':'unknown',detail:entries.length?'Cues-Einträge lesbar':'Cues-Header gefunden, aber im begrenzten Bereich keine vollständigen CuePoints',requests,bytes,cues,entries:entries.length,partial:cue.end>cu.length,targetSeconds:target,nearest};
}
