import crypto from "node:crypto";

// Deterministic pseudo-fare so the same route always quotes a stable base
// price across providers, without needing a real fare database for the demo.
// Scaled to a few RLUSD (not a real fare amount) so a single Testnet faucet
// claim (~10 RLUSD) can fully pay for an end-to-end demo booking.
function baseFareFor(origin, destination) {
  const hash = crypto
    .createHash("sha256")
    .update(`${origin.trim().toLowerCase()}-${destination.trim().toLowerCase()}`)
    .digest();
  const raw = hash.readUInt16BE(0);
  return 2 + (raw % 8); // 2 - 9 RLUSD base fare
}

export function generateOffers({
  origin,
  destination,
  departDate,
  returnDate,
  providerId,
  fareMultiplier,
  timeSlots,
  currency = "RLUSD",
}) {
  const base = baseFareFor(origin, destination);
  return timeSlots.map((slot, idx) => ({
    offerId: `${providerId}-${origin}${destination}-${departDate}-${idx}`.toUpperCase(),
    provider: providerId,
    origin,
    destination,
    departDate,
    returnDate: returnDate || null,
    departTime: slot.departTime,
    returnTime: slot.returnTime || null,
    nonstop: slot.nonstop,
    price: Math.round(base * fareMultiplier * slot.priceFactor * 100) / 100,
    currency,
  }));
}
