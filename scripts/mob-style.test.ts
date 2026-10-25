import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ENEMIES } from "../src/game/enemies";
import { MOB_HEIGHT as RENDER_HEIGHT } from "../src/render/mob-sheets";
import { buildMobSheet, cleanMobFringe, detectMobGrid, MOB_HEIGHT, nearestMobColor, rgbToOklab } from "./sprite-sheets.mjs";

const palette = JSON.parse(readFileSync("art/palette/mobs.json", "utf8"));
const rgb = (h: string) => h.slice(1).match(/../g)!.map(v => parseInt(v, 16));

describe("mob-only art processing", () => {
  it("uses an explicit, bounded palette including distinct warm/cold light and unchanged logical sizes", () => {
    expect(palette.colors).toHaveLength(32);
    expect(new Set(palette.colors).size).toBe(32);
    expect(palette.colors).toContain(palette.outline);
    expect(palette.colors).toContain("#68eaeb");
    expect(MOB_HEIGHT).toEqual(RENDER_HEIGHT);
    expect(Object.keys(MOB_HEIGHT).sort()).toEqual(ENEMIES.map(e => e.id).sort());
  });

  it("converts reference sRGB primaries to OKLab before choosing palette colours", () => {
    const red = rgbToOklab([255, 0, 0]);
    expect(red[0]).toBeCloseTo(0.627955, 5); expect(red[1]).toBeCloseTo(0.224863, 5); expect(red[2]).toBeCloseTo(0.125846, 5);
    expect(rgbToOklab([0, 0, 0])).toEqual([0, 0, 0]);
    expect(nearestMobColor([252, 145, 14], palette.colors.map(rgb))).toEqual(rgb("#fd930c"));
  });

  for (const size of [6, 10, 14]) it(`detects a ${size}px source grid independently of the requested output scale`, () => {
    const w = 120, h = 96, source = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = (Math.floor(x / size) + Math.floor(y / size)) % 2 ? [221, 205, 171] : [29, 43, 64];
      c.forEach((v, k) => source[(y * w + x) * 3 + k] = v);
    }
    const grid = detectMobGrid(source, w, h, [{ x0: 0, y0: 0, x1: w - 1, y1: h - 1 }], 8);
    expect(grid.size).toBeCloseTo(size, 0); expect(grid.confidence).toBeGreaterThan(0.5);
  });

  it("replaces magenta-mixed edge colours with foreground, preserves blue and drops unsupported fringe", () => {
    const bone = [240, 225, 190], ink = [10, 11, 22];
    expect([bone, ink]).toContainEqual(cleanMobFringe([154, 36, 146], [bone, ink, [250, 0, 250]]));
    expect(cleanMobFringe([154, 36, 146], [[250, 0, 250]])).toBeNull();
    expect(cleanMobFringe([30, 155, 245], [ink])).toEqual([30, 155, 245]);
  });

  for (const { id } of ENEMIES) it(`${id}: reproduces the atlas exactly, without matte, partial alpha or out-of-palette pixels`, async () => {
    const generated = await buildMobSheet(id);
    const actual = await sharp(`public/mobs/${id}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect([generated.width, generated.height]).toEqual([768, 112]);
    // Indexed PNG encoders may store any RGB beneath alpha zero; compare the visible pixels and the mask exactly.
    const canonical = (data: Uint8Array) => { const b = Buffer.from(data); for (let p = 0; p < b.length; p += 4) if (!b[p + 3]) b.fill(0, p, p + 3); return b; };
    expect(canonical(generated.data).equals(canonical(actual.data))).toBe(true);
    const allowed = new Set(palette.colors.map((c: string) => rgb(c).join(",")));
    let valid = true, pink = 0;
    for (let p = 0; p < actual.data.length; p += 4) {
      const [r, g, b, a] = actual.data.subarray(p, p + 4);
      if (a !== 0 && a !== 255) valid = false;
      if (!a) continue;
      if (!allowed.has(`${r},${g},${b}`)) valid = false;
      if (Math.min(r, b) - g > 25 && g < 0.5 * Math.min(r, b) && Math.abs(r - b) < 0.35 * Math.max(r, b)) pink++;
    }
    expect(valid).toBe(true); expect(pink).toBe(0);
  });

  const faces = [
    { id: "chaincoil", boxes: [[63, 60, 82, 74], [62, 60, 82, 74], [57, 55, 77, 72], [62, 60, 82, 74]],
      iris: (r: number, g: number, b: number) => r > 170 && g > 25 && g < 170 && b < 65, min: 10 },
    { id: "sootplate", boxes: [[65, 47, 87, 61], [70, 48, 93, 62], [70, 46, 92, 60], [63, 62, 84, 78]],
      iris: (r: number, g: number, b: number) => g > 180 && b > 180 && r < 160, min: 24 },
    { id: "snaretoad", boxes: [[65, 76, 90, 90], [65, 75, 90, 90], [75, 56, 99, 72], [65, 78, 90, 92]],
      iris: (r: number, g: number, b: number) => r > 220 && g > 25 && g < 170 && b < 65, min: 20 },
  ];
  for (const { id, boxes, iris, min } of faces) it(`${id}: keeps both coloured eye accents in every a/b/w/s face`, async () => {
    const { data, info } = await sharp(`public/mobs/${id}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const [frame, [x0, y0, x1, y1]] of boxes.entries()) {
      const xs: number[] = [];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const p = (y * info.width + frame * 192 + x) * 4;
        if (data[p + 3] && iris(data[p], data[p + 1], data[p + 2])) xs.push(x);
      }
      expect(xs.length, `${id}/${frame}: coloured eyes`).toBeGreaterThanOrEqual(min);
      // Eye pairs span both sides of the face, rather than collapsing to a single bright dot.
      expect(Math.max(...xs) - Math.min(...xs), `${id}/${frame}: eye separation`).toBeGreaterThanOrEqual(8);
    }
  });
});
