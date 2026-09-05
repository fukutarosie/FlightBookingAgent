import "dotenv/config";
import { getClient } from "../../xrpl/client.mjs";
import { loadOrCreateWallet } from "../../xrpl/wallet.mjs";
import { ensureRlusdTrustline } from "../../xrpl/rlusd.mjs";
import { createProviderServer } from "../shared/createProviderServer.mjs";

const PORT = process.env.PORT_B || 4002;

const xrplClient = await getClient();
const receivingWallet = await loadOrCreateWallet(xrplClient, "PROVIDER_B_WALLET_SEED");
await ensureRlusdTrustline(xrplClient, receivingWallet); // must trust the issuer before it can receive RLUSD

const app = createProviderServer({
  providerId: "provider-b",
  providerName: "Meridian Airways",
  fareMultiplier: 1.08, // pricier, but better schedule
  xrplAddress: receivingWallet.address,
  xrplClient,
  timeSlots: [
    { departTime: "06:45", returnTime: "15:20", nonstop: true, priceFactor: 1.0 },
    { departTime: "11:00", returnTime: "19:50", nonstop: true, priceFactor: 0.95 },
  ],
});

app.listen(PORT, () => console.log(`[provider-b] Meridian Airways listening on :${PORT}, XRPL address ${receivingWallet.address}`));
