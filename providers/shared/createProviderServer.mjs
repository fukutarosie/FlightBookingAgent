import express from "express";
import { generateOffers } from "./quoteGenerator.mjs";
import { verifyRlusdPayment } from "../../xrpl/verifyPayment.mjs";

// Shape modeled on the general x402 challenge/response pattern (scheme,
// network, asset, payTo, maxAmountRequired). Reconcile field names against
// the actual XRPL x402 Facilitator spec before treating this as final.
function buildPaymentChallenge({ offerId, price, currency, payTo }) {
  return {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: "xrpl-testnet",
        asset: currency,
        payTo,
        maxAmountRequired: String(price),
        resource: "/book",
        description: `Payment for flight offer ${offerId}`,
        extra: { orderId: offerId },
      },
    ],
  };
}

export function createProviderServer({ providerId, providerName, fareMultiplier, timeSlots, xrplAddress, xrplClient }) {
  const app = express();
  app.use(express.json());

  const issuedOffers = new Map(); // offerId -> offer, set at quote time so /book never trusts client-supplied price
  const bookings = new Map();
  const usedTxHashes = new Set(); // replay protection: one tx hash settles exactly one booking

  app.get("/quote", (req, res) => {
    const { origin, destination, departDate, returnDate } = req.query;
    if (!origin || !destination || !departDate) {
      return res.status(400).json({ error: "origin, destination, departDate are required" });
    }
    const offers = generateOffers({
      origin,
      destination,
      departDate,
      returnDate,
      providerId,
      fareMultiplier,
      timeSlots,
    });
    offers.forEach((offer) => issuedOffers.set(offer.offerId, offer));
    res.json({ provider: providerId, providerName, offers });
  });

  // x402 booking flow:
  //   1. No X-PAYMENT header -> respond 402 with a challenge for the price
  //      quoted at /quote time (never the client's word for it).
  //   2. X-PAYMENT header present -> verify the referenced XRPL transaction
  //      actually paid that amount to this provider before confirming.
  app.post("/book", async (req, res) => {
    const { offerId, traveler } = req.body || {};
    if (!offerId) return res.status(400).json({ error: "offerId is required" });

    const offer = issuedOffers.get(offerId);
    if (!offer) return res.status(404).json({ error: "unknown or expired offerId — request a fresh quote" });

    const paymentHeader = req.get("X-PAYMENT");
    if (!paymentHeader) {
      return res.status(402).json(
        buildPaymentChallenge({ offerId, price: offer.price, currency: offer.currency, payTo: xrplAddress }),
      );
    }

    let proof;
    try {
      proof = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));
    } catch {
      return res.status(400).json({ error: "invalid X-PAYMENT header" });
    }
    if (!proof.txHash) return res.status(400).json({ error: "X-PAYMENT proof missing txHash" });
    if (usedTxHashes.has(proof.txHash)) {
      return res.status(409).json({ error: "this transaction has already been used for a booking" });
    }

    const verdict = await verifyRlusdPayment({
      client: xrplClient,
      txHash: proof.txHash,
      expectedAmount: offer.price,
      expectedDestination: xrplAddress,
    });
    if (!verdict.valid) {
      return res.status(402).json({ error: "payment verification failed", reason: verdict.reason });
    }

    usedTxHashes.add(proof.txHash);
    const pnr = `${providerId.slice(-1).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const booking = { offerId, pnr, traveler, txHash: proof.txHash, confirmedAt: new Date().toISOString() };
    bookings.set(offerId, booking);
    res.status(201).json({ status: "confirmed", pnr, offerId, txHash: proof.txHash });
  });

  app.get("/bookings/:offerId", (req, res) => {
    const booking = bookings.get(req.params.offerId);
    if (!booking) return res.status(404).json({ error: "not found" });
    res.json(booking);
  });

  return app;
}
