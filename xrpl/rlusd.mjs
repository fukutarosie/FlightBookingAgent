// Confirmed against https://xrpl.org/docs/agents/xrpl-payments-skill (2026-09-05).
// Double check against the RLUSD faucet (tryrlusd.com) output before relying
// on this for anything beyond Testnet experimentation.
export const RLUSD_CURRENCY = "524C555344000000000000000000000000000000"; // "RLUSD" as a 160-bit hex currency code
export const RLUSD_TESTNET_ISSUER = "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV";

// RLUSD is an IOU, not native XRP, so an account can't hold or receive it
// until it explicitly trusts the issuer. This is a one-time setup per wallet.
export async function ensureRlusdTrustline(client, wallet, limit = "1000000") {
  const lines = await client.request({
    command: "account_lines",
    account: wallet.address,
    peer: RLUSD_TESTNET_ISSUER,
  });
  const alreadyTrusted = lines.result.lines.some((l) => l.currency === RLUSD_CURRENCY || l.currency === "RLUSD");
  if (alreadyTrusted) return { created: false };

  const tx = {
    TransactionType: "TrustSet",
    Account: wallet.address,
    LimitAmount: {
      currency: RLUSD_CURRENCY,
      issuer: RLUSD_TESTNET_ISSUER,
      value: limit,
    },
  };
  const prepared = await client.autofill(tx);
  const signed = wallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);
  return { created: true, result: result.result.meta.TransactionResult, hash: signed.hash };
}

export async function getRlusdBalance(client, address) {
  const lines = await client.request({ command: "account_lines", account: address, peer: RLUSD_TESTNET_ISSUER });
  const line = lines.result.lines.find((l) => l.currency === RLUSD_CURRENCY || l.currency === "RLUSD");
  return line ? Number(line.balance) : 0;
}
