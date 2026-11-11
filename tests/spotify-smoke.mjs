/* Spotify Connect remote integration regression tests.
   Run: node tests/spotify-smoke.mjs
   Tests static wiring, PKCE safety, link parsing, setup/connected UI and lifecycle.
   Live OAuth and real playback still require a registered Client ID and Premium. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../spotify.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../spotify.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/pages.yml',import.meta.url),'utf8');
const qualityWorkflow=readFileSync(new URL('../.github/workflows/quality.yml',import.meta.url),'utf8');
const media=readFileSync(new URL('../mevimedia.js',import.meta.url),'utf8');
new Function(source);
new Function(media);

/* --- Static security and endpoint contract --- */
assert.match(source,/code_challenge_method/);
assert.match(source,/code_challenge/);
assert.match(source,/'S256'/);
assert.match(source,/grant_type:\s*'refresh_token'/);
assert.match(source,/grant_type:\s*'authorization_code'/);
assert.doesNotMatch(source,/client_secret|clientSecret/,'SPA must never send a client secret');
assert.doesNotMatch(source,/accounts\.spotify\.com\/api\/token[\s\S]{0,200}secret/i);
assert.match(source,/mevicar-spotify-client-v1/);
assert.match(source,/mevicar-spotify-token-v1/);
assert.match(source,/mevicar-spotify-device-v1/);
assert.match(source,/localStorage/);
assert.match(source,/sessionStorage/);

