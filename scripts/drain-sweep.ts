// Pure module overrides for a reproducible parameter study; no price, loot, AI or source-file edits.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { it, vi } from "vitest";

it("measures ordinary-creature hit multipliers on identical seeds", async () => {
  const multipliers = (process.env.DRAIN_SWEEP ?? "1.25,2,2.5,3,4,5").split(",").map(Number);
  const runs = Number(process.env.DRAIN_RUNS ?? 30);
  const tag=process.env.DRAIN_TAG??"drain-sweep";
  if(!/^[a-z0-9-]+$/.test(tag))throw new Error("Invalid report tag");
  const rows = [];
  for (const multiplier of multipliers) {
    if (!(multiplier >= 1.25 && Number.isFinite(multiplier))) throw new Error("Invalid drain multiplier");
    vi.resetModules();
    vi.doMock("../src/game/config", async importOriginal => ({
      ...await importOriginal<typeof import("../src/game/config")>(), ENEMY_HIT_MULT: multiplier,
    }));
    const { simulateFogMany,simulateDiveRun } = await import("../src/game/sim");
    const one = simulateFogMany(runs,1), two = simulateFogMany(runs,2);
    const divers=process.env.DRAIN_DEPTHS?[3,5].map(flasks=>{
      const samples=Array.from({length:40},(_,i)=>simulateDiveRun(1000+i*7919,flasks));
      return{flasks,avgDepth:samples.reduce((n,r)=>n+r.depth,0)/40,bossReachRate:samples.filter(r=>r.depth>=7).length/40,bossKillRate:samples.filter(r=>r.bossSlain).length/40};
    }):undefined;
    const row = { multiplier, runs, one, two, efficiencyRatio: two.goldPerCent / one.goldPerCent,divers };
    rows.push(row);console.log(JSON.stringify(row));
  }
  vi.doUnmock("../src/game/config");vi.resetModules();
  const path=`docs/${tag}-${runs}.json`;
  const prior=existsSync(path)?JSON.parse(readFileSync(path,"utf8")):[];
  const merged=[...prior.filter((old: {multiplier: number})=>!rows.some(row=>row.multiplier===old.multiplier)),...rows]
    .sort((a,b)=>a.multiplier-b.multiplier);
  writeFileSync(path,JSON.stringify(merged,null,2)+"\n");
});
