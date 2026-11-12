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
  const debt = loan + feeOf(loan, terms) + terms.gasCompensation;
  return { loan, debt, collateral: collateralFor(debt, terms.price) };
}

const feeOf = (loan: bigint, terms: BorrowTerms) => (loan * terms.feeRate + UNIT - 1n) / UNIT;

/** Mezo sorts troves by collateral over principal, scaled by 1e20 (LiquityMath._computeNominalCR). */
export const nominalRatio = (coll: bigint, principal: bigint) => (principal > 0n ? (coll * 10n ** 20n) / principal : 2n ** 256n - 1n);

/** A trove the player has already, as TroveManager.getEntireDebtAndColl reads it (pending redistributions included). */
export type Trove = { coll: bigint; principal: bigint; interest: bigint };

/**
 * What to send to Mezo's BorrowerOperations for `missing` MUSD: open a trove (at least Mezo's smallest loan), or, for a
 * player who has one, borrow just what is missing from it, adding the BTC that keeps the whole trove at the safe
 * loan-to-value. `send` is the BTC to attach, `nicr` the trove's sorting key afterwards (for the list hints).
 */
export type TroveAction = { kind: "open" | "adjust"; borrow: bigint; send: bigint; nicr: bigint };

export function troveAction(missing: bigint, terms: BorrowTerms, trove: Trove | null): TroveAction | null {
  if (missing <= 0n) return null;
  if (!trove) {
    const plan = borrowPlan(missing, terms);
    return { kind: "open", borrow: plan.loan, send: plan.collateral, nicr: nominalRatio(plan.collateral, plan.debt) };
  }
  const fee = feeOf(missing, terms);
  const need = collateralFor(trove.principal + trove.interest + missing + fee, terms.price);
  const send = need > trove.coll ? need - trove.coll : 0n;
  return { kind: "adjust", borrow: missing, send, nicr: nominalRatio(trove.coll + send, trove.principal + missing + fee) };
}
