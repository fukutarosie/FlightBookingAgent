import { PROVIDERS } from "./config.mjs";

// Queries every configured provider's free /quote endpoint in parallel and
// returns a flat list of offers, tagged with which provider quoted them.
// A provider that's down or errors is skipped, not fatal to discovery.
export async function discoverOffers(trip) {
  const qs = new URLSearchParams({
    origin: trip.origin,
    destination: trip.destination,
    departDate: trip.departDate,
    ...(trip.returnDate ? { returnDate: trip.returnDate } : {}),
  }).toString();

  const results = await Promise.allSettled(
    PROVIDERS.map(async (provider) => {
      const res = await fetch(`${provider.baseUrl}/quote?${qs}`);
      if (!res.ok) throw new Error(`${provider.id} returned ${res.status}`);
      const { offers } = await res.json();
      return offers.map((offer) => ({ ...offer, providerBaseUrl: provider.baseUrl }));
    }),
  );

  const offers = [];
  const errors = [];
  results.forEach((result, idx) => {
    if (result.status === "fulfilled") offers.push(...result.value);
    else errors.push({ provider: PROVIDERS[idx].id, error: String(result.reason) });
  });

  return { offers, errors };
}
