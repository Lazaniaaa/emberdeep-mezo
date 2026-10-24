// Real local input against the generated arena boss. No wallet or live requests.
import assert from "node:assert/strict";
import {writeFileSync} from "node:fs";
import {chromium} from "playwright";
const base=process.argv[2]??"http://127.0.0.1:5741/";
assert(["localhost","127.0.0.1"].includes(new URL(base).hostname));
const browser=await chromium.launch({channel:process.env.SMOKE_CHANNEL||"msedge"}),results=[],errors=[];
try{
  for(const [screen,width,height]of[["desktop",1440,1000],["phone",375,812]]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:screen==="phone"}),page=await context.newPage();
    page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
    await page.goto(base);await page.waitForFunction(()=>window.__emberdeep);
    await page.evaluate(async()=>{
      const {startRun,emptyBag}=await import("/src/game/run.ts"),{NO_PERKS}=await import("/src/game/catalog.ts");
      const {generateFloor}=await import("/src/game/dungeon.ts"),{createRng}=await import("/src/game/rng.ts");
      const s=startRun({seed:20261025,flasks:5,perks:NO_PERKS,weaponDamage:8,bag:{...emptyBag(),ward:1},runId:"late-boss"});
      s.floor=generateFloor(createRng(s.seed),7,{findPct:0});s.depth=s.deepest=7;
      const b=s.floor.dimlings.find(d=>d.boss);if(!b)throw new Error("Generated arena has no boss");
      s.floor.dimlings=[b];b.awake=true;s.player={x:b.x-1,y:b.y,facing:"right"};s.floor.seen.fill(1);
      window.__emberdeep.useGame.setState({runId:s.runId,runSpent:150,muted:true,reducedMotion:false,lastReport:null,animal:"cat-scottish-fold"});
      window.__emberdeep.useRun.setState({run:s,log:null,lastDescent:null});
    });
    await page.getByLabel("Lantern light",{exact:true}).waitFor();await page.waitForTimeout(350);
    const state=()=>page.evaluate(()=>{const s=window.__emberdeep.useRun.getState().run;return{light:s.light,events:s.events,boss:s.floor.dimlings.find(d=>d.boss),slain:s.bossSlain,status:s.status,hoard:s.floor.items.filter(i=>i.kind==="hoard").length};});
    const press=async(key,label)=>{if(screen==="phone"&&label)await page.getByRole("button",{name:label,exact:true}).tap();else await page.keyboard.press(key);await page.waitForTimeout(140);};
    const shot=name=>page.screenshot({path:`docs/screenshots/late-boss-${screen}-${name}.png`});
    const start=await state();await press("Space","Wait a turn");let s=await state();assert.equal(s.boss.phase,"windup");await shot("windup");
    await press("Space","Wait a turn");s=await state();assert.equal(start.light-s.light,45);assert(s.events.includes("bossDrain"));assert.equal(s.boss.cooldown,2);await shot("strike");
    const hit=s.light;for(let i=0;i<2;i++){await press("Space","Wait a turn");s=await state();assert(!s.events.includes("drain"));assert.equal(s.light,hit-(i+1)*2.5);if(i===0)await shot("recovery");}
    await press("Space","Wait a turn");await press("ArrowLeft","Move left");s=await state();assert(s.events.includes("miss"));await shot("dodge");
    await press("ArrowRight","Move right");await press("Space","Wait a turn");await press("Space","Wait a turn");assert.equal((await state()).boss.phase,"windup");
    await press("4");await press("Space","Wait a turn");s=await state();assert(!s.events.includes("bossDrain"));assert.equal(s.boss.cooldown,2);await shot("ward");
    let blows=0;while(!(await state()).slain&&blows<25){await press("ArrowRight","Move right");blows++;}
    s=await state();assert.equal(s.slain,true);assert.equal(s.hoard,1);assert.equal(s.status,"playing");await shot("defeated");
    await page.evaluate(()=>window.__emberdeep.useGame.setState({reducedMotion:true}));await page.waitForTimeout(200);await shot("still");
    results.push({screen,bossAnchor:{x:start.boss.x,y:start.boss.y},windup:true,strike:40,recoveryTurns:2,dodge:true,ward:true,slain:true,hoard:1,blows});await context.close();
  }
  assert.deepEqual(errors,[]);writeFileSync("docs/late-boss-qa.json",JSON.stringify({results,errors},null,2)+"\n");console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();}
