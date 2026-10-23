import { describe, expect, it } from "vitest";
import type { Dimling } from "@/game/dungeon";
import { CREATURE_MOVE_MS, CreatureAnimator, HIT_FLASH_MS, IDLE_MS, KNOCKBACK_MS, STRIKE_MS, WALK_MS } from "./creature-anim";
import { HERO_WINDUP_MS } from "./hero-anim";

const creature = (over: Partial<Dimling> = {}): Dimling => ({
  id: 1, x: 5, y: 5, hp: 16, maxHp: 16, awake: true, species: "wickgnaw", phase: "idle", windupLeft: 0, cooldown: 0, aim: null, ...over,
});

describe("CreatureAnimator", () => {
  it("does not let a new boss contact erase an unshown strike on a slower render frame", () => {
    const a = new CreatureAnimator(), boss = creature({ boss: true, size: 2 });
    a.update("slow", [boss], { x: 4, y: 5 }, 0, 0);
    a.update("slow", [boss], { x: 4, y: 5 }, 1000, 1, true);
    expect(a.pose(boss, 1050).frame).toBe("w");
    a.update("slow", [boss], { x: 4, y: 5 }, 1090, 2, true);
    expect(a.pose(boss, 1110).frame).toBe("s");
    expect(a.pose(boss, 1140).frame).toBe("w");
    expect(a.pose(boss, 1160).frame).toBe("s");
  });
  it("shows a creature standing on its tile when it has not moved", () => {
    const a = new CreatureAnimator();
    const d = creature();
    a.update("run:1", [d], { x: 5, y: 9 }, 1000);
    const pose = a.pose(d, 1000);
    expect(pose.x).toBe(5);
    expect(pose.y).toBe(5);
  });

  it("glides between tiles on a walk cycle with a hop instead of jumping", () => {
    const a = new CreatureAnimator();
    a.update("run:1", [creature({ species: "snaretoad" })], { x: 9, y: 5 }, 1000);
    const moved = creature({ species: "snaretoad", x: 6 });
    a.update("run:1", [moved], { x: 9, y: 5 }, 2000);
    const start = a.pose(moved, 2000);
    const middle = a.pose(moved, 2000 + CREATURE_MOVE_MS / 2);
    const end = a.pose(moved, 2000 + CREATURE_MOVE_MS);
    expect(start.x).toBeCloseTo(5, 5);
    expect(middle.x).toBeGreaterThan(5.3);
    expect(middle.x).toBeLessThan(5.7);
    expect(middle.lift).toBeGreaterThan(0);
    expect(Number.isInteger(middle.lift)).toBe(true);
    expect(end.x).toBe(6);
    expect(end.lift).toBe(0);
    // The two halves of the walk alternate.
    expect(a.pose(moved, 2000).frame).not.toBe(a.pose(moved, 2000 + WALK_MS).frame);
  });

  it("carries on from where the picture is when a second step starts mid-glide", () => {
    const a = new CreatureAnimator();
    a.update("run:1", [creature()], { x: 9, y: 5 }, 1000);
    a.update("run:1", [creature({ x: 6 })], { x: 9, y: 5 }, 2000);
    const seen = a.pose(creature({ x: 6 }), 2000 + CREATURE_MOVE_MS / 2).x;
    a.update("run:1", [creature({ x: 7 })], { x: 9, y: 5 }, 2000 + CREATURE_MOVE_MS / 2);
    expect(a.pose(creature({ x: 7 }), 2000 + CREATURE_MOVE_MS / 2).x).toBeCloseTo(seen, 5);
  });

  it("snaps to the tile when a creature is carried far, such as onto a new floor", () => {
    const a = new CreatureAnimator();
    a.update("run:1", [creature()], { x: 9, y: 5 }, 1000);
    const far = creature({ x: 20, y: 12 });
    a.update("run:1", [far], { x: 9, y: 5 }, 2000);
    expect(a.pose(far, 2000).x).toBe(20);
    expect(a.pose(far, 2000).y).toBe(12);
  });

  it("starts afresh on a new floor", () => {
    const a = new CreatureAnimator();
    a.update("run:1", [creature()], { x: 9, y: 5 }, 1000);
    const next = creature({ x: 6 });
    a.update("run:2", [next], { x: 9, y: 5 }, 2000);
    expect(a.pose(next, 2000).x).toBe(6);
  });

  it("looks at the delver once awake, and keeps its look when level with them", () => {
    const a = new CreatureAnimator();
    const d = creature();
    a.update("run:1", [d], { x: 9, y: 5 }, 1000);
    expect(a.pose(d, 1000).flip).toBe(false);
    a.update("run:1", [d], { x: 1, y: 5 }, 1100);
    expect(a.pose(d, 1100).flip).toBe(true);
    a.update("run:1", [d], { x: 5, y: 9 }, 1200);
    expect(a.pose(d, 1200).flip).toBe(true);
  });

  it("leaves a sleeping creature looking the way it was", () => {
    const a = new CreatureAnimator();
    const asleep = creature({ awake: false });
    a.update("run:1", [asleep], { x: 1, y: 5 }, 1000);
    expect(a.pose(asleep, 1000).flip).toBe(false);
    expect(a.pose(asleep, 1000).lift).toBe(0);
  });

  it("shows the wind-up pose and trembles more as the blow gets closer", () => {
    const a = new CreatureAnimator();
    const calm = creature({ species: "snaretoad" });
    a.update("run:1", [calm], { x: 6, y: 5 }, 1000);
    expect(a.pose(calm, 1013).frame).not.toBe("w");
    expect(a.pose(calm, 1013).offX).toBe(0);
    const first = creature({ species: "snaretoad", phase: "windup", windupLeft: 2 });
    const last = creature({ species: "snaretoad", phase: "windup", windupLeft: 1 });
    expect(a.pose(first, 1013).frame).toBe("w");
    let early = 0, late = 0;
    for (let t = 0; t < 400; t += 7) {
      early = Math.max(early, Math.abs(a.pose(first, 1000 + t).offX));
      late = Math.max(late, Math.abs(a.pose(last, 1000 + t).offX));
    }
    expect(late).toBeGreaterThanOrEqual(early);
    expect(late).toBeGreaterThan(0);
  });

  it("makes a waiting creature bob: floaters swap frames, the rest rise a pixel", () => {
    const a = new CreatureAnimator();
    const moth = creature({ id: 2, species: "cinder-hound" });
    const rat = creature({ id: 3, species: "wickgnaw" });
    a.update("run:1", [moth, rat], { x: 9, y: 5 }, 1000);
    const frames = new Set<string>(), lifts = new Set<number>();
    for (let t = 0; t < IDLE_MS * 3; t += 50) {
      frames.add(a.pose(moth, 1000 + t).frame);
      lifts.add(a.pose(rat, 1000 + t).lift);
    }
    expect(frames.size).toBe(2);
    expect([...lifts].sort()).toEqual([0, 1]);
  });

  it("lunges along its blow when it lands, shown whole rather than faded", () => {
    const a = new CreatureAnimator();
    const winding = creature({ phase: "windup", windupLeft: 1, aim: { x: -1, y: 0 } });
    a.update("run:1", [winding], { x: 4, y: 5 }, 1000);
    const struck = creature({ phase: "recovery", cooldown: 1, aim: null });
    a.update("run:1", [struck], { x: 4, y: 5 }, 2000);
    const mid = a.pose(struck, 2000 + STRIKE_MS / 2);
    expect(mid).toMatchObject({ frame: "s", striking: true, offY: 0 });
    expect(mid.offX).toBeLessThan(0);
    const after = a.pose(struck, 2000 + STRIKE_MS);
    expect(after).toMatchObject({ striking: false, offX: 0 });
  });

  it("lunges at the delver when its blow covers every side", () => {
    const a = new CreatureAnimator();
    a.update("run:1", [creature({ phase: "windup", windupLeft: 1 })], { x: 5, y: 8 }, 1000);
    const struck = creature({ phase: "recovery", cooldown: 1 });
    a.update("run:1", [struck], { x: 5, y: 8 }, 2000);
    const mid = a.pose(struck, 2000 + STRIKE_MS / 2);
    expect(mid.offY).toBeGreaterThan(0);
    expect(mid.offX).toBe(0);
  });

  it("flashes white and is knocked away from the delver when the delver's blow lands", () => {
    const a = new CreatureAnimator();
    a.update("run:1", [creature()], { x: 4, y: 5 }, 1000);
    const hurt = creature({ hp: 8 });
    a.update("run:1", [hurt], { x: 4, y: 5 }, 2000);
    // The flash waits for the delver's wind-up, so it comes with the blow.
    expect(a.pose(hurt, 2000).flash).toBe(false);
    const landed = a.pose(hurt, 2000 + HERO_WINDUP_MS);
    expect(landed.flash).toBe(true);
    expect(landed.offX).toBeGreaterThan(0);
    const later = a.pose(hurt, 2000 + HERO_WINDUP_MS + KNOCKBACK_MS);
    expect(later).toMatchObject({ flash: false, offX: 0 });
    expect(HIT_FLASH_MS).toBeLessThanOrEqual(KNOCKBACK_MS);
  });

  it("animates the boss's walk and one wind-up/attack sequence per damaging turn", () => {
    const a = new CreatureAnimator();
    const boss = creature({ boss: true, size: 2 });
    a.update("run:1", [boss], { x: 9, y: 5 }, 1000);
    const moved = {...boss,x:6};
    a.update("run:1",[moved],{x:9,y:5},2000,1);
    expect(a.pose(moved,2000).frame).toBe("b");
    expect(a.pose(moved,2080).x).toBeCloseTo(5.5);
    a.update("run:1",[moved],{x:8,y:5},3000,2,true);
    expect(a.pose(moved,3000).frame).toBe("w");
    expect(a.pose(moved,3100).frame).toBe("s");
    a.update("run:1",[moved],{x:8,y:5},3300,2,true);
    expect(a.pose(moved,3300).frame).toBe("a"); // Repainting the same turn cannot restart the attack.
    a.update("run:1",[moved],{x:8,y:5},4000,3,false);
    expect(a.pose(moved,4000).frame).toBe("a"); // Ward / a missed contact does not show a damaging blow.
  });
});
