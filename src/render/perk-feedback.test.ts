import {describe,expect,it} from 'vitest';
import {NO_PERKS}from'@/game/catalog';
import {applyAction,emptyBag,startRun}from'@/game/run';
import {turnCues}from'@/audio/event-cues';
import {CreatureAnimator}from'./creature-anim';
import {turnEffects}from'./hero-anim';
import{riftEstimate,wardBlockedIds}from'./turn-feedback';
function room(){const s=startRun({seed:7,flasks:5,perks:{...NO_PERKS},weaponDamage:8,bag:emptyBag()});s.floor.tiles.fill(1);s.floor.seen.fill(1);s.floor.items=[];s.floor.props=[];s.floor.dimlings=[{id:1,x:7,y:6,hp:100,maxHp:100,species:'wickgnaw' as const,awake:true,phase:'windup' as const,windupLeft:1,aim:null}];s.player={x:6,y:6,facing:'right' as const};return s;}
describe('resolved perk presentation',()=>{
  it('shows an Interrupt and never animates or sounds the cancelled creature strike',()=>{
    const s=room();s.levelPerks=[{id:'interrupt',rank:1}];const n=applyAction(s,{type:'move',dx:1,dy:0});
    expect(turnCues(s,n).some(c=>c.name==='wickgnaw:s'||c.name==='hurt')).toBe(false);
    const fx=turnEffects(s,n,100).fx;expect(fx.some(f=>f.kind==='text'&&f.text==='INTERRUPT')).toBe(true);expect(fx.some(f=>f.kind==='impact')).toBe(false);
    const a=new CreatureAnimator();a.updateRun(s,0);a.updateRun(n,100);expect(a.pose(n.floor.dimlings[0],150).striking).toBe(false);
  });
  it('does not show a boss Ward when a normal strike was blocked in the same turn',()=>{
    const s=room();s.levelPerks=[{id:'stone-ward',rank:2}];s.floor.dimlings.push({id:2,x:5,y:7,hp:150,maxHp:150,species:'wickgnaw',awake:true,phase:'windup',windupLeft:1,aim:null,boss:true,size:2});
    const n=applyAction(s,{type:'wait'});expect(n.events).toContain('bossDrain');expect([...wardBlockedIds(s,n)]).toEqual([1]);
    const cues=turnCues(s,n);expect(cues.filter(c=>c.name==='ward')).toHaveLength(1);expect(cues.filter(c=>c.name==='hurt')).toHaveLength(1);
  });
  it('includes already-earned free Momentum steps in the walking estimate',()=>{const s=room();s.floor.spawn={x:6,y:8};s.momentumSteps=3;expect(riftEstimate(s)).toEqual({steps:2,light:0});});
});