for(const endpoint of [
  '/me/player', '/me/player/play', '/me/player/pause',
  '/me/player/seek', '/me/player/shuffle', '/me/player/repeat', '/me/player/queue',
  '/me/player/devices', '/me/player/volume', '/me/player/recently-played',
  '/search', '/me/playlists', '/me/tracks', '/me/albums', '/me/shows', '/me/library'
]) assert.ok(source.includes(endpoint),'Missing Spotify Web API endpoint '+endpoint);
assert.match(source,/api\('\/me\/player\/' \+ direction/);
assert.match(source,/meviSpotifyNext:\s*\(\)\s*=>\s*skip\('next'\)/);
assert.match(source,/meviSpotifyPrev:\s*\(\)\s*=>\s*skip\('previous'\)/);

/* February 2026 Dev Mode migration: avoid removed endpoints and preserve search cap. */
assert.match(source,/\/me\/library\/contains/);
assert.doesNotMatch(source,/\/me\/(tracks|albums|episodes|shows)\/contains/);
assert.doesNotMatch(source,/\/browse\//);
assert.doesNotMatch(source,/\/recommendations/);
assert.match(source,/limit:\s*'10'/);
assert.match(source,/track,album,artist,playlist,show,episode/);
assert.match(source,/Retry-After/);
assert.match(source,/Premium/,'Premium limitation must be explained');

/* --- Styles: shell, themes, short viewports and touch safety --- */
assert.match(css,/\.sp-shell\{/);
assert.match(css,/\.sp-seek::-webkit-slider-runnable-track/);
assert.match(css,/env\(safe-area-inset-bottom/);
assert.match(css,/@media\s*\(max-height:480px\)/);
assert.match(css,/html\[data-theme="cyberpunk"\] \.sp-shell/);
assert.match(css,/html\[data-theme="liquidglass"\] \.sp-shell/);
assert.match(css,/44px/,'Touch targets should reach 44 px where space allows');
assert.match(css,/\.sp-shell\.is-compact/);
assert.match(css,/\.sp-search-entry/);
assert.match(css,/\.sp-voice-button/);
assert.match(css,/width:44px;min-width:44px;min-height:44px/);
assert.match(source,/window\.SpeechRecognition \|\| window\.webkitSpeechRecognition/);
assert.match(source,/recognition\.lang = 'de-DE'/);
assert.match(source,/meviSpotifyVoice: voice/);

/* --- Cockpit wiring and lifecycle --- */
assert.match(html,/<link rel="stylesheet" href="\.\/spotify\.css">/);
assert.match(html,/<script src="\.\/spotify\.js"><\/script>/);
assert.match(html,/meviSpotifyHTML\(/);
assert.match(html,/meviSpotifyUnmount\(\)[\s\S]{0,600}\$\('screen'\)\.innerHTML=html/);
assert.match(html,/\$\('screen'\)\.innerHTML=html;[\s\S]{0,240}meviSpotifyMount\(\)/);
assert.match(html,/selectAudioSource[\s\S]{0,220}meviSpotifyPauseForSource/);
assert.doesNotMatch(html,/meviAudioDemoHTML/);
assert.doesNotMatch(media,/meviAudioDemoHTML|demoCatalog|demoState/,'MeviMedia must not keep a fake Spotify demo');
/* --- Shell: it must be the only Spotify implementation --- */
assert.match(sw,/spotify\.css/);
assert.match(sw,/spotify\.js/);
assert.match(qualityWorkflow,/spotify-smoke\.mjs/);
assert.match(workflow,/spotify\.css/);
assert.match(workflow,/spotify\.js/);

/* --- VM harness --- */
const json=(data,status=200)=>({
  status,ok:status>=200&&status<300,
  headers:{get:name=>name==='Retry-After'?'2':null},
  text:async()=>JSON.stringify(data)
});
function createEnv({connected=false,fetchImpl,shell=null,speechCtor=null}={}){
  const saved={},session={},requests=[];
  if(connected){
    saved['mevicar-spotify-client-v1']='testclient1234';
    saved['mevicar-spotify-token-v1']=JSON.stringify({
      access_token:'access-token',refresh_token:'refresh-token',
      expires_at:Date.now()+3600000,token_type:'Bearer',scope:'user-read-playback-state'
    });
  }
  const localStorage={getItem:k=>saved[k]??null,setItem(k,v){saved[k]=String(v)},removeItem(k){delete saved[k]}};
  const sessionStorage={getItem:k=>session[k]??null,setItem(k,v){session[k]=String(v)},removeItem(k){delete session[k]}};
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:'',hidden:false,className:'',style:{setProperty(){}},querySelector(){return null},focus(){},select(){}});
    return elements.get(id);
  };
  const document={
    hidden:false,activeElement:null,body:{appendChild(){},firstChild:null},
    documentElement:{dataset:{}},
    getElementById:id=>element(id),
    querySelector:selector=>selector==='.sp-shell'?shell:null,
    querySelectorAll:()=>[],
    addEventListener(){},
    createElement:()=>({href:'',target:'',rel:'',click(){},remove(){}})
  };
  const location={href:'https://example.test/mevicar/',origin:'https://example.test',pathname:'/mevicar/',assign(){}};
  const history={replaceState(){}};
  let renders=0;
  const win={render(){renders++},crypto:globalThis.crypto,addEventListener(){},removeEventListener(){},btoa:value=>Buffer.from(value,'binary').toString('base64')};
  if(speechCtor)win.SpeechRecognition=speechCtor;
  const fetchStub=(url,options)=>Promise.resolve((fetchImpl||(()=>json({})))(String(url),options));
  new Function('window','document','navigator','localStorage','sessionStorage','location','history','fetch','URL','TextEncoder','setTimeout','clearTimeout','AbortController',source)(
    win,document,{},localStorage,sessionStorage,location,history,fetchStub,URL,TextEncoder,setTimeout,clearTimeout,AbortController
  );
  return {win,doc:document,saved,session,requests,renders:()=>renders,elements};
}

/* Setup state without a token. */
const setup=createEnv();
let markup=setup.win.meviSpotifyHTML(false);
assert.match(markup,/Spotify im Cockpit steuern/);
assert.match(markup,/Redirect-URI/);
assert.ok(markup.includes('https://example.test/mevicar/'),'Redirect URI must be the exact PWA path');
assert.match(markup,/Client ID/);
assert.match(markup,/Spotify Premium/);
assert.match(markup,/Developer Dashboard/);
assert.match(markup,/data-state="setup"/);
assert.equal(setup.win.meviSpotifyDebug().connected,false);

setup.win.meviSpotifySaveClient('bad id!');
assert.match(setup.win.meviSpotifyHTML(false),/gültige Spotify Client ID/);
assert.equal(setup.win.meviSpotifyDebug().client,false);
setup.win.meviSpotifySaveClient('testclient1234');
assert.equal(setup.saved['mevicar-spotify-client-v1'],'testclient1234');
assert.equal(setup.win.meviSpotifyDebug().client,true);
markup=setup.win.meviSpotifyHTML(true);
assert.match(markup,/Mit Spotify verbinden/);
assert.match(markup,/is-compact/);

/* Connected state renders the remote shell. */
const connected=createEnv({connected:true,shell:{}});
markup=connected.win.meviSpotifyHTML(false);
assert.match(markup,/data-state="ready"/);
assert.match(markup,/SPOTIFY REMOTE|SPOTIFY <em>REMOTE<\/em>/);
assert.match(markup,/id="sp-now-region"/);
assert.match(markup,/id="sp-browse-region"/);
assert.match(markup,/id="sp-search-region"/);
assert.match(markup,/Sprachsuche im Browser nicht verfügbar/);
assert.match(markup,/class="sp-voice-button/);
assert.match(markup,/disabled/);
assert.match(markup,/Wiedergabestatus wird geladen/);
assert.match(markup,/role="tablist"/);
assert.equal(connected.win.meviSpotifyDebug().connected,true);

/* Mount starts polling, unmount stops it. */
connected.win.meviSpotifyMount();
assert.equal(connected.win.meviSpotifyDebug().mounted,true);
assert.equal(connected.win.meviSpotifyDebug().polling,true);
connected.win.meviSpotifyUnmount();
assert.equal(connected.win.meviSpotifyDebug().mounted,false);
assert.equal(connected.win.meviSpotifyDebug().polling,false);

/* Browser speech recognition is optional; recognized text must enter existing search.
   No permission request on mount and any active recognition stops during unmount. */
const instances=[];
class MockRecognition {
  constructor(){instances.push(this);this.started=0;this.aborted=0}
  start(){this.started++}
  abort(){this.aborted++}
}
const spoken=createEnv({connected:true,shell:{dataset:{}},speechCtor:MockRecognition});
let voiceMarkup=spoken.win.meviSpotifyHTML(true);
assert.match(voiceMarkup,/Sprachsuche starten/);
assert.doesNotMatch(voiceMarkup,/Sprachsuche im Browser nicht verfügbar/);
assert.equal(instances.length,0,'Do not request microphone on initial render');
spoken.win.meviSpotifyVoice();
assert.equal(instances.length,1);
assert.equal(instances[0].lang,'de-DE');
assert.equal(instances[0].started,1);
assert.match(spoken.win.meviSpotifyHTML(true),/Sprachsuche beenden/);
instances[0].onresult({results:[[ {transcript:'Daft Punk'} ]]});
assert.equal(spoken.doc.getElementById('sp-search-input').value,'Daft Punk');
assert.equal(spoken.win.meviSpotifyDebug().tab,'search');
assert.equal(spoken.win.meviSpotifyDebug().connected,true);
assert.equal(instances[0].aborted,1,'Recognition must end on successful result');
spoken.win.meviSpotifyVoice();
assert.equal(instances.length,2);
spoken.win.meviSpotifyUnmount();
assert.equal(instances[1].aborted,1,'Unmount must stop the microphone');
spoken.win.meviSpotifyVoice();
instances[2].onerror({error:'not-allowed'});
assert.match(spoken.win.meviSpotifyHTML(true),/Mikrofonzugriff verweigert/);
spoken.win.meviSpotifyVoice();
instances[3].onresult({results:[[ {transcript:'Nena'} ]]});
assert.equal(spoken.doc.getElementById('sp-search-input').value,'Nena');
spoken.win.meviSpotifyVoice();
spoken.win.meviSpotifyTab('browse');
assert.equal(instances[4].aborted,1,'Leaving search must stop microphone');
const unsupported=createEnv({connected:true,shell:{}});
unsupported.win.meviSpotifyVoice();
assert.match(unsupported.win.meviSpotifyHTML(true),/Spracherkennung in diesem Browser nicht verfügbar/);

/* Link parsing mirrors Classic's strict Spotify validation. */
const api=connected.win.MeviSpotify;
assert.equal(api.parseLink('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT').uri,'spotify:track:4cOdK2wGLETKBW3PvgPWqT');
assert.equal(api.parseLink('https://open.spotify.com/intl-de/album/4cOdK2wGLETKBW3PvgPWqT').kind,'album');
assert.equal(api.parseLink('spotify:episode:4cOdK2wGLETKBW3PvgPWqT').kind,'episode');
for(const bad of ['','https://example.com/track/4cOdK2wGLETKBW3PvgPWqT','https://open.spotify.com/track/short','javascript:alert(1)','spotify:track:<script>']){
  assert.equal(api.parseLink(bad),null,'Invalid link must be rejected: '+bad);
}
assert.equal(api.formatTime(65000),'1:05');
assert.equal(api.formatTime(0),'0:00');
assert.equal(api.typeLabel('episode'),'Podcast-Folge');
assert.match(api.scopes,/user-modify-playback-state/);
assert.match(api.scopes,/user-read-playback-state/);
assert.match(api.scopes,/streaming/,'Spotify Premium Web Playback requires streaming permission');
assert.match(source,/sdk\\.scdn\\.co\\/spotify-player\\.js/,'Official Web Playback SDK');
assert.match(source,/activateElement\\(\\)/,'Browser playback must support user activation');
assert.match(source,/meviSpotifyWebPlayer/,'Local player control must be bound');
assert.match(source,/device_ids:\\[st\\.webDeviceId\\]/,'Local player must use Spotify Connect transfer');

/* Premium errors surface as a readable state instead of fake playback. */
const premium=createEnv({connected:true,shell:{},fetchImpl:url=>url.includes('/me/player')?json({error:{status:403,message:'Player command failed: Premium required'}},403):json({})});
premium.win.meviSpotifyMount();
await new Promise(resolve=>setTimeout(resolve,15));
assert.match(premium.win.meviSpotifyDebug().error,/Premium/);
premium.win.meviSpotifyUnmount();

/* No active device: a requested item waits for an explicit device choice, then plays there. */
const calls=[];
const devices=[
  {id:'devA',name:'R1000PC',type:'Computer',is_active:false,volume_percent:80},
  {id:'devB',name:'Web Player',type:'Computer',is_active:false,volume_percent:100}
];
const idle=createEnv({connected:true,shell:{},fetchImpl:(url,options)=>{
  const method=options?.method||'GET';
  const text=String(url);
  calls.push({url:text,method,body:options?.body});
  if(text.endsWith('/me/player')&&method==='GET')return json(null,204);
  if(text.endsWith('/me/player/devices'))return json({devices});
  return json(null,204);
}});
idle.doc.getElementById('sp-link').value='https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
idle.win.meviSpotifyPlayLink(false);
await new Promise(resolve=>setTimeout(resolve,30));
assert.equal(idle.win.meviSpotifyDebug().pendingPlay,true,'Play without an active device must ask for a device');
assert.equal(calls.some(call=>call.url.includes('/me/player/play')),false,'No playback may start before a device is chosen');
await idle.win.meviSpotifyTransfer('devA');
assert.equal(idle.saved['mevicar-spotify-device-v1'],'devA','The chosen device must be remembered');
const transfer=calls.find(call=>call.method==='PUT'&&/\/me\/player$/.test(call.url));
assert.ok(transfer,'Choosing a device must transfer playback');
assert.equal(JSON.parse(transfer.body).play,true,'Transfer must start playback when nothing runs');
const started=calls.filter(call=>call.url.includes('/me/player/play?device_id=devA'));
assert.equal(started.length,1,'The waiting item must start on the chosen device');
assert.deepEqual(JSON.parse(started[0].body),{uris:['spotify:track:4cOdK2wGLETKBW3PvgPWqT']});
idle.win.meviSpotifyUnmount();

/* With a single available device the cockpit targets it directly. */
const singleCalls=[];
const single=createEnv({connected:true,shell:{},fetchImpl:(url,options)=>{
  const method=options?.method||'GET';
  const text=String(url);
  singleCalls.push({url:text,method,body:options?.body});
  if(text.endsWith('/me/player')&&method==='GET')return json(null,204);
  if(text.endsWith('/me/player/devices'))return json({devices:[devices[0]]});
  return json(null,204);
}});
single.doc.getElementById('sp-link').value='spotify:album:4cOdK2wGLETKBW3PvgPWqT';
single.win.meviSpotifyPlayLink(false);
await new Promise(resolve=>setTimeout(resolve,30));
const direct=singleCalls.find(call=>call.method==='PUT'&&call.url.includes('/me/player/play?device_id=devA'));
assert.ok(direct,'A single device must be used without an extra prompt');
assert.deepEqual(JSON.parse(direct.body),{context_uri:'spotify:album:4cOdK2wGLETKBW3PvgPWqT'});
assert.equal(single.win.meviSpotifyDebug().pendingPlay,false);

/* Rate limits are respected through Retry-After. */
assert.match(source,/error\.retryAfter\s*=\s*retry/);
assert.match(source,/st\.pollBlockedUntil\s*=\s*Date\.now\(\)\s*\+\s*retry\s*\*\s*1000/);

console.log('Spotify smoke checks passed: PKCE, no secret, endpoints, migration safety, UI states, link validation, lifecycle, Premium state.');
