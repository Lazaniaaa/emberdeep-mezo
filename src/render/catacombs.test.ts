import { describe, expect, it } from "vitest";
import { NO_PERKS } from "@/game/catalog";
import { footprint, idx } from "@/game/dungeon";
import { emptyBag, startRun } from "@/game/run";
import { CatacombsDecor, catacombsDecorAt, catacombsRow, decorOccupants, usesCatacombsTiles } from "./catacombs";

const run = () => startRun({ seed: 20261024, flasks: 5, perks: NO_PERKS, weaponDamage: 16, bag: emptyBag(), runId: "decor-test" });
const storage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};

describe("catacombs visual layer", () => {
  it("uses bricks only immediately above floor, with rock on side/bottom edges and in deep walls", () => {
    const f = { w: 5, h: 5, tiles: [0,0,0,0,0, 0,0,0,0,0, 0,1,1,1,0, 0,1,1,1,0, 0,0,0,0,0] };
    expect([1,2,3].map(x => catacombsRow(f,x,1))).toEqual([2,2,2]);
    for (const [x,y] of [[0,2],[4,2],[2,4],[2,0]]) expect(catacombsRow(f,x,y)).toBe(1);
    expect(catacombsRow(f,2,2)).toBe(0);
    expect([1,2,3,4,5,6,7].map(usesCatacombsTiles)).toEqual([true,true,false,false,false,false,false]);
  });

  it("reserves all spawn footprints and exits across movement, broken props and reload without mutating the run", () => {
    const s = run(), original = JSON.stringify(s), save = storage(), decor = new CatacombsDecor(s,save);
    const reserved = decorOccupants(s.floor);
    expect(decor.blocked).toEqual(reserved);
    for (const p of [s.floor.spawn,s.floor.stairs,...s.floor.props,...s.floor.items,...s.floor.dimlings.flatMap(footprint)]) {
      expect(decor.blocked?.has(idx(s.floor,p.x,p.y))).toBe(true);
    }
    expect(JSON.stringify(s)).toBe(original);
    const moved = structuredClone(s); moved.steps++; moved.floor.props = []; moved.floor.items = []; moved.floor.dimlings = [];
    const restored = new CatacombsDecor(moved,save);
    expect(restored.blocked).toEqual(reserved);
    expect(new CatacombsDecor({...moved,seed:s.seed+1},save).blocked).toBe(null);
    expect(new CatacombsDecor(moved,{getItem:()=>'{broken',setItem:()=>{}}).blocked).toBe(null);
  });

  it("never decorates reserved spawns, current occupants or walls and keeps selection deterministic", () => {
    const s = run(), f = s.floor, reserved = decorOccupants(f), current = new Set<number>();
    let count = 0;
    for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
      const d = catacombsDecorAt(f,x,y,reserved,current), k=idx(f,x,y);
      expect(catacombsDecorAt(f,x,y,reserved,current)).toBe(d);
      if(d===null)continue;
      count++;expect(f.tiles[k]).toBe(1);expect(reserved.has(k)).toBe(false);
      expect(catacombsDecorAt(f,x,y,reserved,new Set([k]))).toBe(null);
      expect(catacombsDecorAt(f,x,y,null,current)).toBe(null);
    }
    expect(count).toBeGreaterThan(3);
  });
});
