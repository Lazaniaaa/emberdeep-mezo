// Local visual regression and real keyboard/touch walking, with unchanged-floor snapshots.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const phase=process.argv[2],base=process.argv[3]??'http://127.0.0.1:5741/';
assert(['before','after'].includes(phase));
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const out='docs/screenshots';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:process.env.SMOKE_CHANNEL||'msedge'}),errors=[],results=[],renders={};
try {
  for(const [screen,width,height] of [['desktop',1440,1000],['phone',375,812]]) {
    const context=await browser.newContext({viewport:{width,height},hasTouch:screen==='phone'}),page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(base);await page.waitForFunction(()=>window.__emberdeep);
    for(const depth of screen==='desktop'?[1,2,3,4,5,6,7]:[5,6,7]) {
      const grid=await page.evaluate(async depth=>{
        const {startRun,emptyBag}=await import('/src/game/run.ts'),{NO_PERKS}=await import('/src/game/catalog.ts');
        const {generateFloor}=await import('/src/game/dungeon.ts'),{createRng}=await import('/src/game/rng.ts');
        const setup={seed:20261024+depth,flasks:5,perks:{...NO_PERKS,radius:100},weaponDamage:1000,bag:emptyBag(),runId:`late-tiles-qa-${depth}`};
        const s=startRun(setup);s.floor=generateFloor(createRng(setup.seed),depth,{findPct:0});s.depth=s.deepest=depth;
        const snapshot=JSON.stringify(s.floor);s.floor.seen.fill(1);s.floor.revealed=true;s.player={...s.floor.spawn,facing:'right'};s.maxLight=s.light=10000;
        window.__emberdeep.useGame.setState({animal:'cat-scottish-fold',muted:true,reducedMotion:true,lastReport:null,runSpent:150,runId:setup.runId,carried:emptyBag()});
        window.__emberdeep.useRun.setState({run:s,log:null,lastDescent:null});return snapshot;
      },depth);
      await page.getByLabel('Rift walk estimate').waitFor();await page.waitForTimeout(350);
      if(screen==='desktop') {
        const png=await page.evaluate(async()=>{
          const {drawRun}=await import('/src/render/renderer.ts'),{FxQueue}=await import('/src/render/fx.ts'),{HeroAttacks}=await import('/src/render/hero-anim.ts');
          const {useRun,useGame}=window.__emberdeep,s=useRun.getState().run,c=document.createElement('canvas');c.width=s.floor.w*32;c.height=s.floor.h*32;
          const draw=()=>drawRun(c.getContext('2d'),s,{time:1000,reducedMotion:true,hero:{animal:useGame.getState().animal,...new HeroAttacks().pose(1000,'right',false,0,-Infinity,true)},fx:new FxQueue(),playerPos:s.player,view:{x:0,y:0,w:s.floor.w,h:s.floor.h},zoom:1});
          draw();await new Promise(r=>setTimeout(r,300));draw();return c.toDataURL('image/png').split(',')[1];
        });
        renders[depth]=createHash('sha256').update(png).digest('hex');
        if([5,6,7].includes(depth))writeFileSync(`${out}/late-tiles-0${depth}-${phase}-render.png`,Buffer.from(png,'base64'));
      }
      if(![5,6,7].includes(depth))continue;
      await page.screenshot({path:`${out}/late-tiles-0${depth}-${phase}-${screen}.png`});
      const path=await page.evaluate(()=>{
        const s=window.__emberdeep.useRun.getState().run,f=s.floor,start=f.spawn.y*f.w+f.spawn.x,end=f.stairs.y*f.w+f.stairs.x;
        const queue=[start],prev=new Map([[start,null]]);
        for(let i=0;i<queue.length&&!prev.has(end);i++)for(const d of [-f.w,1,f.w,-1]){
          const n=queue[i]+d;if(n<0||n>=f.tiles.length||f.tiles[n]!==1||prev.has(n)||Math.abs(n%f.w-queue[i]%f.w)>1)continue;
          prev.set(n,queue[i]);queue.push(n);
        }
        if(!prev.has(end))throw new Error('No route to stairs');
        const route=[];for(let k=end;k!==start;k=prev.get(k))route.push({x:k%f.w,y:Math.floor(k/f.w)});return route.reverse();
      });
      let actions=0;
      for(const target of path) {
        let reached=false;
        for(let retry=0;retry<20;retry++) {
          const p=await page.evaluate(()=>{const s=window.__emberdeep.useRun.getState().run;return {...s.player,status:s.status};});
          assert.equal(p.status,'playing');if(p.x===target.x&&p.y===target.y){reached=true;break;}
          const dir=target.x>p.x?'right':target.x<p.x?'left':target.y>p.y?'down':'up';
          if(screen==='phone')await page.getByRole('button',{name:`Move ${dir}`,exact:true}).tap();else await page.keyboard.press(`Arrow${dir[0].toUpperCase()+dir.slice(1)}`);
          actions++;await page.waitForTimeout(110);
        }
        assert(reached,`Could not reach ${JSON.stringify(target)}`);
        if(target.x===(13))await page.screenshot({path:`${out}/late-tiles-0${depth}-${phase}-${screen}-corridor.png`});
      }
      await page.getByRole('button',{name:new RegExp(`Descend to depth ${depth+1}`)}).waitFor();
      await page.screenshot({path:`${out}/late-tiles-0${depth}-${phase}-${screen}-stairs.png`});
      results.push({screen,depth,gridHash:createHash('sha256').update(grid).digest('hex'),routeTiles:path.length,actions});
      if(phase==='after'){
        await page.evaluate(async()=>{
          const {NO_PERKS}=await import('/src/game/catalog.ts'),{visibleSet}=await import('/src/game/dungeon.ts');
          const {useRun,useGame}=window.__emberdeep,s=structuredClone(useRun.getState().run);s.perks={...NO_PERKS};s.light=80;s.floor.revealed=false;s.floor.seen.fill(0);s.runId+='-fog';s.events=[];
          for(const k of visibleSet(s.floor,s.player,5))s.floor.seen[k]=1;
          useGame.setState({reducedMotion:false,runId:s.runId});useRun.setState({run:s});
        });
        await page.keyboard.press('Space');await page.waitForTimeout(350);await page.screenshot({path:`${out}/late-tiles-0${depth}-after-${screen}-fog.png`});
      }
    }
    if(phase==='after'){
      const requested=await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>e.name));
      assert(requested.some(n=>n.includes('/tiles/hollowglass.png')),'Hollowglass atlas requested');
      assert(requested.some(n=>n.includes('/tiles/cinderworks.png')),'Cinderworks atlas requested');
      assert(!requested.some(n=>/\/maps\/depth-0[1-7]\.webp/.test(n)),'Painted floors not requested');
    }
    await context.close();
  }
  assert.deepEqual(errors,[]);
  if(phase==='after'){
    const before=JSON.parse(readFileSync('docs/late-tiles-before-qa.json','utf8'));
    for(const d of [1,2,3,4])assert.equal(renders[d],before.renders[d],`Floor ${d} render unchanged`);
    for(let i=0;i<results.length;i++)assert.notEqual(results[i].gridHash,before.results[i].gridHash,'Late floor layouts intentionally changed');
  }
  writeFileSync(`docs/late-tiles-${phase}-qa.json`,JSON.stringify({results,renders,errors},null,2)+'\n');console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();}
