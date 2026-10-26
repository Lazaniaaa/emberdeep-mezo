// Waiting for a transaction to land. Mezo Testnet's RPC can answer "no such transaction" for a while after accepting
// one (eth_getTransactionByHash stays null), which makes viem's waitForTransactionReceipt give up on a transaction that
// does land. This asks for the receipt alone, again and again, until it comes or the time is up.
import type { Hash, TransactionReceipt } from "viem";

type ReceiptReader = { getTransactionReceipt: (args: { hash: Hash }) => Promise<TransactionReceipt> };

export async function waitForReceipt(client: ReceiptReader, hash: Hash, timeoutMs = 120_000, everyMs = 1500): Promise<TransactionReceipt> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await client.getTransactionReceipt({ hash });
    } catch {
      // Not there yet, or the RPC hiccuped: ask again.
    }
    if (Date.now() >= end) throw new Error(`The transaction ${hash} has not landed yet. It may still: check it on the explorer.`);
    await new Promise(resolve => setTimeout(resolve, everyMs));
  }
}
