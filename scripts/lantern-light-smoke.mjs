// Compare historical/current renderers inside the actual React RunView, not a gallery or detached canvas.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import sharp from 'sharp';
import { chromium } from 'playwright';

const base=process.argv[2]??'http://127.0.0.1:5741/',ref='13183e7',out='artifacts/mobs/lantern-light';
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname));mkdirSync(out,{recursive:true});
const source=execFileSync('git',['-c','core.bare=false','-c',`core.worktree=${process.cwd().replaceAll('\\','/')}`,
  'show',`${ref}:src/render/renderer.ts`],{encoding:'utf8'});
const historical=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
  .replace(/from (["'])(@\/|\.\/)([^"']+)\1/g,(_,quote,prefix,path)=>`from ${quote}${prefix==='@/'?'/src/':'/src/render/'}${path}.ts${quote}`);
const browser=await chromium.launch({channel:process.env.SMOKE_CHANNEL||'msedge'}),errors=[],frames=[],results=[];
let initial=null,keys=null;
try{
  for(const phase of ['before','after']){
    const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
    if(phase==='before')await context.route(url=>url.pathname==='/src/render/renderer.ts',route=>route.fulfill({contentType:'text/javascript',body:historical}));
    await context.addInitScript(()=>{
      const raf=window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame=fn=>raf(t=>{const now=window.__lightFrameTime??t;fn(now);window.__lightFrameSeen=now;});
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(base);await page.waitForFunction(()=>window.__emberdeep);
    if(!initial){
      const hint=page.getByRole('button',{name:/got it/i});if(await hint.count())await hint.first().click();
      await page.getByRole('button',{name:'Open Ember Altar',exact:true}).click();
      await page.getByRole('button',{name:/^Mint$/}).first().click();
      await page.getByRole('button',{name:'Equip and return to camp',exact:true}).click();
      await page.keyboard.press('Escape');await page.getByRole('button',{name:'Open Dungeon Gate',exact:true}).click();
      await page.getByRole('button',{name:/Light it and descend/}).click();
      await page.getByLabel('Lantern light',{exact:true}).waitFor();
      initial=await page.evaluate(()=>{
        window.__emberdeep.useGame.setState({muted:true,reducedMotion:false,animal:'cat-scottish-fold'});
        const {useGame,useRun}=window.__emberdeep;
        return JSON.parse(JSON.stringify({game:useGame.getState(),run:useRun.getState().run,log:useRun.getState().log}));
      });
      // Walk a real route in the generated starting room. No floor/entity/light fixtures are altered.
      keys=await page.evaluate(()=>{
        const s=window.__emberdeep.useRun.getState().run,f=s.floor,q=[{...s.player,path:[]}],seen=new Set([`${s.player.x},${s.player.y}`]);
        const dirs=[[1,0,'ArrowRight'],[0,1,'ArrowDown'],[-1,0,'ArrowLeft'],[0,-1,'ArrowUp']];
        for(const p of q){if(p.path.length===3)return p.path;for(const[dx,dy,key]of dirs){const x=p.x+dx,y=p.y+dy,k=`${x},${y}`;
          if(seen.has(k)||f.tiles[y*f.w+x]!==1||f.props.some(d=>d.x===x&&d.y===y)||f.dimlings.some(d=>d.x===x&&d.y===y))continue;
          seen.add(k);q.push({x,y,path:[...p.path,key]});}}
        throw new Error('No three-step route from the rift');
      });
    }else{
      await page.evaluate(snapshot=>{
        const {useGame,useRun}=window.__emberdeep;useGame.setState(snapshot.game);
        useRun.setState({run:snapshot.run,log:snapshot.log,lastDescent:null,prevPlayer:null});
      },initial);
    }
    await page.getByLabel('Lantern light',{exact:true}).waitFor();
    for(const key of keys){await page.keyboard.press(key);await page.waitForTimeout(220);}
    await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(500);await page.mouse.move(1,1);
    await page.evaluate(()=>{window.__lightFrameTime=50000;});
    await page.waitForFunction(()=>window.__lightFrameSeen===50000);await page.waitForTimeout(100);
    const state=await page.evaluate(()=>{
      const s=window.__emberdeep.useRun.getState().run;
      return{seed:s.seed,depth:s.depth,player:s.player,light:s.light,steps:s.steps,status:s.status};
    });
    assert.equal(state.depth,1);assert.equal(state.status,'playing');assert.equal(state.steps,3);
    await page.screenshot({path:`${out}/${phase}.png`,animations:'disabled'});
    const png=await page.locator('canvas').evaluate(c=>c.toDataURL('image/png').split(',')[1]);
    const bytes=Buffer.from(png,'base64');writeFileSync(`${out}/${phase}-canvas.png`,bytes);
    frames.push(await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true}));
    results.push({phase,renderer:phase==='before'?ref:'current',...state,canvasSha256:createHash('sha256').update(frames.at(-1).data).digest('hex')});
    await context.close();
  }
  assert.deepEqual(results[0].player,results[1].player);assert.equal(results[0].seed,results[1].seed);assert.equal(results[0].light,results[1].light);
  assert.deepEqual(frames[0].info,frames[1].info);
  let changedPixels=0;for(let p=0;p<frames[0].data.length;p+=4)if(!frames[0].data.subarray(p,p+4).equals(frames[1].data.subarray(p,p+4)))changedPixels++;
  const qa={ref,actualRunView:true,sameAcceptedMobArt:true,keys,fixedRenderTime:50000,results,changedPixels,errors};
  writeFileSync(`${out}/qa.json`,JSON.stringify(qa,null,2)+'\n');
  assert.deepEqual(errors,[]);assert.equal(changedPixels,0,'Actual dungeon canvas must be pixel-identical');console.log(JSON.stringify(qa,null,2));
}finally{await browser.close();}
