// Borrowing MUSD against BTC on Mezo, as the game suggests it: how much BTC to lock so that the MUSD a player is short
// stays within the safe loan-to-value (MEZO_BORROW.maxLtv). The loan itself is made in Mezo's own app.
import { MEZO_BORROW } from "./mezo-config";

const UNIT = 10n ** 18n;
/** maxLtv in basis points, so the sums stay in whole numbers. */
const LTV_BPS = BigInt(Math.round(MEZO_BORROW.maxLtv * 10_000));

/** The MUSD a player is short of `need`, holding `have`: zero when they hold enough. */
export const shortfall = (need: bigint, have: bigint) => (need > have ? need - have : 0n);

/** The BTC (18 decimals) to lock for borrowing `musd` at the safe loan-to-value, at `btcPrice` MUSD per BTC (18 decimals). */
export function collateralFor(musd: bigint, btcPrice: bigint): bigint {
  if (musd <= 0n || btcPrice <= 0n) return 0n;
  // Rounded up: a little more collateral, never a loan above the line.
  const value = (musd * 10_000n + LTV_BPS - 1n) / LTV_BPS;
  return (value * UNIT + btcPrice - 1n) / btcPrice;
}
