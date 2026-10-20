import time,json
from playwright.sync_api import sync_playwright
GOAL=[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0]
HARD80=[0,12,9,13,15,11,10,14,3,7,2,5,4,8,6,1]
INIT="""(()=>{const W=window.Worker;window.__w={created:0,live:0,maxLive:0};
window.Worker=function(u){const w=new W(u);__w.created++;__w.live++;__w.maxLive=Math.max(__w.maxLive,__w.live);const t=w.terminate.bind(w);let dead=false;w.terminate=()=>{if(!dead){dead=true;__w.live--}t()};return w};
window.__gaps=[];let l=performance.now();const f=t=>{__gaps.push(t-l);l=t;requestAnimationFrame(f)};requestAnimationFrame(f);
window.__lt=[];try{new PerformanceObserver(x=>x.getEntries().forEach(e=>__lt.push(e.duration))).observe({entryTypes:['longtask']})}catch(e){}})()"""
res=[];
def ck(name,cond,extra=''):
    res.append((name,bool(cond)));print(('PASS' if cond else 'FAIL'),name,extra)
def legal_goal(pg,start):  # replay via page: verify S.done and board==GOAL
    return pg.evaluate("()=>{const S=__T.S;return S.board.every((v,i)=>v===[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0][i])}")
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1200,'height':900}); pg=ctx.new_page()
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script(INIT); pg.goto('file:///home/claude/work/test_copy.html'); pg.wait_for_timeout(2500)
    pg.evaluate("document.getElementById('dlgW').close&&0")
    def setb(bd): pg.evaluate("b=>{__T.setup(b)}",bd)
    def info(): return pg.inner_text('#solInfo')
    def msg(): return pg.inner_text('#msg')
    def wait_info(sub,t=60):
        t0=time.time()
        while time.time()-t0<t:
            if sub in info() or sub in msg(): return True
            pg.wait_for_timeout(150)
        return False
    def solve_and_play(bd,label,t=60):
        setb(bd); pg.evaluate("document.getElementById('bSolve').click()")
        okf=wait_info('Solution found',t)
        if not okf: ck(label+' found',False,info()); return None
        n=pg.evaluate("__T.S.sol.moves.length")
        t0=time.time()
        while time.time()-t0<30 and not pg.evaluate("__T.S.done"): pg.wait_for_timeout(200)
        done=pg.evaluate("__T.S.done"); g=legal_goal(pg,bd)
        ck(label+' solved by playback',done and g,f'{n} moves'); 
        if pg.evaluate("document.getElementById('dlgW').open"): pg.evaluate("document.getElementById('dlgW').close()")
        return n
    # 1 solved
    setb(GOAL); pg.evaluate("document.getElementById('bSolve').click()"); pg.wait_for_timeout(300)
    ck('already solved board',('Already solved' in msg()) and pg.evaluate("__w.created")==0)
    # 2 one move
    one=GOAL[:];one[15]=one[14];one[14]=0
    n=solve_and_play(one,'one-move'); ck('one-move length 1',n==1)
    # 3 several moves
    sev=GOAL[:]; 
    for i in [11,7,6,10,14]:
        z=sev.index(0); sev[z]=sev[i]; sev[i]=0
    solve_and_play(sev,'several-moves')
    # 4 random boards via UI shuffles (medium & hard)
    for d in ['70','160','160','70']:
        pg.evaluate("d=>{const s=document.getElementById('oDif');s.value=d;s.dispatchEvent(new Event('change'))}",d)
        start=pg.evaluate("__T.S.board.slice()")
        solve_and_play(start,'random shuffle '+d)
    # 5 unsolvable
    uns=GOAL[:];uns[0],uns[1]=uns[1],uns[0]; setb(uns); c0=pg.evaluate("__w.created"); pg.evaluate("document.getElementById('bSolve').click()"); pg.wait_for_timeout(300)
    ck('unsolvable detected without worker',('parity' in msg()) and pg.evaluate("__w.created")==c0,msg())
    # 6 repeated clicking: never more than one live worker
    setb(HARD80); pg.evaluate("__w.maxLive=0")
    for i in range(7): pg.evaluate("document.getElementById('bSolve').click()"); pg.wait_for_timeout(120)
    ck('repeated Solve clicks keep <=1 worker',pg.evaluate("__w.maxLive")<=1,f"maxLive={pg.evaluate('__w.maxLive')} live={pg.evaluate('__w.live')}")
    # state after 7 clicks: odd -> running
    if pg.evaluate("!!document.getElementById('bSolve').textContent.includes('Cancel')"):
        pg.evaluate("document.getElementById('bSolve').click()"); pg.wait_for_timeout(200)
    ck('cancel leaves no live worker',pg.evaluate("__w.live")==0 and 'cancelled' in (info()+msg()).lower(),info())
    # 7 responsiveness during a difficult search + UI usable
    setb(HARD80); pg.evaluate("__gaps.length=0;__lt.length=0"); pg.evaluate("document.getElementById('bSolve').click()")
    pg.wait_for_timeout(500); pg.evaluate("__gaps.length=0;__lt.length=0")
    seen=set(); t0=time.time()
    while time.time()-t0<6:
        pg.wait_for_timeout(500); seen.add(info()[:22])
    r=pg.evaluate("({gap:Math.max(...__gaps),n:__gaps.length,long:Math.max(0,...__lt)})")
    ck('main thread responsive during hard search',r['gap']<80 and r['n']>250,str(r))
    ck('progress shown while searching','Searching' in info(),info())
    # UI interaction during search: Hint works, Settings opens
    pg.evaluate("document.getElementById('bHint').click()"); pg.wait_for_timeout(100)
    ck('hint usable during search','Try tile' in msg() and pg.evaluate("!!__T.S.job"),msg())
    pg.evaluate("document.getElementById('navS').click()"); pg.wait_for_timeout(300); ck('settings opens during search',pg.evaluate("document.getElementById('dlgS').open")); pg.evaluate("document.getElementById('cS').click()")
    # 8 Stop button cancels search
    ck('Stop enabled during search',pg.evaluate("!document.getElementById('bStop').disabled"))
    pg.evaluate("document.getElementById('bStop').click()"); pg.wait_for_timeout(200)
    ck('Stop cancels search',pg.evaluate("!__T.S.job && __w.live===0") and 'cancelled' in msg().lower(),msg())
    # then start new search on easy board
    setb(GOAL); one2=GOAL[:];one2[15]=one2[11];one2[11]=0; solve_and_play(one2,'new search after cancel')
    # 9 reset / new game / undo while running => no stale result
    for label,js in [('New game',"document.getElementById('bNew').click()"),('Reset',"document.getElementById('bReset').click()")]:
        setb(HARD80); pg.evaluate("document.getElementById('bSolve').click()"); pg.wait_for_timeout(400)
        pg.evaluate(js); pg.wait_for_timeout(400)
        ck(label+' while solving cancels job',pg.evaluate("!__T.S.job && __w.live===0 && !__T.S.sol"))
    # manual move while running cancels job
    setb(HARD80); pg.evaluate("document.getElementById('bSolve').click()"); pg.wait_for_timeout(300)
    pg.evaluate("()=>{const S=__T.S,z=S.board.indexOf(0);const i=[z-4,z+4,z-1,z+1].find(i=>i>=0&&i<16&&Math.abs((i&3)-(z&3))+Math.abs((i>>2)-(z>>2))===1);document.querySelectorAll('#in .t button')[S.board[i]-1].click()}")
    pg.wait_for_timeout(300); ck('manual move while solving cancels job',pg.evaluate("!__T.S.job && __w.live===0 && !__T.S.sol"))
    # mode switch while running
    setb(HARD80); pg.evaluate("document.getElementById('bSolve').click()"); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('.modes button[data-m=image]').click()"); pg.wait_for_timeout(300)
    ck('mode switch while solving cancels job',pg.evaluate("!__T.S.job && __w.live===0")); pg.evaluate("document.querySelector('.modes button[data-m=classic]').click()")
    # 10 limit reached message (Quick effort on 80-move board)
    pg.evaluate("()=>{const e=document.getElementById('oEff');e.value='quick';e.dispatchEvent(new Event('change'))}")
    setb(HARD80); pg.evaluate("document.getElementById('bSolve').click()"); okl=wait_info('Search limit reached',30)
    ck('limit reported accurately (not unsolvable)',okl and 'unsolvable' not in msg().lower().replace("not mean the puzzle is unsolvable",""),info()[:140])
    ck('solver can be retried after limit',pg.evaluate("document.getElementById('bSolve').textContent==='Solve' && !__T.S.job && __w.live===0"))
    pg.evaluate("()=>{const e=document.getElementById('oEff');e.value='standard';e.dispatchEvent(new Event('change'))}")
    ck('JS errors',len(errs)==0,str(errs[:2]))
    b.close()
# watchdog test with a worker that never answers
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page()
    pg.add_init_script("window.Worker=function(){this.terminate=()=>{window.__term=1};this.postMessage=()=>{}}")
    pg.goto('file:///home/claude/work/test_copy.html'); pg.wait_for_timeout(2500)
    pg.evaluate("()=>{const S=__T.S;__T.setup([1,2,3,4,5,6,7,8,9,10,11,12,13,14,0,15])}"); pg.evaluate("document.getElementById('bSolve').click()")
    t0=time.time()
    while time.time()-t0<16 and 'stopped responding' not in pg.inner_text('#msg'): pg.wait_for_timeout(500)
    ck('watchdog shuts down unresponsive worker',('stopped responding' in pg.inner_text('#msg')) and pg.evaluate("window.__term===1"),pg.inner_text('#msg'))
    b.close()
print('TOTAL',sum(1 for _,o in res if o),'/',len(res))
