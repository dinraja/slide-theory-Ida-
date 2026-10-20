"use strict";
/* IDA* for the 4x4 sliding puzzle. Heuristic: Manhattan distance + linear conflict (both admissible, so the
   first solution found is optimal). All state lives in typed arrays: no allocation per node, memory is constant. */
const FOUND=-1,LIMIT=-2;
const GR=new Int8Array(16),GC=new Int8Array(16);
for(let v=1;v<16;v++){GR[v]=(v-1)>>2;GC[v]=(v-1)&3}
const MDT=new Uint8Array(256);
for(let v=1;v<16;v++)for(let p=0;p<16;p++)MDT[v*16+p]=Math.abs((p>>2)-GR[v])+Math.abs((p&3)-GC[v]);
/* neighbours of each blank position */
const NB=[],NBN=new Uint8Array(16);
for(let z=0;z<16;z++){const r=[],y=z>>2,x=z&3;if(y>0)r.push(z-4);if(y<3)r.push(z+4);if(x>0)r.push(z-1);if(x<3)r.push(z+1);NB.push(Int8Array.from(r));NBN[z]=r.length}
/* Linear-conflict tables. A line (row or column) is packed into 16 bits, 4 bits per cell, cell k at shift 4k.
   LC(line) = 2 * (fewest tiles to remove so that the remaining tiles that belong to this line are in goal order). */
function lineLC(code,line,isRow){
  const gp=[];
  for(let k=0;k<4;k++){const v=(code>>(4*k))&15;if(!v)continue;if((isRow?GR[v]:GC[v])===line)gp.push(isRow?GC[v]:GR[v])}
  const m=gp.length;if(m<2)return 0;
  let best=m;
  for(let mask=0;mask<(1<<m);mask++){
    let ok=true,kept=0;
    for(let a=0;a<m&&ok;a++){if(!((mask>>a)&1))continue;kept++;for(let b=a+1;b<m;b++)if(((mask>>b)&1)&&gp[a]>gp[b]){ok=false;break}}
    if(ok&&m-kept<best)best=m-kept;
  }
  return 2*best;
}
const LCR=new Uint8Array(4<<16),LCC=new Uint8Array(4<<16);
for(let line=0;line<4;line++)for(let code=0;code<65536;code++){LCR[(line<<16)|code]=lineLC(code,line,true);LCC[(line<<16)|code]=lineLC(code,line,false)}

const valid=b=>Array.isArray(b)&&b.length===16&&new Set(b).size===16&&b.every(v=>Number.isInteger(v)&&v>=0&&v<16);
const solvable=b=>{let inv=0;for(let i=0;i<16;i++)for(let j=i+1;j<16;j++)if(b[i]&&b[j]&&b[i]>b[j])inv++;const r=4-(b.indexOf(0)>>2);return r%2?inv%2===0:inv%2===1};

/* solve(start, limits, post, now): limits = {maxExpanded, maxMs, progressMs}. Returns a result object. */
function solve(start,limits,post,now){
  const t0=now();
  const res=(state,extra)=>Object.assign({type:"result",state,expanded:nodes,elapsed:Math.round(now()-t0),bound,iteration},extra||{});
  let nodes=0,bound=0,iteration=0;
  if(!valid(start))return res("invalid");
  if(!solvable(start))return res("unsolvable");
  const maxExpanded=limits.maxExpanded>0?limits.maxExpanded:Infinity,maxMs=limits.maxMs>0?limits.maxMs:Infinity,progressMs=limits.progressMs||250;
  const board=Int8Array.from(start),rowC=new Int32Array(4),colC=new Int32Array(4),path=new Int8Array(128);
  let md0=0,lc0=0;
  for(let p=0;p<16;p++){const v=board[p];if(!v)continue;md0+=MDT[v*16+p];rowC[p>>2]|=v<<(4*(p&3));colC[p&3]|=v<<(4*(p>>2))}
  for(let l=0;l<4;l++)lc0+=LCR[(l<<16)|rowC[l]]+LCC[(l<<16)|colC[l]];
  let pathLen=0,stopped=null,nextProgress=t0+progressMs;
  function limitCheck(){
    const t=now();
    if(nodes>=maxExpanded)stopped="budget";else if(t-t0>=maxMs)stopped="timeout";
    if(t>=nextProgress){nextProgress=t+progressMs;post({type:"progress",expanded:nodes,elapsed:Math.round(t-t0),bound,iteration})}
  }
  function dfs(g,blank,prev,md,lc){
    if((++nodes&0xFFFF)===0){limitCheck();if(stopped)return LIMIT}
    let next=Infinity;
    const nb=NB[blank],n=NBN[blank],rb=blank>>2,cb=blank&3;
    for(let k=0;k<n;k++){
      const p=nb[k];if(p===prev)continue;
      const tile=board[p],rp=p>>2,cp=p&3;
      const md2=md-MDT[tile*16+p]+MDT[tile*16+blank];
      const oRp=rowC[rp],oRb=rowC[rb],oCp=colC[cp],oCb=colC[cb];
      let d=-LCR[(rp<<16)|oRp]-LCC[(cp<<16)|oCp];
      if(rb!==rp)d-=LCR[(rb<<16)|oRb];
      if(cb!==cp)d-=LCC[(cb<<16)|oCb];
      rowC[rp]=oRp&~(15<<(4*cp));colC[cp]=oCp&~(15<<(4*rp));
      rowC[rb]|=tile<<(4*cb);colC[cb]|=tile<<(4*rb);
      d+=LCR[(rp<<16)|rowC[rp]]+LCC[(cp<<16)|colC[cp]];
      if(rb!==rp)d+=LCR[(rb<<16)|rowC[rb]];
      if(cb!==cp)d+=LCC[(cb<<16)|colC[cb]];
      const lc2=lc+d,f2=g+1+md2+lc2;
      let r=Infinity;
      if(f2>bound){r=f2}
      else{
        board[blank]=tile;board[p]=0;path[g]=p;
        if(md2===0){pathLen=g+1;return FOUND}
        r=dfs(g+1,p,blank,md2,lc2);
        if(r===FOUND||r===LIMIT)return r;
        board[p]=tile;board[blank]=0;
      }
      rowC[rp]=oRp;rowC[rb]=oRb;colC[cp]=oCp;colC[cb]=oCb;
      if(r<next)next=r;
    }
    return next;
  }
  const z0=board.indexOf(0);
  if(md0===0)return res("done",{moves:[]});
  bound=md0+lc0;
  for(;;){
    iteration++;
    post({type:"progress",expanded:nodes,elapsed:Math.round(now()-t0),bound,iteration});
    const r=dfs(0,z0,-1,md0,lc0);
    if(r===FOUND)return res("done",{moves:Array.from(path.subarray(0,pathLen))});
    if(r===LIMIT)return res(stopped||"budget");
    if(r===Infinity)return res("exhausted");
    if(r>100)return res("depth");
    bound=r;
    limitCheck();if(stopped)return res(stopped);
  }
}
if(typeof module!=="undefined"&&module.exports){module.exports={solve,valid,solvable,MDT,LCR,LCC}}
else{
  self.onmessage=e=>{
    const d=e.data;if(!d||d.type!=="solve")return;
    try{postMessage(solve(d.board,d.limits||{},postMessage,()=>performance.now()))}
    catch(err){postMessage({type:"error",message:err&&err.message?err.message:"Worker solver failed."})}
  };
  postMessage({type:"ready"});
}
