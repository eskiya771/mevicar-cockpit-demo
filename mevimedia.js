/* MeviMedia Next – touchscreen player based on Classic MeviMedia 3.0's library-first UX.
   Browser player: user-approved files and folders, no persistent file access claims. */
(function(){
  'use strict';
  const AUDIO=new Set(['mp3','m4a','aac','flac','wav','ogg','oga','opus','aif','aiff']);
  const VIDEO=new Set(['mp4','m4v','mov','webm','mkv','3gp']);
  const CATEGORIES=[['songs','Titel','music'],['favorites','Favoriten','heart'],['artists','Interpreten','mic'],['albums','Alben','disc'],['folders','Ordner','folder'],['videos','Videos','film']];
  const ICONS={
    music:'<path d="M9 18V5l12-3v13"/><path d="M9 8l12-3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="15" r="3"/>',
    folder:'<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    files:'<path d="M13 2H6a2 2 0 0 0-2 2v13"/><path d="M13 2v5h5"/><path d="M9 7h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"/>',
    play:'<path d="m8 5 12 7-12 7Z" fill="currentColor" stroke="none"/>',
    pause:'<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
    next:'<path d="m5 4 11 8-11 8Z" fill="currentColor" stroke="none"/><path d="M19 4v16" stroke-width="3"/>',
    prev:'<path d="m19 4-11 8 11 8Z" fill="currentColor" stroke="none"/><path d="M5 4v16" stroke-width="3"/>',
    shuffle:'<path d="M3 7h3c5 0 6 10 12 10h3M18 14l3 3-3 3M3 17h3c1 0 2-.5 3-2M14 9c1-1.5 2-2 4-2h3M18 4l3 3-3 3"/>',
    repeat:'<path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>',
    heart:'<path d="M20.8 4.6a5.3 5.3 0 0 0-7.4 0L12 6l-1.4-1.4a5.3 5.3 0 0 0-7.4 7.4L12 21l8.8-9a5.3 5.3 0 0 0 0-7.4Z"/>',
    search:'<circle cx="10.8" cy="10.8" r="7.2"/><path d="m16 16 5.5 5.5"/>',
    film:'<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M17 3v18M2 9h5M2 15h5M17 9h5M17 15h5"/>',
    disc:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="2"/><path d="M12 2a10 10 0 0 1 10 10"/>',
    mic:'<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/>',
    volume:'<path d="M3 9v6h4l5 4V5L7 9ZM16 8c2 1 2 7 0 8M19 5c4 3 4 11 0 14"/>',
    arrow:'<path d="m9 5 7 7-7 7"/>',
    back:'<path d="m15 4-8 8 8 8M8 12h13"/>',
    expand:'<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    list:'<path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'
  };
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const icon=(id)=>'<svg class="mm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+ICONS[id]+'</svg>';
  const safeArg=s=>encodeURIComponent(String(s)).replace(/'/g,'%27');
  const decodeArg=s=>decodeURIComponent(s);
  const baseName=s=>String(s).replace(/\.[^.]+$/,'').replace(/[_]+/g,' ').trim();
  const fmt=s=>Number.isFinite(s)?Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'):'–:––';
  function readStore(key,otherwise){try{return JSON.parse(localStorage.getItem(key))??otherwise}catch{return otherwise}}
  const favorites=new Set(readStore('mevicar-media-favorites-v1',[]));
  const options=readStore('mevicar-media-options-v1',{});
  const st={tracks:[],index:-1,section:'songs',group:null,query:'',queue:[],shuffle:!!options.shuffle,repeat:[0,1,2].includes(options.repeat)?options.repeat:0,
    compactPane:'library',status:'Wähle einen Ordner oder Musikdateien auf dem Gerät.',loaded:false,source:'',scanning:false,artUrl:null,objectUrl:null,metadataBatch:0};
  let player=null,videoLayer=null,scanSerial=0,metaSerial=0,uiProgress=0;
  function persist(){try{localStorage.setItem('mevicar-media-favorites-v1',JSON.stringify([...favorites].slice(-7000)));localStorage.setItem('mevicar-media-options-v1',JSON.stringify({shuffle:st.shuffle,repeat:st.repeat}))}catch{}}
  function isVideo(file){const ext=file.name.split('.').pop().toLowerCase();return VIDEO.has(ext)||(!AUDIO.has(ext)&&file.type.startsWith('video/'))}
  function supported(file){const ext=file.name.split('.').pop().toLowerCase();return AUDIO.has(ext)||VIDEO.has(ext)||file.type.startsWith('audio/')||file.type.startsWith('video/')}
  function isFav(t){return t&&favorites.has(t.key)}
  function ensurePlayer(){
    if(player)return player;
    videoLayer=document.createElement('section');
    videoLayer.className='mm-video-overlay';videoLayer.hidden=true;videoLayer.setAttribute('role','dialog');videoLayer.setAttribute('aria-label','MeviMedia Videoplayer');
    videoLayer.innerHTML='<div class="mm-video-header"><strong id="mm-video-title">Video</strong><button type="button" onclick="meviMediaCloseVideo()">✕ Video schließen</button></div>';
    player=document.createElement('video');player.controls=true;player.preload='metadata';player.playsInline=true;player.setAttribute('playsinline','');player.setAttribute('webkit-playsinline','');player.volume=.85;
    videoLayer.appendChild(player);document.body.appendChild(videoLayer);
    player.addEventListener('timeupdate',updateProgress);
    player.addEventListener('durationchange',()=>{const t=current();if(t&&Number.isFinite(player.duration)){t.duration=player.duration;}updateProgress();});
    player.addEventListener('play',syncPlaybackButtons);
    player.addEventListener('pause',syncPlaybackButtons);
    player.addEventListener('ended',()=>advance(true));
    player.addEventListener('error',()=>{const t=current();st.status='Wiedergabe fehlgeschlagen'+(t?' · '+t.name:'')+'. Codec eventuell im Browser nicht unterstützt.';syncPlaybackButtons();updateNotice();});
    player.addEventListener('volumechange',()=>{const el=$('mm-volume');if(el)el.value=String(Math.round(player.volume*100))});
    if('mediaSession'in navigator){try{
      navigator.mediaSession.setActionHandler('play',()=>{player.play().catch(()=>{})});
      navigator.mediaSession.setActionHandler('pause',()=>player.pause());
      navigator.mediaSession.setActionHandler('nexttrack',()=>advance(false));
      navigator.mediaSession.setActionHandler('previoustrack',previous);
      navigator.mediaSession.setActionHandler('seekto',e=>{if(e.seekTime!=null&&Number.isFinite(player.duration))player.currentTime=e.seekTime});
    }catch{}}
    return player;
  }
  function current(){return st.tracks[st.index]||null}
  function updateNotice(){const el=$('mm-notice');if(el)el.textContent=st.status}
  function showVideo(){const t=current();if(!t||!t.video)return;ensurePlayer();videoLayer.hidden=false;const title=$('mm-video-title');if(title)title.textContent=t.title||t.name}
  function closeVideo(){if(videoLayer&&!videoLayer.hidden){videoLayer.hidden=true;if(current()?.video)player.pause();syncPlaybackButtons()}}
  function onSourceChanged(source){if(source!=='media'){if(player)player.pause();closeVideo();}}
  function makeTrack(file,folder){
    const name=file.name,video=isVideo(file),path=(folder||'')+name;
    const bare=baseName(name),parts=bare.split(/\s+[-–]\s+/);
    const artist=!video&&parts.length>1?parts.shift().trim():'';
    const album=(folder||'').split('/').filter(Boolean).slice(-1)[0]||'';
    return {file,name,path,folder:folder||'',key:path+'|'+file.size+'|'+file.lastModified,video,
      title:artist?parts.join(' – '):bare,artist,album:video?'':album,duration:NaN,metaRead:false};
  }
  function redraw(){if(typeof window.render==='function')window.render();else refreshLibrary();}
  async function loadFiles(fileList,label){
    const files=Array.from(fileList||[]).filter(supported);
    if(!files.length){st.status='Keine unterstützten Audio- oder Videodateien ausgewählt.';updateNotice();return}
    const known=new Set(st.tracks.map(t=>t.key));let added=0;
    for(const file of files){
      const rel=(file.webkitRelativePath||file.relativePath||file.name).replace(/\\/g,'/');
      const path=rel.includes('/')?rel.slice(0,rel.lastIndexOf('/')+1):'';
      const item=makeTrack(file,path);
      if(known.has(item.key))continue;known.add(item.key);st.tracks.push(item);added++;
    }
    st.tracks.sort((a,b)=>a.title.localeCompare(b.title,'de',{sensitivity:'base'}));
    if(player&&st.objectUrl){const trackKey=st.playingKey;st.index=st.tracks.findIndex(x=>x.key===trackKey)}
    st.status=added+' neue Medien geladen · '+st.tracks.length+' insgesamt'+(label?' · '+label:'');
    st.loaded=true;st.group=null;redraw();
    scanMetadataInBackground();
  }
  async function scanDirectory(handle){
    const result=[];const limit=3000;
    async function walk(dir,path,depth){
      if(depth>10||result.length>=limit)return;
      for await(const [name,entry] of dir.entries()){
        if(result.length>=limit)return;
        if(entry.kind==='directory'){await walk(entry,path+name+'/',depth+1)}
        else if(entry.kind==='file'){
          const ext=name.split('.').pop().toLowerCase();
          if(AUDIO.has(ext)||VIDEO.has(ext)){const file=await entry.getFile();if(supported(file)){Object.defineProperty(file,'relativePath',{value:path+name,configurable:true});result.push(file)}}
        }
      }
    }
    st.scanning=true;st.status='Ordner wird eingelesen …';updateNotice();
    try{await walk(handle,'',0);await loadFiles(result,handle.name+(result.length>=limit?' · Maximal '+limit+' Dateien':''))}
    finally{st.scanning=false}
  }
  async function chooseFolder(){
    if(window.showDirectoryPicker&&window.isSecureContext){
      try{const handle=await window.showDirectoryPicker({mode:'read'});await scanDirectory(handle);return}
      catch(e){if(e.name==='AbortError')return;st.status='Ordnerzugriff nicht möglich: '+(e.message||e.name);updateNotice();return}
    }
    const input=$('mm-folder-input');if(input)input.click();
  }
  function chooseFiles(){const input=$('mm-file-input');if(input)input.click()}
  // ID3v2 text metadata enables real artist/album grouping where available.
  function readText(bytes,encoding){
    if(!bytes.length)return '';
    try{
      if(encoding===1||encoding===2){
        const body=bytes.slice(1);
        let codec='utf-16le';
        if(body[0]===0xfe&&body[1]===0xff)codec='utf-16be';
        return new TextDecoder(codec).decode(body).replace(/\uFEFF/g,'').split('\0')[0].trim();
      }
      return new TextDecoder(encoding===3?'utf-8':'iso-8859-1').decode(bytes.slice(1)).split('\0')[0].trim();
    }catch{return ''}
  }
  async function readTags(track,artOnly){
    if(track.video)return;
    try{
      const arr=new Uint8Array(await track.file.slice(0,262144).arrayBuffer());
      if(arr.length<20||String.fromCharCode(...arr.slice(0,3))!=='ID3')return;
      const major=arr[3],flags=arr[5];
      if(![3,4].includes(major)||(flags&0x40))return;
      const size=(arr[6]<<21)|(arr[7]<<14)|(arr[8]<<7)|arr[9];
      const end=Math.min(arr.length,10+size);
      let p=10,cover=null;
      while(p+10<end){
        const id=String.fromCharCode(...arr.slice(p,p+4));
        if(!/^[A-Z0-9]{4}$/.test(id))break;
        const n=major===4?(arr[p+4]<<21)|(arr[p+5]<<14)|(arr[p+6]<<7)|arr[p+7]:(arr[p+4]*16777216+arr[p+5]*65536+arr[p+6]*256+arr[p+7]);
        if(n<=0||n>4000000||p+10+n>end)break;
        const dat=arr.subarray(p+10,p+10+n);
        if(!artOnly&&['TIT2','TPE1','TALB'].includes(id)){
          const val=readText(dat,dat[0]);if(val){if(id==='TIT2')track.title=val;else if(id==='TPE1')track.artist=val;else track.album=val}
        }
        if(artOnly&&id==='APIC'&&dat.length>20){
          let at=1;while(at<dat.length&&dat[at]!==0)at++;
          const mime=new TextDecoder('iso-8859-1').decode(dat.subarray(1,at));
          at+=2;const encoding=dat[0];
          if(encoding===0||encoding===3){while(at<dat.length&&dat[at]!==0)at++;at++}
          else{while(at+1<dat.length&&(dat[at]!==0||dat[at+1]!==0))at+=2;at+=2}
          if(/^image\/(jpeg|png|webp)$/.test(mime)&&at<dat.length-15){
            cover=URL.createObjectURL(new Blob([dat.slice(at)],{type:mime}));
            break;
          }
        }
        p+=10+n;
      }
      return cover;
    }catch{}
  }
  async function scanMetadataInBackground(){
    const run=++metaSerial;let count=0;
    for(const t of st.tracks){
      if(run!==metaSerial)return;
      if(t.metaRead||t.video)continue;
      t.metaRead=true;await readTags(t,false);count++;
      if(count%25===0){refreshLibrary();await new Promise(resolve=>setTimeout(resolve,0))}
    }
    refreshLibrary();
  }
  function filtered(){
    const q=st.query.toLocaleLowerCase('de').trim();
    let pool=st.tracks.filter(t=>st.section==='videos'?t.video:st.section==='favorites'?isFav(t):!t.video);
    if(st.group){pool=pool.filter(t=>{
      if(st.section==='artists')return (t.artist||'Unbekannt')===st.group;
      if(st.section==='albums')return (t.album||'Ohne Album')===st.group;
      return (t.folder||'Hauptordner')===st.group;
    })}
    if(q)pool=pool.filter(t=>[t.title,t.artist,t.album,t.folder,t.name].some(x=>x.toLocaleLowerCase('de').includes(q)));
    return pool;
  }
  function entries(){
    const pool=filtered();
    if(['artists','albums','folders'].includes(st.section)&&!st.group){
      const value=t=>st.section==='artists'?t.artist||'Unbekannt':st.section==='albums'?t.album||'Ohne Album':t.folder||'Hauptordner';
      const groups=new Map();
      for(const t of pool)groups.set(value(t),(groups.get(value(t))||0)+1);
      return [...groups].sort((a,b)=>a[0].localeCompare(b[0],'de',{sensitivity:'base'})).map(([label,count])=>({group:label,count}));
    }
    return pool;
  }
  function makeRow(t){
    if('group'in t){
      const typ=st.section==='artists'?'mic':st.section==='albums'?'disc':'folder';
      return '<button type="button" class="mm-group" onclick="meviMediaGroup(\''+safeArg(t.group)+'\')"><span class="mm-track-icon">'+icon(typ)+'</span><span class="mm-track-text"><span class="mm-track-title">'+esc(t.group)+'</span><span class="mm-track-meta">'+t.count+' Titel</span></span>'+icon('arrow')+'</button>';
    }
    const i=st.tracks.indexOf(t),active=st.index===i;
    return '<div class="mm-track '+(t.video?'video ':'')+(active?'current':'')+'"><button class="mm-track-start" type="button" onclick="meviMediaPlay('+i+')" aria-label="'+esc(t.title)+' abspielen"><span class="mm-track-icon">'+icon(t.video?'film':'music')+'</span><span class="mm-track-text"><span class="mm-track-title">'+esc(t.title)+'</span><span class="mm-track-meta">'+esc(t.video?'Video · '+(t.folder||'Datei'):(t.artist||'Unbekannter Interpret')+' · '+(t.album||'Ohne Album'))+(Number.isFinite(t.duration)?' · '+fmt(t.duration):'')+'</span></span></button>'+(active?'<span class="mm-track-playing" aria-label="Aktueller Titel">●</span>':'')+'<button type="button" class="mm-track-fav" aria-label="'+(isFav(t)?'Aus Favoriten entfernen':'Zu Favoriten hinzufügen')+'" aria-pressed="'+!!isFav(t)+'" onclick="meviMediaFav('+i+')">'+icon('heart')+'</button></div>';
  }
  function listHTML(){
    const items=entries(),total=items.length;
    if(!st.tracks.length)return '<div class="mm-list-empty">'+icon('folder')+'<strong>Deine Musik. Dein Cockpit.</strong><p>Wähle einen Musikordner – auch von einem angeschlossenen USB-Laufwerk, sofern dein Browser ihn anbietet – oder einzelne Audio-/Videodateien.</p><button type="button" onclick="meviMediaFolder()">Ordner auswählen</button><button type="button" onclick="meviMediaFiles()">Dateien hinzufügen</button></div>';
    if(!items.length)return '<div class="mm-list-empty">'+icon('search')+'<strong>Keine Treffer</strong><p>Versuche eine andere Kategorie oder einen anderen Suchbegriff.</p></div>';
    return items.slice(0,350).map(makeRow).join('')+(total>350?'<div class="mm-list-empty" style="min-height:75px"><p>350 von '+total+' Einträgen. Suche zum Eingrenzen verwenden.</p></div>':'');
  }
  function libraryCaption(){
    const total=entries().length;return (st.group?'<button type="button" onclick="meviMediaGroup(\'\')">‹ '+esc(st.group)+'</button>':'<span>'+total+' Einträge · '+st.tracks.length+' geladen</span>')+'<span id="mm-notice">'+esc(st.status)+'</span>';
  }
  function library(){
    const tabs=CATEGORIES.map(([id,label,ic])=>'<button type="button" class="mm-tab '+(id===st.section?'selected':'')+'" aria-pressed="'+(id===st.section)+'" onclick="meviMediaSection(\''+id+'\')">'+icon(ic)+esc(label)+(id==='favorites'?'<span class="mm-count">'+st.tracks.filter(isFav).length+'</span>':'')+'</button>').join('');
    return '<div class="mm-library"><div class="mm-library-header"><label class="mm-search">'+icon('search')+'<input type="search" spellcheck="false" autocomplete="off" placeholder="Titel, Interpret, Album suchen …" aria-label="Medien suchen" value="'+esc(st.query)+'" oninput="meviMediaSearch(this.value)"></label>'+
      '<span class="mm-import"><button type="button" class="mm-action-button" title="Ordner vom Gerät oder USB wählen" aria-label="Ordner wählen" onclick="meviMediaFolder()">'+icon('folder')+'</button><button type="button" class="mm-action-button" title="Musik- oder Videodateien hinzufügen" aria-label="Dateien auswählen" onclick="meviMediaFiles()">'+icon('files')+'</button></span></div>'+
      '<div class="mm-tabs" aria-label="Bibliotheksbereiche">'+tabs+'</div><div class="mm-library-caption" id="mm-caption">'+libraryCaption()+'</div>'+
      '<div class="mm-list" id="mm-list">'+listHTML()+'</div>'+
      '<input id="mm-file-input" type="file" accept="audio/*,video/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.opus,.mp4,.mkv,.webm,.mov" multiple hidden onchange="meviMediaLoadFiles(this.files,\'Dateien\')">'+
      '<input id="mm-folder-input" type="file" webkitdirectory directory multiple hidden onchange="meviMediaLoadFiles(this.files,\'Ordner\')"></div>';
  }
  function now(){
    const t=current(),enabled=!!t,fav=isFav(t),playing=!!player&&!player.paused;
    const art=st.artUrl?' has-image':'',title=t?.title||'DEINE MUSIK. DEIN COCKPIT.',sub=t?.artist||(t?.video?'Video auswählen':'MeviMedia 3.0'),album=t?.album||(t?.folder||'');
    return '<div class="mm-now"><div class="mm-now-top"><div class="mm-artwork '+(t?.video?'video':'')+art+'" id="mm-artwork"'+(st.artUrl?' style="background-image:url('+esc(st.artUrl)+')"':'')+'>'+(!st.artUrl?icon(t?.video?'film':'music')+'<span>MEVI MEDIA</span>':'')+'</div>'+
      '<div class="mm-track-details"><div class="mm-now-eyebrow">'+esc(t?.video?'VIDEO · JETZT ANSEHEN':'NOW PLAYING  //  NEON CITY')+'</div><div class="mm-now-title" id="mm-now-title">'+esc(title)+'</div>'+
      '<div class="mm-now-sub">'+esc(sub)+'</div><div class="mm-now-album">'+esc(album)+'</div>'+
      '<div class="mm-now-buttons"><button class="mm-icon-button" type="button" id="mm-current-fav" aria-label="Favorit umschalten" aria-pressed="'+!!fav+'" onclick="meviMediaFavCurrent()" '+(!enabled?'disabled':'')+'>'+icon('heart')+'</button>'+
      (t?.video?'<button type="button" class="mm-video-open" onclick="meviMediaShowVideo()">'+icon('expand')+' Video öffnen</button>':'')+'</div></div></div>'+
      '<div class="mm-progress"><div class="mm-seek-row"><span class="mm-time" id="mm-elapsed">'+fmt(player?.currentTime||0)+'</span><input class="mm-seek" id="mm-seek" type="range" min="0" max="1000" value="0" style="--seek:0%" aria-label="Wiedergabeposition" oninput="meviMediaSeek(this.value)" '+(!enabled?'disabled':'')+'><span class="mm-time" id="mm-duration">'+fmt(player?.duration||NaN)+'</span></div></div>'+
      '<div class="mm-transport"><button id="mm-shuffle" class="'+(st.shuffle?'mm-mode-on':'')+'" type="button" title="Zufällige Reihenfolge" aria-label="Shuffle" aria-pressed="'+st.shuffle+'" onclick="meviMediaShuffle()" '+(!enabled?'disabled':'')+'>'+icon('shuffle')+'</button>'+
      '<button type="button" title="Vorheriger Titel" aria-label="Zurück" onclick="meviMediaPrev()" '+(!enabled?'disabled':'')+'>'+icon('prev')+'</button>'+
      '<button id="mm-play" type="button" class="mm-primary" aria-label="'+(playing?'Pause':'Abspielen')+'" onclick="meviMediaToggle()" '+(!enabled?'disabled':'')+'>'+icon(playing?'pause':'play')+'</button>'+
      '<button type="button" title="Nächster Titel" aria-label="Weiter" onclick="meviMediaNext()" '+(!enabled?'disabled':'')+'>'+icon('next')+'</button>'+
      '<button id="mm-repeat" type="button" class="'+(st.repeat?'mm-mode-on':'')+'" title="'+(st.repeat===2?'Einzeltitel wiederholen':st.repeat===1?'Alle wiederholen':'Wiederholen aus')+'" aria-label="Wiederholmodus wechseln" onclick="meviMediaRepeat()" '+(!enabled?'disabled':'')+'>'+icon('repeat')+(st.repeat===2?'<span class="mm-repeat-one">1</span>':'')+'</button></div>'+
      '<div class="mm-now-foot"><span class="mm-note">'+(t?esc(t.name)+' · '+esc(t.folder||'Lokale Datei'):'Audio und Video aus deinem Speicher · Offline nutzbar')+'</span><label class="mm-volume" aria-label="Lautstärke">'+icon('volume')+'<input id="mm-volume" type="range" min="0" max="100" value="'+(player?Math.round(player.volume*100):85)+'" aria-label="Lautstärke" oninput="meviMediaVolume(this.value)"></label></div></div>';
  }
  function html(isCompact){
    const compact=!!isCompact;
    const sources=[['radio','Radio','music'],['spotify','Spotify','disc'],['media','Medien','folder']].map(([id,label,ic])=>'<button type="button" data-source="'+id+'" class="mm-mode-button '+(id==='media'?'active':'')+'" aria-pressed="'+(id==='media')+'" onclick="selectAudioSource(\''+id+'\')">'+icon(ic)+label+'</button>').join('');
    return '<section class="mm-shell '+(compact?'is-compact':'')+'" data-pane="'+st.compactPane+'" aria-label="MeviMedia 3.0"><div class="mm-top"><div class="mm-identity"><span class="mm-eyebrow">MEVICAR NEXT</span><span class="mm-heading">MEVI<em>MEDIA</em> 3.0</span></div><div class="mm-top-actions">'+sources+'</div></div>'+
       (compact?'<div class="mm-compact-toggle"><button type="button" aria-pressed="'+(st.compactPane==='library')+'" onclick="meviMediaPane(\'library\')">☷ Bibliothek</button><button type="button" aria-pressed="'+(st.compactPane==='player')+'" onclick="meviMediaPane(\'player\')">▶ Player</button></div>':'')+
       '<div class="mm-content">'+library()+now()+'</div></section>';
  }
  function refreshLibrary(){
    const list=$('mm-list'),caption=$('mm-caption');if(list){list.innerHTML=listHTML();}
    if(caption)caption.innerHTML=libraryCaption();
  }
  function syncPlaybackButtons(){
    const b=$('mm-play');if(b){const isPlaying=!!player&&!player.paused;b.innerHTML=icon(isPlaying?'pause':'play');b.setAttribute('aria-label',isPlaying?'Pause':'Abspielen')}
    if('mediaSession'in navigator){try{navigator.mediaSession.playbackState=player&&!player.paused?'playing':'paused'}catch{}}
  }
  function updateProgress(){
    const seek=$('mm-seek'),duration=player?.duration,elapsed=player?.currentTime;
    if(seek&&Number.isFinite(duration)&&duration>0){
      const n=Math.min(1000,Math.round(elapsed/duration*1000));seek.value=String(n);seek.style.setProperty('--seek',(n/10)+'%');
    }
    const et=$('mm-elapsed'),dt=$('mm-duration');if(et)et.textContent=fmt(elapsed||0);if(dt)dt.textContent=fmt(duration);
  }
  async function showArtwork(t){
    const serial=++scanSerial;
    if(st.artUrl){URL.revokeObjectURL(st.artUrl);st.artUrl=null}
    const cover=await readTags(t,true);if(serial!==scanSerial){if(cover)URL.revokeObjectURL(cover);return}
    st.artUrl=cover||null;
    const el=$('mm-artwork');if(el){el.style.backgroundImage=cover?'url("'+cover+'")':'';el.classList.toggle('has-image',!!cover);el.innerHTML=cover?'':icon(t.video?'film':'music')+'<span>MEVI MEDIA</span>'}
    updateMediaSession(t);
  }
  function updateMediaSession(t){
    if(!('mediaSession'in navigator)||!('MediaMetadata'in window))return;
    try{navigator.mediaSession.metadata=new window.MediaMetadata({title:t.title||t.name,artist:t.artist||'MeviMedia 3.0',album:t.album||'',artwork:st.artUrl?[{src:st.artUrl,type:'image/jpeg'}]:[]})}catch{}
  }
  function play(index,preserveQueue){
    const t=st.tracks[index];if(!t)return;
    ensurePlayer();
    if(!preserveQueue){
      const filter=filtered().filter(v=>v.video===t.video);
      st.queue=(filter.length?filter:st.tracks.filter(v=>v.video===t.video)).map(x=>x.key);
    }
    const same=st.playingKey===t.key;
    st.index=index;st.playingKey=t.key;
    if(!same||!player.src){
      if(st.objectUrl){URL.revokeObjectURL(st.objectUrl);st.objectUrl=null}
      st.objectUrl=URL.createObjectURL(t.file);
      player.pause();player.src=st.objectUrl;player.load();
      showArtwork(t);
    }
    st.status=t.video?'Video ausgewählt – Wiedergabe läuft':'Lokaler Titel · '+t.name;
    if(t.video)showVideo();else if(videoLayer)videoLayer.hidden=true;
    st.compactPane='player';redraw();updateProgress();
    player.play().catch(err=>{st.status='Wiedergabe nicht möglich: '+(err?.message||'Browserfreigabe fehlt');updateNotice();syncPlaybackButtons()});
    updateMediaSession(t);
  }
  function toggle(){
    if(!player||st.index<0){if(st.tracks.length)play(0);return}
    if(player.paused)player.play().catch(()=>{});else player.pause();
  }
  function advance(automatic){
    if(!player||!st.queue.length)return;
    if(automatic&&st.repeat===2){player.currentTime=0;player.play().catch(()=>{});return}
    const currentKey=current()?.key;let pos=st.queue.indexOf(currentKey);
    if(automatic&&!st.shuffle&&st.repeat===0&&pos===st.queue.length-1){player.pause();return}
    let key;
    if(st.shuffle&&st.queue.length>1){const pool=st.queue.filter(k=>k!==currentKey);key=pool[Math.floor(Math.random()*pool.length)]}
    else key=st.queue[(pos+1+st.queue.length)%st.queue.length];
    const index=st.tracks.findIndex(x=>x.key===key);if(index>=0)play(index,true);
  }
  function previous(){
    if(!player||!st.queue.length)return;
    if(player.currentTime>4){player.currentTime=0;return}
    const pos=st.queue.indexOf(current()?.key),key=st.queue[(pos-1+st.queue.length)%st.queue.length],index=st.tracks.findIndex(x=>x.key===key);
    if(index>=0)play(index,true);
  }
  function fav(index){
    const t=st.tracks[index];if(!t)return;
    if(favorites.has(t.key))favorites.delete(t.key);else favorites.add(t.key);
    persist();redraw();
  }
  function setSection(section){if(!CATEGORIES.some(x=>x[0]===section))return;st.section=section;st.group=null;st.query='';redraw()}
  function setGroup(group){st.group=group?decodeArg(group):null;redraw()}
  function search(value){st.query=value;refreshLibrary()}
  function pane(value){st.compactPane=value==='player'?'player':'library';const shell=document.querySelector('.mm-shell.is-compact');if(shell){shell.dataset.pane=st.compactPane;shell.querySelectorAll('.mm-compact-toggle button').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===(value==='library'?0:1))))}}
  function seek(value){if(player&&Number.isFinite(player.duration)&&player.duration>0)player.currentTime=Number(value)/1000*player.duration;updateProgress()}
  function volume(value){ensurePlayer().volume=Math.min(1,Math.max(0,Number(value)/100))}
  function shuffle(){st.shuffle=!st.shuffle;persist();redraw()}
  function repeat(){st.repeat=(st.repeat+1)%3;persist();redraw()}
  function stop(){if(player){player.pause();closeVideo()}}
  Object.assign(window,{
    meviMediaHTML:html,meviMediaFolder:chooseFolder,meviMediaFiles:chooseFiles,meviMediaLoadFiles:loadFiles,
    meviMediaSection:setSection,meviMediaGroup:setGroup,meviMediaSearch:search,meviMediaPane:pane,
    meviMediaPlay:play,meviMediaToggle:toggle,meviMediaNext:()=>advance(false),meviMediaPrev:previous,
    meviMediaSeek:seek,meviMediaVolume:volume,meviMediaShuffle:shuffle,meviMediaRepeat:repeat,
    meviMediaFav:fav,meviMediaFavCurrent:()=>fav(st.index),
    meviMediaShowVideo:showVideo,meviMediaCloseVideo:closeVideo,meviMediaStopForSource:onSourceChanged,
    meviMediaDebug:()=>({count:st.tracks.length,current:st.index,section:st.section,queue:st.queue.length,playing:!!player&&!player.paused,shuffle:st.shuffle,repeat:st.repeat})
  });
})();