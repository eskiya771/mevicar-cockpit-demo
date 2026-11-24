/* Sole route-details row model for Web and Android SDK data. No map APIs. */
(function(root){
 'use strict';
 const finite=v=>typeof v==='number'&&Number.isFinite(v);
 const n=v=>finite(v)?Math.max(0,v):0;
 const label=v=>typeof v==='string'?v.trim().slice(0,240):'';
 /* Browser Google Places and the Android SDK both retain the exact stop
    identity; an old APK may still supply bare strings. Address formatting
    belongs only to this shared model, not to parallel Web/Kotlin formatters. */
 function stopDetail(value){
  if(typeof value==='string')return {name:label(value),address:''};
  if(!value||typeof value!=='object')return null;
  const name=label(value.name||value.title||value.label||value.address)||'Zwischenstopp';
  const address=label(value.address);
  return {name,address:address&&address!==name?address:''};
 }
 function stopText(stop){
  return stop.name+(stop.address?'\n'+stop.address:'');
 }
 function distance(m,style='detail'){
  const v=n(m);
  if(style==='dashboard'){
   if(v<1000)return Math.round(v)+' m';
   return (v/1000).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})+' km';
  }
  if(style==='compact')return v>=1000?new Intl.NumberFormat('de-DE',{maximumFractionDigits:1}).format(v/1000)+' km':Math.round(v/10)*10+' m';
  if(v<1000)return (style==='maneuver'&&v<50?Math.round(v/5)*5:Math.round(v/10)*10)+' m';
  return (v<10000?(v/1000).toFixed(1).replace('.',','):String(Math.round(v/1000)))+' km';
 }
 function duration(sec,rounding='round'){
  const mins=(rounding==='ceil'?Math.ceil:Math.round)(n(sec)/60);
  if(mins<60)return mins+' Min.';
  const hours=Math.floor(mins/60),rest=mins%60;
  return hours+' Std.'+(rounding==='ceil'&&rest===0?'':' '+rest+' Min.');
 }
 function clock(stamp,withSuffix=true){
  if(!finite(stamp)||stamp<0)return '';
  return new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit'}).format(new Date(stamp))+(withSuffix?' Uhr':'');
 }
 /* "32 min · 24 km": trip strip and route preview on every platform. */
 function tripSummary(sec,m){
  const mins=Math.max(1,Math.round(n(sec)/60));
  return (mins<60?mins+' min':Math.floor(mins/60)+' h '+String(mins%60).padStart(2,'0')+' min')+' · '+distance(m);
 }
 /* "Ankunft 14:32", "Ankunft morgen 02:10", "Ankunft +2 Tage 02:10" in local time. */
 function arrival(nowMs,sec){
  const now=finite(nowMs)?nowMs:Date.now(),a=new Date(now),b=new Date(now+n(sec)*1000);
  const days=Math.round((new Date(b.getFullYear(),b.getMonth(),b.getDate())-new Date(a.getFullYear(),a.getMonth(),a.getDate()))/86400000);
  return 'Ankunft '+(days<=0?'':days===1?'morgen ':'+'+days+' Tage ')+clock(b.getTime(),false);
 }
 function averageKmh(drivenMeters,elapsedMs){
  if(!finite(drivenMeters)||!finite(elapsedMs)||drivenMeters<100||elapsedMs<60000)return null;
  return Math.round(drivenMeters*3600/elapsedMs);
 }
 function rows(data){
  if(!data||typeof data!=='object')return [];
  const now=finite(data.nowMs)?data.nowMs:Date.now(),
   started=finite(data.startedAtMs)&&data.startedAtMs>=0?data.startedAtMs:null,
   seconds=n(data.remainingSeconds),remaining=n(data.remainingMeters),
   driven=n(data.drivenMeters),elapsed=started===null?null:Math.max(0,now-started);
  const result=[],add=(key,val)=>{if(val!==null&&val!==undefined&&String(val).trim())result.push([key,String(val)])};
  const dest=data.destination||{};
  add('Ziel',label(dest.title));
  if(label(dest.address)&&label(dest.address)!==label(dest.title))add('Adresse',label(dest.address));
  if(started!==null)add('Start',clock(started));
  add('Ankunft',clock(now+seconds*1000));
  if(elapsed!==null)add('Fahrzeit bisher',duration(elapsed/1000));
  add('Restzeit',duration(seconds));
  const total=driven+remaining;
  add('Fortschritt',total>0?Math.round(100*driven/total)+' %':'0 %');
  add('Gefahren',distance(driven));
  add('Reststrecke',distance(remaining));
  add('Gesamtstrecke',distance(total));
  const average=data.simulation===true||elapsed===null?null:averageKmh(driven,elapsed);
  add('Durchschnittsgeschwindigkeit',average===null?'–':average+' km/h');
  add('Höchstgeschwindigkeit',data.simulation===true||!finite(data.maxSpeedKmh)||data.maxSpeedKmh<0?
   '–':Math.round(data.maxSpeedKmh)+' km/h');
  const turn=data.maneuver;
  if(turn&&typeof turn==='object'){
   const action=label(turn.text),dist=distance(turn.distanceMeters);
   add('Nächstes Manöver',(action?action+' · ':'')+'in '+dist);
  }
  const stops=Array.isArray(data.stops)?data.stops.map(stopDetail).filter(s=>s&&s.name).slice(0,8):[];
  if(stops.length){
   if(finite(data.nextStopSeconds)&&finite(data.nextStopMeters))
    add('Nächster Stopp',stopText(stops[0])+
     (stops[0].address?'\n':' · ')+duration(data.nextStopSeconds)+' · '+
     distance(data.nextStopMeters)+' · '+clock(now+n(data.nextStopSeconds)*1000));
   else add('Nächster Stopp',stopText(stops[0]));
   add('Zwischenstopps',stops.map((s,i)=>(i+1)+'. '+stopText(s)).join('\n\n'));
  }else add('Zwischenstopps','keine');
  const avoid=['avoidTolls','avoidHighways','avoidFerries']
   .filter(key=>data.options?.[key]===true)
   .map(key=>({avoidTolls:'Maut',avoidHighways:'Autobahnen',avoidFerries:'Fähren'})[key]);
  add('Vermeiden',avoid.join(', ')||'nichts');
  add('Ansagen',data.muted===true?'aus':'an');
  const roadNote=label(data.roadNote).replace(/^Blitzer:\s*/,'');
  if(roadNote)add('Blitzer',roadNote);
  return result;
 }
 root.MeviNavRouteDetails=Object.freeze({rows,stopDetail,distance,duration,clock,averageKmh,tripSummary,arrival});
})(window);
