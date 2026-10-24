import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { ENEMY_HIT_MULT, FIELD_GOLD_PER_CENT } from "../src/game/config";
import { simulateFogMany, simulateDiveRun } from "../src/game/sim";

it("records mycelium layout balance using the pre-change cohort seeds", () => {
  const collectors=[1,2,3,5].map(flasks=>({flasks,runs:80,...simulateFogMany(80,flasks)}));
  const divers=[3,5].map(flasks=>{
    const runs=Array.from({length:40},(_,i)=>simulateDiveRun(1000+i*7919,flasks));
    return{flasks,runs:runs.length,avgDepth:runs.reduce((n,r)=>n+r.depth,0)/runs.length,
      deathRate:runs.filter(r=>r.died).length/runs.length,
      bossReachRate:runs.filter(r=>r.depth>=7).length/runs.length,bossKillRate:runs.filter(r=>r.bossSlain).length/runs.length};
  });
  writeFileSync("docs/mycelium-after.json",JSON.stringify({enemyHitMultiplier:ENEMY_HIT_MULT,fieldGoldPerCent:FIELD_GOLD_PER_CENT,collectors,divers},null,2)+"\n");
});
