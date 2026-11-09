import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
const require=createRequire(import.meta.url);
const child=require('node:child_process');
const original=child.spawn;
const workers=[];
child.spawn=(_name,args)=>{
 const worker=new EventEmitter();
 worker.killed=false;
 worker.kill=()=>{worker.killed=true;return true;};
 worker.stderr=new EventEmitter();
 workers.push({worker,args});
 return worker;
};
const remux=require('../bridge/remux.cjs');
try{
 const url=id=>'http://provider.example/live/test/test/'+id+'.ts';
 const a=remux.start('900001',url('900001'));
 const b=remux.start('900002',url('900002'));
 assert.equal(remux.countActive(),2);
 // deterministic LRU ordering, avoid relying on wall clock resolution
 a.used=100;b.used=200;
 const c=remux.start('900003',url('900003'));
 assert.equal(remux.countActive(),2);
 assert.equal(a.proc.killed,true,'oldest stream must be stopped');
 assert.equal(b.proc.killed,false);
 assert.equal(c.proc.killed,false);
 b.used=500;c.used=300;
 const d=remux.start('900004',url('900004'));
 assert.equal(remux.countActive(),2);
 assert.equal(c.proc.killed,true,'next least recently used stream must be stopped');
 assert.equal(d.proc.killed,false);
 assert.strictEqual(remux.start('900004',url('900004')),d,'current stream is reused');
 assert.equal(workers.length,4);
 assert.equal(remux.leastRecentlyUsed(new Map([['a',{used:10}],['b',{used:20}]])),'a');
 assert.equal(remux.leastRecentlyUsed(new Map()),null);
 console.log('Remux switching OK: third/fourth channels evict oldest stream, no 503 slot exhaustion.');
}finally{
 for(const id of ['900001','900002','900003','900004'])remux.cleanup(id);
 child.spawn=original;
}
