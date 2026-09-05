import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

let client;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

function buildPrompt(trip, offers) {
  const offerLines = offers
    .map(
      (o) =>
        `- offerId=${o.offerId} provider=${o.provider} price=$${o.price} ${o.currency} departs=${o.departTime}${o.returnTime ? ` returns=${o.returnTime}` : ""} nonstop=${o.nonstop}`,
    )
    .join("\n");

  return `You are a corporate travel booking agent choosing a flight on behalf of an employee. Weigh price, how closely the departure time matches their stated preference, and whether the flight is non-stop.

Trip request:
- Route: ${trip.origin} to ${trip.destination}
- Depart: ${trip.departDate}${trip.returnDate ? `, return ${trip.returnDate}` : " (one-way)"}
- Preferred departure time: ${trip.preferredTime || "no preference stated"}
- Maximum budget: $${trip.priceRange.max}
- Traveler: ${trip.traveler}

Available offers:
${offerLines}

Choose exactly one offer by its offerId. Respond with ONLY a JSON object and nothing else, in this exact shape:
{"offerId": "<one of the offerIds above, verbatim>", "rationale": "<one or two sentences explaining the trade-off you made>"}`;
}

// Asks Claude to pick among the discovered offers and explain why, in place
// of the fixed scoring formula's mechanical pick. Returns null (never
// throws) if no API key is configured, the call fails, or the model's
// answer can't be trusted — callers must fall back to the deterministic
// top-ranked offer in every one of those cases. The model is never allowed
// to affect budget/policy enforcement, only which in-budget offer to prefer.
export async function chooseOfferWithLLM(trip, offers) {
  const anthropic = getClient();
  if (!anthropic) return null;

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: "user", content: buildPrompt(trip, offers) }],
    });
  } catch (err) {
    return { error: String(err.message || err) };
  }

  const text = response.content.find((block) => block.type === "text")?.text || "";
  let parsed;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : text);
  } catch {
    return { error: "Model response was not valid JSON" };
  }

  const chosen = offers.find((o) => o.offerId === parsed.offerId);
  if (!chosen) return { error: `Model chose an offerId not in the discovered set: ${parsed.offerId}` };

  return { offer: chosen, rationale: parsed.rationale || "Chosen by AI reasoning." };
}
