import { describe, expect, it } from "vitest";
import { distances, footprint, generateFloor, idx, isFloor } from "./dungeon";
import { attackTiles } from "./enemy-ai";
import { createRng } from "./rng";

const rooms={5:[[2,5,7,11],[19,5,24,11],[10,2,16,4],[10,12,16,14]],
  6:[[2,5,6,11],[20,5,24,11],[10,2,16,4],[10,6,16,10],[10,12,16,14]]} as const;
const links={5:[[8,7,18,9],[12,5,14,6],[12,10,14,11]],6:[[7,7,9,9],[17,7,19,9],[12,5,14,5],[12,11,14,11]]} as const;
const strips=[
  [5,8,8,11,8],[5,15,8,18,8],[5,13,5,13,6],[5,13,10,13,11],
  [6,7,8,9,8],[6,17,8,19,8],[6,13,5,13,5],[6,13,11,13,11],
];

describe("Cinderworks and Hollowglass authored layouts",()=>{
  for(const [depth,x0,y0,x1,y1] of strips)it(`${depth}: three lanes with straight borders on ${x0},${y0}–${x1},${y1}`,()=>{
    const f=generateFloor(createRng(42),depth,{findPct:0}),vertical=x0===x1;
    for(let n=0;n<=Math.abs(x1-x0)+Math.abs(y1-y0);n++){
      const x=x0+(vertical?0:n),y=y0+(vertical?n:0),side=(d:number)=>({x:x+(vertical?d:0),y:y+(vertical?0:d)});
      for(const lane of [-1,0,1]){const p=side(lane);expect(isFloor(f,p.x,p.y)).toBe(true);}
      for(const wall of [-2,2]){const p=side(wall);expect(isFloor(f,p.x,p.y)).toBe(false);}
      const blocked={...f,tiles:f.tiles.map((t,k)=>k===idx(f,x,y)?0:t)},a=side(-1),b=side(1);
      expect(distances(blocked,a)[idx(f,b.x,b.y)]).toBeGreaterThan(0);
    }
  });
  for(const depth of [5,6] as const)it(`${depth}: all room mouths stay three-wide, no old furnace or stair niche survives`,()=>{
    const f=generateFloor(createRng(42),depth,{findPct:0});
    for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++)expect(isFloor(f,x,y)).toBe([...rooms[depth],...links[depth]].some(([a,b,c,d])=>x>=a&&x<=c&&y>=b&&y<=d));
    const mouths=depth===5?[[7,8,0,1],[19,8,0,1],[13,4,1,0],[13,12,1,0]]:[[6,8,0,1],[10,8,0,1],[16,8,0,1],[20,8,0,1],[13,4,1,0],[13,6,1,0],[13,10,1,0],[13,12,1,0]];
    for(const [x,y,dx,dy] of mouths)for(const lane of [-1,0,1])expect(isFloor(f,x+dx*lane,y+dy*lane)).toBe(true);
  });
  for(const depth of [5,6,7])it(`${depth}: both exits have an unobstructed 3x3 floor patch`,()=>{
    const f=generateFloor(createRng(42),depth,{findPct:0});
    for(const p of [f.spawn,f.stairs])for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)expect(isFloor(f,p.x+dx,p.y+dy)).toBe(true);
  });
  it("gives Cerberus a clear central fight, eight marked edges and an escape from each, over 200 seeds",()=>{
    for(let seed=1;seed<=200;seed++){
      const f=generateFloor(createRng(seed*7919),7,{findPct:200}),b=f.dimlings.find(d=>d.boss)!;
      expect(b).toMatchObject({x:12,y:7,size:2,hp:150});expect(b.y).toBeGreaterThan(f.stairs.y);expect(b.y+1).toBeLessThan(f.spawn.y);
      const other=[...f.items,...f.props,...f.dimlings.filter(d=>!d.boss).flatMap(footprint)];
      for(let y=b.y-2;y<=b.y+3;y++)for(let x=b.x-2;x<=b.x+3;x++){
        expect(isFloor(f,x,y)).toBe(true);expect(other.some(p=>p.x===x&&p.y===y)).toBe(false);
      }
      const danger=attackTiles(f,b),body=footprint(b),blocked=[...danger,...body,...other];expect(danger).toHaveLength(8);
      for(const p of danger)expect([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>isFloor(f,p.x+dx,p.y+dy)&&!blocked.some(q=>q.x===p.x+dx&&q.y===p.y+dy))).toBe(true);
      for(let y=2;y<=14;y++)for(let x=7;x<=19;x++)expect(isFloor(f,x,y)).toBe(true);
    }
  });
});
