function minutesSinceMidnight(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function timeFit(offerTime, preferredTime) {
  const diff = Math.abs(minutesSinceMidnight(offerTime) - minutesSinceMidnight(preferredTime));
  return 1 - Math.min(diff, 720) / 720; // 0 (12h+ away) to 1 (exact match)
}

// Ranks discovered offers against the trip's stated constraints. Price
// dominates the score; departure-time fit and nonstop are secondary, only
// applied when the requester actually cares (preferredTime given).
export function rankOffers(offers, trip) {
  const hasTimePreference = Boolean(trip.preferredTime);
  const priceWeight = hasTimePreference ? 0.6 : 0.9;
  const timeWeight = hasTimePreference ? 0.3 : 0;
  const nonstopWeight = 0.1;

  const scored = offers.map((offer) => {
    const priceFit = (trip.priceRange.max - offer.price) / trip.priceRange.max;
    const tFit = hasTimePreference ? timeFit(offer.departTime, trip.preferredTime) : 0;
    const nonstopBonus = offer.nonstop ? nonstopWeight : 0;
    const score = priceFit * priceWeight + tFit * timeWeight + nonstopBonus;

    const reasons = [`$${offer.price} ${offer.currency}`];
    if (hasTimePreference) reasons.push(`departs ${offer.departTime} (preferred ${trip.preferredTime})`);
    if (offer.nonstop) reasons.push("non-stop");

    return { ...offer, score, rationale: reasons.join(", ") };
  });

  return scored.sort((a, b) => b.score - a.score);
}
