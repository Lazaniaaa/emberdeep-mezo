import type { Point } from "./dungeon";
export type DoorwayPatch = { x: number; y: number; w: number; h: number; sample: Point };
// Broad copied-floor rectangles are deliberately forbidden. Geometry follows the paintings instead.
export const ART_DOORWAYS: Record<number, DoorwayPatch[]> = {};
export type ArtPatch = { x: number; y: number; w: number; h: number; from: Point };
export const ART_PATCHES: Record<number, ArtPatch[]> = {
  // Two thin, closed stone door frames need a one-tile threshold, not the former 73px cut.
  1: [
    { x: 336, y: 320, w: 27, h: 32, from: { x: 368, y: 320 } },
    { x: 654, y: 320, w: 25, h: 32, from: { x: 622, y: 320 } },
  ],
  // Floor 3: a thin stone seam closes the east end of the otherwise painted link. Open only its one-tile threshold.
  3: [{ x: 650, y: 224, w: 26, h: 32, from: { x: 618, y: 224 } }],
};
