import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {describe,expect,it,vi} from 'vitest';
import {worldSounds,WORLD_KEYS} from '../src/audio/world';
import {mobSounds,MOB_IDS} from '../src/audio/mobs';
import {musicTracks} from '../src/audio/tracks';
import {ambienceSounds} from '../src/audio/ambience';
import {SynthEngine,musicCutoff,R} from '../src/audio/engine';
import {mockAudio} from '../src/audio/audio-mock';
import {parseAudioSettings} from '../src/audio/settings';
import {EVENT_CUES} from '../src/audio/event-cues';

const source=readFileSync('docs/audio/sound-lab.html','utf8').split('<script>')[1].split('</script>')[0];
function reference(){
  const calls:unknown[][]=[];
  const math=Object.create(Math);math.random=()=>.625;
  const context=vm.createContext({Math:math});
  vm.runInContext(source.slice(0,source.indexOf('document.addEventListener')),context);
  context.record=(...args:unknown[])=>calls.push(args);
  vm.runInContext("tone=(t,o)=>record('tone',t,o);noise=(t,o)=>record('noise',t,o);MF='music';AG='ambience';",context);
  return{context,calls};
}
function port(){
  const calls:unknown[][]=[],e={MF:'music',AMBB:'ambience',tone:(...args:unknown[])=>calls.push(['tone',...args]),noise:(...args:unknown[])=>calls.push(['noise',...args])} as unknown as SynthEngine;
  e.clicks=(t,n,span,o)=>{for(let i=0;i<n;i++)e.noise(t+Math.random()*span,{...o,f:R(o.f!,.4),g:R(o.g!,.4)});};
  return{e,calls,S:mobSounds(e,worldSounds(e))};
}
describe('approved Sound Lab parity',()=>{
  it('covers every RunEvent from the unchanged game type',()=>{
    const type=readFileSync('src/game/run.ts','utf8').split('export type RunEvent =')[1].split('export type PotionBag')[0];
    expect(Object.keys(EVENT_CUES).sort()).toEqual([...type.matchAll(/"([A-Za-z]+)"/g)].map(m=>m[1]).sort());
  });
  it('has all 20 world cues and all nine species plus Cerberus w/s/d, identical parameters',()=>{
    const r=reference(),p=port();expect(WORLD_KEYS).toHaveLength(20);expect(MOB_IDS).toHaveLength(10);
    expect(Object.keys(p.S).sort()).toEqual(vm.runInContext('Object.keys(S).sort()',r.context));
    const random=vi.spyOn(Math,'random').mockReturnValue(.625);
    try{for(const key of Object.keys(p.S)){
      r.calls.length=0;p.calls.length=0;vm.runInContext(`S[${JSON.stringify(key)}](2)`,r.context);p.S[key as keyof typeof p.S](2);
      expect(JSON.stringify(p.calls),key).toBe(JSON.stringify(r.calls));
    }}finally{random.mockRestore();}
  });
  it('keeps every note and instrument in all three tracks identical over a whole loop',()=>{
    const r=reference(),p=port(),tracks=musicTracks(p.e);
    for(const id of ['camp','descent','boss'] as const){const T=tracks[id];expect(T.sd).toBe(vm.runInContext(`TR.${id}.sd`,r.context));
      for(let s=0;s<T.len;s++){r.calls.length=0;p.calls.length=0;vm.runInContext(`TR.${id}.play(${s},2)`,r.context);T.play(s,2);expect(JSON.stringify(p.calls),`${id}:${s}`).toBe(JSON.stringify(r.calls));}
    }
  });
  it('keeps all ambient events, gaps, and heartbeat parameters identical',()=>{
    const r=reference(),p=port(),a=ambienceSounds(p.e,'ambience' as unknown as AudioNode,0);
    const random=vi.spyOn(Math,'random').mockReturnValue(.625);
    try{for(const id of ['catacombs','mycelium','cinderworks','hollowglass'] as const){r.calls.length=0;p.calls.length=0;vm.runInContext(`AMB.${id}.ev(2)`,r.context);a.AMB[id].ev(2);expect(JSON.stringify(p.calls)).toBe(JSON.stringify(r.calls));expect(a.AMB[id].gap()).toBe(vm.runInContext(`AMB.${id}.gap()`,r.context));}
      r.calls.length=0;p.calls.length=0;vm.runInContext('heart(2)',r.context);a.heart(2);expect(JSON.stringify(p.calls)).toBe(JSON.stringify(r.calls));
    }finally{random.mockRestore();}
  });
  it('keeps the approved graph and caps simultaneous effects at 24, then releases them',()=>{
    const a=mockAudio(),e=new SynthEngine(a.get());expect(e.FXB.gain.value).toBe(.8);expect(e.MUB.gain.value).toBe(.55);expect(e.filter.Q.value).toBe(.7);
    for(let i=0;i<40;i++)e.tone(0,{f:440});
    expect(a.ctx.createOscillator.mock.results.filter(r=>r.value.stop.mock.calls.some((c:number[])=>c[0]===0))).toHaveLength(16);
    for(let i=0;i<40;i++)e.tone((40-i)/100,{f:440,d:.5});
    for(let t=0;t<1;t+=.01){a.ctx.currentTime=t;expect(e.activeEffectVoices).toBeLessThanOrEqual(24);}
    e.stop();expect(e.activeVoices).toBe(0);expect(musicCutoff(1)).toBe(8800);expect(musicCutoff(0)).toBe(400);
  });
  it('validates independent audio settings without touching the save',()=>{
    expect(parseAudioSettings('broken')).toEqual({music:.55,effects:.8});expect(parseAudioSettings('{"music":2,"effects":-1}')).toEqual({music:1,effects:0});
  });
});
