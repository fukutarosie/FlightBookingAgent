import { getClient } from "../xrpl/client.mjs";
import { loadOrCreateWallet } from "../xrpl/wallet.mjs";
import { ensureRlusdTrustline } from "../xrpl/rlusd.mjs";
import { payAndBook } from "../x402/payAndBook.mjs";
import { validateTripRequest, decideAuthorization } from "./policy.mjs";
import { discoverOffers } from "./discovery.mjs";
import { rankOffers } from "./scoring.mjs";
import { logEvent } from "./auditLog.mjs";
import { createPending, getPending, removePending } from "./approvalStore.mjs";
import { chooseOfferWithLLM } from "./llmDecision.mjs";
import { notifyTelegram } from "./notify.mjs";

function makeEmitter(onEvent) {
  return (event) => {
    const entry = logEvent(event);
    onEvent?.(entry);
    return entry;
  };
}

// Shared by the auto-approved path and the post-approval resume path: signs
// and submits the actual XRPL payment for a chosen offer, then confirms the
// booking. This is the ONLY place money moves in the whole system.
async function payForOffer(offer, trip, resources, emit) {
  const ownsClient = !resources.client;
  const client = resources.client || (await getClient());
  try {
    const wallet = resources.wallet || (await loadOrCreateWallet(client, "COMPANY_WALLET_SEED"));
    if (!resources.wallet) await ensureRlusdTrustline(client, wallet);

    const booking = await payAndBook({ client, wallet, providerBase: offer.providerBaseUrl, offer, traveler: trip.traveler });
    emit({ stage: "payment", offerId: offer.offerId, txHash: booking.txHash, pnr: booking.pnr });
    return booking;
  } finally {
    if (ownsClient) await client.disconnect();
  }
}

// The full need -> discovery -> decision -> payment -> outcome loop for one
// trip request. Accepts an already-connected client/wallet (so a caller can
// reuse them across multiple bookings); creates and tears down its own
// otherwise. `resources.onEvent` (optional) is called with each stage event
// as it happens, in addition to the permanent audit log — this is what lets
// a UI show the agent's reasoning live instead of only a final result.
export async function bookFlight(trip, resources = {}) {
  const emit = makeEmitter(resources.onEvent);

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

  // Let Claude weigh the trade-offs and pick among the discovered offers,
  // in place of always taking the fixed scoring formula's top pick. Never
  // trusted for anything beyond *which offer* to prefer — budget/policy
  // enforcement below is entirely deterministic and cannot be swayed by it.
  const llmResult = await chooseOfferWithLLM(trip, ranked);
  let winner = ranked[0];
  let reasoning = { source: "deterministic", rationale: winner.rationale };
  if (llmResult?.offer) {
    winner = llmResult.offer;
    reasoning = { source: "llm", rationale: llmResult.rationale };
  } else if (llmResult?.error) {
    emit({ stage: "reasoning_fallback", message: llmResult.error });
  }
  emit({ stage: "reasoning", source: reasoning.source, offerId: winner.offerId, rationale: reasoning.rationale });

  const auth = decideAuthorization(winner, trip);
  emit({ stage: "authorization", offerId: winner.offerId, decision: auth.decision, reason: auth.reason });

  if (auth.decision !== "AUTO_APPROVED") {
    let pendingId;
    if (auth.decision === "NEEDS_APPROVAL") {
      pendingId = createPending({ trip, offer: winner, ranked, reason: auth.reason });
      emit({ stage: "pending_created", pendingId, offerId: winner.offerId });
      const result = await notifyTelegram(
        `⚠️ *Approval needed*\n${trip.origin} → ${trip.destination}, $${winner.price} ${winner.currency} via ${winner.provider}\n${auth.reason}`,
      );
      emit({ stage: "notification", channel: "telegram", ...result });
    } else if (auth.decision === "REJECTED") {
      const result = await notifyTelegram(`❌ *Booking rejected*\n${trip.origin} → ${trip.destination}\n${auth.reason}`);
      emit({ stage: "notification", channel: "telegram", ...result });
    }
    const outcome = { status: auth.decision, reason: auth.reason, offer: winner, ranked, pendingId };
    emit({ stage: "outcome", status: outcome.status, offerId: winner.offerId, pendingId });
    return outcome;
  }

  const booking = await payForOffer(winner, trip, resources, emit);
  const outcome = { status: "BOOKED", offer: winner, booking, reason: auth.reason, ranked };
  emit({ stage: "outcome", status: outcome.status, offerId: winner.offerId, pnr: booking.pnr });
  return outcome;
}

// Resumes a booking that was held for human sign-off. `action` is "approve"
// or "decline". Re-validates the offer is still available at the approved
// price before paying — a fare quoted when the decision was made isn't
// guaranteed to still hold by the time a human gets to it.
export async function resolveApproval(pendingId, action, resources = {}) {
  const emit = makeEmitter(resources.onEvent);

  const pending = getPending(pendingId);
  if (!pending) throw new Error(`No pending approval found for id ${pendingId} — already resolved or expired.`);

  if (action === "decline") {
    removePending(pendingId);
    emit({ stage: "approval_declined", pendingId, offerId: pending.offer.offerId });
    const outcome = { status: "DECLINED", pendingId, offer: pending.offer };
    emit({ stage: "outcome", status: outcome.status, offerId: pending.offer.offerId });
    return outcome;
  }
  if (action !== "approve") throw new Error(`Unknown approval action: ${action}`);

  emit({ stage: "approval_received", pendingId, offerId: pending.offer.offerId });

  const { offers } = await discoverOffers(pending.trip);
  const stillValid = offers.find((o) => o.offerId === pending.offer.offerId && o.price === pending.offer.price);
  if (!stillValid) {
    removePending(pendingId);
    emit({ stage: "approval_invalidated", pendingId, offerId: pending.offer.offerId });
    const outcome = { status: "EXPIRED", reason: "Offer is no longer available at the approved price — submit a new trip request." };
    emit({ stage: "outcome", status: outcome.status, offerId: pending.offer.offerId });
    return outcome;
  }

  const booking = await payForOffer(pending.offer, pending.trip, resources, emit);
  removePending(pendingId);
  const outcome = { status: "BOOKED", offer: pending.offer, booking, reason: "Approved by a human reviewer.", ranked: pending.ranked };
  emit({ stage: "outcome", status: outcome.status, offerId: pending.offer.offerId, pnr: booking.pnr });
  return outcome;
}
