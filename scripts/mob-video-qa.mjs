// Decode the recorded WebMs in the installed browser and save review frames. No external codec downloads.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const base=process.argv[2]??'http://127.0.0.1:5741/';
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const browser=await chromium.launch({channel:process.env.SMOKE_CHANNEL||'msedge'}),results=[];
mkdirSync('artifacts/mobs/video-review',{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1600,height:1024}});
  for(const phase of ['before','after']){
    await page.goto(new URL('mob-gallery.html',base).href);
    await page.setContent(`<style>body{margin:0;background:black}video{width:1600px;height:1024px}</style><video muted preload="auto" src="${new URL(`artifacts/mobs/gallery-${phase}.webm`,base).href}"></video>`);
    await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
    const metadata=await page.evaluate(()=>{const v=document.querySelector('video');return{duration:v.duration,width:v.videoWidth,height:v.videoHeight};});
    assert(metadata.duration>=18&&metadata.duration<26,'18-second tour plus short browser start/end');
    assert.equal(metadata.width,1600);assert.equal(metadata.height,1024);
    for(const [i,time]of[2.5,7,11.5,16].entries()){
      await page.evaluate(t=>new Promise(resolve=>{const v=document.querySelector('video');v.addEventListener('seeked',resolve,{once:true});v.currentTime=t;}),time);
      await page.screenshot({path:`artifacts/mobs/video-review/${phase}-${i}.png`});
    }
    results.push({phase,...metadata,decodedFrames:4});
  }
  writeFileSync('artifacts/mobs/video-qa.json',JSON.stringify(results,null,2)+'\n');console.log(results);
}finally{await browser.close();}
