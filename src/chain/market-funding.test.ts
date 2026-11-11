import { afterEach, describe, expect, it, vi } from "vitest";
import { mezoClient, readMarketFunding, readPot } from "./mezo";
import { marketAddress, MEZO_POT } from "./mezo-config";

vi.mock("./mezo-config", async importOriginal => ({ ...await importOriginal<typeof import("./mezo-config")>(), marketAddress: vi.fn() }));
const market = "0x00000000000000000000000000000000000000a2";
afterEach(() => { vi.restoreAllMocks(); vi.mocked(marketAddress).mockReset(); });

describe("Ember Pot market funding", () => {
  it("reads the round's count from the pot", async () => {
    vi.mocked(marketAddress).mockReturnValue(market);
    const read = vi.spyOn(mezoClient, "readContract").mockResolvedValue(350000000000000001n as never);
    expect(await readMarketFunding(2n)).toBe(350000000000000001n);
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ address: MEZO_POT.address, functionName: "fundedIn", args: [2n] }));
  });
  it("does not read before the market is configured", async () => {
    vi.mocked(marketAddress).mockReturnValue(null);
    const read = vi.spyOn(mezoClient, "readContract");
    expect(await readMarketFunding(0n)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
  it("keeps the pot readable on a V2 pot, which has no count", async () => {
    vi.mocked(marketAddress).mockReturnValue(market);
    vi.spyOn(mezoClient, "readContract").mockImplementation((async ({ functionName }: { functionName: string }) => {
      if (functionName === "fundedIn") throw new Error("execution reverted");
      return 0n;
    }) as never);
    const snapshot = await readPot(null, MEZO_POT.launchTime);
    expect(snapshot.marketFunding).toBeNull();
    expect(snapshot.pot).toBe(0n);
    expect(snapshot.round).toBe(0);
  });
});
