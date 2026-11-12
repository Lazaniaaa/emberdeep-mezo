// The game sheets as scripts/sprite-sheets.mjs writes them: one per animal in public/heroes, one per creature in public/mobs.
import { existsSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ANIMALS } from "../src/game/animals";
import { ENEMIES } from "../src/game/enemies";
import { CELL_H, CELL_W, FOOT_Y, TEXTURE_SCALE } from "../src/render/animal-sprites";
import { MOB_CELL_H, MOB_CELL_W, MOB_FOOT_Y, MOB_HEIGHT, MOB_TEXTURE_SCALE } from "../src/render/mob-sheets";
import { LOOT_ORDER, PROP_CELL_H, PROP_CELL_W, PROP_FOOT_Y, stagesOf } from "../src/render/prop-sheets";
import { PROPS } from "../src/game/props";
// @ts-expect-error -- a plain .mjs build script without type declarations
import { CAMP_CELL_H, CAMP_CELL_W, CAMP_FOOT_X, CAMP_FOOT_Y, CAMP_SHEETS, CAMP_SPRITE_HEIGHT, CAMP_OBJECTS, CAMP_PAVING, footOf } from "../src/game/camp-art";
import {
  BENCH_HEIGHT, BENCH_ORDER, BUILDING_HEIGHT, BUILDING_ORDER, CURB_HEIGHT, CURB_ORDER, DECOR_HEIGHT, DECOR_ORDER, FURNITURE_HEIGHT, FURNITURE_ORDER, VAULT_HEIGHT, VAULT_ORDER, LOOT_HEIGHT, LOOT_ORDER as SCRIPT_LOOT_ORDER, PROP_HEIGHT,
} from "./sprite-sheets.mjs";

async function frames(file: string, cols: number, rows: number, cellW: number, cellH: number) {
  expect(existsSync(file), file).toBe(true);
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  expect([info.width, info.height]).toEqual([cellW * cols, cellH * rows]);
  const alpha = (x: number, y: number) => data[(y * info.width + x) * 4 + 3];
  const out: { top: number; bottom: number; corner: number }[] = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    let top = -1, bottom = -1;
    for (let y = 0; y < cellH; y++) for (let x = 0; x < cellW; x++) if (alpha(col * cellW + x, row * cellH + y)) { if (top < 0) top = y; bottom = y; }
    out.push({ top, bottom, corner: alpha(col * cellW, row * cellH) });
  }
  return out;
}

describe("hero sheets", () => {
  for (const animal of ANIMALS) {
    it(`${animal}: 5 x 4 frames on a clear background, every frame standing on the same line`, async () => {
      for (const f of await frames(`public/heroes/${animal}.png`, 5, 4, CELL_W * TEXTURE_SCALE, CELL_H * TEXTURE_SCALE)) {
        expect(f.corner).toBe(0);
        expect(Math.abs(Math.floor(f.bottom / TEXTURE_SCALE) - FOOT_Y)).toBeLessThanOrEqual(1);
      }
    });
  }
});

