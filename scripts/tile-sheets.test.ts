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
