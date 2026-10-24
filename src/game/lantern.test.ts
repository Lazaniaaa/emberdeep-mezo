import { describe, expect, it } from "vitest";
import { NO_PERKS } from "./catalog";
import { xpToNext } from "./levels";
import { lanternFullness, lootWeights, propDef } from "./props";
import { applyAction, emptyBag, startRun } from "./run";
import { withTuning } from "./tuning";

const room=()=>{
  const s=startRun({seed:7,flasks:1,perks:{...NO_PERKS,freeStepChance:1},weaponDamage:100,bag:{...emptyBag(),oil:2,heal:2}});
  s.floor.tiles.fill(1);s.floor.props=[];s.floor.items=[];s.floor.dimlings=[];
  s.player={x:6,y:6,facing:"right"};return s;
};
const right=(s:ReturnType<typeof room>)=>applyAction(s,{type:"move",dx:1,dy:0});
const foe={id:9,x:7,y:6,hp:1,maxHp:1,awake:false,species:"wickgnaw" as const};

describe("bounded lantern",()=>{
  it("starts at flasks x 80 plus the start-light perk",()=>{
    const s=startRun({seed:1,flasks:3,perks:{...NO_PERKS,startLight:17},weaponDamage:8,bag:emptyBag()});
    expect([s.light,s.startLight,s.maxLight]).toEqual([257,257,257]);
  });
  it.each(["oil","heal"] as const)("caps %s, loses excess, and keeps a full-lantern potion without a turn or RNG roll",id=>{
    const s=room();s.light=79;
    const n=applyAction(s,{type:"potion",id});
    expect(n.light).toBe(80);expect(n.bag[id]).toBe(1);expect(n.used[id]).toBe(1);
    expect(n.messages[0]).toMatch(/lantern full/i);
    const full=applyAction(n,{type:"potion",id});
    expect([full.light,full.maxLight,full.bag[id],full.used[id],full.steps]).toEqual([80,80,1,1,0]);
    expect(full.rng).toEqual(n.rng);expect(full.messages[0]).toMatch(/potion kept/i);
  });
  it("caps oil jars and props, while still collecting the floor find or breaking the prop",()=>{
    const s=room();s.light=79;s.floor.items=[{id:1,x:7,y:6,kind:"oil"}];
    const jar=right(s);expect(jar.light).toBe(80);expect(jar.floor.items).toHaveLength(0);
    expect(jar.events).toContain("lanternFull");
    s.floor.items=[];s.floor.props=[{id:2,x:7,y:6,kind:"sack",hp:1,maxHp:1,stash:{gold:0,crystals:0,oil:5}}];
    const prop=right(s);expect(prop.light).toBe(80);expect(prop.floor.props).toHaveLength(0);
    expect(prop.drops?.[0].light).toBe(1);expect(prop.events).toContain("lanternFull");
  });
  it("caps creature oil and Emberblade separately, including a boss kill before level-up refills",()=>{
    const s=room();s.light=79;s.floor.dimlings=[{...foe}];
    const oil=withTuning({killDropChance:[1,1],killDropLight:[20,20]},()=>right(s));
    expect(oil.light).toBe(80);expect(oil.drops?.[0].light).toBe(1);expect(oil.events).toContain("lanternFull");
    s.perks.lightOnKill=50;
    const ember=withTuning({killDropChance:[0,0]},()=>right(s));
    expect(ember.light).toBe(80);expect(ember.events).toContain("lanternFull");
    s.floor.dimlings=[{...foe,boss:true,size:2}];
    const boss=right(s);expect(boss.bossSlain).toBe(true);
    expect(boss.light).toBe(boss.maxLight);expect(boss.events).toContain("lanternFull");
    expect(boss.maxLight).toBe(80+10*((boss.level??1)-1));
  });
  it("caps potion and passive regeneration on both free steps and attack turns",()=>{
    const s=room();s.regen=5;s.perks.regenEvery=1;
    const step=applyAction(s,{type:"wait"});expect(step.light).toBe(80);expect(step.regen).toBe(4);
    expect(step.events).toContain("lanternFull");
    s.floor.props=[{id:2,x:7,y:6,kind:"crate",hp:2,maxHp:2}];
    const attack=right(s);expect(attack.light).toBe(80);expect(attack.regen).toBe(4);expect(attack.steps).toBe(0);
    expect(attack.events).toContain("lanternFull");
  });
  it("raises capacity and current light by exactly ten for every new level",()=>{
    const s=room();s.light=70;s.xp=xpToNext(1)-1;s.floor.dimlings=[{...foe}];
    const n=withTuning({killDropChance:[0,0]},()=>right(s));
    expect(n.level).toBe(2);expect([n.maxLight,n.light]).toEqual([90,80]);
    expect(n.messages.some(m=>m.includes("+10 max light"))).toBe(true);
    s.light=80;s.xp=xpToNext(1)+xpToNext(2)-1;
    const multi=withTuning({killDropChance:[0,0]},()=>right(s));
    expect(multi.level).toBe(3);expect([multi.maxLight,multi.light]).toEqual([100,100]);
  });
  it("uses grown capacity, rather than the initial fill, for oil fullness",()=>{
    expect(lanternFullness(80,160)).toBe(0.5);
    expect(lootWeights(propDef("urn"),80,160).oil).toBeGreaterThan(lootWeights(propDef("urn"),80,80).oil);
    let drops=0;
    withTuning({killDropChance:[0,1],killDropLight:[1,1]},()=>{
      for(let seed=1;seed<=200;seed++){
        const s=room();s.rng.s=seed;s.maxLight=160;s.floor.dimlings=[{...foe}];
        if(right(s).events.includes("oil"))drops++;
      }
    });
    expect(drops).toBeGreaterThan(60);expect(drops).toBeLessThan(140);
  });
});
