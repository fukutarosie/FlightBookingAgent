import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bookFlight } from "../agent/orchestrator.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT_FRONTEND || 3000;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Streams newline-delimited JSON: one line per agent stage event as it
// happens, then a final {stage:"done"} or {stage:"error"} line.
app.post("/api/book", async (req, res) => {
  res.writeHead(200, {
    "content-type": "application/x-ndjson",
    "cache-control": "no-cache",
    "transfer-encoding": "chunked",
  });

  const write = (obj) => res.write(JSON.stringify(obj) + "\n");
  const { origin, destination, departDate, returnDate, preferredTime, maxPrice, traveler } = req.body || {};

  const trip = {
    origin,
    destination,
    departDate,
    returnDate: returnDate || undefined,
    preferredTime: preferredTime || undefined,
    priceRange: { max: Number(maxPrice) },
    traveler: traveler || "Guest Traveler",
  };

  try {
    const outcome = await bookFlight(trip, { onEvent: write });
    write({ stage: "done", outcome });
  } catch (err) {
    write({ stage: "error", message: String(err.message || err) });
  } finally {
    res.end();
  }
});

app.listen(PORT, () => console.log(`[frontend] FlightAgent UI listening on :${PORT}`));
