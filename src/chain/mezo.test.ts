import { describe, expect, it } from "vitest";
import { RelayUnavailable, relayRecord, relayerAddress } from "./mezo";

const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const body = { player: "0x00000000000000000000000000000000000000b1" as const, setup: {}, moves: ["X"], target: "pot" as const, until: 1, login: "0x01" as const };

describe("relaying on Mezo", () => {
  it("finds the relayer from the server's health, and none when the server has no relayer or cannot be reached", async () => {
    expect(await relayerAddress("/api/attest", reply(200, { ok: true, relayer: "0x00000000000000000000000000000000000000a0" }) as never)).toBe("0x00000000000000000000000000000000000000a0");
    expect(await relayerAddress("/api/attest", reply(200, { ok: true }) as never)).toBeNull();
    expect(await relayerAddress("/api/attest", (async () => { throw new Error("down"); }) as never)).toBeNull();
  });

  it("falls back to the wallet when the server does not relay or its relayer is out of gas, and explains a refusal", async () => {
    await expect(relayRecord("/api/attest", body, reply(404, { error: "This server does not relay" }) as never)).rejects.toBeInstanceOf(RelayUnavailable);
    await expect(relayRecord("/api/attest", body, reply(503, { error: "out of gas" }) as never)).rejects.toBeInstanceOf(RelayUnavailable);
    const refused = relayRecord("/api/attest", body, reply(409, { error: "You have no Ember Pot key on Mezo." }) as never);
    await expect(refused).rejects.toThrow(/no Ember Pot key/);
    await expect(refused).rejects.not.toBeInstanceOf(RelayUnavailable);
  });
});
