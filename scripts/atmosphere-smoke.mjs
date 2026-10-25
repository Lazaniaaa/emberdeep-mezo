// Isolated development fixtures: ordinary mobs, low-light HUD, and original Web Audio soundtrack.
// SMOKE_CHANNEL=msedge node scripts/atmosphere-smoke.mjs [baseUrl] [outDir]
import assert from "node:assert/strict";
import {mkdirSync,writeFileSync} from "node:fs";
import {chromium} from "playwright";
const base=process.argv[2]??"http://127.0.0.1:5741/",out=process.argv[3]??"artifacts/atmosphere";
mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:process.env.SMOKE_CHANNEL||"msedge"});
const errors=[],results={};
try {
  for(const [name,width,height] of [["desktop",1280,900],["phone",375,812]]) {
    const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();
    await page.addInitScript(()=>{
      const Original=window.AudioContext;window.__audioContexts=0;
      window.AudioContext=class extends Original {constructor(...args){super(...args);window.__audioContexts++;}};
    });
    page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
    await page.goto(base);await page.getByRole("button",{name:"Mute sound",exact:true}).waitFor();
    // Vite can version modules with ?t=. Inspect the instance actually imported by App, not a second bare-URL copy.
    const bindMusic=()=>page.evaluate(async()=>{
      const url=performance.getEntriesByType("resource").map(e=>e.name).find(n=>n.includes("/src/audio/music.ts"));
      window.__qaMusic=await import(url);
    });
    await bindMusic();
    const music=()=>page.evaluate(()=>{const {soundtrack}=window.__qaMusic;return {playing:soundtrack.playing,voices:soundtrack.activeVoices,effects:soundtrack.activeEffectVoices,contexts:window.__audioContexts};});
    assert.equal((await music()).playing,false,"music starts only after a gesture");
    await page.mouse.click(240,25);
    await page.waitForFunction(()=>window.__qaMusic.soundtrack.playing);
    await page.getByRole("button",{name:"Mute sound",exact:true}).click();
    await page.waitForFunction(()=>!window.__qaMusic.soundtrack.playing);
    assert.equal((await music()).voices,0);
    await page.reload();await page.getByRole("button",{name:"Unmute sound",exact:true}).waitFor();
    await bindMusic();
    assert.equal((await music()).playing,false,"mute survives reload");
    await page.getByRole("button",{name:"Unmute sound",exact:true}).click();
    await page.waitForFunction(()=>window.__qaMusic.soundtrack.playing);
    await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});document.dispatchEvent(new Event("visibilitychange"));});
    assert.deepEqual((({playing,voices})=>({playing,voices}))(await music()),{playing:false,voices:0});
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event("visibilitychange"));});
    await page.waitForFunction(()=>window.__qaMusic.soundtrack.playing);
    for(let i=0;i<3;i++) {
      await page.getByRole("button",{name:"Mute sound",exact:true}).click();
      await page.waitForFunction(()=>!window.__qaMusic.soundtrack.playing);
      await page.getByRole("button",{name:"Unmute sound",exact:true}).click();
      await page.waitForFunction(()=>window.__qaMusic.soundtrack.playing);
    }
    await page.waitForFunction(()=>window.__emberdeep);
    await page.evaluate(async()=>{
      const {startRun,emptyBag}=await import("/src/game/run.ts");const {NO_PERKS}=await import("/src/game/catalog.ts");
      const {generateFloor}=await import("/src/game/dungeon.ts");const {createRng}=await import("/src/game/rng.ts");
      const {ENEMIES}=await import("/src/game/enemies.ts");
      const s=startRun({seed:8801,flasks:5,weaponDamage:8,bag:emptyBag(),perks:{...NO_PERKS}});
      s.depth=8;s.floor=generateFloor(createRng(8),8,{findPct:0});s.floor.tiles.fill(1);s.floor.seen.fill(1);s.floor.props=[];s.floor.items=[];
      const positions=[[7,5],[10,5],[13,5],[7,8],[13,8],[7,11],[10,11],[13,11],[10,4]];
      s.floor.dimlings=ENEMIES.map((e,i)=>({id:i+1,species:e.id,x:positions[i][0],y:positions[i][1],hp:24,maxHp:24,awake:false,phase:"idle"}));
      s.player={x:10,y:8,facing:"down"};s.light=25;
      window.__emberdeep.useGame.setState({reducedMotion:true});window.__emberdeep.useRun.setState({run:s,prevPlayer:null,log:null});
    });
    await page.getByText("Radius 5",{exact:true}).waitFor();
    await page.waitForFunction(async()=>{
      const {ENEMIES}=await import("/src/game/enemies.ts");const {mobSheet}=await import("/src/render/mob-sheets.ts");
      return ENEMIES.every(e=>mobSheet(e.id));
    });
    await page.waitForTimeout(250);await page.screenshot({path:`${out}/mobs-${name}-25.png`});
    const radii=[];
    for(const [light,radius] of [[80,5],[25,5],[24,4],[20,4],[19,3],[10,3],[9,2],[5,2],[4,1]]) {
      await page.evaluate(light=>{const store=window.__emberdeep.useRun;store.setState({run:{...store.getState().run,light}});},light);
      await page.getByText(`Radius ${radius}`,{exact:true}).waitFor();radii.push({light,radius});
      if(light===24)await page.screenshot({path:`${out}/mobs-${name}-24.png`});
    }
    // SFX and music must use the same hardware context even after repeated screen/mute changes.
    await page.evaluate(async()=>{(await import("/src/audio/sfx.ts")).playSfx("gold",false);});
    const sound=await music();
    assert.equal(sound.playing,true,"music stopped when entering the descent");
    assert.equal(sound.contexts,1);assert(sound.effects<=24,"unbounded effect voices");
    results[name]={radii,music:sound,mutePersists:true,hiddenStops:true,fixture:"Flat procedural floor with all nine approved creatures; real RunView/HUD"};
    await context.close();
  }
  const page=await browser.newPage();await page.goto(base);
  const audio=await page.evaluate(async()=>{
    const {renderAudio}=await import('/src/audio/offline.ts');return renderAudio({kind:'music',id:'descent',seconds:16,light:1});
  });
  assert(audio.rms>0.001&&audio.peak<1&&audio.nonFinite===0,"silent or clipped soundtrack");
  writeFileSync(`${out}/descent-preview.wav`,Buffer.from(audio.base64,"base64"));delete audio.base64;results.audio=audio;
  assert.deepEqual(errors,[]);writeFileSync(`${out}/report.json`,JSON.stringify(results,null,2)+"\n");
  console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
