import { describe, expect, it } from "vitest";
import { NO_PERKS } from "@/game/catalog";
import { idx, type Dimling } from "@/game/dungeon";
import { applyAction, emptyBag, startRun, type RunState } from "@/game/run";
import type { Fx } from "./fx";
import { HERO_HURT_MS, HERO_STRIKE_MS, HERO_WINDUP_MS, HeroAttacks, heroMotion, turnEffects } from "./hero-anim";

/** An open room with the delver in the middle facing right, and nothing else on the floor. */
function room(over: Partial<Parameters<typeof startRun>[0]> = {}): RunState {
  const s = startRun({ seed: 7, flasks: 5, perks: NO_PERKS, weaponDamage: 8, bag: emptyBag(), ...over });
  s.floor.tiles.fill(0);
  for (let y = 2; y <= 12; y++) for (let x = 2; x <= 12; x++) s.floor.tiles[idx(s.floor, x, y)] = 1;
  s.floor.items = [];
  s.floor.dimlings = [];
  s.floor.props = [];
  s.player = { x: 6, y: 6, facing: "right" };
  return s;
}

const creature = (over: Partial<Dimling> = {}): Dimling => ({
  id: 1, x: 7, y: 6, hp: 16, maxHp: 16, awake: true, species: "wickgnaw", phase: "idle", windupLeft: 0, cooldown: 0, aim: null, ...over,
});

const of = <K extends Fx["kind"]>(fx: Fx[], kind: K) => fx.filter((f): f is Extract<Fx, { kind: K }> => f.kind === kind);

describe("heroMotion", () => {
  it("keeps each contact visible while a key submits attacks every 90 ms, with no growing animation backlog", () => {
    const attacks = new HeroAttacks();
    const pose = (t: number, still = false) => attacks.pose(t, "down", false, 0, -Infinity, still);
    attacks.add(0, "right"); expect(pose(45).frame).toBe("w");
    for (let at = 90; at <= 900; at += 90) {
      attacks.add(at, "right");
      expect(pose(at + 10)).toMatchObject({ frame: "s", dir: "right" });
      expect(pose(at + 55).frame).toBe("w");
    }
    expect(pose(1010, true)).toMatchObject({ frame: "s", offX: 0, offY: 0 });
    expect(pose(1200).frame).toBe("a");
    attacks.add(1300, "left"); attacks.clear(); expect(pose(1400).frame).toBe("a");
  });
  it("shows a contact even if the next render misses its usual 45 ms contact window", () => {
    const attacks = new HeroAttacks(); attacks.add(0, "right"); attacks.add(90, "right");
    expect(attacks.pose(145, "right", false, 0, -Infinity, false).frame).toBe("s");
    expect(attacks.pose(175, "right", false, 0, -Infinity, false).frame).toBe("w");
    expect(attacks.pose(200, "right", false, 0, -Infinity, false).frame).toBe("s");
  });
  it("stands still, and walks with the leading foot swapping tile by tile", () => {
    expect(heroMotion(1000, "down", false, 0, -Infinity, -Infinity, false).frame).toBe("a");
    expect(heroMotion(1000, "down", true, 4, -Infinity, -Infinity, false).frame).toBe("c");
    expect(heroMotion(1000, "down", true, 5, -Infinity, -Infinity, false).frame).toBe("b");
  });

  it("winds up, then lands the blow with a lunge toward where it faces, then stands again", () => {
    const at = 1000;
    expect(heroMotion(at, "right", false, 0, at, -Infinity, false)).toMatchObject({ frame: "w", offX: 0, offY: 0 });
    const mid = heroMotion(at + HERO_WINDUP_MS + HERO_STRIKE_MS / 2, "right", false, 0, at, -Infinity, false);
    expect(mid.frame).toBe("s");
    expect(mid.offX).toBeGreaterThan(0);
    expect(mid.offY).toBe(0);
    const up = heroMotion(at + HERO_WINDUP_MS + HERO_STRIKE_MS / 2, "up", false, 0, at, -Infinity, false);
    expect(up.offY).toBeLessThan(0);
    expect(heroMotion(at + HERO_WINDUP_MS + HERO_STRIKE_MS, "right", false, 0, at, -Infinity, false)).toMatchObject({ frame: "a", offX: 0 });
  });

  it("keeps the frames but drops the lunge with reduced motion", () => {
    const m = heroMotion(1000 + HERO_WINDUP_MS + HERO_STRIKE_MS / 2, "left", false, 0, 1000, -Infinity, true);
    expect(m).toMatchObject({ frame: "s", offX: 0, offY: 0 });
  });

  it("flashes red when hit, fading out", () => {
    const early = heroMotion(1010, "down", false, 0, -Infinity, 1000, false).flash;
    const late = heroMotion(1000 + HERO_HURT_MS * 0.8, "down", false, 0, -Infinity, 1000, false).flash;
    expect(early).toBeGreaterThan(late);
    expect(late).toBeGreaterThan(0);
    expect(heroMotion(1000 + HERO_HURT_MS, "down", false, 0, -Infinity, 1000, false).flash).toBe(0);
  });
});

