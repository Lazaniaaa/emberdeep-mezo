import { describe, expect, it } from "vitest";
import { TurnSounds } from "./turn-sounds";

describe("visible contact sounds", () => {
  it("plays a hit only at contact, exactly once, and keeps immediate cues immediate", () => {
    const q = new TurnSounds(), played: string[] = [];
    q.add(["hit", "warn", "hit"], 1000, 1090);
    q.flush(1000, false, e => played.push(e)); expect(played).toEqual(["warn"]);
    q.flush(1089, false, e => played.push(e)); expect(played).toEqual(["warn"]);
    q.flush(1090, false, e => played.push(e)); expect(played).toEqual(["warn", "hit"]);
    q.flush(1200, false, e => played.push(e)); expect(played).toHaveLength(2);
  });
  it("cancels pending sounds on hide/unmount and consumes due sounds silently when muted", () => {
    const q = new TurnSounds(), played: string[] = [];
    q.add(["kill"], 1000, 1090); q.clear(); q.flush(1200, false, e => played.push(e));
    q.add(["hit"], 2000, 2090); q.flush(2090, true, e => played.push(e)); q.flush(2200, false, e => played.push(e));
    expect(played).toEqual([]);
  });
});
