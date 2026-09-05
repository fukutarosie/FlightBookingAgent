import { POLICY } from "./config.mjs";

export function validateTripRequest(trip) {
  const required = ["origin", "destination", "departDate", "priceRange"];
  const missing = required.filter((key) => !trip[key]);
  if (missing.length) throw new Error(`TripRequest missing required field(s): ${missing.join(", ")}`);
  if (!trip.priceRange.max) throw new Error("TripRequest.priceRange.max is required");
}

// Three-tier authorization: auto-book, hold for a human, or refuse outright.
// This check runs BEFORE any payment code is reachable — the decision is
// made on the chosen offer, independent of what the agent would prefer.
export function decideAuthorization(offer, trip) {
  if (offer.price > trip.priceRange.max) {
    return {
      decision: "REJECTED",
      reason: `Cheapest suitable offer ($${offer.price}) exceeds the requester's stated budget ($${trip.priceRange.max}).`,
    };
  }
  if (offer.price > POLICY.hardCap) {
    return {
      decision: "REJECTED",
      reason: `Offer ($${offer.price}) exceeds the company hard cap ($${POLICY.hardCap}) — no approval path.`,
    };
  }
  if (offer.price > POLICY.autoApproveLimit) {
    return {
      decision: "NEEDS_APPROVAL",
      reason: `Offer ($${offer.price}) is within budget but above the auto-approve limit ($${POLICY.autoApproveLimit}) — a human must approve before payment.`,
    };
  }
  return {
    decision: "AUTO_APPROVED",
    reason: `Offer ($${offer.price}) is within budget and under the auto-approve limit ($${POLICY.autoApproveLimit}) — agent may book without human sign-off.`,
  };
}
