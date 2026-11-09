import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {Game}=createRequire(import.meta.url)('../tetris.js');
const g=new Game(()=>.5);
assert.equal(g.board.length,20);
assert.equal(g.board[0].length,10);
const seen=[g.piece.flat().find(Boolean),g.next.flat().find(Boolean)];
for(let i=0;i<5;i++)seen.push(g.pick().flat().find(Boolean));
assert.equal(new Set(seen).size,7,'Every bag contains all seven pieces');
g.reset();
while(g.move(-1)){}
const edge=g.x;assert.equal(g.move(-1),false);assert.equal(g.x,edge);
const before=JSON.stringify(g.piece);
g.x=3;for(let i=0;i<4;i++)assert(g.rotate());
assert.equal(JSON.stringify(g.piece),before,'Four rotations restore a piece');
g.piece=[[1,1,1,1]];g.x=3;g.y=0;
g.board[19]=[2,2,2,0,0,0,0,2,2,2];
assert.equal(g.ghostY(),19);g.drop();
assert.equal(g.lines,1);assert.equal(g.score,138);
assert(g.board.every(r=>r.every(v=>v===0)),'Completed row removed');
g.reset();g.piece=[[1],[1],[1],[1]];g.x=4;g.y=0;
for(let y=16;y<20;y++){g.board[y].fill(2);g.board[y][4]=0;}
g.drop();assert.equal(g.lines,4);assert.equal(g.score,832);
g.reset();g.board[19].fill(2);g.board[19][0]=0;g.piece=[[3]];g.x=0;g.y=18;g.lines=9;g.step();g.step();
assert.equal(g.lines,10);assert.equal(g.level,2);assert(g.interval<800);
g.reset();g.board[0].fill(1);g.spawn();assert(g.over);
const score=g.score;g.drop();g.step();assert.equal(g.score,score);
g.reset();assert(!g.over);assert.equal(g.lines,0);assert.equal(g.score,0);
console.log('Tetris OK: bag, walls, rotation, ghost, drop, line clears, level, game over, reset.');
const {readFileSync}=await import('node:fs');
const {runInNewContext}=await import('node:vm');
const handlers=new Map(),timers=new Map(),elements=new Map();
let id=0;
const context={fillRect(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},save(){},restore(){},translate(){}};
const root={
 querySelector(selector){if(!elements.has(selector))elements.set(selector,{getContext:()=>context,textContent:'',hidden:false});return elements.get(selector);},
 addEventListener(type,fn){handlers.set('root:'+type,fn);},
 removeEventListener(type){handlers.delete('root:'+type);}
};
const doc={hidden:false,querySelector:()=>root,addEventListener:(t,f)=>handlers.set(t,f),removeEventListener:t=>handlers.delete(t)};
const win={document:doc};
runInNewContext(readFileSync(new URL('../tetris.js',import.meta.url),'utf8'),{window:win,document:doc,localStorage:{getItem:()=>null,setItem(){}},setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id)});
win.meviTetrisMount();assert.equal(timers.size,0,'Mounted game waits for Start');
function click(action){handlers.get('root:click')({target:{closest:()=>({dataset:{action}})}});}
click('pause');assert.equal(timers.size,1);
click('left');assert.equal(timers.size,1,'Movement does not duplicate timers');
doc.hidden=true;handlers.get('visibilitychange')();assert.equal(timers.size,0);
doc.hidden=false;click('pause');assert.equal(timers.size,1);
win.meviTetrisUnmount();assert.equal(timers.size,0);assert.equal(handlers.size,0);
win.meviTetrisMount();assert.equal(timers.size,0,'Returning does not resume without input');
win.meviTetrisUnmount();
console.log('Tetris lifecycle OK: start, pause, hidden tab, unmount and remount.');
