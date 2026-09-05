// Real end-to-end test: an actual XRPL Testnet Payment settling a mock
// flight booking via the x402 challenge/response flow.
// Prereqs: `npm run provider:a` running in another terminal.
import "dotenv/config";
import { getClient } from "../xrpl/client.mjs";
import { loadOrCreateWallet } from "../xrpl/wallet.mjs";
import { ensureRlusdTrustline, getRlusdBalance } from "../xrpl/rlusd.mjs";
import { payAndBook } from "../x402/payAndBook.mjs";

const PROVIDER_BASE = process.env.PROVIDER_A_URL || "http://localhost:4001";

const client = await getClient();
const companyWallet = await loadOrCreateWallet(client, "COMPANY_WALLET_SEED");
await ensureRlusdTrustline(client, companyWallet);

const balance = await getRlusdBalance(client, companyWallet.address);
console.log(`[company wallet] ${companyWallet.address} — RLUSD balance: ${balance}`);

if (balance <= 0) {
  console.log(
    `\nNo RLUSD balance yet. Fund this address at https://tryrlusd.com/ with:\n  ${companyWallet.address}\n` +
      `Then re-run this script (save COMPANY_WALLET_SEED=${companyWallet.seed} in .env first so you reuse the same wallet).`,
  );
  await client.disconnect();
  process.exit(0);
}

const trip = { origin: "SIN", destination: "NRT", departDate: "2026-10-12", returnDate: "2026-10-19" };
const qs = new URLSearchParams(trip).toString();
const { providerName, offers } = await fetch(`${PROVIDER_BASE}/quote?${qs}`).then((r) => r.json());
const offer = offers[0];
console.log(`\n${providerName} offer: $${offer.price} ${offer.currency}, depart ${offer.departTime}`);

if (balance < offer.price) {
  console.log(`Balance (${balance}) is less than the fare (${offer.price}) — top up at https://tryrlusd.com/ and retry.`);
  await client.disconnect();
  process.exit(0);
}

const booking = await payAndBook({ client, wallet: companyWallet, providerBase: PROVIDER_BASE, offer, traveler: "Fukutaro Sie" });
console.log("\nBooking confirmed:", booking);
console.log(`Explorer: https://testnet.xrpl.org/transactions/${booking.txHash}`);

await client.disconnect();
