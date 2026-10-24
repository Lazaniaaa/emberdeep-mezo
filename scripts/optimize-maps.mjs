// Historical painted-map archive only. Runtime floors now use tiles; do not republish these pictures to public/.
// The game draws every floor into a tile canvas (32px tiles) and never shows more detail than that, so each image is
// resized to the exact size the renderer draws it at: 34x22 tiles for floors 1-3, 27x17 for the rest.
import { mkdir, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";
import { hasPatch, makePicture, patchFloor } from "./map-patches.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, "art", "maps", "original");
const target = path.join(root, "art", "maps", "painted");
const canvasFor = name => (Number(name.match(/depth-(\d+)/)?.[1]) <= 3 ? [34 * 32, 22 * 32] : [27 * 32, 17 * 32]);
const QUALITY = Number(process.env.MAP_QUALITY ?? 96);

await mkdir(target, { recursive: true });
let before = 0, after = 0;
for (const name of (await readdir(source)).filter(n => n.endsWith(".png")).sort()) {
  const input = path.join(source, name);
  const { width, height } = await sharp(input).metadata();
  const [CANVAS_W, CANVAS_H] = canvasFor(name);
  // Retain the old painted-map registration for the archived reference pictures.
  const scale = Math.min(CANVAS_W / width, CANVAS_H / height);
  const w = Math.round(width * scale), h = Math.round(height * scale);
  const output = path.join(target, name.replace(/\.png$/, ".webp"));
  const depth = Number(name.match(/depth-(\d+)/)?.[1]);
  const resized = sharp(input).resize(w, h, { kernel: "lanczos3" });
  if (hasPatch(depth)) {
    // Floors with touch-ups (see map-patches.mjs) are placed on the full game canvas first, where the patches are measured.
    const left = Math.floor((CANVAS_W - w) / 2), top = Math.floor((CANVAS_H - h) / 2);
    const { data } = await resized.ensureAlpha().extend({ top, bottom: CANVAS_H - h - top, left, right: CANVAS_W - w - left, background: "#000000" })
      .raw().toBuffer({ resolveWithObject: true });
    const patched = patchFloor(depth, makePicture(data, CANVAS_W, CANVAS_H));
    await sharp(Buffer.from(patched.data), { raw: { width: CANVAS_W, height: CANVAS_H, channels: 4 } }).webp({ quality: QUALITY, effort: 6 }).toFile(output);
  } else {
    await resized.webp({ quality: QUALITY, effort: 6 }).toFile(output);
  }
  const [a, b] = [(await stat(input)).size, (await stat(output)).size];
  before += a; after += b;
  console.log(`${name}: ${width}x${height} -> ${w}x${h}  ${(a / 1024).toFixed(0)} KB -> ${(b / 1024).toFixed(0)} KB`);
}
console.log(`total ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(2)} MB`);
