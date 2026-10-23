// Isolated local QA: no wallet, network writes, purchases or live records.
// SMOKE_CHANNEL=msedge node scripts/floors-smoke.mjs [baseUrl]
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
const base=process.argv[2]??"http://127.0.0.1:5741/",out="docs/screenshots";
if(!["localhost","127.0.0.1"].includes(new URL(base).hostname))throw new Error("Local dev server only");
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:process.env.SMOKE_CHANNEL||"msedge"}),errors=[],results=[];
try {
  for(const [name,width,height]of [["desktop",1440,1000],["phone",375,812]]) {
    const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();
    page.on("pageerror",e=>errors.push(e.message));
    page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
    await page.goto(base);await page.waitForFunction(()=>window.__emberdeep);
    const fixture=async depth=>{
      await page.evaluate(async depth=>{
        const {startRun,emptyBag}=await import("/src/game/run.ts"),{NO_PERKS}=await import("/src/game/catalog.ts");
        const {generateFloor}=await import("/src/game/dungeon.ts"),{createRng}=await import("/src/game/rng.ts");
        const {useRun,useGame}=window.__emberdeep;
        const setup={seed:20261023+depth,flasks:5,perks:{...NO_PERKS,radius:100},weaponDamage:16,bag:emptyBag(),runId:`map-qa-${depth}`};
        const s=startRun(setup);s.floor=generateFloor(createRng(setup.seed),depth,{findPct:0});s.depth=depth;s.deepest=depth;
        s.floor.seen.fill(1);s.floor.revealed=true;s.player={...s.floor.spawn,facing:"right"};s.light=10000;
        useGame.setState({muted:true,reducedMotion:false,lastReport:null,runSpent:60,runId:setup.runId,carried:emptyBag()});
        useRun.setState({run:s,log:null,lastDescent:null});
      },depth);
      await page.getByLabel("Rift walk estimate").waitFor();await page.waitForTimeout(350);
    };
    for(let depth=1;depth<=7;depth++) {
      await fixture(depth);
      if(name==="desktop") {
        const png=await page.evaluate(async()=>{
          const {drawRun}=await import("/src/render/renderer.ts"),{FxQueue}=await import("/src/render/fx.ts");
          const {HeroAttacks}=await import("/src/render/hero-anim.ts");
          const {useRun,useGame}=window.__emberdeep,s=useRun.getState().run,c=document.createElement("canvas");
          c.width=s.floor.w*32;c.height=s.floor.h*32;
          const draw=()=>drawRun(c.getContext("2d"),s,{time:1000,reducedMotion:true,hero:{animal:useGame.getState().animal,...new HeroAttacks().pose(1000,"right",false,0,-Infinity,true)},fx:new FxQueue(),playerPos:s.player,view:{x:0,y:0,w:s.floor.w,h:s.floor.h},zoom:1});
          draw();await new Promise(r=>setTimeout(r,200));draw();return c.toDataURL("image/png").split(",")[1];
        });
        writeFileSync(`${out}/floor-${String(depth).padStart(2,"0")}-render.png`,Buffer.from(png,"base64"));
      }
      await page.screenshot({path:`${out}/floor-${String(depth).padStart(2,"0")}-${name}.png`});
      // Exercise the real keyboard path at a wall beside a traced corridor. Every attempted move stays on floor.
      const barrier=await page.evaluate(async()=>{
        const {useRun}=window.__emberdeep,s=structuredClone(useRun.getState().run);
        const {isFloor}=await import("/src/game/dungeon.ts");
        const dirs=[{dx:1,dy:0,key:"ArrowRight"},{dx:-1,dy:0,key:"ArrowLeft"},{dx:0,dy:1,key:"ArrowDown"},{dx:0,dy:-1,key:"ArrowUp"}];
        let chosen;
        for(let y=2;y<s.floor.h-2&&!chosen;y++)for(let x=2;x<s.floor.w-2&&!chosen;x++)if(isFloor(s.floor,x,y)) {
          const dir=dirs.find(d=>!isFloor(s.floor,x+d.dx,y+d.dy));if(dir)chosen={x,y,...dir};
        }
        if(!chosen)throw new Error("No wall boundary");
        s.floor.dimlings=[];s.floor.props=[];s.floor.items=[];s.player={x:chosen.x,y:chosen.y,facing:"down"};
        useRun.setState({run:s});return chosen;
      });
      await page.keyboard.press(barrier.key);
      assert.deepEqual(await page.evaluate(()=>{const p=window.__emberdeep.useRun.getState().run.player;return {x:p.x,y:p.y};}),{x:barrier.x,y:barrier.y});
      const stairs=await page.evaluate(()=>{
        const {useRun}=window.__emberdeep,s=structuredClone(useRun.getState().run),p=s.floor.stairs;
        s.player={x:p.x,y:p.y+1,facing:"up"};useRun.setState({run:s});return p;
      });
      await page.keyboard.press("ArrowUp");
      assert.deepEqual(await page.evaluate(()=>{const p=window.__emberdeep.useRun.getState().run.player;return{x:p.x,y:p.y};}),stairs);
      await page.getByRole("button",{name:new RegExp(`Descend to depth ${depth+1}`)}).waitFor();
      results.push({screen:name,depth,barrier:"passed",stairApproach:"passed"});
    }
    // Readable labels in the real render loop, next to a living Cerberus, on both viewport sizes.
    await fixture(7);
    await page.evaluate(async()=>{
      const live=async fragment=>import(performance.getEntriesByType("resource").map(e=>e.name).filter(n=>n.includes(fragment)).at(-1));
      const {LightLabels}=await live("/src/render/light-labels.ts"),draw=LightLabels.prototype.draw;
      window.__labels=[];
      LightLabels.prototype.draw=function(ctx,t,bounds,avoid){
        ctx.save();ctx.font="8px Silkscreen, monospace";
        const labels=this.layout(t,text=>ctx.measureText(text).width,bounds,avoid);ctx.restore();
        if(labels.length)window.__labels.push({labels,avoid});return draw.call(this,ctx,t,bounds,avoid);
      };
      const {useRun}=window.__emberdeep,s=structuredClone(useRun.getState().run);
      s.floor.dimlings=[{id:999,x:14,y:8,hp:2000,maxHp:2000,awake:true,boss:true,size:2}];
      s.floor.items=[];s.floor.props=[];s.player={x:13,y:8,facing:"right"};s.light=400;
      s.runId="label-qa";window.__emberdeep.useGame.setState({runId:s.runId});
      useRun.setState({run:s});
    });
    for(let n=0;n<3;n++){await page.keyboard.press("ArrowRight");await page.waitForTimeout(110);}
    const feedback=await page.evaluate(()=>{
      const samples=window.__labels.filter(s=>s.labels.some(l=>l.text==="−120 light · boss ×3"));
      const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
      return {samples:samples.length,overlaps:samples.some(s=>s.labels.some(l=>s.avoid.some(r=>overlap(l.rect,r)))),light:window.__emberdeep.useRun.getState().run.light};
    });
    assert(feedback.samples>0,"three rapid boss drains merge");assert.equal(feedback.overlaps,false,"labels avoid boss bar and damage");assert.equal(feedback.light,280);
    await page.screenshot({path:`${out}/light-labels-${name}.png`});
    await page.evaluate(()=>window.__emberdeep.useGame.setState({reducedMotion:true}));
    await page.keyboard.press("ArrowRight");await page.waitForTimeout(100);
    assert.equal(await page.locator("canvas").evaluate(c=>c.parentElement.getAnimations().length),0);
    results.push({screen:name,feedback,reducedMotion:"passed"});
    await context.close();
  }
  assert.deepEqual(errors,[]);
  writeFileSync("docs/floors-qa.json",JSON.stringify({results,errors},null,2)+"\n");
  console.log(JSON.stringify({results,errors},null,2));
} finally {await browser.close();}
