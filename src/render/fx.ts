import type { PropKind } from "@/game/props";
import { LightLabels, type LabelRect } from "./light-labels";

/** One game tile in logical pixels, as in renderer.ts (not imported, to keep the renderer free to import this file). */
const TILE = 32;

/**
 * Short effects drawn over the cave, all in tile coordinates and all fading out on their own: the arc of the delver's
 * blow, numbers rising from what was hit, a puff where something broke or fell, loot hopping out of what broke, and
 * the burst where a creature's blow landed. They only decorate what the game state already says happened.
 */
export type Fx =
  | { kind: "slash"; x: number; y: number; dx: number; dy: number; at: number }
  | { kind: "text"; x: number; y: number; text: string; color: string; at: number }
  | { kind: "puff"; x: number; y: number; color: string; at: number }
  | { kind: "impact"; x: number; y: number; at: number }
  /** Loot hopping out of a broken prop or a fallen creature: its icon hops up off the tile, with the amount beside it.
   *  Several items from one thing settle one above another, `lift` pixels higher each. */
  | { kind: "drop"; x: number; y: number; item: DropIcon; text: string; color: string; lift: number; at: number }
  /** A prop breaking apart where it stood, frame by frame (only once its art exists). */
  | { kind: "shatter"; x: number; y: number; prop: PropKind; hp: number; maxHp: number; at: number };

/** What a drop shows: an item's own sprite, or a small blade for gear. */
export type DropIcon = "gold" | "crystal" | "oil" | "gear";

/**
 * Pictures the renderer draws for the effects, so this file need not import the renderer: a loot item centred on (x, y),
 * and a prop's breaking-apart frame on its base. Each returns false when it has nothing to draw.
 */
export type FxArt = {
  loot: (ctx: CanvasRenderingContext2D, item: Exclude<DropIcon, "gear">, x: number, y: number) => boolean;
  /** `k` runs from 0 to 1 over the effect, to pick the stage of breaking apart. */
  shatter: (ctx: CanvasRenderingContext2D, prop: PropKind, x: number, baseY: number, k: number, hp: number, maxHp: number) => boolean;
};
const NO_ART: FxArt = { loot: () => false, shatter: () => false };

const LIFE: Record<Fx["kind"], number> = { slash: 220, text: 750, puff: 340, impact: 240, drop: 1100, shatter: 560 };

const ease = (k: number) => 1 - (1 - k) * (1 - k);

export class FxQueue {
  private list: Fx[] = [];
  readonly light = new LightLabels();

  add(fx: Fx) {
    this.list.push(fx);
    if (this.list.length > 80) this.list.shift();
  }

  clear() {
    this.list = [];
    this.light.clear();
  }

