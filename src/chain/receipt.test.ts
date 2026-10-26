import { describe, expect, it } from "vitest";
import type { TransactionReceipt } from "viem";
import { waitForReceipt } from "./receipt";

describe("waitForReceipt", () => {
  it("keeps asking through 'not found' answers until the receipt comes", async () => {
    let asks = 0;
    const client = { getTransactionReceipt: async () => { if (++asks < 3) throw new Error("not found"); return { status: "success" } as TransactionReceipt; } };
    expect((await waitForReceipt(client, "0x01", 5_000, 1)).status).toBe("success");
    expect(asks).toBe(3);
  });

  it("gives up after the timeout with a message that points to the explorer", async () => {
    const client = { getTransactionReceipt: async (): Promise<TransactionReceipt> => { throw new Error("not found"); } };
    await expect(waitForReceipt(client, "0x02", 20, 5)).rejects.toThrow(/explorer/);
  });
});
