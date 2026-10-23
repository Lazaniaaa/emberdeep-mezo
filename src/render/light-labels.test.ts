import { describe, expect, it } from "vitest";
import { LightLabels } from "./light-labels";
const bounds = { x: 0, y: 0, w: 500, h: 500 }, hero = { x: 6, y: 7 };
const measure = (s: string) => s.length * 5;
describe("stacked light feedback", () => {
  it("merges identical amounts and causes within 500ms, using their total and count", () => {
    const q = new LightLabels();
    for (const t of [0, 150, 400]) q.add({ amount: 40, cause: "boss" }, hero, t);
    expect(q.layout(400, measure, bounds, []).map(e => e.text)).toEqual(["−120 light · boss ×3"]);
    q.add({ amount: 40, cause: "boss" }, hero, 901);
    expect(q.layout(901, measure, bounds, [])).toHaveLength(2);
  });
  it("keeps different amounts/causes in separate lanes, newest above, clear of boss and damage", () => {
    const q = new LightLabels(), avoid = [{ x: 180, y: 160, w: 80, h: 25 }, { x: 180, y: 110, w: 100, h: 30 }];
    q.add({ amount: 1, cause: "step" }, hero, 0);
    q.add({ amount: 1, cause: "hit" }, hero, 100);
    q.add({ amount: 40, cause: "boss" }, hero, 200);
    const labels = q.layout(200, measure, bounds, avoid);
    expect(labels).toHaveLength(3);
    expect(labels[2].rect.y + labels[2].rect.h).toBeLessThan(labels[1].rect.y);
    expect(labels[1].rect.y + labels[1].rect.h).toBeLessThan(labels[0].rect.y);
    for (const { rect: r } of labels) for (const b of avoid) expect(r.x >= b.x+b.w || r.x+r.w <= b.x || r.y >= b.y+b.h || r.y+r.h <= b.y).toBe(true);
    q.clear(); expect(q.layout(200, measure, bounds, [])).toEqual([]);
  });
  it("expires unseen labels too and respects a camera near the top of the map", () => {
    const q = new LightLabels(); q.add({ amount: 1, cause: "step" }, {x: 1,y: 1}, 0);
    const [label] = q.layout(0, measure, bounds, []); expect(label.rect.y).toBeGreaterThanOrEqual(4);
    expect(q.layout(1100, measure, bounds, [])).toEqual([]);
  });
  it("merges identical displayed decimals despite floating point subtraction", () => {
    const q = new LightLabels();
    q.add({ amount: 0.3-0.2, cause: "step" }, hero, 0);
    q.add({ amount: 0.1, cause: "step" }, hero, 100);
    expect(q.layout(100, measure, bounds, []).map(e=>e.text)).toEqual(["−0.2 light · step ×2"]);
  });
});
