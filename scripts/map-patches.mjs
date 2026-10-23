// Preserve the approved geometry; only align the slab texture to the game grid.
import { regridFloor } from "./floor-regrid.mjs";

/** An RGBA picture: `data` holds width * height * 4 bytes. */
export function makePicture(data, width, height) {
  return { data, width, height };
}

/** Floors whose slabs are redrawn on the game's 32px grid (see floor-regrid.mjs), with the pictures' parts to leave alone. */
const REGRID = {
  // The rune circle and the stairs are pictures of their own and are left as painted.
  1: { exclude: [{ x: 140, y: 300, w: 70, h: 76 }, { x: 805, y: 290, w: 90, h: 100 }] },
  2: { exclude: [{ x: 850, y: 236, w: 120, h: 156 }] },
  3: { exclude: [{ x: 795, y: 160, w: 130, h: 150 }] },
  // Floors 4-7 have other palettes: the colours below are the floors' own hue, saturation and brightness.
  4: { exclude: [{ x: 668, y: 228, w: 110, h: 110 }] },
  5: { hue: [200, 222], saturation: 0.3, value: [0.22, 0.4], exclude: [{ x: 670, y: 230, w: 110, h: 110 }] },
  6: { hue: [196, 216], saturation: 0.3, value: [0.25, 0.42], exclude: [{ x: 395, y: 230, w: 80, h: 90 }, { x: 710, y: 230, w: 90, h: 90 }] },
  7: { hue: [198, 216], saturation: 0.6, value: [0.3, 0.56], exclude: [{ x: 340, y: 155, w: 185, h: 195 }] },
};

export const hasPatch = depth => depth in REGRID;

/** Applies the touch-ups for a floor to its picture (a canvas-sized RGBA buffer). Returns a new picture. */
export function patchFloor(depth, pic) {
  let result = pic;
  if (REGRID[depth]) result = regridFloor(result, REGRID[depth]);
  return result;
}
