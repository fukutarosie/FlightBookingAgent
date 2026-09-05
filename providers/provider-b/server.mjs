import "dotenv/config";
import { createProviderServer } from "../shared/createProviderServer.mjs";

const PORT = process.env.PORT_B || 4002;

const app = createProviderServer({
  providerId: "provider-b",
  providerName: "Meridian Airways",
  fareMultiplier: 1.08, // pricier, but better schedule
  xrplAddress: process.env.PROVIDER_B_XRPL_ADDRESS || "rPROVIDERB_PLACEHOLDER",
  timeSlots: [
    { departTime: "06:45", returnTime: "15:20", nonstop: true, priceFactor: 1.0 },
    { departTime: "11:00", returnTime: "19:50", nonstop: true, priceFactor: 0.95 },
  ],
});

app.listen(PORT, () => console.log(`[provider-b] Meridian Airways listening on :${PORT}`));
