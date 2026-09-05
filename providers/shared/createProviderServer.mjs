import express from "express";
import { generateOffers } from "./quoteGenerator.mjs";

// Shape modeled on the general x402 challenge/response pattern (scheme,
// network, asset, payTo, maxAmountRequired). Reconcile field names against
// the actual XRPL x402 Facilitator spec before wiring in real verification.
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

export function createProviderServer({ providerId, providerName, fareMultiplier, timeSlots, xrplAddress }) {
  const app = express();
  app.use(express.json());

  const bookings = new Map();

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
    res.json({ provider: providerId, providerName, offers });
  });

  // MVP booking flow:
  //   1. No X-PAYMENT header -> respond 402 with the payment challenge.
  //   2. X-PAYMENT header present -> confirm booking.
  // NOTE: payment proof is NOT yet verified against the XRPL ledger here.
  // This stub accepts any well-formed proof so the discovery/booking shape
  // can be tested end to end before the real xrpl.js verification lands.
  app.post("/book", (req, res) => {
    const { offerId, traveler, price, currency } = req.body || {};
    if (!offerId) return res.status(400).json({ error: "offerId is required" });

    const paymentHeader = req.get("X-PAYMENT");
    if (!paymentHeader) {
      if (!price || !currency) {
        return res.status(400).json({ error: "price and currency required to build the payment challenge" });
      }
      return res.status(402).json(buildPaymentChallenge({ offerId, price, currency, payTo: xrplAddress }));
    }

    let proof;
    try {
      proof = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));
    } catch {
      return res.status(400).json({ error: "invalid X-PAYMENT header" });
    }
    if (!proof.txHash) {
      return res.status(400).json({ error: "X-PAYMENT proof missing txHash" });
    }

    // TODO: verify proof.txHash on XRPL Testnet — correct amount, correct
    // destination (xrplAddress), correct currency — before confirming.
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
