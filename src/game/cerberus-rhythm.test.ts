import { describe, expect, it } from "vitest";
import { NO_PERKS } from "./catalog";
import { BOSS_DRAIN, BOSS_MOVE_FACTOR, BOSS_RECOVERY } from "./config";
import { attackTiles } from "./enemy-ai";
import { applyAction, emptyBag, startRun } from "./run";

const room=()=>{
  const s=startRun({seed:42,flasks:5,perks:{...NO_PERKS,freeStepChance:1},weaponDamage:8,bag:{...emptyBag(),ward:1}});
  s.floor.tiles.fill(1);s.floor.seen.fill(1);s.floor.props=[];s.floor.items=[];
  s.player={x:6,y:7,facing:"right"};
  s.floor.dimlings=[{id:1,x:7,y:6,hp:150,maxHp:150,boss:true,size:2,awake:true}];return s;
};
const wait=(s:ReturnType<typeof room>)=>applyAction(s,{type:"wait"});

describe("Cerberus readable attack cycle",()=>{
  it("marks all eight edge tiles, excluding body, corners, walls and props",()=>{
    const s=room(),b=s.floor.dimlings[0];
    expect(attackTiles(s.floor,b)).toHaveLength(8);
    expect(attackTiles(s.floor,b)).toContainEqual({x:6,y:7});
    expect(attackTiles(s.floor,b)).not.toContainEqual({x:6,y:5});
    s.floor.props=[{id:2,x:6,y:7,kind:"crate",hp:2,maxHp:2}];
    s.floor.tiles[5*s.floor.w+7]=0;
    expect(attackTiles(s.floor,b)).toHaveLength(6);
  });
  it("warns, strikes once for 40, then spends two whole turns recovering without movement or drain",()=>{
    const s=room(),wind=wait(s);expect(BOSS_RECOVERY).toBe(2);expect(BOSS_MOVE_FACTOR).toBe(0.5);
    expect(wind.light).toBe(s.light);expect(wind.events).toContain("warn");
    expect(wind.floor.dimlings[0]).toMatchObject({phase:"windup",windupLeft:1});
    const hit=wait(wind);expect(wind.light-hit.light).toBe(BOSS_DRAIN);expect(hit.events).toContain("bossDrain");
    expect(hit.floor.dimlings[0]).toMatchObject({phase:"recovery",cooldown:2});
    const rest1=wait(hit),rest2=wait(rest1);
    for(const rest of [rest1,rest2]){expect(rest.light).toBe(hit.light);expect(rest.events).not.toContain("drain");
      expect(rest.floor.dimlings[0]).toMatchObject({x:7,y:6});}
    expect(rest1.floor.dimlings[0]).toMatchObject({phase:"recovery",cooldown:1});
    expect(rest2.floor.dimlings[0]).toMatchObject({phase:"idle",cooldown:0});
    const next=wait(rest2);expect(next.events).toContain("warn");expect(next.light).toBe(rest2.light);
  });
  it("advances on hero attack turns too, without passive contact drain",()=>{
    let s=room();const start=s.light;
    s=applyAction(s,{type:"move",dx:1,dy:0});expect(s.light).toBe(start);expect(s.steps).toBe(0);
    s=applyAction(s,{type:"move",dx:1,dy:0});expect(s.light).toBe(start-40);expect(s.steps).toBe(0);
    for(let i=0;i<2;i++)s=applyAction(s,{type:"move",dx:1,dy:0});
    expect(s.light).toBe(start-40);expect(s.events).not.toContain("drain");
  });
  it("misses a dodge and still recovers; Ward cancels a hit but not its recovery",()=>{
    const wind=wait(room());
    const dodge=applyAction(wind,{type:"move",dx:-1,dy:0});
    expect(dodge.light).toBe(wind.light);expect(dodge.events).toContain("miss");
    expect(dodge.floor.dimlings[0]).toMatchObject({phase:"recovery",cooldown:2});
    const ward=applyAction(wind,{type:"potion",id:"ward"}),blocked=wait(ward);
    expect(blocked.light).toBe(ward.light);expect(blocked.events).not.toContain("bossDrain");
    expect(blocked.floor.dimlings[0]).toMatchObject({phase:"recovery",cooldown:2});
  });
});
