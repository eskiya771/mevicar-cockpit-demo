/* Free German Piper TTS for MeviCar Next.
 * Completely local synthesis in the iPhone/browser after a one-time model download.
 * No API key, paid provider or Synology inference endpoint is used.
 * ONNX Runtime Web, piper-phonemize and de_DE-thorsten-medium assets are served
 * from MeviCar's own /vendor/piper/ directory and can be cached by the PWA.
 *
 * Runtime and voice notices: docs/PIPER_OFFLINE_TTS.md.
 */
(function(root){
'use strict';
const BASE='./vendor/piper/';
const SCRIPTS=[
 BASE+'ort/ort.wasm.min.js',
 BASE+'phonemize/piper_phonemize.js'
];
let loading=null;
const engines=new Map(),building=new Map();
const VOICES={
 thorsten:{file:'de_DE-thorsten-medium',name:'Thorsten'},
 audiobook:{file:'de_DE-audio_book-medium',name:'Audio Book'}
};
const findNative=()=>!!root.MeviNativeBridge?.postMessage;
const isAvailable=()=>!findNative()&&!!root.document&&!!root.fetch&&!!(root.AudioContext||root.webkitAudioContext);
function script(url){
 return new Promise((resolve,reject)=>{
  const el=root.document.createElement('script');
  el.src=url;el.async=false;
  el.onload=()=>resolve();
  el.onerror=()=>reject(Error('Piper-Datei konnte nicht geladen werden: '+url));
  root.document.head.appendChild(el);
 });
}
async function boot(notice){
 if(loading)return loading;
 loading=(async()=>{
  notice?.('Piper initialisiert kostenlose Offline-Sprachausgabe …');
  if(!root.ort)await script(SCRIPTS[0]);
  if(!root.createPiperPhonemize)await script(SCRIPTS[1]);
  if(!root.ort?.InferenceSession||!root.createPiperPhonemize)
   throw Error('Piper-Rechenbibliotheken sind nicht verfügbar.');
  root.ort.env.wasm.wasmPaths=BASE+'ort/';
  // iOS PWAs usually lack cross-origin isolation; use single-threaded WASM.
  root.ort.env.wasm.numThreads=1;
  return true;
 })().catch(e=>{loading=null;throw e});
 return loading;
}
async function getEngine(notice,voice='thorsten'){
 const selected=VOICES[voice];
 if(!selected)throw Error('Unbekannte Piper-Stimme.');
 if(engines.has(voice))return engines.get(voice);
 if(building.has(voice))return building.get(voice);
 const pending=(async()=>{
  await boot(notice);
  notice?.('Piper '+selected.name+' wird geladen (einmaliger Download ca. 64 MB) …');
  const [model,cfgRes]=await Promise.all([
   root.fetch(BASE+selected.file+'.onnx'),
   root.fetch(BASE+selected.file+'.onnx.json')
  ]);
  if(!model.ok||!cfgRes.ok)throw Error('Piper-Modell nicht gefunden. Bitte den Web-Build aktualisieren.');
  const [bytes,cfg]=await Promise.all([model.arrayBuffer(),cfgRes.json()]);
  if(bytes.byteLength<1000000||cfg?.num_symbols!==256||
     cfg?.phoneme_id_map?.['$']?.[0]!==2||cfg?.espeak?.voice!=='de'||
     cfg?.audio?.sample_rate!==22050||
     (voice==='thorsten'&&cfg.audio?.quality!=='medium'))
   throw Error('Piper-Sprachmodell und Konfiguration passen nicht zusammen.');
  notice?.('Piper '+selected.name+' wird auf dem Gerät eingerichtet …');
  const session=await root.ort.InferenceSession.create(bytes,{executionProviders:['wasm']});
  const result={session,cfg,rate:cfg.audio.sample_rate,lang:cfg.espeak.voice};
  engines.set(voice,result);
  return result;
 })().finally(()=>{building.delete(voice)});
 building.set(voice,pending);
 return pending;
}
let phonemizerPromise=null;
function phonemizer(){
 if(phonemizerPromise)return phonemizerPromise;
 phonemizerPromise=(async()=>{
  await boot();
  const lines=[];
  const mod=await root.createPiperPhonemize({
   print:s=>{try{lines.push(JSON.parse(s))}catch{}},
   printErr:s=>root.console?.warn?.('[Piper]',s),
   locateFile:name=>BASE+'phonemize/'+name
  });
  return (text,lang)=>{
   lines.length=0;
   const exit=mod.callMain([
    '--espeak_data','/espeak-ng-data','--language',lang,
    '--input',JSON.stringify([{text}])
   ]);
   if(exit!==0||!lines[0]?.phoneme_ids?.length)
    throw Error('Piper konnte den deutschen Text nicht in Laute zerlegen.');
   return lines[0].phoneme_ids;
  };
 })().catch(e=>{phonemizerPromise=null;throw e});
 return phonemizerPromise;
}
async function infer(session,cfg,ids){
 const defaults=cfg.inference||{};
 const noiseScale=defaults.noise_scale??0.667;
 const lengthScale=defaults.length_scale??1;
 const noiseW=defaults.noise_w??0.8;
 const values={
  input:new root.ort.Tensor('int64',BigInt64Array.from(ids,x=>BigInt(x)),[1,ids.length]),
  input_lengths:new root.ort.Tensor('int64',BigInt64Array.of(BigInt(ids.length)),[1]),
  scales:new root.ort.Tensor('float32',Float32Array.of(noiseScale,lengthScale,noiseW),[3])
 };
 const data=await session.run(values);
 return data.output.data;
}
function makeWav(samples,rate){
 const bytes=new Uint8Array(44+samples.length*2);
 const view=new DataView(bytes.buffer);
 const tag=(at,s)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i))};
 tag(0,'RIFF');view.setUint32(4,bytes.length-8,true);
 tag(8,'WAVE');tag(12,'fmt ');
 view.setUint32(16,16,true);view.setUint16(20,1,true);
 view.setUint16(22,1,true);view.setUint32(24,rate,true);
 view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
 tag(36,'data');view.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){
  const v=Number.isFinite(samples[i])?Math.max(-1,Math.min(1,samples[i])):0;
  view.setInt16(44+i*2,Math.round(v*32767),true);
 }
 return bytes;
}
async function synthesize(value,signal,onProgress,voice='thorsten'){
 if(!isAvailable())throw Error('Piper-TTS ist nur in der Browser-/iPhone-Web-App verfügbar.');
 const text=String(value||'').trim().slice(0,240);
 if(!text)throw Error('Kein Text für Piper-TTS.');
 if(signal?.aborted)throw Error('Piper-Sprachausgabe abgebrochen.');
 const [e,convert]=await Promise.all([getEngine(onProgress,voice),phonemizer()]);
 if(signal?.aborted)throw Error('Piper-Sprachausgabe abgebrochen.');
 onProgress?.('Piper spricht die Antwort auf Deutsch …');
 const ids=convert(text,e.lang);
 const maxSymbols=e.cfg.num_symbols;
 if(Number.isInteger(maxSymbols)&&maxSymbols>0&&ids.some(id=>
     !Number.isInteger(id)||id<0||id>=maxSymbols))
  throw Error('Die Piper-Lauttabelle passt nicht zum Sprachmodell. Bitte Web-Version aktualisieren.');
 const eos=e.cfg.phoneme_id_map?.['$']?.[0]??2;
 const groups=[];let current=[];
 for(const id of ids){current.push(id);if(id===eos){groups.push(current);current=[]}}
 if(current.length)groups.push(current);
 const chunks=[];let count=0;
 for(const item of groups){
  if(signal?.aborted)throw Error('Piper-Sprachausgabe abgebrochen.');
  const pcm=await infer(e.session,e.cfg,item);
  chunks.push(pcm);count+=pcm.length;
  // Keep sentence breaks distinct, but never add unlimited silence.
  if(groups.indexOf(item)!==groups.length-1){
   const gap=new Float32Array(Math.round(e.rate*0.15));
   chunks.push(gap);count+=gap.length;
  }
  if(count>e.rate*45)throw Error('Piper-Antwort zu lang.');
 }
 if(!count)throw Error('Piper hat kein Audio erzeugt.');
 const pcm=new Float32Array(count);
 let pos=0;for(const chunk of chunks){pcm.set(chunk,pos);pos+=chunk.length}
 return makeWav(pcm,e.rate);
}
root.MeviPiperTTS={synthesize,isAvailable,model:'de_DE-thorsten-medium',isReady:()=>engines.has('thorsten')};
root.MeviPiperAudiobookTTS={
 synthesize:(value,signal,onProgress)=>synthesize(value,signal,onProgress,'audiobook'),
 isAvailable,model:'de_DE-audio_book-medium',isReady:()=>engines.has('audiobook')
};
})(window);
