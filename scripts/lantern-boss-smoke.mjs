// Local-only rule/UI QA through actual keyboard/touch input. No wallet, purchases or live writes.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
const base=process.argv[2]??"http://127.0.0.1:5741/";
assert(["localhost","127.0.0.1"].includes(new URL(base).hostname));
const browser=await chromium.launch({channel:process.env.SMOKE_CHANNEL||"msedge"}),results=[],errors=[];
try{
  for(const [screen,width,height]of[["desktop",1440,1000],["phone",375,812]]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:screen==="phone"}),page=await context.newPage();
    page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
    await page.goto(base);await page.waitForFunction(()=>window.__emberdeep);
    const snapshot=()=>page.evaluate(()=>{const s=window.__emberdeep.useRun.getState().run;return{light:s.light,max:s.maxLight,steps:s.steps,bag:s.bag,events:s.events,boss:s.floor.dimlings.find(d=>d.boss),slain:s.bossSlain,items:s.floor.items};});
    const press=async(key,label)=>{
      try{if(screen==="phone"&&label)await page.getByRole("button",{name:label,exact:true}).tap();else await page.keyboard.press(key);}
      catch(error){console.error(screen,key,await snapshot());await shot("failure");throw error;}
      await page.waitForTimeout(130);
    };
    const shot=async name=>page.screenshot({path:`docs/screenshots/lantern-boss-${screen}-${name}.png`});
    await page.evaluate(()=>{window.__emberdeep.useGame.setState({muted:true,reducedMotion:false,lastReport:null,animal:"cat-scottish-fold"});});
    await page.evaluate(async()=>{
      const {startRun,emptyBag}=await import("/src/game/run.ts"),{NO_PERKS}=await import("/src/game/catalog.ts");
      const s=startRun({seed:7,flasks:1,perks:NO_PERKS,weaponDamage:8,bag:{...emptyBag(),oil:1,heal:1},runId:"lantern-qa"});
      s.floor.dimlings=[];s.floor.items=[];s.floor.props=[{id:999,x:s.player.x+1,y:s.player.y,kind:"urn",hp:1,maxHp:1,stash:{gold:0,crystals:0,oil:3}}];s.xp=9;
      window.__emberdeep.useGame.setState({runId:s.runId,runSpent:70});window.__emberdeep.useRun.setState({run:s,log:null,lastDescent:null});
    });
    await page.getByLabel("Lantern light",{exact:true}).waitFor();await page.waitForTimeout(350);
    assert.equal((await page.getByLabel("Lantern light",{exact:true}).textContent()).trim(),"80 / 80");
    await press("2");assert.equal((await snapshot()).bag.oil,1);
    await shot("full");await press("ArrowRight","Move right");
    let s=await snapshot();assert.equal(s.max,90);assert.equal(s.light,90);assert(s.events.includes("levelup"));
    await shot("level-up");await press("7");assert.equal((await snapshot()).bag.heal,1);
    await press("Space","Wait a turn");await press("2");s=await snapshot();assert.equal(s.light,90);assert.equal(s.bag.oil,0);
    await page.evaluate(async()=>{
      const {startRun,emptyBag}=await import("/src/game/run.ts"),{NO_PERKS}=await import("/src/game/catalog.ts");
      const {generateFloor,isFloor}=await import("/src/game/dungeon.ts"),{createRng}=await import("/src/game/rng.ts");
      const s=startRun({seed:20261024,flasks:5,perks:NO_PERKS,weaponDamage:8,bag:{...emptyBag(),ward:1},runId:"cerberus-rhythm-qa"});
      s.floor=generateFloor(createRng(s.seed),7,{findPct:0});s.depth=s.deepest=7;s.floor.items=[];s.floor.props=[];
      s.floor.dimlings=[{id:999,x:14,y:8,size:2,boss:true,awake:true,hp:150,maxHp:150,phase:"idle"}];
      s.player={x:13,y:8,facing:"right"};s.floor.seen.fill(1);
      if(!isFloor(s.floor,13,8)||!isFloor(s.floor,12,8))throw new Error("Boss fixture not on floor");
      window.__emberdeep.useGame.setState({runId:s.runId,runSpent:150});window.__emberdeep.useRun.setState({run:s,log:null,lastDescent:null});
    });
    await page.waitForTimeout(350);const start=(await snapshot()).light;
    await press("Space","Wait a turn");s=await snapshot();assert.equal(s.boss.phase,"windup");assert.equal(s.light,start-2.5);
    const danger=await page.evaluate(async()=>{const {attackTiles}=await import("/src/game/enemy-ai.ts");const s=window.__emberdeep.useRun.getState().run;return attackTiles(s.floor,s.floor.dimlings[0]);});
    assert.equal(danger.length,8);assert(danger.some(p=>p.x===13&&p.y===8));await shot("windup");
    await press("Space","Wait a turn");s=await snapshot();assert.equal(s.light,start-45);assert(s.events.includes("bossDrain"));assert.equal(s.boss.cooldown,2);await shot("strike");
    const afterHit=s.light;
    for(let i=0;i<2;i++){await press("Space","Wait a turn");s=await snapshot();assert(!s.events.includes("drain"));assert.equal(s.light,afterHit-(i+1)*2.5);if(i===0)await shot("recovery");}
    await shot("ready");await press("Space","Wait a turn");assert.equal((await snapshot()).boss.phase,"windup");
    await press("4");const wardLight=(await snapshot()).light;await press("Space","Wait a turn");s=await snapshot();assert.equal(s.light,wardLight-2.5);assert(!s.events.includes("drain"));assert.equal(s.boss.cooldown,2);await shot("ward");
    await press("Space","Wait a turn");await press("Space","Wait a turn");await press("Space","Wait a turn");
    await press("ArrowLeft","Move left");s=await snapshot();assert(s.events.includes("miss"));assert.equal(s.boss.phase,"recovery");
    await press("ArrowRight","Move right");
    let blows=0;
    while(!(await snapshot()).slain&&blows<30){await press("ArrowRight","Move right");blows++;}
    s=await snapshot();assert.equal(s.slain,true);assert.equal(s.items.filter(i=>i.kind==="hoard").length,1);assert(s.light<=s.max);await shot("defeated");
    results.push({screen,capHUD:"80 / 80 → 90 / 90",fullPotionsKept:true,windupTiles:danger.length,strike:40,recoveryTurns:2,ward:true,dodge:true,bossSlain:true,blows});
    await context.close();
  }
  assert.deepEqual(errors,[]);writeFileSync("docs/lantern-boss-qa.json",JSON.stringify({results,errors},null,2)+"\n");console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();}
