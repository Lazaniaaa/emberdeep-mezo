import type { RunState } from "@/game/run";
import type { RunReport } from "@/state/store";

const KEY = "emberdeep-death-display-v1";
const fingerprint = (r: Pick<RunReport, "depth" | "steps" | "kills" | "gold" | "crystals" | "sigils" | "ticketsFound">) =>
  [r.depth, r.steps, r.kills, r.gold, r.crystals, r.sigils, r.ticketsFound].join(":");

/** Presentation-only session note. Never added to a run, its replay log, the ledger or a signed result. */
export function rememberDeath(run: RunState, text: string) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ key: fingerprint({ ...run, depth: run.deepest, ticketsFound: run.tickets }), text }));
  } catch { /* Storage is optional. */ }
}

export function reportDeath(report: RunReport): string | null {
  if (report.outcome !== "dead") return null;
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    if (saved && typeof saved === "object" && "key" in saved && "text" in saved
      && saved.key === fingerprint(report) && typeof saved.text === "string" && saved.text.length < 160) return saved.text;
  } catch { /* Old reports and unavailable storage have no reliable cause. */ }
  return "Light exhausted · final source unavailable";
}
