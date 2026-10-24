import { beforeAll, describe, expect, it, vi } from "vitest";
import { NO_PERKS } from "@/game/catalog";
import { emptyBag, startRun } from "@/game/run";
import { useGame } from "./store";

const saved = new Map<string, string>();
const storage = {
  getItem: (name: string) => saved.get(name) ?? null,
  setItem: (name: string, value: string) => { saved.set(name, value); },
  removeItem: (name: string) => { saved.delete(name); },
};
let useRun: typeof import("./run-store").useRun;
let validSavedRun: typeof import("./run-store").validSavedRun;
let settle: typeof import("./run-store").settle;

beforeAll(async () => {
  vi.stubGlobal("sessionStorage", storage);
  ({ useRun, validSavedRun, settle } = await import("./run-store"));
});

describe("active run recovery", () => {
  it("restores an old lantern's capacity from start light and level, clamps overflow and rejects invalid capacity",()=>{
    const legacy=startRun({seed:7,flasks:2,perks:NO_PERKS,weaponDamage:8,bag:emptyBag()});
    legacy.level=3;legacy.light=999;
    delete (legacy as Partial<typeof legacy>).maxLight;
    const restored=useRun.persist.getOptions().merge!({run:legacy},useRun.getState()) as ReturnType<typeof useRun.getState>;
    expect(restored.run?.maxLight).toBe(180);expect(restored.run?.light).toBe(180);
    expect(validSavedRun({...legacy,maxLight:-1})).toBe(false);
    expect(validSavedRun({...legacy,maxLight:Infinity})).toBe(false);
  });
  it("restores and continues a run after rehydration", async () => {
    useRun.getState().start({ seed: 7, flasks: 2, perks: NO_PERKS, weaponDamage: 1, bag: emptyBag() });
    useRun.getState().act({ type: "wait" });
    const before = useRun.getState().run;
    const snapshot = saved.get("emberdeep-run-v1");
    expect(snapshot).toBeTruthy();

    useRun.getState().clear();
    saved.set("emberdeep-run-v1", snapshot!);
    await useRun.persist.rehydrate();
    expect(useRun.getState().run).toEqual(before);
    useRun.getState().act({ type: "wait" });
    expect(useRun.getState().run?.steps).toBe((before?.steps ?? 0) + 1);
    useRun.getState().clear();
  });

  it("drops a malformed run instead of crashing during rehydration", async () => {
    saved.set("emberdeep-run-v1", JSON.stringify({ state: { run: { floor: null } }, version: 0 }));
    await useRun.persist.rehydrate();
    expect(useRun.getState().run).toBeNull();
  });
});

describe("saved run validation", () => {
  const good = () => JSON.parse(JSON.stringify(startRun({ seed: 7, flasks: 2, perks: NO_PERKS, weaponDamage: 1, bag: emptyBag() })));

  it("accepts a complete run and rejects saves with holes in nested data", () => {
    expect(validSavedRun(good())).toBe(true);
    const holes: [string, (r: Record<string, any>) => void][] = [
      ["no stairs", r => { r.floor.stairs = null; }],
      ["stairs off the map", r => { r.floor.stairs = { x: 99, y: 3 }; }],
      ["stairs inside a wall", r => { r.floor.stairs = { x: 0, y: 0 }; }],
      ["null item", r => { r.floor.items = [null]; }],
      ["unknown item kind", r => { r.floor.items = [{ id: 1, x: 3, y: 3, kind: "bomb" }]; }],
      ["item without id", r => { r.floor.items = [{ x: 3, y: 3, kind: "gold" }]; }],
      ["dimling without health", r => { r.floor.dimlings = [{ id: 1, x: 3, y: 3, awake: false }]; }],
      ["oversized dimling", r => { r.floor.dimlings = [{ id: 1, x: 3, y: 3, hp: 5, maxHp: 5, awake: false, size: 9 }]; }],
      // Floor 1 is 34 x 22 tiles.
      ["boss hanging off the edge", r => { r.floor.dimlings = [{ id: 1, x: 33, y: 21, hp: 5, maxHp: 5, awake: false, size: 2 }]; }],
      ["floor of the wrong size for its depth", r => { r.floor.w = 27; r.floor.h = 17; r.floor.tiles = r.floor.tiles.slice(0, 27 * 17); r.floor.seen = r.floor.seen.slice(0, 27 * 17); }],
      ["creature of an unknown species", r => { r.floor.dimlings = [{ id: 1, x: 8, y: 10, hp: 5, maxHp: 5, awake: false, species: "dragon" }]; }],
      ["creature with a bad phase", r => { r.floor.dimlings = [{ id: 1, x: 8, y: 10, hp: 5, maxHp: 5, awake: false, phase: "sleeping" }]; }],
      ["creature aimed diagonally", r => { r.floor.dimlings = [{ id: 1, x: 8, y: 10, hp: 5, maxHp: 5, awake: true, phase: "windup", windupLeft: 1, aim: { x: 1, y: 1 } }]; }],
      ["bad theme", r => { r.floor.theme = "lava"; }],
      ["floor from another depth", r => { r.floor.depth = 5; }],
      ["seen with junk", r => { r.floor.seen[3] = 7; }],
      ["log with junk", r => { r.messages = [1, 2]; }],
      ["runId as number", r => { r.runId = 12; }],
      ["prop of an unknown kind", r => { r.floor.props = [{ id: 1, x: 8, y: 10, kind: "chandelier", hp: 5, maxHp: 5 }]; }],
      ["prop off the map", r => { r.floor.props = [{ id: 1, x: 80, y: 10, kind: "urn", hp: 5, maxHp: 5 }]; }],
      ["prop without health", r => { r.floor.props = [{ id: 1, x: 8, y: 10, kind: "urn" }]; }],
      ["level beyond the last", r => { r.level = 16; }],
      ["level zero", r => { r.level = 0; }],
      ["negative experience", r => { r.xp = -4; }],
      ["gear nobody makes", r => { r.gear = ["trident"]; }],
    ];
    for (const [name, damage] of holes) {
      const run = good();
      damage(run);
      expect(validSavedRun(run), name).toBe(false);
    }
  });
});

