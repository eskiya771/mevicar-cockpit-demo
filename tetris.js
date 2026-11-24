/* Dependency-free falling-block game and lifecycle adapter. */
(function(global){
'use strict';
const SHAPES=[
 [[1,1,1,1]], [[2,2],[2,2]], [[0,3,0],[3,3,3]],
 [[0,4,4],[4,4,0]], [[5,5,0],[0,5,5]],
 [[6,0,0],[6,6,6]], [[0,0,7],[7,7,7]]
];
class Game {
 constructor(random=Math.random){this.random=random;this.reset();}
 reset(){this.board=Array.from({length:20},()=>Array(10).fill(0));this.bag=[];this.score=0;this.lines=0;this.over=false;this.next=this.pick();this.spawn();}
 pick(){if(!this.bag.length){this.bag=[0,1,2,3,4,5,6];for(let i=6;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}}return SHAPES[this.bag.pop()].map(r=>r.slice());}
 get level(){return 1+Math.floor(this.lines/10);}
 get interval(){return Math.max(90,800*Math.pow(.82,this.level-1));}
 fits(shape=this.piece,x=this.x,y=this.y){return shape.every((row,dy)=>row.every((v,dx)=>!v||(x+dx>=0&&x+dx<10&&y+dy<20&&(y+dy<0||!this.board[y+dy][x+dx]))));}
 spawn(){this.piece=this.next;this.next=this.pick();this.x=Math.floor((10-this.piece[0].length)/2);this.y=0;if(!this.fits())this.over=true;}
 move(dx){if(!this.over&&this.fits(this.piece,this.x+dx,this.y)){this.x+=dx;return true;}return false;}
 rotate(){if(this.over)return false;const rotated=this.piece[0].map((_,i)=>this.piece.map(row=>row[i]).reverse());for(const dx of [0,-1,1,-2,2]){if(this.fits(rotated,this.x+dx,this.y)){this.piece=rotated;this.x+=dx;return true;}}return false;}
 step(soft=false){if(this.over)return false;if(this.fits(this.piece,this.x,this.y+1)){this.y++;if(soft)this.score++;return true;}this.lock();return false;}
 drop(){if(this.over)return;while(this.fits(this.piece,this.x,this.y+1)){this.y++;this.score+=2;}this.lock();}
 ghostY(){let y=this.y;while(this.fits(this.piece,this.x,y+1))y++;return y;}
 lock(){for(let y=0;y<this.piece.length;y++)for(let x=0;x<this.piece[y].length;x++)if(this.piece[y][x]){if(this.y+y<0){this.over=true;return;}this.board[this.y+y][this.x+x]=this.piece[y][x];}
 const kept=this.board.filter(row=>row.some(v=>!v)),cleared=20-kept.length;
 this.score+=[0,100,300,500,800][cleared]*this.level;this.lines+=cleared;
 while(kept.length<20)kept.unshift(Array(10).fill(0));this.board=kept;this.spawn();}
}
if(typeof module!=='undefined'&&module.exports)module.exports={Game};
if(!global.document)return;
const colors=['','#39d5ff','#ffd45c','#ba86ff','#70edaa','#ff6a8f','#6995ff','#ffa965'];
let game=null,root=null,timer=null,paused=true,best=0;
try{best=Math.max(0,Number(localStorage.getItem('mevicar-tetris-best'))||0);}catch{}
function html(){return '<div class="tt-root"><div class="tt-stage"><canvas class="tt-board" width="300" height="600" role="img" aria-label="Tetris-Spielfeld, zehn Spalten und zwanzig Reihen"></canvas><div class="tt-banner" aria-live="polite"></div></div><section class="tt-panel"><div class="tt-title">TETRIS <span>BLOCK PLAY</span></div><div class="tt-stats"><div>Punkte<strong data-stat="score">0</strong></div><div>Level<strong data-stat="level">1</strong></div><div>Reihen<strong data-stat="lines">0</strong></div><div>Rekord<strong data-stat="best">0</strong></div></div><div class="tt-next">Nächster Stein<canvas width="120" height="64" aria-label="Vorschau des nächsten Steins"></canvas></div><div class="tt-controls"><button data-action="left" aria-label="Nach links">←</button><button data-action="rotate" aria-label="Drehen">↻</button><button data-action="right" aria-label="Nach rechts">→</button><button data-action="down" aria-label="Ein Feld abwärts">↓</button><button data-action="drop" aria-label="Sofort fallen lassen">⇓ Fallen</button></div><div class="tt-actions"><button data-action="pause">Start</button><button data-action="new">Neu</button></div><small class="tt-help">← → Bewegen · ↑ Drehen · ↓ Senken<br>Leertaste Fallen · P Pause</small></section></div>';}
function cell(ctx,x,y,v,size,alpha=1){ctx.globalAlpha=alpha;ctx.fillStyle=colors[v];ctx.fillRect(x*size+1,y*size+1,size-2,size-2);ctx.fillStyle='#ffffff55';ctx.fillRect(x*size+2,y*size+2,size-4,3);ctx.globalAlpha=1;}
function draw(){
 if(!root||!game)return;const canvas=root.querySelector('.tt-board'),ctx=canvas.getContext('2d');ctx.fillStyle='#081321';ctx.fillRect(0,0,300,600);ctx.strokeStyle='#ffffff0c';ctx.lineWidth=1;
 for(let x=0;x<=10;x++){ctx.beginPath();ctx.moveTo(x*30,0);ctx.lineTo(x*30,600);ctx.stroke();}
 for(let y=0;y<=20;y++){ctx.beginPath();ctx.moveTo(0,y*30);ctx.lineTo(300,y*30);ctx.stroke();}
 game.board.forEach((r,y)=>r.forEach((v,x)=>{if(v)cell(ctx,x,y,v,30);}));
 if(!game.over){const ghost=game.ghostY();game.piece.forEach((r,y)=>r.forEach((v,x)=>{if(v){cell(ctx,x+game.x,y+ghost,v,30,.2);cell(ctx,x+game.x,y+game.y,v,30);}}));}
 const next=root.querySelector('.tt-next canvas'),nc=next.getContext('2d');nc.clearRect(0,0,120,64);const ox=(120-game.next[0].length*24)/2,oy=(64-game.next.length*24)/2;nc.save();nc.translate(ox,oy);game.next.forEach((r,y)=>r.forEach((v,x)=>{if(v)cell(nc,x,y,v,24);}));nc.restore();
 if(game.score>best){best=game.score;try{localStorage.setItem('mevicar-tetris-best',String(best));}catch{}}
 for(const key of ['score','level','lines','best'])root.querySelector('[data-stat="'+key+'"]').textContent=key==='best'?best:game[key];
 const banner=root.querySelector('.tt-banner');banner.textContent=game.over?'Spiel beendet':paused?'Bereit? Start / Weiter':'';banner.hidden=!game.over&&!paused;
 root.querySelector('[data-action="pause"]').textContent=game.over?'Neues Spiel':paused?'▶ Weiter':'Ⅱ Pause';
}
function schedule(){clearTimeout(timer);timer=null;if(!root||paused||game.over)return;timer=setTimeout(()=>{game.step();draw();schedule();},game.interval);}
function action(name){if(!root)return;if(name==='new'||(name==='pause'&&game.over)){game.reset();paused=false;}else if(name==='pause'){paused=!paused;}else if(!paused&&!game.over){if(name==='left')game.move(-1);if(name==='right')game.move(1);if(name==='rotate')game.rotate();if(name==='down')game.step(true);if(name==='drop')game.drop();}else return;draw();if(['pause','new','drop','down'].includes(name))schedule();}
function click(e){const b=e.target.closest('[data-action]');if(b)action(b.dataset.action);}
function key(e){if(!root||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;const a={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'rotate',ArrowDown:'down',' ':'drop',p:'pause',P:'pause',Escape:'pause'}[e.key];if(!a)return;e.preventDefault();if(e.repeat&&['pause','rotate','drop'].includes(a))return;action(a);}
function visibility(){if(document.hidden&&root){paused=true;clearTimeout(timer);timer=null;draw();}}
function unmount(){clearTimeout(timer);timer=null;paused=true;document.removeEventListener('keydown',key);document.removeEventListener('visibilitychange',visibility);if(root)root.removeEventListener('click',click);root=null;}
function mount(){unmount();root=document.querySelector('.tt-root');if(!root)return;if(!game)game=new Game();root.addEventListener('click',click);document.addEventListener('keydown',key);document.addEventListener('visibilitychange',visibility);draw();}
global.meviTetrisHTML=html;global.meviTetrisMount=mount;global.meviTetrisUnmount=unmount;
})(typeof window==='undefined'?globalThis:window);
