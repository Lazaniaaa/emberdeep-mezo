import { describe, expect, it } from "vitest";
import { NO_PERKS } from "@/game/catalog";
import { applyAction, emptyBag, startRun, type RunState } from "@/game/run";
import { bossDrained, deathExplanation, lightLoss, riftEstimate, SHAKE_PX, shakeWeight } from "./turn-feedback";
import { RunPresentation } from "./run-presentation";

const room = (): RunState => {
  const s = startRun({ seed: 42, flasks: 3, perks: NO_PERKS, weaponDamage: 16, bag: emptyBag() });
  s.floor.w = 11; s.floor.h = 11; s.floor.tiles = Array(121).fill(1); s.floor.seen = Array(121).fill(1);
  s.floor.props = []; s.floor.items = []; s.floor.dimlings = []; s.floor.spawn = { x: 2, y: 4 };
  s.player = { x: 4, y: 4, facing: "right" };
  return s;
};
const bossRoom = () => {
  const s = room();
  s.floor.dimlings = [{ id: 99, x: 5, y: 4, size: 2, boss: true, awake: true, hp: 150, maxHp: 150, phase:"windup",windupLeft:1 }];
  return s;
};

describe("presentation feedback reads resolved rules", () => {
  it("shows exact net light loss and distinguishes steps from hits and boss contacts", () => {
    const s = room(), walked = applyAction(s, { type: "move", dx: -1, dy: 0 });
    expect(lightLoss(s, walked)).toEqual({ amount: 1, cause: "step" });
    expect(shakeWeight(s, walked, false)).toBe("none");
    const b = bossRoom(), hit = applyAction(b, { type: "move", dx: 1, dy: 0 });
    expect(hit.steps).toBe(b.steps);
    expect(lightLoss(b, hit)).toEqual({ amount: 40, cause: "boss" });
    expect(bossDrained(b, hit)).toBe(true);
    expect(shakeWeight(b, hit, false)).toBe("boss");
    expect(lightLoss(s, { ...s, light: s.light - 3, events: ["drain"] })).toEqual({ amount: 3, cause: "hit" });
  });

  it("does not invent a boss hit when another creature hits and the boss merely moves adjacent", () => {
    const s = bossRoom(); s.floor.dimlings[0].x = 6;
    const next = structuredClone(s); next.floor.dimlings[0].x = 5; next.events = ["drain"]; next.light -= 3;
    expect(bossDrained(s, next)).toBe(false);
    expect(lightLoss(s, next)?.cause).toBe("hit");
  });

  it("does not show damage for ward, a dead boss, refilling oil, bumps or new floors", () => {
    const s = bossRoom(); s.ward = 1;
    const protectedHit = applyAction(s, { type: "move", dx: 1, dy: 0 });
    expect(bossDrained(s, protectedHit)).toBe(false);
    expect(lightLoss(s, protectedHit)).toBeNull();
    const dying = bossRoom(); dying.floor.dimlings[0].hp = 1;
    expect(bossDrained(dying, applyAction(dying, { type: "move", dx: 1, dy: 0 }))).toBe(false);
    expect(lightLoss(s, s)).toBeNull();
    expect(lightLoss(s, { ...s, light: s.light + 30 })).toBeNull();
    expect(lightLoss(s, { ...s, depth: 2, light: 1 })).toBeNull();
  });

  it("clamps displayed fatal loss to the remaining bar and describes Night Vision separately", () => {
    const s = bossRoom(); s.light = 3;
    const dead = applyAction(s, { type: "move", dx: 1, dy: 0 });
    expect(dead.status).toBe("dead");
    expect(lightLoss(s, dead)).toEqual({ amount: 3, cause: "boss" });
    expect(deathExplanation(s, dead)).toBe("Last loss: −3 light · boss");
    const night = room(); night.light = 0; night.nightVision = 1;
    expect(deathExplanation(night, applyAction(night, { type: "wait" }))).toBe("Night Vision exhausted · step");
  });

  it("weights shake, with death strongest, and disables every weight under reduced motion", () => {
    const s = room();
    for (const [loss, weight] of [[2, "small"], [12, "big"]] as const) {
      const n = { ...s, light: s.light - loss, events: ["drain"] as RunState["events"] };
      expect(shakeWeight(s, n, false)).toBe(weight);
      expect(shakeWeight(s, n, true)).toBe("none");
    }
    const b = bossRoom(); b.light = 2;
    const dead = applyAction(b, { type: "move", dx: 1, dy: 0 });
    expect(shakeWeight(b, dead, false)).toBe("death");
    expect(shakeWeight(b, dead, true)).toBe("none");
    expect(SHAKE_PX.small).toBeLessThan(SHAKE_PX.big);
    expect(SHAKE_PX.big).toBeLessThan(SHAKE_PX.boss);
    expect(SHAKE_PX.boss).toBeLessThan(SHAKE_PX.death);
  });
});

describe("known rift estimate", () => {
  it("uses only seen walkable tiles and current depth/discount, without assuming unseen shortcuts", () => {
    const s = room(); s.depth = 5; s.perks = { ...NO_PERKS, stepDiscount: 0.25 };
    expect(riftEstimate(s)).toEqual({ steps: 2, light: 3 });
    s.floor.seen.fill(0);
    for (const [x, y] of [[4, 4], [4, 3], [3, 3], [2, 3], [2, 4]]) s.floor.seen[y * 11 + x] = 1;
    expect(riftEstimate(s)).toEqual({ steps: 4, light: 6 });
    s.floor.tiles[3 * 11 + 3] = 0;
    expect(riftEstimate(s)).toBeNull();
  });
  it("returns zero at the rift and deliberately ignores creatures and props (a lower bound)", () => {
    const s = bossRoom();
    s.floor.props = [{ id: 2, x: 3, y: 4, kind: "crate", hp: 2, maxHp: 2 }];
    expect(riftEstimate(s)?.steps).toBe(2);
    s.player = { ...s.floor.spawn, facing: "up" };
    expect(riftEstimate(s)).toEqual({ steps: 0, light: 0 });
  });
});

describe("RunPresentation", () => {
  it("animates every boss drain from attacks with unchanged steps, once per action and never per repaint", () => {
    let s = bossRoom(); const p = new RunPresentation(s); const before = structuredClone(s);
    for (let i=0;i<9;i++) {
      const at=1000+i*400;
      const next = applyAction(s, { type: "move", dx: 1, dy: 0 });
      p.observe(next, at);
      expect(p.creatures.pose(next.floor.dimlings[0], at + 100).striking).toBe(i%4===0);
      p.observe(next, at + 400);
      expect(p.creatures.pose(next.floor.dimlings[0], at + 400).striking).toBe(false);
      expect(next.steps).toBe(0); s = next;
    }
    expect(before).toEqual(bossRoom());
  });
  it("emits a labelled loss and retains the final explanation without changing either run", () => {
    const s = bossRoom(); s.light = 3;
    const next = applyAction(s, { type: "move", dx: 1, dy: 0 }), saved = structuredClone(next);
    const p = new RunPresentation(s); p.observe(next, 1000);
    expect(p.death).toBe("Last loss: −3 light · boss");
    const texts: string[] = [];
    p.fx.draw({ save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, stroke() {}, strokeText() {}, fillRect() {}, measureText(t: string) { return { width: t.length * 5 }; }, fillText(text: string) { texts.push(text); } } as unknown as CanvasRenderingContext2D, 1000, true);
    expect(texts).toContain("−3 light · boss");
    expect(next).toEqual(saved);
  });
});
