import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { ENEMY_HIT_MULT } from "../src/game/config";
import { simulateFogMany, simulateDiveRun } from "../src/game/sim";

it("records depth, deaths, gold and Cerberus reach/kill frequencies", () => {
  const phase=process.env.LANTERN_PHASE??"after";
  if(!["before","after"].includes(phase))throw new Error("Invalid metrics phase");
  const collectors=[1,2,3,5].map(flasks=>({flasks,runs:80,...simulateFogMany(80,flasks)}));
  const divers=[3,5].map(flasks=>{
    const runs=Array.from({length:40},(_,i)=>simulateDiveRun(1000+i*7919,flasks));
    return{flasks,runs:runs.length,avgDepth:runs.reduce((n,r)=>n+r.depth,0)/runs.length,
      bossReachRate:runs.filter(r=>r.depth>=7).length/runs.length,bossKillRate:runs.filter(r=>r.bossSlain).length/runs.length};
  });
  writeFileSync(`docs/lantern-boss-${phase}.json`,JSON.stringify({phase,enemyHitMultiplier:ENEMY_HIT_MULT,collectors,divers},null,2)+"\n");
});
