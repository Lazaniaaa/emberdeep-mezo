// Borrowing MUSD against BTC on Mezo, as the game suggests it: how much MUSD Mezo would lend a player who is short, and
// how much BTC to lock so that loan stays within the safe loan-to-value (MEZO_BORROW.maxLtv). The loan itself is made
// in Mezo's own app.
import { MEZO_BORROW } from "./mezo-config";

const UNIT = 10n ** 18n;
/** maxLtv in basis points, so the sums stay in whole numbers. */
const LTV_BPS = BigInt(Math.round(MEZO_BORROW.maxLtv * 10_000));

/**
 * What a loan on Mezo costs, all in 18 decimals: the BTC price Mezo values collateral at (its own price feed, not a
 * pool's), the smallest loan it makes, the refundable gas compensation every loan carries, and its one-time fee as a
 * share of the loan.
 */
export type BorrowTerms = { price: bigint; minDebt: bigint; gasCompensation: bigint; feeRate: bigint };

/** The terms in mezo-config.ts with a given price, for when the chain cannot be read. */
export const fallbackTerms = (price: bigint): BorrowTerms => ({
  price, minDebt: BigInt(MEZO_BORROW.minDebt) * UNIT, gasCompensation: BigInt(MEZO_BORROW.gasCompensation) * UNIT,
  feeRate: (BigInt(MEZO_BORROW.feeBps) * UNIT) / 10_000n,
});

/** The MUSD a player is short of `need`, holding `have`: zero when they hold enough. */
export const shortfall = (need: bigint, have: bigint) => (need > have ? need - have : 0n);

/** The BTC (18 decimals) to lock for a debt of `musd` at the safe loan-to-value, at `btcPrice` MUSD per BTC (18 decimals). */
export function collateralFor(musd: bigint, btcPrice: bigint): bigint {
  if (musd <= 0n || btcPrice <= 0n) return 0n;
  // Rounded up: a little more collateral, never a loan above the line.
  const value = (musd * 10_000n + LTV_BPS - 1n) / LTV_BPS;
  return (value * UNIT + btcPrice - 1n) / btcPrice;
}

/**
 * The loan that covers `missing` MUSD: never less than Mezo's smallest loan. `debt` is what Mezo counts against the
 * collateral (the loan, its fee and the gas compensation), and `collateral` the BTC that keeps that debt at the safe
 * loan-to-value.
 */
export function borrowPlan(missing: bigint, terms: BorrowTerms): { loan: bigint; debt: bigint; collateral: bigint } {
  if (missing <= 0n) return { loan: 0n, debt: 0n, collateral: 0n };
  const loan = missing > terms.minDebt ? missing : terms.minDebt;
  const debt = loan + (loan * terms.feeRate + UNIT - 1n) / UNIT + terms.gasCompensation;
  return { loan, debt, collateral: collateralFor(debt, terms.price) };
}
