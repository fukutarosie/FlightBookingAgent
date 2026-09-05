import "dotenv/config";
import { createProviderServer } from "../shared/createProviderServer.mjs";

const PORT = process.env.PORT_A || 4001;

const app = createProviderServer({
  providerId: "provider-a",
  providerName: "Aurora Air",
  fareMultiplier: 0.92, // slightly cheaper overall
  xrplAddress: process.env.PROVIDER_A_XRPL_ADDRESS || "rPROVIDERA_PLACEHOLDER",
  timeSlots: [
    { departTime: "09:15", returnTime: "17:40", nonstop: true, priceFactor: 1.0 },
    { departTime: "14:30", returnTime: "21:10", nonstop: false, priceFactor: 0.85 },
  ],
});

app.listen(PORT, () => console.log(`[provider-a] Aurora Air listening on :${PORT}`));
