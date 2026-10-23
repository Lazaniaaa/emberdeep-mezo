import { describe, expect, it } from "vitest";
import { distances, footprint, generateFloor, idx, type Point } from "./dungeon";
import { PAINTED_FLOORS } from "./painted-floors";
import { createRng } from "./rng";

const exits = [[26,10],[28,9],[26,6],[22,7],[22,8],[23,8],[13,3]];
const near = (a: Point,b: Point) => Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y)) <= 2;
describe("painted map collision and placement", () => {
  it("keeps painted landmarks blocked and the narrow passages one tile wide", () => {
    // Independently reviewed torch/pillar/well-edge cells and corridor cross sections, not random samples of the mask.
    const blocked = [
      [[10,9],[20,11],[25,10],[27,10]],
      [[10,8],[27,8],[29,10],[17,16]],
      [[6,4],[25,5],[28,7],[31,9]],
      [[9,7],[9,9],[12,6],[14,6],[7,11],[4,5],[23,5],[11,4],[15,4]],
      [[12,6],[14,6],[12,11],[14,11],[21,7],[23,9]],
      [[12,5],[14,5],[13,8],[12,8],[14,8],[22,7],[24,9]],
      [[7,6],[19,6],[12,14],[14,14]],
    ];
    for(let depth=1;depth<=7;depth++) {
      const f=generateFloor(createRng(1),depth,{findPct:0});
      for(const [x,y] of blocked[depth-1]) expect(f.tiles[idx(f,x,y)],`${depth}: ${x},${y}`).toBe(0);
      expect([f.stairs.x,f.stairs.y]).toEqual(exits[depth-1]);
    }
    for(const depth of [5,6]) {
      const f=generateFloor(createRng(1),depth,{findPct:0});
      for(const y of [5,11]) expect([12,13,14].map(x=>f.tiles[idx(f,x,y)])).toEqual([0,1,0]);
    }
  });

  for(let depth=1;depth<=7;depth++) it(`depth ${depth}: 200 seeds stay on the trace, connected, clear of exits and without overlaps`, () => {
    const mask=PAINTED_FLOORS[depth];
    expect(mask.rows.join("").match(/S/g)).toHaveLength(1);
    expect(mask.rows.join("").match(/R/g)).toHaveLength(1);
    for(let seed=1;seed<=200;seed++) {
      const f=generateFloor(createRng(seed*7919+depth),depth,{findPct:seed%3===0?200:0});
      const dist=distances(f,f.spawn);
      expect(dist[idx(f,f.stairs.x,f.stairs.y)]).toBeGreaterThan(0);
      for(let k=0;k<f.tiles.length;k++) {
        expect(f.tiles[k]).toBe(mask.rows[Math.floor(k/f.w)][k%f.w]==="#"?0:1);
        if(f.tiles[k]) expect(dist[k]).toBeGreaterThanOrEqual(0);
      }
      const occupied = new Set<number>([idx(f,f.spawn.x,f.spawn.y),idx(f,f.stairs.x,f.stairs.y)]);
      for(const p of [...f.items,...f.props,...f.dimlings.flatMap(footprint)]) {
        const k=idx(f,p.x,p.y);
        expect(f.tiles[k]).toBe(1);
        expect(mask.rows[p.y][p.x]).toBe(".");
        expect(near(p,f.spawn)||near(p,f.stairs)).toBe(false);
        expect(occupied.has(k)).toBe(false);occupied.add(k);
      }
      const blocked=new Set(f.props.map(p=>idx(f,p.x,p.y)));
      const clear={...f,tiles:f.tiles.map((t,k)=>blocked.has(k)?0:t)};
      const openDistances=distances(clear,f.spawn);
      for(let k=0;k<clear.tiles.length;k++) if(clear.tiles[k]) expect(openDistances[k]).toBeGreaterThanOrEqual(0);
      if(depth===7) expect(f.dimlings.filter(d=>d.boss)).toHaveLength(1);
    }
  });
});
