import { sendRlusdPayment } from "../xrpl/payment.mjs";

// Drives the x402 challenge/response loop against a provider's /book
// endpoint: request without payment -> receive 402 + challenge -> pay on
// XRPL -> retry with proof. Returns the provider's booking confirmation.
export async function payAndBook({ client, wallet, providerBase, offer, traveler }) {
  const initial = await fetch(`${providerBase}/book`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ offerId: offer.offerId, price: offer.price, currency: offer.currency }),
  });

  if (initial.status !== 402) {
    throw new Error(`expected 402 payment challenge, got ${initial.status}`);
  }
  const challenge = await initial.json();
  const terms = challenge.accepts?.[0];
  if (!terms) throw new Error("402 response missing payment terms");

  const { txHash } = await sendRlusdPayment({
    client,
    wallet,
    destination: terms.payTo,
    amount: terms.maxAmountRequired,
    orderId: terms.extra?.orderId || offer.offerId,
  });

  const proof = Buffer.from(JSON.stringify({ txHash })).toString("base64");
  const confirmRes = await fetch(`${providerBase}/book`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-PAYMENT": proof },
    body: JSON.stringify({ offerId: offer.offerId, traveler }),
  });

  if (!confirmRes.ok) {
    throw new Error(`booking confirmation failed: ${confirmRes.status} ${await confirmRes.text()}`);
  }
  const booking = await confirmRes.json();
  return { ...booking, txHash };
}
