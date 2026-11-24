/* MeviCar Next · Chess: offline, fully legal touch chess with a light local AI.
 * chess-rules.js: chess.js v0.10.3, BSD license retained in the vendored file.
 * No external services, no accounts, no network calls.
 */
(function(global){
'use strict';
const STORAGE='mevicar-next-chess-v1';
const GLYPHS={wk:'♔',wq:'♕',wr:'♖',wb:'♗',wn:'♘',wp:'♙',bk:'♚',bq:'♛',br:'♜',bb:'♝',bn:'♞',bp:'\u265F\uFE0E'};
const NAMES={p:'Bauer',n:'Springer',b:'Läufer',r:'Turm',q:'Dame',k:'König'};
const VALUE={p:100,n:320,b:330,r:510,q:900,k:0};
const FILES='abcdefgh';
const START='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AI_THINK_PAUSE_MS=650;
const SHOWCASE_MS={fast:800,normal:2000,slow:3500};
let game=null,root=null,mode='ai',level='normal',tempo='normal',flipped=false;
let selected=null,promotion=null,advice=null,thinking=false,aiTimer=null,showcaseTimer=null,computerMove=null,flash='',lastDisplayedPly=-1;
const escapeHTML=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&#39;'}[c]));
function newEngine(){
 if(typeof global.Chess!=='function')return null;
 return new global.Chess();
}
function init(){
 if(game)return;
 game=newEngine();
 if(!game)return;
 try{
  const saved=JSON.parse(global.localStorage?.getItem(STORAGE)||'null');
  if(saved&&saved.v===1){
   mode=saved.mode==='local'?'local':'ai';
   level=['easy','normal','hard'].includes(saved.level)?saved.level:'normal';
   tempo=Object.hasOwn(SHOWCASE_MS,saved.tempo)?saved.tempo:'normal';
   flipped=!!saved.flipped;
   if(typeof saved.pgn==='string'&&saved.pgn.length<30000){
    if(saved.pgn)game.load_pgn(saved.pgn);
   }
  }
 }catch{}
}
function save(){
 if(!game)return;
 try{global.localStorage?.setItem(STORAGE,JSON.stringify({
  v:1,pgn:game.pgn(),mode,level,tempo,flipped
 }))}catch{}
}
function message(){
 if(!game)return 'Schachregeln werden geladen …';
 const turn=game.turn()==='w'?'Weiß':'Schwarz';
 if(game.in_checkmate())return 'Schachmatt · '+(turn==='Weiß'?'Schwarz':'Weiß')+' gewinnt!';
 if(game.in_stalemate())return 'Remis · Patt';
 if(game.in_threefold_repetition())return 'Remis · dreifache Stellungswiederholung';
 if(game.insufficient_material())return 'Remis · unzureichendes Material';
 if(game.in_draw())return 'Remis · 50-Züge-Regel';
 if(thinking)return 'Computer überlegt …';
 return turn+' am Zug'+(game.in_check()?' · SCHACH!':'');
}
function finished(){return !game||game.game_over()}
function legalFrom(square){
 return game.moves({square,verbose:true});
}
function allLegal(){return game.moves({verbose:true})}
function humanTurn(){return mode==='local'||game.turn()==='w'}
function needsAI(){return !!root&&mode==='ai'&&game.turn()==='b'&&!game.game_over()}
function evaluate(){
 if(game.in_checkmate())return game.turn()==='w'?100000:-100000;
 if(game.in_draw())return 0;
 let score=0;
 const board=game.board();
 for(let row=0;row<8;row++)for(let col=0;col<8;col++){
  const p=board[row][col];if(!p)continue;
  const mid=(3.5-Math.abs(col-3.5))+(3.5-Math.abs(row-3.5));
  const bonus=(p.type==='p'?(p.color==='b'?row:7-row)*2:
   (p.type==='n'||p.type==='b'?mid*5:mid*1));
  score+=(VALUE[p.type]+bonus)*(p.color==='b'?1:-1);
 }
 return score;
}
function rankedMoves(){
 return allLegal().sort((a,b)=>{
  const strength=m=>(m.captured?(VALUE[m.captured]||0)*10-(VALUE[m.piece]||0):0)+
   (m.promotion?VALUE[m.promotion]||0:0)+(/[#]/.test(m.san)?5000:0);
  return strength(b)-strength(a);
 });
}
function chooseAI(){
 const depth=level==='hard'?3:level==='normal'?2:1;
 let nodes=0;
 const budget=level==='hard'?11000:level==='normal'?3400:600;
 function search(remaining,alpha,beta){
  if(++nodes>budget||remaining===0||game.game_over())return evaluate();
  const maximizing=game.turn()==='b';
  let best=maximizing?-Infinity:Infinity;
  for(const move of rankedMoves()){
   game.move({from:move.from,to:move.to,promotion:move.promotion||'q'});
   const score=search(remaining-1,alpha,beta);
   game.undo();
   if(maximizing){best=Math.max(best,score);alpha=Math.max(alpha,best)}
   else{best=Math.min(best,score);beta=Math.min(beta,best)}
   if(beta<=alpha||nodes>budget)break;
  }
  return Number.isFinite(best)?best:evaluate();
 }
 const moves=rankedMoves();
 if(!moves.length)return null;
 const candidates=[];
 let best=-Infinity;
 for(const m of moves){
  game.move({from:m.from,to:m.to,promotion:m.promotion||'q'});
  const score=search(depth-1,-Infinity,Infinity);
  game.undo();
  candidates.push({move:m,score});
  best=Math.max(best,score);
 }
 if(level==='easy'){
  // Friendly opponents occasionally miss tactics but still play legal moves.
  candidates.sort((a,b)=>b.score-a.score);
  return candidates[Math.floor(Math.random()*Math.min(5,candidates.length))].move;
 }
 const tolerance=level==='normal'?45:0;
 const options=candidates.filter(x=>x.score>=best-tolerance);
 return options[Math.floor(Math.random()*options.length)].move;
}
function clearShowcase(){
 if(showcaseTimer!==null){global.clearTimeout(showcaseTimer);showcaseTimer=null}
 computerMove=null;
}
function afterMove(){
 clearShowcase();
 selected=null;promotion=null;advice=null;flash='';
 save();paint();
 if(needsAI())queueAI();
}
function queueAI(){
 if(!needsAI()||thinking)return;
 clearShowcase();
 thinking=true;flash='';paint();
 aiTimer=global.setTimeout(()=>{
  aiTimer=null;
  if(!root||mode!=='ai'||game.turn()!=='b'||game.game_over()){
   thinking=false;flash='';paint();return;
  }
  let played=null;
  try{
   const move=chooseAI();
   if(move)played=game.move({from:move.from,to:move.to,promotion:move.promotion||'q'});
  }catch(err){flash='Computerzug fehlgeschlagen · bitte wiederholen';}
  thinking=false;
  if(played){
   computerMove={from:played.from,to:played.to,san:played.san};
   flash='Computer spielte '+played.san+' · '+played.from+' → '+played.to;
   showcaseTimer=global.setTimeout(()=>{
    showcaseTimer=null;computerMove=null;flash='';paint();
   },SHOWCASE_MS[tempo]);
  }else if(!flash&&!game.game_over())flash='Computerzug konnte nicht ausgeführt werden.';
  save();paint();
 },AI_THINK_PAUSE_MS);
}
function cancelAI(){
 if(aiTimer!==null){global.clearTimeout(aiTimer);aiTimer=null}
 clearShowcase();
 thinking=false;
}
function moveHuman(move){
 if(!game||finished()||thinking||!humanTurn())return false;
 const played=game.move({from:move.from,to:move.to,promotion:move.promotion||'q'});
 if(!played)return false;
 afterMove();return true;
}
function chooseSquare(square){
 if(!game||finished()||thinking||promotion||!humanTurn())return;
 if(computerMove){clearShowcase();flash='';}
 const piece=game.get(square),color=game.turn();
 if(selected===square){selected=null;advice=null;paint();return}
 if(selected){
  const options=legalFrom(selected).filter(m=>m.to===square);
  if(options.length){
   if(options.some(m=>m.flags.includes('p'))){
    promotion={from:selected,to:square};
    paint();return;
   }
   moveHuman(options[0]);return;
  }
 }
 if(piece&&piece.color===color){selected=square;advice=null;flash='';paint();}
 else{selected=null;paint();}
}
function newGame(){
 cancelAI();
 if(!game)game=newEngine();
 if(!game)return;
 game.reset();selected=null;promotion=null;advice=null;flash='';
 save();paint();
}
function undo(){
 if(!game||!game.history().length)return;
 cancelAI();selected=null;promotion=null;advice=null;flash='';
 game.undo();
 if(mode==='ai'&&game.turn()==='b'&&game.history().length)game.undo();
 save();paint();
 if(needsAI())queueAI();
}
function hint(){
 if(!game||finished()||thinking||!humanTurn())return;
 const moves=allLegal();
 if(!moves.length)return;
 let best=null,score=-Infinity;
 // Lightweight one-ply hint, no waiting, no remote chess engine.
 for(const m of moves){
  game.move({from:m.from,to:m.to,promotion:m.promotion||'q'});
  const n=evaluate()*(game.turn()==='b'?-1:1);
  game.undo();
  if(n>score){score=n;best=m}
 }
 advice=best;
 flash=best?'Tipp: '+best.san+' · markierte Felder':'';
 selected=null;paint();
}
function boardMarkup(){
 const positions=Array.from({length:64},(_,i)=>{
  const row=Math.floor(i/8),col=i%8;
  return flipped?FILES[7-col]+String(row+1):FILES[col]+String(8-row);
 });
 const history=game.history({verbose:true});
 const last=history[history.length-1];
 const targets=selected?legalFrom(selected):[];
 const checkSquare=game.in_check()?(()=>{
  const b=game.board();for(let r=0;r<8;r++)for(let c=0;c<8;c++){
   const p=b[r][c];if(p&&p.type==='k'&&p.color===game.turn())
    return FILES[c]+(8-r);
  }
  return '';
 })():'';
 return positions.map((at,i)=>{
  const piece=game.get(at);
  const p=piece?GLYPHS[piece.color+piece.type]:'';
  const file=FILES.indexOf(at[0]),rank=Number(at[1]);
  const motion=computerMove&&computerMove.to===at?
   ' style="--chess-from-x:'+(FILES.indexOf(computerMove.from[0])-file)*(flipped?-1:1)*100+'%;'+
   '--chess-from-y:'+(rank-Number(computerMove.from[1]))*(flipped?-1:1)*100+'%;"':'';
  const dark=(file+rank)%2===0;
  const target=targets.find(m=>m.to===at);
  const classes=['chess-square',dark?'chess-dark':'chess-light',
    selected===at?'chess-selected':'',
    last&&(last.from===at||last.to===at)?'chess-last':'',
    computerMove&&computerMove.from===at?'chess-ai-from':'',
    computerMove&&computerMove.to===at?'chess-ai-to':'',
    target?'chess-target':'',target&&target.captured?'chess-capture':'',
    checkSquare===at?'chess-check':'',
    advice&&(advice.from===at||advice.to===at)?'chess-hint':''].filter(Boolean).join(' ');
  const rankLabel=i%8===0?'<span class="chess-coordinate chess-rank">'+rank+'</span>':'';
  const fileLabel=Math.floor(i/8)===7?'<span class="chess-coordinate chess-file">'+at[0]+'</span>':'';
  return '<button type="button" class="'+classes+'" data-square="'+at+'" '+
   'aria-label="'+at+(piece?', '+(piece.color==='w'?'Weißer ':'Schwarzer ')+NAMES[piece.type]:' leer')+
   '" aria-pressed="'+(selected===at?'true':'false')+'">'+
   rankLabel+fileLabel+(piece?'<span class="chess-piece '+(piece.color==='w'?'white':'black')+'"'+motion+'>'+p+'</span>':'')+
   (target?'<span class="chess-target-mark"></span>':'')+'</button>';
 }).join('');
}
function moveMarkup(){
 const h=game.history();
 if(!h.length)return '<p class="chess-empty">Dein erster Zug wartet auf dich.</p>';
 let start=Math.max(0,h.length-24);
 let list='';
 if(start%2===1){
  list+='<div class="chess-turn"><span class="chess-turn-number">'+(Math.floor(start/2)+1)+'.</span>'+
   '<span class="chess-notation">…</span><span class="chess-notation">'+escapeHTML(h[start])+'</span></div>';
  start++;
 }
 for(let i=start;i<h.length;i+=2){
  list+='<div class="chess-turn"><span class="chess-turn-number">'+(Math.floor(i/2)+1)+'.</span>'+
   '<span class="chess-notation '+(i===h.length-1?'latest':'')+'">'+escapeHTML(h[i]||'')+'</span>'+
   '<span class="chess-notation '+(i+1===h.length-1?'latest':'')+'">'+escapeHTML(h[i+1]||'')+'</span></div>';
 }
 return list;
}
function markup(){
 return '<div class="chess-root" aria-label="MeviCar Schach">'+
 '<section class="chess-playfield"><div class="chess-board-frame">'+
 '<div class="chess-board" data-chess-board role="group" aria-label="Schachbrett"></div>'+
 '<div class="chess-promotion" data-promotion hidden></div></div></section>'+
 '<section class="chess-sidebar">'+
 '<header class="chess-heading"><span class="chess-kicker">MEVICAR · BOARD GAMES</span>'+
 '<h2>SCHACH <span>♞</span></h2><p>Dein Schachbrett. Deine Partie.</p></header>'+
 '<div class="chess-status-card"><span class="chess-status-lamp"></span>'+
 '<strong data-status aria-live="polite">Weiß am Zug</strong><small data-substatus>Tippe eine Figur an.</small></div>'+
 '<div class="chess-settings">'+
 '<label>Spielmodus<select data-setting="mode" aria-label="Spielmodus">'+
 '<option value="ai">Gegen Computer</option><option value="local">2 Spieler</option></select></label>'+
 '<label data-level-holder>Schwierigkeit<select data-setting="level" aria-label="Schwierigkeit">'+
 '<option value="easy">Einfach</option><option value="normal">Mittel</option><option value="hard">Schwer</option></select></label>'+ 
 '<label data-tempo-holder>Zuganzeige<select data-setting="tempo" aria-label="Dauer der Computerzug-Anzeige">'+
 '<option value="fast">Kurz · 0,8 s</option><option value="normal">Normal · 2 s</option><option value="slow">Langsam · 3,5 s</option></select></label>'+
 '</div>'+
 '<div class="chess-actions"><button type="button" data-action="new" class="chess-primary">↻ Neu</button>'+
 '<button type="button" data-action="undo">↶ Zurück</button>'+
 '<button type="button" data-action="hint">✧ Tipp</button>'+
 '<button type="button" data-action="flip">⇅ Drehen</button></div>'+
 '<div class="chess-moves"><div class="chess-moves-head"><span>ZUGVERLAUF</span><span data-count>0 Züge</span></div>'+
 '<div class="chess-moves-list" data-moves></div></div>'+
 '<p class="chess-footnote">♟ Spielstand wird lokal gespeichert · Vollständige Schachregeln · Offline</p>'+
 '</section></div>';
}
function paint(){
 if(!root||!game)return;
 const board=root.querySelector('[data-chess-board]');
 if(!board)return;
 board.innerHTML=boardMarkup();
 const p=root.querySelector('[data-promotion]');
 p.hidden=!promotion;
 if(promotion){
  const colors=game.turn();
  p.innerHTML='<div class="chess-promotion-box"><strong>Bauernumwandlung</strong>'+
   '<div class="chess-promotion-choices">'+['q','r','b','n'].map(type=>
    '<button type="button" data-promote="'+type+'" aria-label="'+NAMES[type]+' auswählen">'+
    GLYPHS[colors+type]+'</button>').join('')+'</div>'+
   '<button type="button" data-action="cancelPromotion">Abbrechen</button></div>';
 }else p.innerHTML='';
 root.querySelector('[data-status]').textContent=message();
 root.querySelector('[data-substatus]').textContent=flash||(
  thinking?'Computer wählt seinen Zug.':
  finished()?'Neue Partie beginnen?':
  selected?'Leuchtendes Zielfeld antippen.':
  mode==='ai'?'Du spielst Weiß · Computer spielt Schwarz.':
  'Abwechselnd auf diesem Gerät spielen.');
 const movesNode=root.querySelector('[data-moves]');
 movesNode.innerHTML=moveMarkup();
 const h=game.history().length;
 if(h!==lastDisplayedPly){movesNode.scrollTop=movesNode.scrollHeight||0;lastDisplayedPly=h;}
 root.querySelector('[data-count]').textContent=h+' Halbzüge';
 root.querySelector('[data-setting="mode"]').value=mode;
 root.querySelector('[data-setting="level"]').value=level;
 root.querySelector('[data-setting="tempo"]').value=tempo;
 root.querySelector('[data-level-holder]').hidden=mode!=='ai';
 root.querySelector('[data-tempo-holder]').hidden=mode!=='ai';
 root.querySelector('[data-action="undo"]').disabled=!h;
 root.querySelector('[data-action="hint"]').disabled=finished()||thinking||!humanTurn();
 root.classList.toggle('chess-thinking',thinking);
 root.classList.toggle('chess-showcase',!!computerMove);
 root.classList.toggle('chess-game-over',finished());
}
function click(event){
 if(!root)return;
 const square=event.target.closest('[data-square]');
 if(square&&root.contains(square)){chooseSquare(square.dataset.square);return}
 const promotionChoice=event.target.closest('[data-promote]');
 if(promotionChoice&&promotion){
  moveHuman({from:promotion.from,to:promotion.to,promotion:promotionChoice.dataset.promote});return;
 }
 const action=event.target.closest('[data-action]');
 if(!action||!root.contains(action))return;
 if(action.dataset.action==='new')newGame();
 if(action.dataset.action==='undo')undo();
 if(action.dataset.action==='hint')hint();
 if(action.dataset.action==='flip'){flipped=!flipped;save();paint()}
 if(action.dataset.action==='cancelPromotion'){promotion=null;paint()}
}
function changeSetting(event){
 const name=event.target.dataset.setting;
 if(name==='mode'&&(event.target.value==='ai'||event.target.value==='local')){
  mode=event.target.value;flipped=false;newGame();
 }
 if(name==='level'&&['easy','normal','hard'].includes(event.target.value)){
  level=event.target.value;newGame();
 }
 if(name==='tempo'&&Object.hasOwn(SHOWCASE_MS,event.target.value)){
  tempo=event.target.value;save();paint();
 }
}
function mount(){
 const el=global.document?.querySelector('.chess-root');
 if(!el||el===root)return;
 unmount();init();root=el;lastDisplayedPly=-1;
 root.addEventListener('click',click);
 root.addEventListener('change',changeSetting);
 paint();
 if(needsAI())queueAI();
}
function unmount(){
 cancelAI();
 if(root){root.removeEventListener('click',click);root.removeEventListener('change',changeSetting)}
 root=null;lastDisplayedPly=-1;
}
global.meviChessHTML=markup;
global.meviChessMount=mount;
global.meviChessUnmount=unmount;
global.MeviChess={mount,unmount,reset:newGame,getState:()=>game?{
 fen:game.fen(),pgn:game.pgn(),mode,level,tempo,thinking,computerMove
}:null};
})(window);