describe("source eye details", () => {
  const heroes = [
    { name: "cat-ginger-tabby", band: [50, 66], minIrisWidth: 9, minPupilWidth: 4, iris: (r: number, g: number, b: number) => g > r + 30 && g > b + 15 },
    { name: "cat-scottish-fold", band: [40, 62], iris: (r: number, g: number, b: number) => r > 170 && g > 80 && b < 90 && r - b > 110 },
    { name: "dog-husky", band: [48, 66], minIrisWidth: 7, minPupilWidth: 3, iris: (r: number, g: number, b: number) => b > r + 50 && b > g + 15 && b > 120 },
  ];
  for (const { name, band, iris, minIrisWidth = 4, minPupilWidth = 1 } of heroes) {
    it(`${name}: both eyes retain their coloured iris, pupil and highlight in idle and walk frames`, async () => {
      const { data, info } = await sharp(`public/heroes/${name}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const pixel = (col: number, x: number, y: number) => {
        const i = (y * info.width + col * CELL_W * TEXTURE_SCALE + x) * 4;
        return [data[i], data[i + 1], data[i + 2]];
      };
      for (let col = 0; col < 3; col++) for (const [left, right] of [[34, 55], [57, 83]]) {
        const points: [number, number][] = [];
        for (let y = band[0]; y <= band[1]; y++) for (let x = left; x <= right; x++) {
          const [r, g, b] = pixel(col, x, y);
          if (iris(r, g, b)) points.push([x, y]);
        }
        expect(points.length, `frame ${col}, eye ${left}: coloured iris`).toBeGreaterThanOrEqual(10);
        const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        expect(x1 - x0 + 1).toBeGreaterThanOrEqual(minIrisWidth);
        expect(y1 - y0 + 1).toBeGreaterThanOrEqual(5);
        let pupil = 0, highlight = 0;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const rgb = pixel(col, x, y);
          if (rgb.reduce((a, b) => a + b) < 120) pupil++;
          if (Math.min(...rgb) > 200) highlight++;
        }
        expect(pupil, `frame ${col}, eye ${left}: pupil`).toBeGreaterThan(0);
        expect(highlight, `frame ${col}, eye ${left}: highlight`).toBeGreaterThan(0);
        // Look inside the iris, excluding its outline: a round pupil must not collapse into a vertical slit.
        let widestPupil = 0;
        for (let y = y0 + 2; y <= y1 - 2; y++) {
          let width = 0;
          for (let x = x0 + 1; x < x1; x++) {
            width = pixel(col, x, y).reduce((a, b) => a + b) < 120 ? width + 1 : 0;
            widestPupil = Math.max(widestPupil, width);
          }
        }
        expect(widestPupil, `frame ${col}, eye ${left}: rounded pupil width`).toBeGreaterThanOrEqual(minPupilWidth);
      }
    });
  }
});

describe("creature strips", () => {
  for (const e of ENEMIES) {
    it(`${e.id}: 4 frames, standing on the line, as tall as the game expects`, async () => {
      const [first, ...rest] = await frames(`public/mobs/${e.id}.png`, 4, 1, MOB_CELL_W*MOB_TEXTURE_SCALE, MOB_CELL_H*MOB_TEXTURE_SCALE);
      expect(first.corner).toBe(0);
      expect(Math.abs(first.bottom/MOB_TEXTURE_SCALE - MOB_FOOT_Y)).toBeLessThanOrEqual(1);
      // Sparks, spores or a flame tip may stand a little above the body the size is set from.
      expect(Math.abs((first.bottom - first.top + 1)/MOB_TEXTURE_SCALE - MOB_HEIGHT[e.id])).toBeLessThanOrEqual(6);
      for (const f of rest) expect(f.top).toBeGreaterThanOrEqual(0);
    });
  }
});

describe("Cerberus four-direction sheet", () => {
  it("keeps sixteen complete frames on the same baseline, with clear margins and no magenta", async () => {
    const cells=await frames("public/bosses/cerberus.png",4,4,256,224);
    expect(cells).toHaveLength(16);
    for(const f of cells) {
      expect(f.corner).toBe(0);
      expect(f.top).toBeGreaterThan(0);
      expect(Math.abs(f.bottom-208)).toBeLessThanOrEqual(1);
    }
    const {data,info}=await sharp("public/bosses/cerberus.png").ensureAlpha().raw().toBuffer({resolveWithObject:true});
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++) {
      const i=(y*info.width+x)*4;if(!data[i+3])continue;
      expect(x%256>0&&x%256<255&&y%224>0&&y%224<223,`clipped at ${x},${y}`).toBe(true);
      expect(data[i]>80&&data[i+2]>80&&data[i+1]<0.45*Math.min(data[i],data[i+2]),`magenta ${x},${y}`).toBe(false);
    }
  // Two checks for each of the sheet's ~900,000 pixels: near five seconds when the whole suite runs at once.
  }, 20_000);
});

// The props and the loot have no art until the owner generates it (docs/art/PROMPTS.md, П1-П3); the game draws the code
// sprites meanwhile. Whatever sheets exist must fit the cells the game crops.
describe("prop and loot sheets", () => {
  it("cover every prop and the same loot row as the game, in the script's sizes", () => {
    expect(Object.keys(PROP_HEIGHT).sort()).toEqual(PROPS.map(p => p.id).sort());
    expect(SCRIPT_LOOT_ORDER).toEqual(LOOT_ORDER);
    expect(Object.keys(LOOT_HEIGHT).sort()).toEqual([...LOOT_ORDER].sort());
  });

  for (const name of [...PROPS.map(p => p.id), "loot"]) {
    const file = `public/props/${name}.png`;
    it.skipIf(!existsSync(file))(`${name}: frames on a clear background, standing on the line`, async () => {
      // Twice the game's density; a prop is 1 frame (only whole), 3 or up to 6 (see stagesOf).
      const { width, height } = await sharp(file).metadata();
      const d = height! / PROP_CELL_H;
      expect(d).toBe(2);
      const cols = width! / (PROP_CELL_W * d);
      expect(name === "loot" ? [LOOT_ORDER.length] : [1, 3, 5, 6]).toContain(cols);
      // Whole and cracked it stands on the line; breaking apart, the pieces may spill lower but stay inside the cell.
      const standing = name === "loot" ? cols : 1 + stagesOf(cols).cracks;
      for (const [i, f] of (await frames(file, cols, 1, PROP_CELL_W * d, PROP_CELL_H * d)).entries()) {
        expect(f.corner).toBe(0);
        if (i < standing) expect(Math.abs(f.bottom - PROP_FOOT_Y * d), `frame ${i}`).toBeLessThanOrEqual(d);
        else expect(f.bottom, `frame ${i}`).toBeLessThan(PROP_CELL_H * d - 1);
      }
    });
  }
});

describe("camp sheets", () => {
  it("keeps the Altar and inward-facing Vault foundations inside their pads", async () => {
    for(const id of ["altar","ledger"] as const) {
      const sheet=id==="altar"?"buildings":"vault";
      const {data,info}=await sharp(`public/lobby/${sheet}.png`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      const object=CAMP_OBJECTS.find(o=>o.id===id)!;
      const pad=CAMP_PAVING.find(p=>p.id===(id==="ledger"?"vault-pad":"altar-pad"))!;
      const col=(CAMP_SHEETS[sheet] as readonly string[]).indexOf(object.sprite), foot=footOf(object);
      let left=Infinity,right=-Infinity,bottom=-Infinity;
      for(let y=CAMP_FOOT_Y-5;y<CAMP_CELL_H;y++)for(let x=0;x<CAMP_CELL_W;x++) {
        if(!data[(y*info.width+col*CAMP_CELL_W+x)*4+3])continue;
        left=Math.min(left,foot.x+x-CAMP_FOOT_X);right=Math.max(right,foot.x+x-CAMP_FOOT_X);
        bottom=Math.max(bottom,foot.y+y-CAMP_FOOT_Y);
      }
      expect(right-left+1,id).toBeLessThanOrEqual(pad.w*32-16);
      expect(left,id).toBeGreaterThanOrEqual(pad.x*32+8);
      expect(right,id).toBeLessThan((pad.x+pad.w)*32-8);
      expect(bottom,id).toBeLessThan((pad.y+pad.h)*32-8);
      expect(Math.abs(bottom-((pad.y+pad.h/2)*32+32)),id).toBeLessThanOrEqual(8);
      if(id==="ledger") {
        // A rectangle's front edge stays horizontal; the rejected three-quarter foundation sloped across its width.
        const edge: [number,number][]=[];
        for(let x=0;x<CAMP_CELL_W;x++)for(let y=CAMP_CELL_H-1;y>=0;y--) {
          if(data[(y*info.width+col*CAMP_CELL_W+x)*4+3]){edge.push([x,y]);break;}
        }
        const ys=edge.filter(([x])=>x>edge[0][0]+5&&x<edge.at(-1)![0]-5).map(p=>p[1]);
        expect(ys.length).toBeGreaterThan(100);
        expect(Math.max(...ys)-Math.min(...ys)).toBeLessThanOrEqual(2);
      }
    }
  });

  it("cut the buildings, furniture and decor in the order and at the sizes the camp draws them", () => {
    expect([...CAMP_SHEETS.buildings]).toEqual(BUILDING_ORDER);
    expect([...CAMP_SHEETS.furniture]).toEqual(FURNITURE_ORDER);
    expect([...CAMP_SHEETS.decor]).toEqual(DECOR_ORDER);
    expect([...CAMP_SHEETS.curbs]).toEqual(CURB_ORDER);
    expect([...CAMP_SHEETS.benches]).toEqual(BENCH_ORDER);
    expect([...CAMP_SHEETS.vault]).toEqual(VAULT_ORDER);
    expect(CAMP_SPRITE_HEIGHT).toEqual({ ...BUILDING_HEIGHT, ...FURNITURE_HEIGHT, ...BENCH_HEIGHT, ...VAULT_HEIGHT, ...DECOR_HEIGHT, ...CURB_HEIGHT });
  });

  for (const name of Object.keys(CAMP_SHEETS) as (keyof typeof CAMP_SHEETS)[]) {
    const file = `public/lobby/${name}.png`;
    it.skipIf(!existsSync(file))(`${name}: one clear cell for each, standing on the line`, async () => {
      const { width, height } = await sharp(file).metadata();
      expect(height).toBe(CAMP_CELL_H);
      expect(width).toBe(CAMP_CELL_W * CAMP_SHEETS[name].length);
      for (const f of await frames(file, CAMP_SHEETS[name].length, 1, CAMP_CELL_W, CAMP_CELL_H)) {
        expect(f.corner).toBe(0);
        expect(Math.abs(f.bottom - CAMP_FOOT_Y)).toBeLessThanOrEqual(2);
      }
    });
  }

  it("keeps curb joins at one tile, with an empty corner interior and no magenta fringe", async () => {
    const {data,info} = await sharp("public/lobby/curbs.png").ensureAlpha().raw().toBuffer({resolveWithObject:true});
    for (let cell=0;cell<CURB_ORDER.length;cell++) {
      let left=CAMP_CELL_W,right=-1,top=CAMP_CELL_H,bottom=-1;
      for(let y=0;y<CAMP_CELL_H;y++)for(let x=0;x<CAMP_CELL_W;x++) {
        const i=(y*info.width+cell*CAMP_CELL_W+x)*4;
        if(!data[i+3])continue;
        left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
        expect(data[i]>100 && data[i+2]>100 && data[i+1]<50,`magenta at ${cell}/${x}/${y}`).toBe(false);
      }
      expect(right-left+1,CURB_ORDER[cell]).toBe(cell===1||cell===5?8:32);
      expect(bottom-top+1,CURB_ORDER[cell]).toBe(CURB_HEIGHT[CURB_ORDER[cell]]);
      if(cell===2||cell===3)expect(data[((top+20)*info.width+cell*CAMP_CELL_W+left+20)*4+3]).toBe(0);
    }
  });
});
