import { RLUSD_CURRENCY, RLUSD_TESTNET_ISSUER } from "./rlusd.mjs";

// Sends an RLUSD payment and waits for ledger validation. `orderId` is
// carried in the Memo field so the receiving provider can reconcile which
// booking this payment settles.
export async function sendRlusdPayment({ client, wallet, destination, amount, orderId }) {
  const tx = {
    TransactionType: "Payment",
    Account: wallet.address,
    Destination: destination,
    Amount: {
      currency: RLUSD_CURRENCY,
      issuer: RLUSD_TESTNET_ISSUER,
      value: String(amount),
    },
    Memos: [
      {
        Memo: {
          MemoType: Buffer.from("orderId", "utf8").toString("hex").toUpperCase(),
          MemoData: Buffer.from(orderId, "utf8").toString("hex").toUpperCase(),
        },
      },
    ],
  };

  const prepared = await client.autofill(tx);
  const signed = wallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);

  const code = result.result.meta.TransactionResult;
  if (code !== "tesSUCCESS") {
    throw new Error(`XRPL payment failed: ${code}`);
  }
  return { txHash: signed.hash, result: code };
}