describe("saves from before props and levels", () => {
  it("are still accepted, and played as level 1 on a floor with nothing to smash", async () => {
    const run = JSON.parse(JSON.stringify(startRun({ seed: 7, flasks: 2, perks: NO_PERKS, weaponDamage: 1, bag: emptyBag() })));
    delete run.floor.props; delete run.xp; delete run.level; delete run.gear; delete run.smashed;
    expect(validSavedRun(run)).toBe(true);
    saved.set("emberdeep-run-v1", JSON.stringify({ state: { run, prevPlayer: null }, version: 0 }));
    await useRun.persist.rehydrate();
    const restored = useRun.getState().run!;
    expect(restored.floor.props).toEqual([]);
    expect([restored.level, restored.xp, restored.gear, restored.smashed]).toEqual([1, 0, [], 0]);
    useRun.getState().act({ type: "wait" });
    expect(useRun.getState().run?.steps).toBe(1);
    useRun.getState().clear();
  });

  it("keep their props, level and gear through a round trip", async () => {
    useRun.getState().start({ seed: 11, flasks: 2, perks: NO_PERKS, weaponDamage: 16, bag: emptyBag() });
    const before = { ...useRun.getState().run!, level: 4, xp: 7, gear: ["sword" as const], smashed: 3 };
    useRun.setState({ run: before });
    const snapshot = saved.get("emberdeep-run-v1")!;
    useRun.getState().clear();
    saved.set("emberdeep-run-v1", snapshot);
    await useRun.persist.rehydrate();
    const after = useRun.getState().run!;
    expect(after.floor.props.length).toBeGreaterThan(0);
    expect([after.level, after.xp, after.gear, after.smashed]).toEqual([4, 7, ["sword"], 3]);
    useRun.getState().clear();
  });
});

describe("booking a descent", () => {
  it("banks the result the moment the descent ends, and only once", () => {
    useGame.getState().reset();
    expect(useGame.getState().payForRun()).toBe(true);
    const paid = useGame.getState();
    useRun.getState().start({ seed: 7, flasks: 2, perks: NO_PERKS, weaponDamage: 1, bag: { ...paid.carried }, runId: paid.runId ?? undefined });
    useRun.setState({ run: { ...useRun.getState().run!, gold: 50, crystals: 4 } });

    useRun.getState().act({ type: "extract" });
    const after = useGame.getState();
    expect(after.runSpent).toBe(0);
    expect(after.runId).toBeNull();
    expect(after.roundGold).toBe(50);
    expect(after.crystals).toBe(4);
    expect(after.lastReport?.outcome).toBe("extracted");

    // The result screen may sit open, be reloaded or be settled again; nothing is counted twice.
    settle(useRun.getState().run!);
    settle(useRun.getState().run!);
    expect(useGame.getState().roundGold).toBe(50);
    expect(useGame.getState().stats.runs).toBe(1);
    useRun.getState().clear();
    useGame.getState().reset();
  });

  it("does not let an old result settle a newer payment", () => {
    useGame.getState().reset();
    useGame.getState().payForRun();
    const first = useGame.getState();
    useRun.getState().start({ seed: 7, flasks: 2, perks: NO_PERKS, weaponDamage: 1, bag: { ...first.carried }, runId: first.runId ?? undefined });
    const oldRun = { ...useRun.getState().run!, status: "extracted" as const, gold: 400 };
    useRun.getState().clear();

    // Another tab abandoned it and paid for a new descent before the old result arrived.
    useGame.getState().abandonRun();
    useGame.getState().payForRun();
    const secondId = useGame.getState().runId;
    expect(secondId).not.toBe(first.runId);

    settle(oldRun);
    const after = useGame.getState();
    expect(after.runSpent).toBeGreaterThan(0);
    expect(after.runId).toBe(secondId);
    expect(after.roundGold).toBe(0);
    useGame.getState().reset();
  });
});

