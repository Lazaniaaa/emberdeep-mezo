import { describe, expect, it } from "vitest";
import { distances, generateFloor, idx, isFloor, type Point } from "./dungeon";
import { createRng } from "./rng";

// Independent cross-sections of the retained triangle loop (3) and four-room hub (4).
const strips = [
  { depth:3, from:[11,7], to:[20,7] },
  { depth:3, from:[9,13], to:[9,14] },
  { depth:3, from:[11,16], to:[13,16] },
  { depth:3, from:[26,10], to:[26,14] },
  { depth:4, from:[7,8], to:[11,8] },
  { depth:4, from:[15,8], to:[19,8] },
  { depth:4, from:[13,5], to:[13,6] },
  { depth:4, from:[13,10], to:[13,10] },
];
const rooms = {
  3:[[3,5,10,12],[21,4,31,9],[14,15,24,18]],
  4:[[2,5,6,10],[20,5,24,10],[8,2,18,4],[7,11,19,14]],
} as const;
const links = {
  3:[[11,6,20,8],[8,13,10,17],[11,15,13,17],[25,10,27,17]],
  4:[[7,7,19,9],[12,5,14,6],[12,10,14,10]],
} as const;

describe("mycelium three-wide rooms and links",()=>{
  for(const c of strips)it(`floor ${c.depth}: three open lanes and straight wall borders from ${c.from} to ${c.to}`,()=>{
    const f=generateFloor(createRng(42),c.depth,{findPct:0});
    const vertical=c.from[0]===c.to[0],steps=Math.abs(c.to[0]-c.from[0])+Math.abs(c.to[1]-c.from[1]);
    for(let n=0;n<=steps;n++){
      const x=c.from[0]+(vertical?0:n),y=c.from[1]+(vertical?n:0);
      const side=(lane:number):Point=>({x:x+(vertical?lane:0),y:y+(vertical?0:lane)});
      for(const lane of [-1,0,1]){const p=side(lane);expect(isFloor(f,p.x,p.y)).toBe(true);}
      for(const wall of [-2,2]){const p=side(wall);expect(isFloor(f,p.x,p.y)).toBe(false);}
      const blocked={...f,tiles:f.tiles.map((t,k)=>k===idx(f,x,y)?0:t)},a=side(-1),b=side(1);
      expect(distances(blocked,a)[idx(f,b.x,b.y)]).toBeGreaterThan(0);
    }
  });
  for(const depth of [3,4] as const)it(`floor ${depth}: open exits, wide mouths and bends, no leftover one-cell niches`,()=>{
    const f=generateFloor(createRng(42),depth,{findPct:0});
    for(const exit of [f.spawn,f.stairs]){
      expect(rooms[depth].some(([x0,y0,x1,y1])=>exit.x>x0&&exit.x<x1&&exit.y>y0&&exit.y<y1)).toBe(true);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)expect(isFloor(f,exit.x+dx,exit.y+dy)).toBe(true);
    }
    for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
      const inPlan=[...rooms[depth],...links[depth]].some(([x0,y0,x1,y1])=>x>=x0&&x<=x1&&y>=y0&&y<=y1);
      expect(isFloor(f,x,y),`${depth}: ${x},${y}`).toBe(inPlan);
    }
    // Both elbows on 3 and the crossing on 4 have complete 3x3 turning space.
    for(const [x,y] of depth===3?[[9,16],[26,16]]:[[13,8]])
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)expect(isFloor(f,x+dx,y+dy)).toBe(true);
    // Three lanes continue right into rooms, rather than narrowing at their doors.
    const mouths=depth===3?[[10,7,0,1],[21,7,0,1],[9,12,1,0],[14,16,0,1],[26,9,1,0],[24,16,0,1]]
      :[[6,8,0,1],[20,8,0,1],[13,4,1,0],[13,11,1,0]];
    for(const [x,y,sx,sy] of mouths)for(const lane of [-1,0,1])expect(isFloor(f,x+sx*lane,y+sy*lane)).toBe(true);
  });
});
