import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
// @ts-expect-error The asset pipeline is a standalone Node module.
import { cutTiles, isTileMatte, JOINT } from "./tile-sheets.mjs";

describe("approved catacombs tilesheet", () => {
  it("detects all 18 tight boxes including torch tips, and reproduces the checked-in atlas", async () => {
    const sheet = await cutTiles("art/tiles/raw/catacombs-v5.webp");
    expect([sheet.width, sheet.height, sheet.boxes.length]).toEqual([128, 160, 18]);
    const png = await sharp(await readFile("public/tiles/catacombs.png")).ensureAlpha().raw().toBuffer();
    expect(Buffer.compare(sheet.data, png)).toBe(0);
    for (let row = 0; row < 5; row++) for (let col = 0; col < (row === 4 ? 2 : 4); col++) {
      let solid = 0;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const p = ((row * 32 + y) * 128 + col * 32 + x) * 4, rgba = [...png.subarray(p, p + 4)];
        if (rgba[3]) { solid++; expect(isTileMatte(...rgba.slice(0, 3))).toBe(false); }
        if (row < 3) expect(rgba[3]).toBe(255); // Walls must never reveal floor underneath.
        if (row === 0 && (x === 0 || y === 0 || x === 31 || y === 31)) expect(rgba).toEqual(JOINT);
        if (row >= 3 && (x === 0 || y === 0 || x === 31 || y === 31)) expect(rgba[3]).toBe(0);
      }
      expect(solid).toBeGreaterThan(40);
    }
  });
});

describe("approved mycelium tilesheet",()=>{
  it("cuts earth without a slab joint, opaque walls and transparent attachments; leaves the glow slot empty",async()=>{
    const sheet=await cutTiles("art/tiles/raw/mycelium-v1.webp","mycelium");
    expect([sheet.width,sheet.height,sheet.boxes.length]).toEqual([128,160,18]);
    const png=await sharp(await readFile("public/tiles/mycelium.png")).ensureAlpha().raw().toBuffer();
    expect(Buffer.compare(sheet.data,png)).toBe(0);
    for(let row=0;row<5;row++)for(let col=0;col<(row===4?2:4);col++){
      let solid=0,joint=0;
      for(let y=0;y<32;y++)for(let x=0;x<32;x++){
        const p=((row*32+y)*128+col*32+x)*4,rgba=[...png.subarray(p,p+4)];
        if(rgba[3]){solid++;expect(isTileMatte(...rgba.slice(0,3))).toBe(false);}
        if(row<3)expect(rgba[3]).toBe(255);
        if(row===0&&(x===0||y===0||x===31||y===31)&&rgba.every((v,i)=>v===JOINT[i]))joint++;
        if(row>=3&&(x===0||y===0||x===31||y===31))expect(rgba[3]).toBe(0);
      }
      if(row===3&&col===1)expect(solid).toBe(0);
      else expect(solid).toBeGreaterThan(40);
      if(row===0)expect(joint).toBeLessThan(5);
    }
    // Verify the floor's five-percent tight-box inset fills all 32 pixels (no invented border).
    const box=sheet.boxes.find((b:{row:number;col:number})=>b.row===0&&b.col===0)!;
    const ix=Math.round(box.width*0.05),iy=Math.round(box.height*0.05);
    const expected=await sharp("art/tiles/raw/mycelium-v1.webp").extract({left:box.left+ix,top:box.top+iy,width:box.width-2*ix,height:box.height-2*iy}).resize(32,32,{kernel:"nearest",fit:"fill"}).ensureAlpha().raw().toBuffer();
    const actual=await sharp("public/tiles/mycelium.png").extract({left:0,top:0,width:32,height:32}).raw().toBuffer();
    expect(Buffer.compare(expected,actual)).toBe(0);
  });
});
