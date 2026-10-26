import { toUsd } from "@/game/config";
import { campMode, crystalsFor } from "@/lib/camp-mode";

/** A share of a whole as a percentage: two decimals below 10%, one below 100%. */
export function percent(share: number) {
  const p = share * 100;
  const digits = p >= 10 ? 1 : 2;
  return `${p.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits })}%`;
}

/** Money in the game is cents of simulated USDC; this shows it as dollars: 50 is "$0.50", 250000 is "$2,500". */
export function usd(cents: number) {
  const v = toUsd(cents);
  const digits = Math.abs(v) >= 1_000 ? 0 : 2;
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** A price for a toast or plain text: crystals in the Mezo release, simulated dollars elsewhere. */
export function money(cents: number) {
  return campMode.crystals ? `${crystalsFor(cents)} crystals` : usd(cents);
}

/** An 18-decimal token amount (MUSD, BTC, MEZO): whole units with at most `digits` decimals, trailing zeros dropped. */
export function tokens(value: bigint, digits = 2): string {
  const negative = value < 0n;
  const v = negative ? -value : value;
  const whole = v / 10n ** 18n;
  const frac = (v % 10n ** 18n).toString().padStart(18, "0").slice(0, digits).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
}

export function shortAddress(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
