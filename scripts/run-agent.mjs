// Runs FlightAgent's full loop against one trip request:
// need -> discovery -> ranking -> policy decision -> payment -> outcome.
// Prereqs: `npm run provider:a` and `npm run provider:b` running.
import "dotenv/config";
import { bookFlight } from "../agent/orchestrator.mjs";

const trip = {
  origin: process.env.TRIP_ORIGIN || "SIN",
  destination: process.env.TRIP_DESTINATION || "NRT",
  departDate: process.env.TRIP_DEPART || "2026-10-12",
  returnDate: process.env.TRIP_RETURN || "2026-10-19",
  preferredTime: process.env.TRIP_TIME || "09:00",
  priceRange: { max: Number(process.env.TRIP_MAX_PRICE || 5) },
  traveler: process.env.TRIP_TRAVELER || "Fukutaro Sie",
};

console.log("Trip request:", trip, "\n");

const outcome = await bookFlight(trip);

console.log(`Decision: ${outcome.status}`);
if (outcome.reason) console.log(`Reason: ${outcome.reason}`);
if (outcome.ranked) {
  console.log("\nOffers considered:");
  outcome.ranked.forEach((o) => console.log(`  [${o.score.toFixed(2)}] ${o.provider}: ${o.rationale}`));
}
if (outcome.status === "BOOKED") {
  console.log(`\nBooked with ${outcome.offer.provider}: PNR ${outcome.booking.pnr}`);
  console.log(`Transaction: https://testnet.xrpl.org/transactions/${outcome.booking.txHash}`);
}
