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
    stop:'<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none"/>',
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
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    trash:'<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 11v6M14 11v6"/>'
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
  let player=null,videoLayer=null,scanSerial=0,metaSerial=0,uiProgress=0,audioOwner='media';
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
    player.addEventListener('play',()=>{if(audioOwner!=='media'){player.pause();return;}syncPlaybackButtons();});
    player.addEventListener('pause',syncPlaybackButtons);
    player.addEventListener('ended',()=>{if(audioOwner==='media')advance(true);});
    player.addEventListener('error',()=>{const t=current();st.status='Wiedergabe fehlgeschlagen'+(t?' · '+t.name:'')+'. Codec eventuell im Browser nicht unterstützt.';syncPlaybackButtons();updateNotice();});
    player.addEventListener('volumechange',()=>{const el=$('mm-volume');if(el)el.value=String(Math.round(player.volume*100))});
    bindAudioSession();
    return player;
  }
  function current(){return st.tracks[st.index]||null}
  function updateNotice(){const el=$('mm-notice');if(el)el.textContent=st.status}
  function showVideo(){const t=current();if(!t||!t.video)return;ensurePlayer();videoLayer.hidden=false;const title=$('mm-video-title');if(title)title.textContent=t.title||t.name}
  function closeVideo(){if(videoLayer&&!videoLayer.hidden){videoLayer.hidden=true;if(current()?.video)player.pause();syncPlaybackButtons()}}
  function onSourceChanged(source){audioOwner=source;if(source!=='media'){if(player)player.pause();closeVideo();}if(source!=='radio')radioStop();bindAudioSession();}
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
    // An empty library has one prominent import area; no duplicate icons or empty search.
    if(!st.tracks.length)return '<div class="mm-library mm-library-empty"><div class="mm-list" id="mm-list">'+listHTML()+'</div>'+
      '<input id="mm-file-input" type="file" accept="audio/*,video/*,.mp3,.m4a,.aac,.flac,.wav,.ogg,.opus,.mp4,.mkv,.webm,.mov" multiple hidden onchange="meviMediaLoadFiles(this.files,\'Dateien\')">'+
      '<input id="mm-folder-input" type="file" webkitdirectory directory multiple hidden onchange="meviMediaLoadFiles(this.files,\'Ordner\')"></div>';    const tabs=CATEGORIES.map(([id,label,ic])=>'<button type="button" class="mm-tab '+(id===st.section?'selected':'')+'" aria-pressed="'+(id===st.section)+'" onclick="meviMediaSection(\''+id+'\')">'+icon(ic)+esc(label)+(id==='favorites'?'<span class="mm-count">'+st.tracks.filter(isFav).length+'</span>':'')+'</button>').join('');
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

  // Shared source navigation; demo sources never create or control an audio stream.
  function sourceButtons(source){
    return [['radio','Radio','music'],['spotify','Spotify','disc'],['media','Medien','folder']].map(([id,label,ic])=>'<button type="button" data-source="'+id+'" class="mm-mode-button '+(id===source?'active':'')+'" aria-pressed="'+(id===source)+'" onclick="selectAudioSource(\''+id+'\')">'+icon(ic)+label+'</button>').join('');
  }
  // Classic's direct HTTPS MP3 catalog, no aggregator, API key or proxy.
  const RADIO_STATIONS=[
    ['bayern1-franken','BAYERN 1 Franken','Oldies & Pop · Franken','https://dispatcher.rndfnk.com/br/br1/franken/mp3/mid'],
    ['bayern3','BAYERN 3','Pop & Hits · Bayern','https://dispatcher.rndfnk.com/br/br3/live/mp3/mid'],
    ['antenne-bayern','ANTENNE BAYERN','Pop & Hits · Bayern','https://stream.antenne.de/antenne/stream/mp3'],
    ['rock-antenne','ROCK ANTENNE','Rock · Deutschland','https://stream.rockantenne.de/rockantenne/stream/mp3'],
    ['oldie-antenne','OLDIE ANTENNE','80er & 90er · Deutschland','https://stream.antenne.de/oldie-antenne/stream/mp3'],
    ['deutschlandfunk','Deutschlandfunk','Nachrichten & Hintergrund','https://st01.sslstream.dlf.de/dlf/01/128/mp3/stream.mp3'],
    ['bayern2','BAYERN 2','Kultur & Wissen · Bayern','https://dispatcher.rndfnk.com/br/br2/live/mp3/mid'],
    ['br24','BR24','Nachrichten · Bayern','https://dispatcher.rndfnk.com/br/br24/live/mp3/mid'],
    ['br-schlager','BR Schlager','Schlager · Bayern','https://dispatcher.rndfnk.com/br/brschlager/live/mp3/mid'],
    ['br-heimat','BR Heimat','Volksmusik · Bayern','https://dispatcher.rndfnk.com/br/brheimat/live/mp3/mid'],
    ['br-klassik','BR-KLASSIK','Klassische Musik · Bayern','https://dispatcher.rndfnk.com/br/brklassik/live/mp3/mid'],
    ['dlf-kultur','Deutschlandfunk Kultur','Kultur & Musik','https://st02.sslstream.dlf.de/dlf/02/128/mp3/stream.mp3'],
    ['dlf-nova','Deutschlandfunk Nova','Wissen & Pop','https://st03.sslstream.dlf.de/dlf/03/128/mp3/stream.mp3']
  ].map(([id,name,description,url])=>({id,name,description,url}));
  const radioSaved=readStore('mevicar-radio-v1',{});
  const radioSettings=radioSaved&&typeof radioSaved==='object'?radioSaved:{};
  function normalizeStreamUrl(raw){
    try{
      const url=new URL(String(raw||'').trim());
      if(url.protocol!=='https:'||url.username||url.password)return null;
      url.hash='';
      return url.href;
    }catch{return null}
  }
  function normalizeCustomStations(list){
    if(!Array.isArray(list))return [];
    const seen=new Set(),out=[];
    for(const item of list){
      if(!item||typeof item!=='object')continue;
      const url=normalizeStreamUrl(item.url);if(!url||seen.has(url))continue;
      const id=typeof item.id==='string'&&/^custom-[a-z0-9-]+$/i.test(item.id)?item.id:'custom-'+out.length+'-'+Date.now().toString(36);
      let name=String(item.name||'').trim().slice(0,60);
      if(!name){try{name=new URL(url).hostname}catch{name='Eigener Sender'}}
      out.push({id,name,description:'Eigener Stream · HTTPS',url,custom:true});
      seen.add(url);
      if(out.length>=20)break;
    }
    return out;
  }
  const restoredCustom=normalizeCustomStations(radioSettings.custom);
  const restoredStations=RADIO_STATIONS.concat(restoredCustom);
  const radioState={custom:restoredCustom,index:Math.max(0,restoredStations.findIndex(x=>x.id===radioSettings.station)),pane:'library',filter:false,query:'',adding:false,pendingRemove:null,
    favorites:new Set(Array.isArray(radioSettings.favorites)?radioSettings.favorites.filter(id=>restoredStations.some(x=>x.id===id)):[]),
    volume:Number.isFinite(radioSettings.volume)?Math.min(1,Math.max(0,radioSettings.volume)):.8,status:'Bereit · Sender wählen oder Abspielen drücken',wanted:false,resume:false,retries:0};
  let radioPlayer=null,radioTimer=null,radioRetryTimer=null,radioSerial=0;
  function radioStations(){return RADIO_STATIONS.concat(radioState.custom)}
  function radioStation(){return radioStations()[radioState.index]||RADIO_STATIONS[0]}
  function saveRadio(){try{const station=radioStation();localStorage.setItem('mevicar-radio-v1',JSON.stringify({station:station?station.id:RADIO_STATIONS[0].id,volume:radioState.volume,favorites:[...radioState.favorites].filter(id=>radioStations().some(x=>x.id===id)),custom:radioState.custom}))}catch{}}
  function bindAudioSession(){
    if(!('mediaSession'in navigator))return;
    const handlers={
      play:()=>{if(audioOwner==='radio')radioStart();else if(audioOwner==='media'&&player?.paused)toggle();},
      pause:()=>{if(audioOwner==='radio')radioStop();else if(audioOwner==='media')player?.pause();},
      stop:()=>{if(audioOwner==='radio')radioStop();else if(audioOwner==='media')player?.pause();},
      nexttrack:()=>{if(audioOwner==='radio')radioStep(1);else if(audioOwner==='media')advance(false);},
      previoustrack:()=>{if(audioOwner==='radio')radioStep(-1);else if(audioOwner==='media')previous();},
      seekto:audioOwner==='media'?e=>{if(player&&e.seekTime!=null&&Number.isFinite(player.duration))player.currentTime=e.seekTime;}:null
    };
    for(const [action,handler] of Object.entries(handlers)){try{navigator.mediaSession.setActionHandler(action,handler)}catch{}}
    try{if(!(audioOwner==='radio'&&radioPlayer)){navigator.mediaSession.metadata=null;navigator.mediaSession.playbackState='none';}}catch{}
    if(audioOwner==='media')updateMediaSession(current());
  }
  function clearRadioTimers(){
    clearTimeout(radioTimer);radioTimer=null;
    clearTimeout(radioRetryTimer);radioRetryTimer=null;
  }
  function detachRadio(){
    radioSerial++;clearRadioTimers();
    const old=radioPlayer;radioPlayer=null;
    if(old){old.pause();old.removeAttribute('src');old.load();old.remove();}
  }
  function paintRadio(){
    const status=$('mm-radio-status');if(status)status.textContent=radioState.status;
    const notice=$('mm-radio-notice');if(notice)notice.textContent=radioState.status;
    const active=radioState.wanted&&!!radioPlayer;
    const button=$('mm-radio-play');if(button){button.innerHTML=icon(active?'stop':'play');button.setAttribute('aria-label',active?'Radio stoppen':'Radio abspielen');}
    const remove=$('mm-radio-remove');if(remove)remove.classList.toggle('selected',radioState.pendingRemove===radioStation()?.id);
    if(audioOwner==='radio'&&'mediaSession'in navigator){try{navigator.mediaSession.playbackState=active&&!radioPlayer.paused?'playing':'paused'}catch{}}
  }
  function radioStop(message='Gestoppt · Abspielen startet wieder live'){
    detachRadio();
    radioState.wanted=false;radioState.resume=false;radioState.retries=0;radioState.pendingRemove=null;
    radioState.status=message;paintRadio();
  }
  function scheduleRadioRetry(message){
    if(!radioState.wanted||radioState.retries>=3)return false;
    const delay=[4000,10000,25000][radioState.retries]||25000;
    radioState.retries++;
    radioState.status=message+' · Neuer Versuch in '+Math.round(delay/1000)+' s ('+radioState.retries+'/3)';
    clearTimeout(radioRetryTimer);
    radioRetryTimer=setTimeout(()=>{
      radioRetryTimer=null;
      if(radioState.wanted&&navigator.onLine!==false)radioStart();
    },delay);
    return true;
  }
  function radioFail(message,options={}){
    detachRadio();
    radioState.wanted=options.stop===true?false:true;
    radioState.status=message;
    if(options.retry===false){
      radioState.retries=0;radioState.resume=options.resume===true;
    }else if(!scheduleRadioRetry(message)){
      radioState.resume=true;
      radioState.status=message+' · Erneut versuchen';
    }
    paintRadio();
  }
  function radioStart(){
    onSourceChanged('radio');
    if(navigator.onLine===false){
      radioState.wanted=true;radioState.resume=true;radioState.status='Offline · Wiederverbindung automatisch';paintRadio();return;
    }
    detachRadio();
    const station=radioStation(),serial=radioSerial,audio=document.createElement('audio');
    radioPlayer=audio;radioState.wanted=true;radioState.resume=true;radioState.pendingRemove=null;
    radioState.status='Livestream wird geladen …';
    audio.id='mevi-radio-audio';audio.hidden=true;audio.preload='none';audio.volume=radioState.volume;
    document.body.appendChild(audio);
    const active=()=>serial===radioSerial&&radioPlayer===audio&&radioState.wanted;
    const armTimeout=()=>{if(radioTimer!==null)return;radioTimer=setTimeout(()=>{if(active())radioFail('Stream antwortet nicht · Erneut starten oder Sender wechseln');},15000);};
    audio.addEventListener('playing',()=>{if(!active())return;clearRadioTimers();radioState.retries=0;radioState.resume=false;radioState.status='LIVE · '+station.name;paintRadio();});
    for(const event of ['waiting','stalled'])audio.addEventListener(event,()=>{if(!active()||(event==='stalled'&&audio.readyState>=3))return;radioState.status='Verbindung wird gepuffert …';paintRadio();armTimeout();});
    audio.addEventListener('pause',()=>{if(active())radioFail('Wiedergabe unterbrochen · Erneut starten');});
    audio.addEventListener('ended',()=>{if(active())radioFail('Stream beendet · Erneut starten');});
    audio.addEventListener('error',()=>{if(active())radioFail('Stream nicht erreichbar · Internet prüfen oder Sender wechseln');});
    audio.addEventListener('volumechange',()=>{if(!active())return;radioState.volume=audio.volume;saveRadio();const input=$('mm-radio-volume');if(input)input.value=String(Math.round(audio.volume*100));});
    if('mediaSession'in navigator&&'MediaMetadata'in window){try{navigator.mediaSession.metadata=new window.MediaMetadata({title:station.name,artist:station.description,album:'MeviCar Internetradio'});}catch{}}
    audio.src=station.url;armTimeout();paintRadio();
    try{Promise.resolve(audio.play()).catch(error=>{
      if(!active())return;
      if(error?.name==='NotAllowedError')radioFail('Browser blockiert Wiedergabe · Abspielen erneut drücken',{retry:false,stop:true});
      else if(error?.name==='NotSupportedError')radioFail('Streamformat wird nicht unterstützt · Anderen Sender wählen',{retry:false,stop:true});
      else radioFail('Stream nicht abspielbar · Erneut starten oder Sender wechseln');
    });}
    catch{if(active())radioFail('Wiedergabe nicht möglich · Erneut starten');}
  }
  function radioSelect(index){
    if(!Number.isInteger(index)||!radioStations()[index])return;
    radioState.index=index;radioState.pane='player';radioState.adding=false;radioState.pendingRemove=null;saveRadio();radioStart();redraw();
  }
  function radioStep(delta){const total=radioStations().length;radioSelect((radioState.index+delta+total)%total);}
  function radioRows(){
    const q=radioState.query.trim().toLocaleLowerCase('de');
    return radioStations().map((item,index)=>({item,index})).filter(({item})=>(!radioState.filter||radioState.favorites.has(item.id))&&(!q||[item.name,item.description].some(x=>String(x).toLocaleLowerCase('de').includes(q))));
  }
  function radioCountLabel(){const total=radioStations().length;return radioState.filter||radioState.query.trim()?radioRows().length+' von '+total+' Sendern':total+' Sender';}
  function radioRowsHTML(){
    const rows=radioRows();
    if(!rows.length)return '<div class="mm-demo-empty">Keine Sender gefunden.<br>Suche ändern oder Favoritenfilter ausschalten.</div>';
    return rows.map(({item,index})=>
      '<button type="button" class="mm-demo-item '+(radioState.index===index?'selected':'')+'" aria-label="'+esc(item.name)+' abspielen" aria-pressed="'+(radioState.index===index)+'" onclick="meviRadioAction(\'select\','+index+')"><span class="mm-demo-item-icon">'+icon('music')+'</span><span class="mm-demo-item-text"><strong>'+esc(item.name)+(item.custom?' <span class="mm-radio-own">EIGEN</span>':'')+'</strong><small>'+esc(item.description)+'</small></span>'+icon(radioState.favorites.has(item.id)?'heart':'play')+'</button>').join('');
  }
  function refreshRadioList(){
    const list=$('mm-radio-list');if(list)list.innerHTML=radioRowsHTML();
    const count=$('mm-radio-count');if(count)count.textContent=radioCountLabel();
    const filter=$('mm-radio-filter');if(filter){filter.classList.toggle('selected',radioState.filter);filter.setAttribute('aria-pressed',String(radioState.filter));}
  }
  function addRadioStation(name,url){
    const clean=normalizeStreamUrl(url);
    if(!clean){radioState.status='Ungültige Stream-URL · Nur vollständige HTTPS-Adressen';paintRadio();return false}
    if(radioStations().some(item=>item.url===clean)){radioState.status='Sender ist bereits vorhanden';paintRadio();return false}
    if(radioState.custom.length>=20){radioState.status='Maximal 20 eigene Sender';paintRadio();return false}
    let label=String(name||'').trim().slice(0,60);
    if(!label){try{label=new URL(clean).hostname}catch{label='Eigener Sender'}}
    const item={id:'custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),name:label,description:'Eigener Stream · HTTPS',url:clean,custom:true};
    radioState.custom.push(item);
    radioState.index=radioStations().length-1;
    radioState.adding=false;radioState.filter=false;radioState.query='';radioState.pane='player';radioState.pendingRemove=null;
    radioState.status='Sender hinzugefügt · Abspielen drücken';
    saveRadio();redraw();return true;
  }
  function addRadioFromForm(){
    return addRadioStation($('mm-radio-name')?.value||'',$('mm-radio-url')?.value||'');
  }
  function removeRadioStation(){
    const station=radioStation();
    if(!station?.custom)return;
    if(radioState.pendingRemove!==station.id){
      radioState.pendingRemove=station.id;
      radioState.status='Erneut auf Entfernen tippen, um „'+station.name+'“ zu löschen';
      redraw();return;
    }
    if(radioPlayer)radioStop('Eigener Sender entfernt');
    radioState.custom=radioState.custom.filter(item=>item.id!==station.id);
    radioState.favorites.delete(station.id);
    radioState.pendingRemove=null;
    radioState.index=Math.min(radioState.index,Math.max(0,radioStations().length-1));
    radioState.status='Eigener Sender entfernt';
    saveRadio();redraw();
  }
  function radioAction(action,value){
    if(action==='select')radioSelect(value);
    else if(action==='toggle'){if(radioState.wanted&&radioPlayer)radioStop();else radioStart();}
    else if(action==='next')radioStep(1);
    else if(action==='previous')radioStep(-1);
    else if(action==='pane'&&['library','player'].includes(value)){radioState.pane=value;redraw();}
    else if(action==='filter'){radioState.filter=!radioState.filter;refreshRadioList();}
    else if(action==='query'){radioState.query=String(value||'').slice(0,80);refreshRadioList();}
    else if(action==='addform'){radioState.adding=!radioState.adding;radioState.pane='library';redraw();}
    else if(action==='favorite'){const id=radioStation().id;if(radioState.favorites.has(id))radioState.favorites.delete(id);else radioState.favorites.add(id);saveRadio();redraw();}
    else if(action==='volume'&&Number.isFinite(Number(value))){radioState.volume=Math.min(100,Math.max(0,Number(value)))/100;if(radioPlayer)radioPlayer.volume=radioState.volume;saveRadio();}
    else if(action==='remove')removeRadioStation();
  }
  window.addEventListener?.('offline',()=>{
    if(radioState.wanted||radioPlayer)radioFail('Offline · Wiederverbindung automatisch',{retry:false,resume:true});
  });
  window.addEventListener?.('online',()=>{
    if(radioState.wanted&&radioState.resume&&!radioPlayer){radioState.retries=0;radioState.status='Verbindung wieder da · Stream wird neu geladen';radioStart();}
  });
  function radioHTML(compact){
    const station=radioStation();
    const isCustom=!!station.custom;
    const playing=radioState.wanted&&!!radioPlayer;
    const addForm=radioState.adding?'<form class="mm-radio-add" onsubmit="event.preventDefault();meviRadioAddFromForm()"><label><span>Name (optional)</span><input id="mm-radio-name" type="text" maxlength="60" autocomplete="off" placeholder="z. B. Mein Lieblingssender"></label><label><span>HTTPS-Stream-URL</span><input id="mm-radio-url" type="url" inputmode="url" autocomplete="off" required placeholder="https://example.com/live.mp3"></label><div class="mm-radio-add-actions"><button type="submit" class="primary">'+icon('plus')+' Hinzufügen</button><button type="button" onclick="meviRadioAction(\'addform\')">Abbrechen</button></div><div class="mm-radio-notice" id="mm-radio-notice" role="status">'+esc(radioState.status)+'</div></form>':'';
    return '<section class="mm-shell mm-demo mm-radio '+(compact?'is-compact':'')+(radioState.adding?' is-adding':'')+'" data-source="radio" data-pane="'+radioState.pane+'" aria-label="Internetradio"><div class="mm-top"><div class="mm-identity"><span class="mm-eyebrow">MEVICAR NEXT</span><span class="mm-heading">RADIO</span></div><div class="mm-top-actions">'+sourceButtons('radio')+'</div></div>'+
      '<div class="mm-demo-notice">Internetradio · benötigt WLAN oder mobile Daten · HTTPS</div>'+
      (compact?'<div class="mm-compact-toggle"><button type="button" aria-pressed="'+(radioState.pane==='library')+'" onclick="meviRadioAction(\'pane\',\'library\')">'+icon('list')+' Sender</button><button type="button" aria-pressed="'+(radioState.pane==='player')+'" onclick="meviRadioAction(\'pane\',\'player\')">'+icon('music')+' Player</button></div>':'')+
      '<div class="mm-content"><div class="mm-library"><div class="mm-radio-tools"><label class="mm-search mm-radio-search">'+icon('search')+'<input id="mm-radio-search" type="search" spellcheck="false" autocomplete="off" placeholder="Sender suchen …" aria-label="Radiosender suchen" value="'+esc(radioState.query)+'" oninput="meviRadioAction(\'query\',this.value)"></label><div class="mm-radio-tools-row"><strong id="mm-radio-count">'+radioCountLabel()+'</strong><span class="mm-radio-actions"><button type="button" id="mm-radio-filter" class="mm-tab '+(radioState.filter?'selected':'')+'" aria-pressed="'+radioState.filter+'" onclick="meviRadioAction(\'filter\')">'+icon('heart')+' Favoriten</button><button type="button" id="mm-radio-add" class="mm-tab '+(radioState.adding?'selected':'')+'" aria-expanded="'+radioState.adding+'" onclick="meviRadioAction(\'addform\')">'+icon('plus')+' Sender</button></span></div>'+addForm+'</div><div class="mm-list" id="mm-radio-list">'+radioRowsHTML()+'</div></div>'+
      '<div class="mm-now"><div class="mm-now-top"><div class="mm-artwork mm-demo-art" aria-hidden="true">'+icon('music')+'<span>RADIO</span></div><div class="mm-track-details"><div class="mm-now-eyebrow">INTERNETRADIO</div><div class="mm-now-title">'+esc(station.name)+'</div><div class="mm-now-sub">'+esc(station.description)+'</div>'+(isCustom?'<div class="mm-now-album">Eigener Sender · lokal gespeichert</div>':'')+'<div class="mm-now-buttons"><button type="button" class="mm-icon-button" aria-label="Favorit umschalten" aria-pressed="'+radioState.favorites.has(station.id)+'" onclick="meviRadioAction(\'favorite\')">'+icon('heart')+'</button>'+(isCustom?'<button type="button" id="mm-radio-remove" class="mm-icon-button mm-radio-remove '+(radioState.pendingRemove===station.id?'selected':'')+'" aria-label="Eigenen Sender entfernen" aria-pressed="'+(radioState.pendingRemove===station.id)+'" onclick="meviRadioRemoveStation()">'+icon('trash')+'</button>':'')+'</div></div></div>'+
      '<div class="mm-radio-status" id="mm-radio-status" role="status">'+esc(radioState.status)+'</div>'+
      '<div class="mm-radio-controls"><div class="mm-transport"><button type="button" aria-label="Vorheriger Sender" onclick="meviRadioAction(\'previous\')">'+icon('prev')+'</button><button type="button" id="mm-radio-play" class="mm-primary" aria-label="'+(playing?'Radio stoppen':'Radio abspielen')+'" onclick="meviRadioAction(\'toggle\')">'+icon(playing?'stop':'play')+'</button><button type="button" aria-label="Nächster Sender" onclick="meviRadioAction(\'next\')">'+icon('next')+'</button></div><label class="mm-radio-volume">'+icon('volume')+'<input id="mm-radio-volume" type="range" min="0" max="100" value="'+Math.round(radioState.volume*100)+'" aria-label="Radio-Lautstärke" oninput="meviRadioAction(\'volume\',this.value)"></label></div></div></div></section>';
  }

  function html(isCompact){
    const compact=!!isCompact;
    const sources=sourceButtons('media');
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
    if(audioOwner==='media'&&'mediaSession'in navigator){try{navigator.mediaSession.playbackState=player&&!player.paused?'playing':'paused'}catch{}}
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
    if(audioOwner!=='media'||!t||!('mediaSession'in navigator)||!('MediaMetadata'in window))return;
    try{navigator.mediaSession.metadata=new window.MediaMetadata({title:t.title||t.name,artist:t.artist||'MeviMedia 3.0',album:t.album||'',artwork:st.artUrl?[{src:st.artUrl,type:'image/jpeg'}]:[]})}catch{}
  }
  function play(index,preserveQueue){
    const t=st.tracks[index];if(!t)return;
    onSourceChanged('media');ensurePlayer();
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
    if(player.paused){onSourceChanged('media');player.play().catch(()=>{});updateMediaSession(current());}else player.pause();
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
    meviRadioHTML:radioHTML,meviRadioAction:radioAction,
    meviRadioAddStation:addRadioStation,meviRadioAddFromForm:addRadioFromForm,meviRadioRemoveStation:removeRadioStation,
    meviMediaHTML:html,meviMediaFolder:chooseFolder,meviMediaFiles:chooseFiles,meviMediaLoadFiles:loadFiles,
    meviMediaSection:setSection,meviMediaGroup:setGroup,meviMediaSearch:search,meviMediaPane:pane,
    meviMediaPlay:play,meviMediaToggle:toggle,meviMediaNext:()=>advance(false),meviMediaPrev:previous,
    meviMediaSeek:seek,meviMediaVolume:volume,meviMediaShuffle:shuffle,meviMediaRepeat:repeat,
    meviMediaFav:fav,meviMediaFavCurrent:()=>fav(st.index),
    meviMediaShowVideo:showVideo,meviMediaCloseVideo:closeVideo,meviMediaStopForSource:onSourceChanged,
    meviMediaDebug:()=>({count:st.tracks.length,current:st.index,section:st.section,queue:st.queue.length,playing:!!player&&!player.paused,shuffle:st.shuffle,repeat:st.repeat})
  });
})();