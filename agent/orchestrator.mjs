import { getClient } from "../xrpl/client.mjs";
import { loadOrCreateWallet } from "../xrpl/wallet.mjs";
import { ensureRlusdTrustline } from "../xrpl/rlusd.mjs";
import { payAndBook } from "../x402/payAndBook.mjs";
import { validateTripRequest, decideAuthorization } from "./policy.mjs";
import { discoverOffers } from "./discovery.mjs";
import { rankOffers } from "./scoring.mjs";
import { logEvent } from "./auditLog.mjs";

// The full need -> discovery -> decision -> payment -> outcome loop for one
// trip request. Accepts an already-connected client/wallet (so a caller can
// reuse them across multiple bookings); creates and tears down its own
// otherwise. `resources.onEvent` (optional) is called with each stage event
// as it happens, in addition to the permanent audit log — this is what lets
// a UI show the agent's reasoning live instead of only a final result.
export async function bookFlight(trip, resources = {}) {
  const emit = (event) => {
    const entry = logEvent(event);
    resources.onEvent?.(entry);
    return entry;
  };

  validateTripRequest(trip);
  emit({ stage: "trip_received", trip });

  const { offers, errors } = await discoverOffers(trip);
  emit({ stage: "discovery", offersFound: offers.length, providerErrors: errors });
  if (offers.length === 0) {
    const outcome = { status: "NO_OFFERS", errors };
    emit({ stage: "outcome", ...outcome });
    return outcome;
  }

  const ranked = rankOffers(offers, trip);
  emit({
    stage: "ranking",
    ranked: ranked.map(({ offerId, provider, price, score, rationale }) => ({ offerId, provider, price, score, rationale })),
  });

  const winner = ranked[0];
  const auth = decideAuthorization(winner, trip);
  emit({ stage: "authorization", offerId: winner.offerId, decision: auth.decision, reason: auth.reason });

  if (auth.decision !== "AUTO_APPROVED") {
    const outcome = { status: auth.decision, reason: auth.reason, offer: winner, ranked };
    emit({ stage: "outcome", status: outcome.status, offerId: winner.offerId });
    return outcome;
  }

  const ownsClient = !resources.client;
  const client = resources.client || (await getClient());
  try {
    const wallet = resources.wallet || (await loadOrCreateWallet(client, "COMPANY_WALLET_SEED"));
    if (!resources.wallet) await ensureRlusdTrustline(client, wallet);

    const booking = await payAndBook({
      client,
      wallet,
      providerBase: winner.providerBaseUrl,
      offer: winner,
      traveler: trip.traveler,
    });
    emit({ stage: "payment", offerId: winner.offerId, txHash: booking.txHash, pnr: booking.pnr });

    const outcome = { status: "BOOKED", offer: winner, booking, reason: auth.reason, ranked };
    emit({ stage: "outcome", status: outcome.status, offerId: winner.offerId, pnr: booking.pnr });
    return outcome;
  } finally {
    if (ownsClient) await client.disconnect();
  }
}
