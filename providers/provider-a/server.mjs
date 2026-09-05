import "dotenv/config";
import { getClient } from "../../xrpl/client.mjs";
import { loadOrCreateWallet } from "../../xrpl/wallet.mjs";
import { ensureRlusdTrustline } from "../../xrpl/rlusd.mjs";
import { createProviderServer } from "../shared/createProviderServer.mjs";

const PORT = process.env.PORT_A || 4001;

const xrplClient = await getClient();
const receivingWallet = await loadOrCreateWallet(xrplClient, "PROVIDER_A_WALLET_SEED");
await ensureRlusdTrustline(xrplClient, receivingWallet); // must trust the issuer before it can receive RLUSD

const app = createProviderServer({
  providerId: "provider-a",
  providerName: "Aurora Air",
  fareMultiplier: 0.92, // slightly cheaper overall
  xrplAddress: receivingWallet.address,
  xrplClient,
  timeSlots: [
    { departTime: "09:15", returnTime: "17:40", nonstop: true, priceFactor: 1.0 },
    { departTime: "14:30", returnTime: "21:10", nonstop: false, priceFactor: 0.85 },
  ],
});

app.listen(PORT, () => console.log(`[provider-a] Aurora Air listening on :${PORT}, XRPL address ${receivingWallet.address}`));
