const {solve,solvable,MDT}=require('./solver_worker.js');
const GOAL=[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0];
const nb=z=>{const r=[],y=z>>2,x=z&3;if(y>0)r.push(z-4);if(y<3)r.push(z+4);if(x>0)r.push(z-1);if(x<3)r.push(z+1);return r};
let seed=12345;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
function shuf(n){let b=GOAL.slice(),last=-1;for(let k=0;k<n;k++){const z=b.indexOf(0);const o=nb(z).filter(i=>i!==last);const i=o[Math.floor(rnd()*o.length)];last=z;b[z]=b[i];b[i]=0}return b}
function randomSolvable(){for(;;){const b=GOAL.slice();for(let i=15;i>0;i--){const j=Math.floor(rnd()*(i+1));[b[i],b[j]]=[b[j],b[i]]}if(solvable(b))return b}}
function verify(start,moves){let b=start.slice();for(const i of moves){const z=b.indexOf(0);if(!nb(z).includes(i))return false;b[z]=b[i];b[i]=0}return b.every((v,i)=>v===GOAL[i])}
const run=(b,lim)=>solve(b,Object.assign({maxExpanded:2e9,maxMs:60000},lim||{}),()=>{},()=>performance.now());
let pass=0,fail=0;const ok=(c,m)=>{if(c)pass++;else{fail++;console.log('FAIL',m)}};
// 1 solved
let r=run(GOAL);ok(r.state==='done'&&r.moves.length===0,'solved');
// 2 one move
{const b=GOAL.slice();b[15]=b[14];b[14]=0;r=run(b);ok(r.state==='done'&&r.moves.length===1&&verify(b,r.moves),'one move')}
// BFS reference distances from goal up to depth 14
const dist=new Map();{let fr=[GOAL.join()];dist.set(fr[0],0);let cur=[GOAL];for(let d=1;d<=14;d++){const nx=[];for(const b of cur){const z=b.indexOf(0);for(const i of nb(z)){const c=b.slice();c[z]=c[i];c[i]=0;const k=c.join();if(!dist.has(k)){dist.set(k,d);nx.push(c)}}}cur=nx}}
console.log('BFS states',dist.size);
// 3 optimality vs BFS on shallow boards (sampled)
{let n=0;for(const [k,d] of dist){if(Math.floor(rnd()*dist.size)>1500)continue;const b=k.split(',').map(Number);r=run(b);n++;ok(r.state==='done'&&r.moves.length===d&&verify(b,r.moves),'optimal vs BFS '+k+' want '+d+' got '+(r.moves&&r.moves.length));}console.log('BFS-checked boards',n)}
// 4 random solvable boards: legality + goal; and admissibility (len>=h) 
{let t=Date.now(),cnt=0,nodes=0,lens=[];for(let i=0;i<60;i++){const b=randomSolvable();r=run(b,{maxMs:60000});if(r.state!=='done'){console.log('random not done',r.state,r.elapsed);continue}cnt++;nodes+=r.expanded;lens.push(r.moves.length);ok(verify(b,r.moves),'random verify');let h=0;for(let p=0;p<16;p++)if(b[p])h+=MDT[b[p]*16+p];ok(r.moves.length>=h,'len>=MD')}
 console.log('random solved',cnt,'/60 avg nodes',Math.round(nodes/cnt),'avg len',(lens.reduce((a,b)=>a+b,0)/cnt).toFixed(1),'max len',Math.max(...lens),'ms',Date.now()-t)}
// 5 known hard board (80 moves): 
{const b=[0,12,9,13,15,11,10,14,3,7,2,5,4,8,6,1];const t=Date.now();let last=0;r=solve(b,{maxExpanded:3e9,maxMs:120000,progressMs:20000},m=>{if(m.type==='progress')console.log(' progress',m.expanded,m.bound,m.elapsed+'ms')},()=>performance.now());console.log('hard80',r.state,r.moves&&r.moves.length,'nodes',r.expanded,'ms',Date.now()-t,'nps',Math.round(r.expanded/(Date.now()-t)*1000));if(r.state==='done')ok(verify(b,r.moves)&&r.moves.length===80,'hard80 optimal=80')}
// 6 unsolvable
{const b=GOAL.slice();[b[0],b[1]]=[b[1],b[0]];r=run(b);ok(r.state==='unsolvable','unsolvable')}
// 7 invalid
ok(run([1,2,3]).state==='invalid','invalid');
// 8 limits reported as limits not unsolvable
{const b=[0,12,9,13,15,11,10,14,3,7,2,5,4,8,6,1];r=run(b,{maxExpanded:200000});ok(r.state==='budget','budget state '+r.state);r=run(b,{maxMs:50});ok(r.state==='timeout','timeout state '+r.state)}
console.log('pass',pass,'fail',fail);
