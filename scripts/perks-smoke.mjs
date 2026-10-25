import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync}from'node:fs';
import {chromium}from'playwright';
const base=process.argv[2]??'http://127.0.0.1:5741/';assert(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const route=JSON.parse(readFileSync('artifacts/perks/browser-route.json','utf8'));mkdirSync('artifacts/perks',{recursive:true});mkdirSync('docs/screenshots',{recursive:true});
const browser=await chromium.launch({channel:process.env.SMOKE_CHANNEL||'msedge'}),errors=[],results=[];
try{
 for(const[name,width,height]of[['desktop',1440,1000],['phone',375,812]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:name==='phone',hasTouch:name==='phone',recordVideo:{dir:'artifacts/perks',size:{width,height}}}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base);await page.waitForFunction(()=>window.__emberdeep);
  const hint=page.getByRole('button',{name:/got it/i});if(await hint.count())await hint.first().click();
  await page.evaluate(async setup=>{
    // Exercise production-default rules even when the owner's optional VITE_DROP_OIL preview is set locally.
    const resource=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/game/tuning.ts');
    const{tuning,DEFAULT_TUNING}=await import(resource?.name??'/src/game/tuning.ts');tuning.dropOil=DEFAULT_TUNING.dropOil;
    window.__emberdeep.useGame.setState({muted:true});window.__emberdeep.useRun.getState().start(setup);
  },route.setup);
  await page.getByLabel('Lantern light',{exact:true}).waitFor();
  let choices=0,paused=false,rankTwo=false,index=0;
  for(;index<route.moves.length;index++){
   const code=route.moves[index];
   if(code.startsWith('K')){
    const id=code.slice(1),dialog=page.getByRole('dialog');await dialog.waitFor();
    const state=await page.evaluate(()=>{const s=window.__emberdeep.useRun.getState().run;return{level:s.level,choice:s.perkChoice,steps:s.steps,light:s.light};});
    assert(state.choice.options.includes(id));
    if(!paused){
     await page.keyboard.press('Escape');await page.mouse.click(1,height-1);assert(await dialog.isVisible());
     await page.evaluate(()=>window.__emberdeep.useRun.getState().act({type:'wait'}));
     assert.deepEqual(await page.evaluate(()=>{const s=window.__emberdeep.useRun.getState().run;return{steps:s.steps,light:s.light};}),{steps:state.steps,light:state.light});
     await page.screenshot({path:`docs/screenshots/perks-${name}-choice.png`});paused=true;
    }
    await page.waitForTimeout(650);
    if(name==='phone')await page.locator(`[data-perk-option="${id}"]`).tap();else if(choices%2===0)await page.locator(`[data-perk-option="${id}"]`).click();else await page.keyboard.press(String(state.choice.options.indexOf(id)+1));
    choices++;await page.waitForTimeout(350);
    const after=await page.evaluate(()=>{const s=window.__emberdeep.useRun.getState().run;return{perks:s.levelPerks,level:s.level,light:s.light,steps:s.steps};});
    assert.equal(after.steps,state.steps);rankTwo=after.perks.some(p=>p.rank>=2);
    if(after.perks.length===4&&rankTwo){
      await page.screenshot({path:`docs/screenshots/perks-${name}-bar.png`});
      const bar=await page.getByRole('region',{name:'Descent perks'}).boundingBox(),log=await page.getByRole('region',{name:'Log',exact:true}).boundingBox(),potions=await page.getByRole('region',{name:'Potions',exact:true}).boundingBox();
      assert(bar&&log&&potions);assert(log.y+log.height<=bar.y,'Perk bar overlaps log');assert(potions.y+potions.height<=bar.y,'Perk bar overlaps potions');
      const first=page.getByRole('region',{name:'Descent perks'}).getByRole('button').first();if(name==='phone')await first.tap();else await first.click();assert(await page.getByRole('tooltip').isVisible());await page.mouse.click(1,height-1);
      results.push({name,viewport:{width,height},choices,level:after.level,perks:after.perks,bar,log,potions});
      break;
    }
   }else{
    // Real deterministic actions over the unmodified generated floor. No XP, ranks or grids are injected.
    await page.evaluate(async code=>{const{decodeMove}=await import('/src/game/replay.ts');window.__emberdeep.useRun.getState().act(decodeMove(code));},code);
    await page.waitForTimeout(35);
   }
  }
  assert(choices>=4&&rankTwo,'Showcase did not fill slots and upgrade');
  // Show real strikes/steps with the acquired perks after the panel is filled.
  for(const code of route.moves.slice(index+1,index+16)){
   if(code.startsWith('K'))break;await page.evaluate(async code=>{const{decodeMove}=await import('/src/game/replay.ts');window.__emberdeep.useRun.getState().act(decodeMove(code));},code);await page.waitForTimeout(100);
  }
  await page.waitForTimeout(1000);const video=page.video();await context.close();await video.saveAs(`artifacts/perks/perks-${name}.webm`);const original=await video.path();
  // Keep Playwright's native output too; both remain ignored local captures.
  assert(original);await video.delete();
 }
 assert.deepEqual(errors,[]);writeFileSync('artifacts/perks/browser-qa.json',JSON.stringify({seed:route.setup.seed,realReplay:true,results,errors,passed:true},null,2)+'\n');console.log(JSON.stringify({results,errors}));
}finally{await browser.close();}
