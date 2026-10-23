import { afterEach, expect, it, vi } from "vitest";
import { NO_PERKS } from "@/game/catalog";
import { emptyBag, startRun } from "@/game/run";
import type { RunReport } from "@/state/store";
import { rememberDeath, reportDeath } from "./death-cause";

afterEach(() => vi.unstubAllGlobals());

it("keeps a death explanation separate from game saves and only shows it on the matching report", () => {
  const data = new Map<string, string>();
  vi.stubGlobal("sessionStorage", { setItem: (k: string, v: string) => data.set(k, v), getItem: (k: string) => data.get(k) ?? null });
  const run = startRun({ seed: 4, flasks: 1, perks: NO_PERKS, weaponDamage: 16, bag: emptyBag() });
  run.status = "dead"; run.light = 0; run.steps = 5; run.gold = 7; run.tickets = 2;
  const original = structuredClone(run);
  const report: RunReport = { outcome: "dead", depth: 1, gold: 7, crystals: 0, sigils: 0, payout: 0, spent: 20, revenue: 6.6,
    minted: [], tickets: 0, ticketsFound: 2, steps: 5, kills: 0, bossSlain: false };
  rememberDeath(run, "Last loss: −3 light · boss");
  expect(run).toEqual(original);
  expect(reportDeath(report)).toBe("Last loss: −3 light · boss");
  expect(reportDeath({ ...report, gold: 8 })).toContain("unavailable");
  expect(reportDeath({ ...report, outcome: "extracted" })).toBeNull();
});

it("handles old reports, corrupt notes and blocked session storage without affecting settlement", () => {
  const report = { outcome: "dead" } as RunReport;
  vi.stubGlobal("sessionStorage", { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } });
  expect(reportDeath(report)).toContain("unavailable");
  expect(() => rememberDeath({} as Parameters<typeof rememberDeath>[0], "test")).not.toThrow();
  vi.stubGlobal("sessionStorage", { getItem: () => "broken json" });
  expect(reportDeath(report)).toContain("unavailable");
});
