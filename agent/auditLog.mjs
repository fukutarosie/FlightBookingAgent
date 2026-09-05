import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LOG_PATH = process.env.AUDIT_LOG_PATH || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "audit-log.jsonl");

export function logEvent(event) {
  const entry = { timestamp: new Date().toISOString(), ...event };
  fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n");
  return entry;
}

export function readAuditLog() {
  if (!fs.existsSync(LOG_PATH)) return [];
  return fs
    .readFileSync(LOG_PATH, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
