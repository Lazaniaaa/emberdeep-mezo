import sharp from 'sharp';

export const TILE_SIZE = 32, TILE_COLS = 4, TILE_ROWS = 5;
export const JOINT = [11, 26, 36, 255];
// Includes compressed magenta fringes, while retaining blue water and warm rune/fire pixels.
export const isTileMatte = (r, g, b) => Math.min(r, b) > 40 && g < 0.55 * Math.min(r, b) && Math.min(r, b) > 0.45 * Math.max(r, b);

function bands(projection, maxGap = 20) {
  const result = [];
  for (let n = 0; n < projection.length; n++) {
    if (!projection[n]) continue;
    const last = result.at(-1);
    if (last && n - last[1] <= maxGap + 1) last[1] = n;
    else result.push([n, n]);
  }
  return result;
}

/** Detect actual artwork bands, not equal sheet partitions (the torch crosses an equal-row boundary). */
export async function cutTiles(input, theme = 'catacombs') {
  if (!['catacombs', 'mycelium', 'cinderworks', 'hollowglass'].includes(theme)) throw new Error(`Unknown tile theme: ${theme}`);
  const earth = theme === 'mycelium';
  const late = theme === 'cinderworks' || theme === 'hollowglass';
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info, rows = new Uint32Array(h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 4;
    if (isTileMatte(data[p], data[p + 1], data[p + 2])) data[p + 3] = 0;
    else if (data[p + 3]) rows[y]++;
  }
  const rowBands = bands(rows);
  if (rowBands.length !== 5) throw new Error(`Expected 5 artwork rows, found ${rowBands.length}`);
  const width = TILE_COLS * TILE_SIZE, height = TILE_ROWS * TILE_SIZE;
  const atlas = Buffer.alloc(width * height * 4), boxes = [];
  for (const [row, [y0, y1]] of rowBands.entries()) {
    const cols = new Uint32Array(w);
    for (let y = y0; y <= y1; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3]) cols[x]++;
    const colBands = bands(cols), expected = row === 4 ? 2 : 4;
    if (colBands.length !== expected) throw new Error(`Row ${row + 1}: expected ${expected} tiles, found ${colBands.length}`);
    for (const [col, [x0, x1]] of colBands.entries()) {
      let top = y1, bottom = y0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (data[(y * w + x) * 4 + 3]) {
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      const box = { left: x0, top, width: x1 - x0 + 1, height: bottom - top + 1 };
      boxes.push({ row, col, ...box });
      // The translucent spore puff is rendered as a soft glow, not a matte-cut opaque sprite.
      if (earth && row === 3 && col === 1) continue;
      let crop = box;
      if (row === 0) {
        const inset = earth ? 0.05 : 0.075;
        const ix = Math.round(box.width * inset), iy = Math.round(box.height * inset);
        crop = { left: box.left + ix, top: box.top + iy, width: box.width - 2 * ix, height: box.height - 2 * iy };
      } else if (late && row === 1) {
        // Crop past compression/matte remnants on the outer rock frame, not just its tight box.
        const ix = Math.max(3, Math.round(box.width * 0.025)), iy = Math.max(3, Math.round(box.height * 0.025));
        crop = { left: box.left + ix, top: box.top + iy, width: box.width - 2 * ix, height: box.height - 2 * iy };
      }
      const tile = sharp(data, { raw: { width: w, height: h, channels: 4 } }).extract(crop);
      const structural = row < 3, opaque = structural && !(theme === 'hollowglass' && row === 2);
      const size = (row === 0 && !earth) || !structural ? 30 : 32;
      const pixels = await tile.resize(size, size, { fit: structural ? 'fill' : 'inside', kernel: 'nearest' }).raw().toBuffer({ resolveWithObject: true });
      const ox = col * 32, oy = row * 32;
      if (opaque) for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) atlas.set(JOINT, ((oy + y) * width + ox + x) * 4);
      const dx = Math.floor((32 - pixels.info.width) / 2), dy = Math.floor((32 - pixels.info.height) / 2);
      for (let y = 0; y < pixels.info.height; y++) for (let x = 0; x < pixels.info.width; x++) {
        const p = (y * pixels.info.width + x) * 4, dest = ((oy + dy + y) * width + ox + dx + x) * 4;
        if (pixels.data[p + 3]) {
          pixels.data.copy(atlas, dest, p, p + 4);
          if (theme === 'hollowglass' && row === 4 && col === 1) {
            // The owner asked for a more legible crystal gate. Brighten only its non-matte artwork.
            for (let channel = 0; channel < 3; channel++) atlas[dest + channel] = Math.min(255, Math.round(atlas[dest + channel] * 1.45 + 12));
            // Lift clipped purple highlights toward luminous lavender rather than creating matte-like magenta.
            if(isTileMatte(atlas[dest],atlas[dest+1],atlas[dest+2]))atlas[dest+1]=Math.ceil(0.56*Math.min(atlas[dest],atlas[dest+2]));
          }
        }
      }
    }
  }
  return { data: atlas, width, height, boxes };
}

export async function writeTiles(input, output, theme = 'catacombs') {
  const sheet = await cutTiles(input, theme);
  await sharp(sheet.data, { raw: { width: sheet.width, height: sheet.height, channels: 4 } }).png().toFile(output);
  console.log(`${input} -> ${output}: ${sheet.boxes.length} tiles, ${sheet.width}x${sheet.height}`);
}
