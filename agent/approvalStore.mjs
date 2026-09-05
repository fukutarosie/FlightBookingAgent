import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

// Persisted queue of bookings held for human sign-off. Deliberately a plain
// JSON file, not in-memory — a pending decision must survive a page reload,
// a server restart, or someone else picking it up later.
const STORE_PATH =
  process.env.APPROVALS_STORE_PATH || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "pending-approvals.json");

function readStore() {
  if (!fs.existsSync(STORE_PATH)) return {};
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function writeStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

export function createPending({ trip, offer, ranked, reason }) {
  const store = readStore();
  const id = crypto.randomUUID();
  store[id] = { id, trip, offer, ranked, reason, createdAt: new Date().toISOString() };
  writeStore(store);
  return id;
}

export function getPending(id) {
  return readStore()[id] || null;
}

export function listPending() {
  return Object.values(readStore()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function removePending(id) {
  const store = readStore();
  delete store[id];
  writeStore(store);
}
