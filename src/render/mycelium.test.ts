import { describe, expect, it } from "vitest";
import { NO_PERKS } from "@/game/catalog";
import { generateFloor, idx } from "@/game/dungeon";
import { createRng } from "@/game/rng";
import { emptyBag, startRun } from "@/game/run";
import { CatacombsDecor, catacombsDecorAt, catacombsRow, decorOccupants, usesTiledFloor } from "./catacombs";
import { myceliumFloorVariant, usesMyceliumTiles } from "./mycelium";

describe("mycelium presentation",()=>{
  it("uses deterministic rare root crosses rather than alternating patterns",()=>{
    const counts=[0,0,0,0];
    for(let y=0;y<100;y++)for(let x=0;x<100;x++){
      const v=myceliumFloorVariant(x,y,3);counts[v]++;
      expect(myceliumFloorVariant(x,y,3)).toBe(v);
    }
    expect(counts[1]/10000).toBeGreaterThan(0.08);expect(counts[1]/10000).toBeLessThan(0.12);
    for(const i of [0,2,3])expect(counts[i]/10000).toBeGreaterThan(0.27);
    expect([1,2,3,4,5,6,7].map(usesMyceliumTiles)).toEqual([false,false,true,true,false,false,false]);
    expect([1,2,3,4,5,6,7].map(usesTiledFloor)).toEqual([true,true,true,true,true,true,true]);
  });
  for(const depth of [3,4])it(`floor ${depth}: full-cell wall orientation and spawn-safe, visual-only decoration`,()=>{
    const s=startRun({seed:42,flasks:5,perks:NO_PERKS,weaponDamage:16,bag:emptyBag()});
    s.floor=generateFloor(createRng(42),depth,{findPct:0});s.depth=depth;
    const before=JSON.stringify(s),saved=new Map<string,string>();
    const storage={getItem:(k:string)=>saved.get(k)??null,setItem:(k:string,v:string)=>{saved.set(k,v);}};
    const reserved=new CatacombsDecor(s,storage),occupied=decorOccupants(s.floor),f=s.floor;
    expect(reserved.blocked).toEqual(occupied);
    let decorations=0,spores=0;
    for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
      const row=catacombsRow(f,x,y),k=idx(f,x,y);
      expect(row).toBe(f.tiles[k]===1?0:y+1<f.h&&f.tiles[k+f.w]===1?2:1);
      const d=catacombsDecorAt(f,x,y,reserved.blocked,occupied);
      if(d!==null){decorations++;if(d===1)spores++;expect(f.tiles[k]).toBe(1);expect(occupied.has(k)).toBe(false);}
    }
    expect(decorations).toBeGreaterThan(2);expect(spores).toBeGreaterThan(0);expect(JSON.stringify(s)).toBe(before);
    const moved=structuredClone(s);moved.steps++;moved.floor.props=[];moved.floor.items=[];moved.floor.dimlings=[];
    expect(new CatacombsDecor(moved,storage).blocked).toEqual(occupied);
  });
});
