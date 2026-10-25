import {mkdirSync,writeFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
import {NO_PERKS,WEAPONS} from '../src/game/catalog';
import type{RunAction,RunState}from '../src/game/run';
import {encodeMove,replayRun}from '../src/game/replay';
import{simulateDiveRun}from '../src/game/sim';
const tape=vi.hoisted(()=>({on:false,moves:[] as RunAction[],last:null as RunState|null}));
vi.mock('../src/game/run',async original=>{const r=await original<typeof import('../src/game/run')>();return{...r,applyAction:(s:RunState,a:RunAction)=>{const n=r.applyAction(s,a);if(tape.on&&n!==s){tape.moves.push(a);tape.last=n;}return n;}};});
// A legal showcase policy fills slots before upgrading, distinct from the economic bot policy.
vi.mock('../src/game/level-perks',async original=>{const p=await original<typeof import('../src/game/level-perks')>();return{...p,botPerkChoice:(s:RunState)=>s.perkChoice?.options.find(id=>!p.rankOf(s,id))??p.botPerkChoice(s)};});
it('writes a real replayable level 2-5 browser route without XP or grid fixtures',()=>{
  mkdirSync('artifacts/perks',{recursive:true});
  for(const seed of [77,7,1000,8919,4243,8918]){
    tape.moves=[];tape.on=true;try{simulateDiveRun(seed,5);}finally{tape.on=false;}
    const first=tape.moves.filter(a=>a.type==='perk').slice(0,4) as Extract<RunAction,{type:'perk'}>[];
    if(new Set(first.map(a=>a.id)).size!==4)continue;
    const setup={seed,flasks:5,perks:{...NO_PERKS},weaponDamage:WEAPONS.dagger.damage,bag:{nightVision:0,oil:0,flare:0,ward:0,rage:0,regen:0,heal:0}},moves=tape.moves.map(encodeMove);
    const result=replayRun(setup,moves);expect(result.state.levelPerks).toEqual(tape.last!.levelPerks);
    writeFileSync('artifacts/perks/browser-route.json',JSON.stringify({setup,moves,firstChoices:first.map(a=>a.id),summary:{depth:result.depth,gold:result.gold,level:result.state.level}},null,2)+'\n');return;
  }
  throw new Error('No showcase seed filled four slots in its first four choices');
});
