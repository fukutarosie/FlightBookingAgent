import { RLUSD_CURRENCY, RLUSD_TESTNET_ISSUER } from "./rlusd.mjs";

// Provider-side check: does this tx hash correspond to a validated XRPL
// Payment of at least `expectedAmount` RLUSD to `expectedDestination`?
// Rejects underpayment; overpayment is accepted (mirrors x402 "exact" scheme
// intent without penalizing a client that pays a hair more for safety).
export async function verifyRlusdPayment({ client, txHash, expectedAmount, expectedDestination }) {
  let response;
  try {
    response = await client.request({ command: "tx", transaction: txHash });
  } catch (err) {
    return { valid: false, reason: `transaction not found: ${String(err)}` };
  }

  const { result } = response;
  if (!result.validated) return { valid: false, reason: "transaction not yet validated" };
  if (result.TransactionType !== "Payment") return { valid: false, reason: "not a Payment transaction" };
  if (result.meta?.TransactionResult !== "tesSUCCESS") {
    return { valid: false, reason: `transaction result was ${result.meta?.TransactionResult}` };
  }
  if (result.Destination !== expectedDestination) {
    return { valid: false, reason: "destination address does not match" };
  }

  const amount = result.Amount;
  if (typeof amount !== "object" || amount.currency !== RLUSD_CURRENCY || amount.issuer !== RLUSD_TESTNET_ISSUER) {
    return { valid: false, reason: "payment was not in RLUSD" };
  }
  if (Number(amount.value) < Number(expectedAmount)) {
    return { valid: false, reason: "payment amount was less than required" };
  }

  return { valid: true };
}
