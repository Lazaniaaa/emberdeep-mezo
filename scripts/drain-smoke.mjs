// Local resolved-hit QA: real input on authored floor tiles, no wallet or live writes.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
const base=process.argv[2]??"http://127.0.0.1:5741/";
assert(["localhost","127.0.0.1"].includes(new URL(base).hostname));
const browser=await chromium.launch({channel:process.env.SMOKE_CHANNEL||"msedge"}),results=[],errors=[];
try {
  for(const [screen,width,height]of[["desktop",1440,1000],["phone",375,812]]) {
    const context=await browser.newContext({viewport:{width,height},hasTouch:screen==="phone"}),page=await context.newPage();
    page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
    await page.goto(base);await page.waitForFunction(()=>window.__emberdeep);
    for(const depth of [1,2]) {
      await page.evaluate(async({depth,screen})=>{
        const {startRun,emptyBag}=await import("/src/game/run.ts"),{NO_PERKS}=await import("/src/game/catalog.ts");
        const {generateFloor,isFloor}=await import("/src/game/dungeon.ts"),{createRng}=await import("/src/game/rng.ts");
        const s=startRun({seed:20261023+depth,flasks:2,perks:NO_PERKS,weaponDamage:8,bag:emptyBag(),runId:`drain-qa-${depth}-${screen}`});
        s.floor=generateFloor(createRng(s.seed),depth,{findPct:0});s.depth=s.deepest=depth;s.floor.props=[];s.floor.items=[];
        s.player={x:depth===1?15:12,y:depth===1?10:9,facing:"right"};s.light=80;s.events=[];
        if(!isFloor(s.floor,s.player.x+1,s.player.y))throw new Error("Creature fixture must stand on floor");
        s.floor.dimlings=[{id:999,x:s.player.x+1,y:s.player.y,hp:100,maxHp:100,awake:true,species:"wickgnaw",phase:"windup",windupLeft:1,cooldown:0,aim:null}];
        s.floor.seen.fill(1);
        window.__emberdeep.useGame.setState({animal:"cat-scottish-fold",muted:true,reducedMotion:false,lastReport:null,runSpent:90,runId:s.runId,carried:emptyBag()});
        window.__emberdeep.useRun.setState({run:s,log:null,lastDescent:null});
      },{depth,screen});
      await page.getByLabel("Rift walk estimate").waitFor();await page.waitForTimeout(200);
      if(screen==="phone")await page.getByRole("button",{name:"Wait a turn",exact:true}).tap();
      else await page.keyboard.press("Space");
      await page.waitForTimeout(180);
      const hit=await page.evaluate(()=>{const s=window.__emberdeep.useRun.getState().run;return{light:s.light,steps:s.steps,events:s.events,phase:s.floor.dimlings[0].phase,messages:s.messages};});
      const drain=depth===1?8:12;
      assert.equal(hit.light,80-drain-1);assert.equal(hit.steps,1);assert(hit.events.includes("drain"));assert.equal(hit.phase,"recovery");
      assert(hit.messages.some(m=>m.includes(`(-${drain} light)`)));
      await page.screenshot({path:`docs/screenshots/drain-0${depth}-${screen}.png`});
      results.push({screen,depth,hitDrain:drain,stepCost:1,remainingLight:hit.light,phase:hit.phase});
    }
    await context.close();
  }
  assert.deepEqual(errors,[]);writeFileSync("docs/drain-qa.json",JSON.stringify({results,errors},null,2)+"\n");
  console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();}