  /**
   * Draws the live effects and forgets the finished ones. An effect whose `at` is still ahead waits for it. With reduced
   * motion, numbers stay put and nothing sweeps.
   */
  draw(ctx: CanvasRenderingContext2D, time: number, still: boolean, art: FxArt = NO_ART,
    bounds: LabelRect = { x: -10000, y: -10000, w: 20000, h: 20000 }, reserved: LabelRect[] = []) {
    this.list = this.list.filter(fx => time - fx.at < LIFE[fx.kind]);
    for (const fx of this.list) {
      if (time < fx.at) continue;
      const k = Math.min(1, (time - fx.at) / LIFE[fx.kind]);
      const cx = fx.x * TILE + TILE / 2, cy = fx.y * TILE + TILE / 2;
      ctx.save();
      switch (fx.kind) {
        case "slash": {
          if (still) break;
          // A bright crescent swept across the tile that was struck, turned toward the blow.
          const facing = Math.atan2(fx.dy, fx.dx);
          const sweep = ease(Math.min(1, k * 1.6));
          const from = facing - 1.25, to = from + 2.5 * sweep;
          ctx.globalAlpha = 1 - k;
          ctx.lineCap = "round";
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(cx - fx.dx * 6, cy - fx.dy * 6, 13, from, to); ctx.stroke();
          ctx.strokeStyle = "#ccff00";
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(cx - fx.dx * 6, cy - fx.dy * 6, 16, from, to); ctx.stroke();
          break;
        }
        case "text": {
          const rise = still ? 0 : Math.round(ease(k) * 14);
          ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
          ctx.font = "8px Silkscreen, monospace";
          ctx.textAlign = "center";
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#0b0912";
          ctx.strokeText(fx.text, cx, cy - 18 - rise);
          ctx.fillStyle = fx.color;
          ctx.fillText(fx.text, cx, cy - 18 - rise);
          break;
        }
        case "puff": {
          // Bits flying outward from where it was.
          ctx.globalAlpha = 1 - k;
          ctx.fillStyle = fx.color;
          const r = 3 + ease(k) * 12;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + 0.3;
            const s = i % 2 ? 3 : 2;
            ctx.fillRect(Math.round(cx + Math.cos(a) * r - s / 2), Math.round(cy + Math.sin(a) * r - s / 2), s, s);
          }
          break;
        }
        case "drop": {
          // Hops up out of the tile and settles a little higher, then fades.
          const hop = still ? 16 : Math.round(Math.sin(Math.min(1, k * 1.8) * Math.PI * 0.75) * 22 + ease(k) * 6);
          const x = Math.round(cx);
          const y = Math.round(cy - 4 - hop - fx.lift * (still ? 1 : ease(Math.min(1, k * 2))));
          ctx.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
          if (fx.item !== "gear") {
            art.loot(ctx, fx.item, x, y);
          } else {
            // A tiny blade: steel, a gold guard, a dark grip.
            ctx.fillStyle = "#0b0912"; ctx.fillRect(x - 1, y - 8, 4, 14);
            ctx.fillStyle = "#dfe6f2"; ctx.fillRect(x, y - 7, 2, 9);
            ctx.fillStyle = "#e8c070"; ctx.fillRect(x - 3, y + 2, 8, 2);
            ctx.fillStyle = "#5a3a22"; ctx.fillRect(x, y + 4, 2, 3);
          }
          ctx.font = "8px Silkscreen, monospace";
          ctx.textAlign = "left";
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#0b0912";
          ctx.strokeText(fx.text, x + 9, y + 3);
          ctx.fillStyle = fx.color;
          ctx.fillText(fx.text, x + 9, y + 3);
          break;
        }
        case "shatter": {
          // The prop cracks and flies apart stage by stage; the pieces fade out over the last fifth.
          ctx.globalAlpha = k < 0.8 ? 1 : 1 - (k - 0.8) / 0.2;
          art.shatter(ctx, fx.prop, cx, fx.y * TILE + TILE - 2, still ? 0.99 : k, fx.hp, fx.maxHp);
          break;
        }
        case "impact": {
          // A red burst on a tile a creature's blow just hit.
          ctx.globalAlpha = (1 - k) * 0.9;
          ctx.strokeStyle = "#ff4a2a";
          ctx.lineWidth = 2;
          const r0 = 3 + k * 4, r1 = 9 + k * 6;
          ctx.beginPath();
          for (let i = 0; i < 4; i++) {
            const a = Math.PI / 4 + (i * Math.PI) / 2;
            ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
            ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
          }
          ctx.stroke();
          break;
        }
      }
      ctx.restore();
    }
    // Reserve the entire rising path, rather than a single frame, so damage and loot never collide with light loss.
    const avoid = [...reserved];
    ctx.save(); ctx.font = "8px Silkscreen, monospace";
    for (const fx of this.list) {
      if (time < fx.at || (fx.kind !== "text" && fx.kind !== "drop")) continue;
      const w = ctx.measureText(fx.text).width + (fx.kind === "drop" ? 28 : 8);
      avoid.push({ x: fx.x * TILE + 16 - (fx.kind === "drop" ? 8 : w / 2), y: fx.y * TILE - 45 - (fx.kind === "drop" ? fx.lift : 0), w, h: 48 });
    }
    ctx.restore();
    this.light.draw(ctx, time, bounds, avoid);
  }
}
