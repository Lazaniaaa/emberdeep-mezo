import { describe, expect, it } from "vitest";
import { borrowPlan, collateralFor, fallbackTerms, shortfall } from "./borrow";

const E18 = 10n ** 18n;

describe("borrowing MUSD against BTC", () => {
  it("counts only what is missing", () => {
    expect(shortfall(5n * E18, 2n * E18)).toBe(3n * E18);
    expect(shortfall(5n * E18, 9n * E18)).toBe(0n);
  });

  it("asks for enough BTC to keep the loan at 65% of it", () => {
    // 65 MUSD at 65% needs 100 MUSD of BTC: at 100,000 MUSD a BTC, 0.001 BTC.
    expect(collateralFor(65n * E18, 100_000n * E18)).toBe(E18 / 1000n);
    // Never below the line, even by a wei.
    const btc = collateralFor(1_800n * E18, 78_442n * E18);
    expect((btc * 78_442n * 65n) / 100n).toBeGreaterThanOrEqual(1_800n * E18);
    expect(collateralFor(0n, 100_000n * E18)).toBe(0n);
  });

  it("never plans a loan below Mezo's smallest, and counts its fee and gas compensation as debt", () => {
    // Mezo Testnet on 2026-11-12: 1,800 MUSD at least, 0.1% fee, 200 MUSD gas compensation.
    const terms = fallbackTerms(71_730n * E18);
    expect(terms).toMatchObject({ minDebt: 1_800n * E18, gasCompensation: 200n * E18, feeRate: E18 / 1000n });

    // One key short: the loan is still 1,800 MUSD, and the debt Mezo counts is 1,800 + 1.8 + 200.
    const key = borrowPlan(E18, terms);
    expect(key.loan).toBe(1_800n * E18);
    expect(key.debt).toBe((20_018n * E18) / 10n);
    // About 0.043 BTC, not the 0.00002 BTC a 1 MUSD loan would take; and the debt is at most 65% of it.
    expect(key.collateral).toBeGreaterThan((42n * E18) / 1000n);
    expect(key.collateral).toBeLessThan((44n * E18) / 1000n);
    expect((key.collateral * terms.price * 65n) / (100n * E18)).toBeGreaterThanOrEqual(key.debt);

    // A weapon dearer than the minimum: the loan is what is missing.
    const spear = borrowPlan(5_000n * E18, terms);
    expect(spear.loan).toBe(5_000n * E18);
    expect(spear.debt).toBe(5_205n * E18);
    expect(borrowPlan(0n, terms)).toEqual({ loan: 0n, debt: 0n, collateral: 0n });
  });
});