describe("turnEffects", () => {
  it("shows the swing on the struck tile and the damage, both when the blow lands", () => {
    const s = room();
    s.floor.dimlings = [creature({ hp: 30, maxHp: 30, awake: false })];
    const next = applyAction(s, { type: "move", dx: 1, dy: 0 });
    expect(next.events).toContain("hit");
    const turn = turnEffects(s, next, 5000);
    expect(turn.attack).toBe(true);
    expect(of(turn.fx, "slash")).toEqual([{ kind: "slash", x: 7, y: 6, dx: 1, dy: 0, at: 5000 + HERO_WINDUP_MS }]);
    const dealt = 30 - next.floor.dimlings[0].hp;
    expect(of(turn.fx, "text")).toMatchObject([{ x: 7, y: 6, text: `-${dealt}`, at: 5000 + HERO_WINDUP_MS }]);
  });

  it("leaves a puff where a creature fell", () => {
    const s = room();
    s.floor.dimlings = [creature({ hp: 3, maxHp: 3, awake: false })];
    const next = applyAction(s, { type: "move", dx: 1, dy: 0 });
    expect(next.events).toContain("kill");
    const turn = turnEffects(s, next, 0);
    expect(of(turn.fx, "puff")).toMatchObject([{ x: 7, y: 6 }]);
    expect(of(turn.fx, "text")[0].text).toBe("-3");
  });

  it("shows a prop cracking and breaking", () => {
    const s = room();
    s.floor.props = [{ id: 9, x: 7, y: 6, kind: "barrel", hp: 2, maxHp: 2 }];
    const cracked = applyAction(s, { type: "move", dx: 1, dy: 0 });
    expect(cracked.events).toContain("smash");
    const first = turnEffects(s, cracked, 0);
    expect(first.attack).toBe(true);
    // A crack is shown by the prop's own picture; no number, nothing breaks yet.
    expect(of(first.fx, "text")).toHaveLength(0);
    expect(of(first.fx, "puff")).toHaveLength(0);
    expect(of(first.fx, "shatter")).toHaveLength(0);

    const weak = room();
    weak.floor.props = [{ id: 9, x: 7, y: 6, kind: "urn", hp: 1, maxHp: 1 }];
    const broken = applyAction(weak, { type: "move", dx: 1, dy: 0 });
    expect(broken.events).toContain("break");
    const effects = turnEffects(weak, broken, 0).fx;
    expect(of(effects, "puff")).toMatchObject([{ x: 7, y: 6 }]);
    // It breaks apart from where it stood: whole, at its only blow.
    expect(of(effects, "shatter")).toMatchObject([{ x: 7, y: 6, prop: "urn", hp: 1, maxHp: 1 }]);
  });

  it("bursts on every tile a creature's blow lands on, and marks the delver hurt", () => {
    let s = room();
    s.floor.dimlings = [creature()];
    s = applyAction(s, { type: "wait" });
    const next = applyAction(s, { type: "wait" });
    expect(next.events).toContain("drain");
    const turn = turnEffects(s, next, 0);
    expect(turn.hurt).toBe(true);
    expect(turn.attack).toBe(false);
    expect(of(turn.fx, "impact").length).toBeGreaterThan(0);
    expect(of(turn.fx, "impact").some(f => f.x === 6 && f.y === 6)).toBe(true);
  });

  it("says DODGE when the delver steps out of a blow, and WARD when a ward turns it", () => {
    let s = room();
    s.floor.dimlings = [creature()];
    s = applyAction(s, { type: "wait" });
    const dodged = applyAction(s, { type: "move", dx: -1, dy: 0 });
    expect(dodged.events).toContain("miss");
    expect(of(turnEffects(s, dodged, 0).fx, "text").map(f => f.text)).toEqual(["DODGE"]);

    let w = room({ bag: { ...emptyBag(), ward: 1 } });
    w.floor.dimlings = [creature()];
    w = applyAction(w, { type: "potion", id: "ward" });
    w = applyAction(w, { type: "wait" });
    const warded = applyAction(w, { type: "wait" });
    expect(warded.events).toContain("miss");
    expect(of(turnEffects(w, warded, 0).fx, "text").map(f => f.text)).toEqual(["WARD"]);
  });

  it("shows nothing across floors or descents", () => {
    const s = room();
    s.floor.dimlings = [creature({ hp: 3, maxHp: 3 })];
    const other = { ...applyAction(s, { type: "move", dx: 1, dy: 0 }), depth: 2 };
    expect(turnEffects(s, other, 0)).toEqual({ fx: [], attack: false, hurt: false });
  });
});
