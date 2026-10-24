import { describe, expect, it, vi } from "vitest";
import { generateFloor } from "@/game/dungeon";
import { createRng } from "@/game/rng";
import { decorOccupants } from "./catacombs";
import { drawCrystalGate, drawLateCell } from "./late-tiles";
vi.mock("./sheets",()=>({loadSheet:()=>({image:{}})}));

describe("late tile compositing",()=>{
  it("lays a rock top under every transparent crystal face and stays in full cells",()=>{
    const f=generateFloor(createRng(42),7,{findPct:0}),calls:unknown[][]=[];
    const ctx={drawImage:(...args:unknown[])=>calls.push(args)} as unknown as CanvasRenderingContext2D;
    drawLateCell(ctx,f,13,1,true,null,decorOccupants(f));
    expect(calls[0].slice(2)).toEqual([32,32,32,416,32,32,32]);
    expect(calls[1].slice(2)).toEqual([64,32,32,416,32,32,32]);
  });
  it("draws the bright two-tile gate after the wall, only over known solid masonry",()=>{
    const f=generateFloor(createRng(42),7,{findPct:0});f.seen.fill(1);
    const calls:unknown[][]=[],ctx={save(){},restore(){},drawImage:(...args:unknown[])=>calls.push(args)} as unknown as CanvasRenderingContext2D;
    drawCrystalGate(ctx,f,new Set(f.tiles.map((_,i)=>i)));expect(calls).toHaveLength(1);
    expect(calls[0].slice(1)).toEqual([32,128,32,32,400,0,64,64]);
    f.tiles[13]=1;drawCrystalGate(ctx,f,new Set());expect(calls).toHaveLength(1);
    f.tiles[13]=0;f.seen[13]=0;drawCrystalGate(ctx,f,new Set());expect(calls).toHaveLength(1);
  });
});
