import { describe, expect, it } from "vitest";
import { collateralFor, shortfall } from "./borrow";

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
});
