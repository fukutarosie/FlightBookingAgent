// Smoke test for the mock providers: fetch quotes from both, then walk one
// offer through the 402 challenge and a mock-paid booking confirmation.
// Run `npm run provider:a` and `npm run provider:b` in separate terminals first.

const PROVIDERS = [
  { name: "provider-a", base: "http://localhost:4001" },
  { name: "provider-b", base: "http://localhost:4002" },
];

const trip = {
  origin: "SIN",
  destination: "NRT",
  departDate: "2026-10-12",
  returnDate: "2026-10-19",
};

async function getQuotes(base) {
  const qs = new URLSearchParams(trip).toString();
  const res = await fetch(`${base}/quote?${qs}`);
  if (!res.ok) throw new Error(`quote failed: ${res.status}`);
  return res.json();
}

async function attemptBooking(base, offer) {
  const bookRes = await fetch(`${base}/book`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ offerId: offer.offerId, price: offer.price, currency: offer.currency }),
  });

  if (bookRes.status === 402) {
    const challenge = await bookRes.json();
    console.log("  -> 402 payment required:", JSON.stringify(challenge.accepts[0]));

    // Stand-in for a real XRPL payment until the payment client is wired in.
    const fakeProof = Buffer.from(JSON.stringify({ txHash: "MOCK_TX_HASH_" + Date.now() })).toString("base64");

    const confirmRes = await fetch(`${base}/book`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-PAYMENT": fakeProof },
      body: JSON.stringify({ offerId: offer.offerId, traveler: "Fukutaro Sie" }),
    });
    console.log("  -> booking result:", confirmRes.status, await confirmRes.json());
    return;
  }
  console.log("  -> unexpected status", bookRes.status, await bookRes.json());
}

for (const provider of PROVIDERS) {
  console.log(`\n=== ${provider.name} ===`);
  const { providerName, offers } = await getQuotes(provider.base);
  console.log(`${providerName}: ${offers.length} offers`);
  offers.forEach((o) => console.log(`  ${o.offerId}  $${o.price} ${o.currency}  depart ${o.departTime}  nonstop=${o.nonstop}`));

  await attemptBooking(provider.base, offers[0]);
}
