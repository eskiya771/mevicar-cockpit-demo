/* Sole route-details row model for Web and Android SDK data. No map APIs. */
(function(root){
 'use strict';
 const finite=v=>typeof v==='number'&&Number.isFinite(v);
 const n=v=>finite(v)?Math.max(0,v):0;
 const label=v=>typeof v==='string'?v.trim().slice(0,240):'';
 function distance(m,style='detail'){
  const v=n(m);
  if(style==='dashboard'){
   if(v<1000)return Math.round(v)+' m';
   return (v/1000).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})+' km';
  }
  if(v<1000)return Math.round(v/10)*10+' m';
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
  const stops=Array.isArray(data.stops)?data.stops.filter(x=>typeof x==='string').slice(0,8):[];
  if(stops.length){
   if(finite(data.nextStopSeconds)&&finite(data.nextStopMeters))
    add('Nächster Stopp',label(stops[0])+' · '+duration(data.nextStopSeconds)+' · '+
     distance(data.nextStopMeters)+' · '+clock(now+n(data.nextStopSeconds)*1000));
   else add('Nächster Stopp',label(stops[0]));
   add('Zwischenstopps',stops.map((s,i)=>(i+1)+'. '+label(s)).join('\n'));
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
 root.MeviNavRouteDetails=Object.freeze({rows,distance,duration,clock,averageKmh});
})(window);
