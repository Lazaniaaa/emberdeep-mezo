import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
const base=process.argv[2]??'http://127.0.0.1:5741/';
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname));
mkdirSync('artifacts/audio',{recursive:true});mkdirSync('docs/audio',{recursive:true});
const browser=await chromium.launch({channel:process.env.SMOKE_CHANNEL||'msedge'}),errors=[],files=[];
try{
  const page=await browser.newPage();await page.route('**/favicon.ico',r=>r.fulfill({status:204}));
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(`${m.text()} ${m.location().url}`);});
  await page.goto(new URL('docs/audio/sound-lab.html',base).href);
  // Open and play the owner's actual reference, including its low-light mode, before rendering the port.
  for(const selector of ['[data-s="hit"]','[data-s="chaincoil:w"]','[data-s="cerberus:s"]','[data-m="camp"]']){
    await page.locator(selector).click();await page.waitForTimeout(350);
  }
  await page.locator('[data-m="camp"]').click();
  const manifest=await page.evaluate(async()=>{const m=await import('/src/audio/offline.ts');return m.audioManifest;});
  const jobs=[...manifest.sounds.map(id=>({kind:'sfx',id,seconds:5})),
    ...manifest.tracks.flatMap(id=>[1,.15].map(light=>({kind:'music',id,seconds:30,light}))),
    ...manifest.ambiences.map(id=>({kind:'ambience',id,seconds:20}))];
  for(const job of jobs){
    const result=await page.evaluate(async request=>(await import('/src/audio/offline.ts')).renderAudio(request),job);
    const {base64,...metrics}=result,name=`${job.kind}-${job.id.replaceAll(':','-')}${job.kind==='music'?`-${Math.round(job.light*100)}pct`:''}.wav`,path=`artifacts/audio/${name}`;
    writeFileSync(path,Buffer.from(base64,'base64'));const passed=metrics.nonFinite===0&&metrics.peak>1e-6&&metrics.peak<1&&metrics.rms>1e-7;
    files.push({...job,path,...metrics,passed});console.log(`${passed?'PASS':'FAIL'} ${name} ${metrics.peakDb.toFixed(2)} dBFS`);
  }
  const report={spec:'docs/audio/sound-lab.html',channel:process.env.SMOKE_CHANNEL||'msedge',sampleRate:44100,format:'stereo IEEE float WAV, unnormalized',files,errors,passed:files.every(f=>f.passed)&&errors.length===0};
  writeFileSync('docs/audio-qa.json',JSON.stringify(report,null,2)+'\n');assert(report.passed,'Audio QA failed; see docs/audio-qa.json');
}finally{await browser.close();}
