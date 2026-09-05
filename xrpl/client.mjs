import { Client } from "xrpl";

const TESTNET_WS = process.env.XRPL_WS_URL || "wss://s.altnet.rippletest.net:51233";

export async function getClient() {
  const client = new Client(TESTNET_WS);
  await client.connect();
  return client;
}
