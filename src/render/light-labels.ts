import type { Point } from "@/game/dungeon";
import { lightNumber, type LightLoss } from "./turn-feedback";

export type LabelRect = { x: number; y: number; w: number; h: number };
type Entry = LightLoss & { unit: number; count: number; at: number };
const LIFE = 1100, GAP = 15, PAD = 4;
const overlaps = (a: LabelRect, b: LabelRect) => a.x < b.x + b.w + PAD && a.x + a.w + PAD > b.x
  && a.y < b.y + b.h + PAD && a.y + a.h + PAD > b.y;

/** Presentation history only: identical losses coalesce, newest group occupies the top lane. */
export class LightLabels {
  private entries: Entry[] = [];
  private anchor: Point = { x: 0, y: 0 };
  get active() { return this.entries.length > 0; }

  add(loss: LightLoss, anchor: Point, at: number) {
    this.anchor = { ...anchor };
    this.entries = this.entries.filter(e => at - e.at < LIFE);
    const unit = Number(lightNumber(loss.amount));
    const match = this.entries.find(e => e.cause === loss.cause && e.unit === unit && at - e.at <= 500);
    if (match) {
      this.entries = this.entries.filter(e => e !== match);
      this.entries.push({ ...match, amount: match.amount + loss.amount, count: match.count + 1, at });
    } else this.entries.push({ ...loss, unit, count: 1, at });
    this.entries = this.entries.slice(-8);
  }

  clear() { this.entries = []; }

  layout(time: number, measure: (text: string) => number, bounds: LabelRect, avoid: LabelRect[]) {
    this.entries = this.entries.filter(e => time - e.at < LIFE);
    const entries = this.entries.filter(e => time >= e.at).map(e => ({ ...e,
      text: `−${lightNumber(e.amount)} light · ${e.cause}${e.count > 1 ? ` ×${e.count}` : ""}` }));
    if (!entries.length) return [];
    const w = Math.max(...entries.map(e => measure(e.text))) + 8, h = entries.length * GAP;
    const minX = bounds.x + PAD + w / 2, maxX = bounds.x + bounds.w - PAD - w / 2;
    const clamp = (x: number) => Math.max(minX, Math.min(maxX, x));
    const xs = [this.anchor.x * 32 + 16, ...avoid.flatMap(r => [r.x - w / 2 - PAD * 2, r.x + r.w + w / 2 + PAD * 2]), minX, maxX];
    let box: LabelRect | null = null;
    for (const x of xs) {
      let bottom = Math.min(this.anchor.y * 32 - 12, bounds.y + bounds.h - PAD);
      let candidate = { x: clamp(x) - w / 2, y: bottom - h, w, h };
      for (let n = 0; n <= avoid.length; n++) {
        const hits = avoid.filter(r => overlaps(candidate, r));
        if (!hits.length) break;
        bottom = Math.min(...hits.map(r => r.y)) - PAD * 2;
        candidate = { ...candidate, y: bottom - h };
      }
      if (candidate.y >= bounds.y + PAD && !avoid.some(r => overlaps(candidate, r))) { box = candidate; break; }
    }
    // Near the top edge there may be no room above the hero. Try a free side column inside the viewport.
    if (!box) for (const x of xs) {
      for (const y of [bounds.y + PAD, ...avoid.map(r => r.y + r.h + PAD * 2)]) {
        const candidate = { x: clamp(x) - w / 2, y, w, h };
        if (y+h <= bounds.y+bounds.h-PAD && !avoid.some(r => overlaps(candidate,r))) { box=candidate; break; }
      }
      if (box) break;
    }
    // Only a viewport smaller than the feedback itself can run out of room completely.
    box ??= { x: minX - w / 2, y: bounds.y + PAD, w, h };
    return entries.map((e, i) => ({ ...e, rect: { x: box.x, y: box.y + (entries.length - 1 - i) * GAP, w, h: 12 } }));
  }

  draw(ctx: CanvasRenderingContext2D, time: number, bounds: LabelRect, avoid: LabelRect[]) {
    ctx.save(); ctx.font = "8px Silkscreen, monospace"; ctx.textAlign = "center";
    for (const e of this.layout(time, text => ctx.measureText(text).width, bounds, avoid)) {
      ctx.globalAlpha = Math.min(1, (LIFE - (time - e.at)) / 250);
      ctx.fillStyle = "#0b0912df"; ctx.fillRect(e.rect.x, e.rect.y, e.rect.w, e.rect.h);
      ctx.fillStyle = e.cause === "step" ? "#e2d6ba" : "#ff997a";
      ctx.fillText(e.text, e.rect.x + e.rect.w / 2, e.rect.y + 9);
    }
    ctx.restore();
  }
}
