import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { quoteIn } from "./mezo";
import { clearMarketQuotes, quoteListing } from "./items";

vi.mock("./mezo", async importOriginal => ({ ...await importOriginal<typeof import("./mezo")>(), quoteIn: vi.fn() }));
const quote = vi.mocked(quoteIn);
beforeEach(() => { clearMarketQuotes(); quote.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe("market quote previews", () => {
  it("shares an in-flight quote for the same token and price", async () => {
    quote.mockResolvedValue(123n);
    const first = quoteListing("BTC", 100n), second = quoteListing("BTC", 100n);
    expect(first).toBe(second);
    expect(await first).toBe(123n);
    expect(quote).toHaveBeenCalledExactlyOnceWith("BTC", 100n);
  });
  it("keeps prices and currencies separate", async () => {
    quote.mockResolvedValue(5n);
    await Promise.all([quoteListing("BTC", 100n), quoteListing("MEZO", 100n), quoteListing("BTC", 200n)]);
    expect(quote).toHaveBeenCalledTimes(3);
  });
  it("expires after one minute and refresh invalidates even pending entries", async () => {
    vi.useFakeTimers(); quote.mockResolvedValue(1n);
    const first = quoteListing("BTC", 100n);
    vi.advanceTimersByTime(60_001);
    expect(quoteListing("BTC", 100n)).not.toBe(first);
    clearMarketQuotes();
    await quoteListing("BTC", 100n);
    expect(quote).toHaveBeenCalledTimes(3);
  });
  it("returns no preview on failure, caches that fallback, and retries on Refresh", async () => {
    quote.mockRejectedValueOnce(new Error("No liquidity")).mockResolvedValue(42n);
    expect(await quoteListing("MEZO", 100n)).toBeNull();
    expect(await quoteListing("MEZO", 100n)).toBeNull();
    clearMarketQuotes();
    expect(await quoteListing("MEZO", 100n)).toBe(42n);
  });
});
