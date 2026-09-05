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

Call choose_offer with exactly one offerId from the list above.`;
}

const CHOOSE_OFFER_TOOL = {
  name: "choose_offer",
  description: "Select the single best flight offer for the traveler and explain the trade-off.",
  input_schema: {
    type: "object",
    properties: {
      offerId: { type: "string", description: "Must exactly match one offerId from the list provided in the prompt." },
      rationale: { type: "string", description: "One or two sentences explaining the trade-off made." },
    },
    required: ["offerId", "rationale"],
  },
};

// Asks Claude to pick among the discovered offers and explain why, in place
// of the fixed scoring formula's mechanical pick. Returns null (never
// throws) if no API key is configured, the call fails, or the model's
// answer can't be trusted — callers must fall back to the deterministic
// top-ranked offer in every one of those cases. The model is never allowed
// to affect budget/policy enforcement, only which in-budget offer to prefer.
//
// Uses tool use (forced via tool_choice) rather than prompting for JSON in
// prose — the model's answer is structurally guaranteed to parse, instead
// of relying on regex-extracting a JSON blob out of free text. (Note:
// `temperature` is not configurable on this model family — Anthropic
// rejects the request if it's set at all — so consistency here comes from
// the tight, criteria-bound prompt rather than a sampling parameter.)
export async function chooseOfferWithLLM(trip, offers) {
  const anthropic = getClient();
  if (!anthropic) return null;

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      tools: [CHOOSE_OFFER_TOOL],
      tool_choice: { type: "tool", name: "choose_offer" },
      messages: [{ role: "user", content: buildPrompt(trip, offers) }],
    });
  } catch (err) {
    return { error: String(err.message || err) };
  }

  const toolUse = response.content.find((block) => block.type === "tool_use" && block.name === "choose_offer");
  if (!toolUse) return { error: "Model did not return a choose_offer tool call" };

  const { offerId, rationale } = toolUse.input;
  const chosen = offers.find((o) => o.offerId === offerId);
  if (!chosen) return { error: `Model chose an offerId not in the discovered set: ${offerId}` };

  return { offer: chosen, rationale: rationale || "Chosen by AI reasoning." };
}
