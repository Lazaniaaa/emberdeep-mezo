import { describe, expect, it } from "vitest";
import { distances, generateFloor, idx, isFloor, type Floor, type Point } from "./dungeon";
import { createRng } from "./rng";

// Independently specified corridor axes from the owner's approved room graph, not derived from the masks under test.
const corridors = [
  { depth: 1, from: { x: 10, y: 10 }, to: { x: 21, y: 10 }, openEnd: true },
  { depth: 2, from: { x: 10, y: 9 }, to: { x: 14, y: 9 }, openEnd: true },
  { depth: 2, from: { x: 20, y: 10 }, to: { x: 24, y: 10 }, openEnd: true },
  { depth: 2, from: { x: 17, y: 12 }, to: { x: 17, y: 14 }, openEnd: false },
];
const rooms = {
  1: [[3,7,9,14],[22,6,31,15]],
  2: [[2,5,9,13],[15,6,19,11],[25,6,31,13]],
} as const;
const at = (p: Point, d: Point, n: number): Point => ({ x: p.x + d.x*n, y: p.y + d.y*n });
const floorAt = (f: Floor, p: Point) => isFloor(f,p.x,p.y);

describe("three-lane catacombs corridors", () => {
  for (const c of corridors) it(`floor ${c.depth}: every section ${JSON.stringify(c.from)} to ${JSON.stringify(c.to)} has exactly three lanes and open doorways`, () => {
    const f = generateFloor(createRng(42),c.depth,{findPct:0});
    const forward = { x: Math.sign(c.to.x-c.from.x), y: Math.sign(c.to.y-c.from.y) };
    const side = { x: forward.y, y: forward.x }, length = Math.abs(c.to.x-c.from.x)+Math.abs(c.to.y-c.from.y)+1;
    for(let n=0;n<length;n++) {
      const center = at(c.from,forward,n);
      // Covers every lane cell, not only the corridor centreline. Rock starts exactly at +/-2.
      for(const lane of [-1,0,1]) expect(floorAt(f,at(center,side,lane))).toBe(true);
      for(const wall of [-2,2]) expect(floorAt(f,at(center,side,wall))).toBe(false);
      // A single creature or prop on the centre cannot cut off the two outer lanes.
      const blocked = { ...f, tiles: f.tiles.map((t,k) => k===idx(f,center.x,center.y)?0:t) };
      const left = at(center,side,-1), right = at(center,side,1);
      expect(distances(blocked,left)[idx(f,right.x,right.y)]).toBeGreaterThan(0);
    }
    for(const mouth of [at(c.from,forward,-1),...(c.openEnd?[at(c.to,forward,1)]:[])]) {
      for(const lane of [-1,0,1]) expect(floorAt(f,at(mouth,side,lane))).toBe(true);
    }
    if(!c.openEnd)for(const lane of [-1,0,1])expect(floorAt(f,at(at(c.to,forward,1),side,lane))).toBe(false);
  });

  for(const depth of [1,2] as const)it(`floor ${depth}: no other corridor cells or exit niches remain`, () => {
    const f=generateFloor(createRng(42),depth,{findPct:0});
    for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++)if(isFloor(f,x,y)) {
      const inRoom=rooms[depth].some(([x0,y0,x1,y1])=>x>=x0&&x<=x1&&y>=y0&&y<=y1);
      const inCorridor=corridors.filter(c=>c.depth===depth).some(c=>c.from.y===c.to.y
        ? x>=c.from.x&&x<=c.to.x&&Math.abs(y-c.from.y)<=1
        : y>=c.from.y&&y<=c.to.y&&Math.abs(x-c.from.x)<=1);
      expect(inRoom||inCorridor,`Unexpected floor at ${x},${y}`).toBe(true);
    }
    for(const exit of [f.spawn,f.stairs]) {
      expect(rooms[depth].some(([x0,y0,x1,y1])=>exit.x>x0&&exit.x<x1&&exit.y>y0&&exit.y<y1)).toBe(true);
      // All four cardinal neighbours plus diagonals: no wall face may surround the marker.
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)expect(isFloor(f,exit.x+dx,exit.y+dy)).toBe(true);
    }
  });
});
