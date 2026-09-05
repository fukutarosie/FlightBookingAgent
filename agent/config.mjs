export const PROVIDERS = [
  { id: "provider-a", name: "Aurora Air", baseUrl: process.env.PROVIDER_A_URL || "http://localhost:4001" },
  { id: "provider-b", name: "Meridian Airways", baseUrl: process.env.PROVIDER_B_URL || "http://localhost:4002" },
];

// Testnet-scaled thresholds (real fares are ~$0.2-1 here; in production these
// would be real currency amounts, e.g. AUTO_APPROVE_LIMIT=800, HARD_CAP=2500).
export const POLICY = {
  // Agent may book without human approval up to this amount.
  autoApproveLimit: Number(process.env.AUTO_APPROVE_LIMIT ?? 1.0),
  // Above this, the agent refuses outright rather than holding for approval.
  hardCap: Number(process.env.HARD_CAP ?? 2.0),
};
