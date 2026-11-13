import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('spotify.js','utf8');
const settings=fs.readFileSync('credential-settings.js','utf8');
new vm.Script(source,{filename:'spotify.js'});
assert.match(source,/const nativeOAuthBridge = \(\) => !!window\.MeviNativeBridge\?\.postMessage/);
assert.match(source,/const androidSpotify = \(\) => false/,'Android must NOT require Spotify App Remote');
assert.match(source,/if \(nativeOAuthBridge\(\)\) return NATIVE_REDIRECT/);
assert.match(source,/nativeCallback && !nativeOAuthBridge\(\)/);
assert.match(source,/code_verifier: saved\.verifier/);
assert.match(source,/saved\.state !== state/);
assert.match(source,/navigator\.requestMediaKeySystemAccess/,'WebView DRM check required');
assert.match(source,/Spotify-DRM im Android WebView nicht verfügbar/);
assert.match(source,/function startWebPlayer\(/);
assert.match(source,/https:\/\/sdk\.scdn\.co\/spotify-player\.js/);
assert.match(source,/meviSpotifyOpenBrowser: openInSystemBrowser/);
assert.match(source,/action:'spotify.browser'/);
assert.match(source,/meviSpotifyPauseForSource: pauseForSource/);
assert.match(source,/mm-mode-button/,'Same media source buttons as Radio and MeviMedia');
assert.match(settings,/meviSpotifySaveClient/);
// Simulate Chrome returning after Android has recreated the WebView. The old
// sessionStorage is empty, but the short-lived PKCE verifier must still work.
function runNativeCallback(pending, {bridgeCallback = '', hidden = false} = {}) {
  const saved={
    'mevicar-spotify-client-v1':'testclient1234',
    'mevicar-spotify-auth-v1':JSON.stringify(pending)
  };
  const session={};
  const requests=[];
  const bridgeActions=[];
  const bridgeRequests=[];
  let activeBridgeCallback=bridgeCallback;
  const store=values=>({
    getItem:key=>values[key]??null,
    setItem(key,value){values[key]=String(value)},
    removeItem(key){delete values[key]}
  });
  const origin='https://eskiya771.github.io';
  const loc={href:origin+'/mevicar-cockpit-demo/',origin,pathname:'/mevicar-cockpit-demo/'};
  const window={MeviNativeBridge:{postMessage(raw){
    const req=JSON.parse(raw);
    bridgeActions.push(req.action);
    bridgeRequests.push(req);
    if(!activeBridgeCallback)return;
    let reply=null;
    if(req.action==='spotify.callback.pull')reply={id:req.id,ok:true,callback:activeBridgeCallback};
    if(req.action==='spotify.callback.ack')reply={id:req.id,ok:true,acknowledged:true};
    if(reply && typeof this.onmessage==='function')this.onmessage({data:JSON.stringify(reply)});
  }},render(){},addEventListener(){}};
  const document={
    hidden,
    getElementById(){return null},
    querySelector(){return null},
    addEventListener(){}
  };
  const response=data=>({
    ok:true,status:200,headers:{get(){return null}},
    json:async()=>data,text:async()=>JSON.stringify(data)
  });
  const fakeFetch=(url,options)=>{
    requests.push({url:String(url),body:String(options?.body||'')});
    if(String(url).endsWith('/api/token')) return response({
      access_token:'token-after-chrome',refresh_token:'refresh-from-chrome',
      expires_in:3600,scope:'streaming user-read-playback-state'
    });
    if(String(url).endsWith('/v1/me')) return response({display_name:'Test'});
    return response({});
  };
  new Function('window','document','navigator','localStorage','sessionStorage',
    'location','history','fetch','URL','TextEncoder','setTimeout','clearTimeout',
    'setInterval','clearInterval','AbortController',source)(
      window,document,{},store(saved),store(session),loc,{replaceState(){}},
      fakeFetch,URL,TextEncoder,()=>1,()=>{},()=>1,()=>{},AbortController
    );
  return {window,saved,session,requests,bridgeActions,bridgeRequests,
    setBridgeCallback(value){activeBridgeCallback=value}};
}
// Starting Spotify from the hybrid APK must never navigate the WebView to
// accounts.spotify.com. The APK opens the validated authorization URL instead.
const authorize=runNativeCallback({
  state:'old-state',verifier:'old-verifier',at:Date.now(),
  redirect:'mevicarnext://spotify-callback'
});
authorize.window.crypto={
  getRandomValues(bytes){ bytes.fill(7); return bytes; },
  subtle:{digest:async()=>new Uint8Array(32).buffer}
};
authorize.window.btoa=value=>Buffer.from(value,'binary').toString('base64');
await authorize.window.meviSpotifyConnect();
const request=authorize.bridgeRequests.find(r=>r.action==='spotify.authorize');
assert.ok(request,'Hybrid login must send spotify.authorize to Android');
const loginUrl=new URL(request.url);
assert.equal(loginUrl.hostname,'accounts.spotify.com');
assert.equal(loginUrl.searchParams.get('redirect_uri'),'mevicarnext://spotify-callback');
assert.equal(loginUrl.searchParams.get('code_challenge_method'),'S256');
assert.ok(loginUrl.searchParams.get('code_challenge'));
assert.equal(JSON.parse(authorize.saved['mevicar-spotify-auth-v1']).state,
  loginUrl.searchParams.get('state'));

const native=runNativeCallback({
  state:'state123456',verifier:'pkce-verifier',at:Date.now(),
  redirect:'mevicarnext://spotify-callback'
});
assert.equal(await native.window.meviSpotifyAcceptNativeCallback(
  'mevicarnext://spotify-callback?code=spotify-authorization-code&state=state123456'),true);
assert.equal(native.window.meviSpotifyDebug().connected,true,'Returning from Chrome must connect');
assert.equal(JSON.parse(native.saved['mevicar-spotify-token-v1']).access_token,
  'token-after-chrome');
assert.equal(native.saved['mevicar-spotify-auth-v1'],undefined,'PKCE request consumed once');
assert.equal(native.requests[0].body.includes('code_verifier=pkce-verifier'),true);
assert.equal(native.requests[0].body.includes('redirect_uri=mevicarnext%3A%2F%2Fspotify-callback'),true);
const tokenExchangeCount=native.requests.filter(req=>req.url.endsWith('/api/token')).length;
assert.equal(await native.window.meviSpotifyAcceptNativeCallback(
  'mevicarnext://spotify-callback?code=spotify-authorization-code&state=state123456'),true);
assert.equal(native.requests.filter(req=>req.url.endsWith('/api/token')).length,
  tokenExchangeCount,'Android retry must not invalidate an already completed Spotify login');
// A WebView that never receives evaluateJavascript can now pull and acknowledge
// the pending authorization code using the existing trusted WebMessage channel.
const pulled=runNativeCallback({
  state:'pull-state',verifier:'pull-verifier',at:Date.now(),
  redirect:'mevicarnext://spotify-callback'
}, {bridgeCallback:'mevicarnext://spotify-callback?code=pulled-code&state=pull-state'});
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(pulled.window.meviSpotifyDebug().connected,true,'WebView must pull pending native callback');
assert.ok(pulled.bridgeActions.includes('spotify.callback.pull'));
assert.ok(pulled.bridgeActions.includes('spotify.callback.ack'));
assert.equal(pulled.requests.filter(q=>q.url.endsWith('/api/token')).length,1);
assert.equal(pulled.saved['mevicar-spotify-auth-v1'],undefined);

// Android WebView can report document.hidden=true during the handoff even
// when WebMessage communication is active. OAuth must still be recovered.
const hiddenPulled=runNativeCallback({
  state:'hidden-state',verifier:'hidden-verifier',at:Date.now(),
  redirect:'mevicarnext://spotify-callback'
}, {
  bridgeCallback:'mevicarnext://spotify-callback?code=hidden-code&state=hidden-state',
  hidden:true
});
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(hiddenPulled.window.meviSpotifyDebug().connected,true,
  'Hidden WebView must still pull OAuth callback');
assert.ok(hiddenPulled.bridgeActions.includes('spotify.callback.pull'));

// The Android status callback is proof that evaluateJavascript already
// reached the web runtime. It must trigger an immediate pull when Android's
// lifecycle/visibility events did not resume the normal polling timer.
const stageTriggered=runNativeCallback({
  state:'stage-state',verifier:'stage-verifier',at:Date.now(),
  redirect:'mevicarnext://spotify-callback'
});
stageTriggered.setBridgeCallback(
  'mevicarnext://spotify-callback?code=stage-code&state=stage-state'
);
stageTriggered.window.meviSpotifyNativeStage(
  'Build 53 · Spotify-Code von Android empfangen'
);
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(stageTriggered.window.meviSpotifyDebug().connected,true,
  'Native stage must trigger web callback pull and PKCE token exchange');
assert.ok(stageTriggered.bridgeActions.includes('spotify.callback.ack'));

const stale=runNativeCallback({
  state:'state123456',verifier:'pkce-verifier',at:Date.now()-11*60*1000,
  redirect:'mevicarnext://spotify-callback'
});
await stale.window.meviSpotifyAcceptNativeCallback(
  'mevicarnext://spotify-callback?code=spotify-authorization-code&state=state123456');
assert.equal(stale.window.meviSpotifyDebug().connected,false,'Expired callback must be rejected');
assert.equal(stale.requests.length,0,'Expired callback must not exchange token');
assert.match(stale.window.meviSpotifyHTML(false),/Spotify-Sicherheitsprüfung fehlgeschlagen/);

console.log('Spotify APK OAuth return: WebView restart, PKCE verification, token exchange, stale-state rejection OK');
