import { Wallet } from "xrpl";

// Loads a wallet from a seed env var if provided, otherwise funds a brand
// new one from the Testnet faucet (XRP only — RLUSD still needs a trustline
// plus a manual top-up from https://tryrlusd.com/, see rlusd.mjs).
export async function loadOrCreateWallet(client, seedEnvVar) {
  const seed = process.env[seedEnvVar];
  if (seed) {
    return Wallet.fromSeed(seed);
  }
  const { wallet } = await client.fundWallet();
  console.log(
    `[wallet] No ${seedEnvVar} set — generated and funded a new Testnet wallet.\n` +
      `  address: ${wallet.address}\n` +
      `  seed:    ${wallet.seed}\n` +
      `  Save the seed to your .env as ${seedEnvVar} to reuse this wallet.`,
  );
  return wallet;
}
