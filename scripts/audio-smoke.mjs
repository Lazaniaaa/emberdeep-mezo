import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
const base=process.argv[2]??'http://127.0.0.1:5741/';assert(['localhost','127.0.0.1'].includes(new URL(base).hostname));
mkdirSync('artifacts/audio',{recursive:true});
const browser=await chromium.launch({channel:process.env.SMOKE_CHANNEL||'msedge'}),errors=[],stages=[];
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(()=>{
    const connect=AudioNode.prototype.connect;
    window.__audioCapture={contexts:[],recorders:[],chunks:[],analysers:[],starts:0};
    AudioNode.prototype.connect=function(...args){
      const result=connect.apply(this,args),q=window.__audioCapture;
      if(args[0]===this.context.destination){
        const ctx=this.context,dest=ctx.createMediaStreamDestination(),analyser=ctx.createAnalyser();analyser.fftSize=2048;
        connect.call(this,analyser);connect.call(analyser,dest);
        const chunks=[],rec=new MediaRecorder(dest.stream,{mimeType:'audio/webm;codecs=opus'});
        rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};rec.start(200);
        q.contexts.push(ctx);q.recorders.push(rec);q.chunks.push(chunks);q.analysers.push(analyser);
      }
      return result;
    };
    const start=OscillatorNode.prototype.start;OscillatorNode.prototype.start=function(...args){window.__audioCapture.starts++;return start.apply(this,args);};
  });
  const page=await context.newPage();await page.route('**/favicon.ico',r=>r.fulfill({status:204}));
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(base);await page.waitForFunction(()=>window.__emberdeep);
  // No sound before a user gesture.
  assert.equal(await page.evaluate(()=>window.__audioCapture.contexts.length),0);
  const hint=page.getByRole('button',{name:/got it/i});if(await hint.count())await hint.first().click();
  await page.mouse.click(2,200);
  const sample=async(label)=>{
    await page.waitForTimeout(700);
    const data=await page.evaluate(async()=>{
      const {soundtrack}=window.__emberdeepAudio,q=window.__audioCapture;
      let peak=0;for(const a of q.analysers){const d=new Float32Array(a.fftSize);a.getFloatTimeDomainData(d);for(const v of d)peak=Math.max(peak,Math.abs(v));}
      return{track:soundtrack.currentTrack,scene:soundtrack.currentScene,playing:soundtrack.playing,activeVoices:soundtrack.activeVoices,contexts:q.contexts.length,states:q.contexts.map(c=>c.state),peak,starts:q.starts};
    });stages.push({label,...data});return data;
  };
  const camp=await sample('camp');assert.equal(camp.track,'camp');
  await page.getByLabel('Audio settings',{exact:true}).click();
  for(const [label,value]of [['Music volume','35'],['Effects volume','65']])await page.getByLabel(label,{exact:true}).fill(value);
  const settings=await page.evaluate(()=>JSON.parse(localStorage.getItem('emberdeep-audio-v1')));assert.deepEqual(settings,{music:.35,effects:.65});
  await page.getByLabel('Audio settings',{exact:true}).click();
  await page.getByRole('button',{name:'Open Ember Altar',exact:true}).click();await page.getByRole('button',{name:/^Mint$/}).first().click();
  await page.getByRole('button',{name:'Equip and return to camp',exact:true}).click();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Open Dungeon Gate',exact:true}).click();await page.getByRole('button',{name:/Light it and descend/}).click();
  await page.getByLabel('Lantern light',{exact:true}).waitFor();await page.waitForTimeout(600);
  assert.equal((await sample('descent')).track,'descent');
  const beforeSettings=await page.evaluate(()=>window.__emberdeep.useRun.getState().run.steps);
  await page.getByLabel('Audio settings',{exact:true}).focus();await page.keyboard.press('Space');
  await page.getByLabel('Music volume',{exact:true}).focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>window.__emberdeep.useRun.getState().run.steps),beforeSettings,'Sliders must not submit game turns');
  await page.getByLabel('Audio settings',{exact:true}).click();await page.evaluate(()=>document.activeElement?.blur());
  // Real game actions on the generated floor; a deterministic dev fixture places an archer on an existing floor cell.
  await page.evaluate(()=>{
    const {useRun}=window.__emberdeep,s=structuredClone(useRun.getState().run),f=s.floor;
    let pair=null;for(let y=2;y<f.h-2&&!pair;y++)for(let x=2;x<f.w-2;x++)if(f.tiles[y*f.w+x]===1&&f.tiles[y*f.w+x+1]===1){pair={x,y};break;}
    if(!pair)throw new Error('No adjacent floor cells');s.player={...pair,facing:'right'};s.floor.props=[];s.floor.items=[];
    s.floor.dimlings=[{id:9001,x:pair.x+1,y:pair.y,hp:100,maxHp:100,awake:true,species:'chaincoil',phase:'idle',aim:null}];
    s.light=s.maxLight*.5;useRun.setState({run:s,log:null});
  });
  for(let i=0;i<5;i++){await page.keyboard.press('ArrowRight');await page.waitForTimeout(300);}
  const combat=await sample('archer combat');assert(combat.peak>0);assert(combat.contexts===1);
  await page.screenshot({path:'artifacts/audio/game-combat.png'});
  // Actual low-light state and next game action, then natural death through applyAction.
  await page.evaluate(()=>{const{useRun}=window.__emberdeep,s=structuredClone(useRun.getState().run);s.light=s.maxLight*.15;useRun.setState({run:s});});
  assert((await sample('15 percent light')).scene.light<=.25);
  await page.getByRole('button',{name:'Mute sound',exact:true}).click();assert.equal((await sample('muted')).activeVoices,0);
  await page.getByRole('button',{name:'Unmute sound',exact:true}).click();
  // Emulate document visibility via the same event the application observes.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal((await sample('hidden')).playing,false);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal((await sample('visible')).playing,true);
  // A real generated boss floor and actual wait actions exercise descent -> boss without a second context.
  await page.evaluate(async()=>{
    const{generateFloor}=await import('/src/game/dungeon.ts'),{createRng}=await import('/src/game/rng.ts'),{attackTiles}=await import('/src/game/enemy-ai.ts');
    const{useRun}=window.__emberdeep,s=structuredClone(useRun.getState().run),floor=generateFloor(createRng(777),7,{findPct:0}),boss=floor.dimlings.find(d=>d.boss);
    if(!boss)throw new Error('No Cerberus on floor 7');floor.dimlings=[boss];
    const spot=attackTiles(floor,boss)[0];if(!spot)throw new Error('No open boss attack tile');
    s.depth=7;s.deepest=7;s.floor=floor;s.player={...spot,facing:'right'};s.maxLight=400;s.light=300;s.ward=0;
    useRun.setState({run:s,log:null});for(let i=0;i<4&&!useRun.getState().run.floor.dimlings[0].awake;i++)useRun.getState().act({type:'wait'});
  });
  await page.waitForTimeout(700);assert.equal((await sample('Cerberus awake')).track,'boss');
  for(let i=0;i<4;i++){await page.keyboard.press('.');await page.waitForTimeout(300);}
  await sample('Cerberus fight');
  await page.screenshot({path:'artifacts/audio/game-boss.png'});
  await page.evaluate(()=>{const{useRun}=window.__emberdeep,s=structuredClone(useRun.getState().run);s.light=.01;s.nightVision=0;s.bag.nightVision=0;useRun.setState({run:s});useRun.getState().act({type:'wait'});});
  const status=await page.evaluate(()=>window.__emberdeep.useRun.getState().run.status);assert.equal(status,'dead');
  await sample('death');await page.waitForTimeout(2200);
  await page.evaluate(()=>window.__emberdeep.useRun.getState().clear());await sample('return to camp');await page.keyboard.press('Escape');
  await page.setViewportSize({width:375,height:812});await page.getByLabel('Audio settings',{exact:true}).click();
  await page.getByLabel('Effects volume',{exact:true}).fill('60');
  await page.screenshot({path:'artifacts/audio/game-phone-settings.png'});
  // Save a real audio recording, not a silent screen video.
  const recordings=await page.evaluate(async()=>{
    const q=window.__audioCapture;return Promise.all(q.recorders.map((r,i)=>new Promise(resolve=>{
      r.onstop=async()=>{const b=new Uint8Array(await new Blob(q.chunks[i],{type:r.mimeType}).arrayBuffer());let s='';for(let k=0;k<b.length;k+=16384)s+=String.fromCharCode(...b.subarray(k,k+16384));resolve(btoa(s));};r.stop();
    })));
  });
  recordings.forEach((b,i)=>writeFileSync(`artifacts/audio/game-edge-${i}.webm`,Buffer.from(b,'base64')));
  assert.equal(errors.length,0);assert(stages.some(s=>s.peak>0));
  writeFileSync('artifacts/audio/game-qa.json',JSON.stringify({channel:process.env.SMOKE_CHANNEL||'msedge',settings,stages,errors,recordings:recordings.length,passed:true},null,2)+'\n');
  console.log(JSON.stringify({stages:stages.map(s=>({label:s.label,track:s.track,peak:s.peak})),errors,recordings:recordings.length}));
}finally{await browser.close();}
