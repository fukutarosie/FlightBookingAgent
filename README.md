# FlightAgent — AI-Native Corporate Travel Booking on XRPL

An AI agent that fully automates flight booking for a company: given a trip
request (origin, destination, dates, time window, price range), it discovers
fares across multiple providers, decides which one to book against company
policy, pays for it autonomously via **x402** on the **XRP Ledger**, and
delivers the confirmed ticket. For fares within policy, no human touches a
comparison spreadsheet, an approval form, or a payment page; for fares
above the auto-approve threshold, a human reviews and approves before any
money moves.

Built for the [Ripple: AI-Native Business on XRPL](https://github.com/Singhacks-2026/ripple) challenge.

---

## The problem

Booking business travel today is slow and manual: someone compares fares by
hand across airlines/OTAs, waits on manager approval, pays on a corporate
card, then waits days for settlement before the trip is even reconciled.
For companies that book travel often, this is recurring overhead with no
real decision complexity — just tedious comparison and paperwork.

**Target user**: company travel/finance admins and the employees waiting on
their itinerary, at companies that book flights often enough that manual
comparison and approval routing is a genuine, recurring cost.

## What FlightAgent does

Given a trip request, the agent runs the full loop autonomously:

```
Trip request → discover fares → rank against policy → decide
             → pay via x402/XRPL → deliver confirmed ticket
```

Remove the agent and you're back to a human doing comparison and approval by
hand. Remove autonomous payment and you're back to a human-approved card
transaction with days of settlement lag. The agent and the payment are both
load-bearing — that's the point of the challenge.

**Business model**: FlightAgent is a B2B tool for company travel/finance
teams — a flat per-booking fee (or a small margin on settled fares) replaces
the labor cost of a human travel coordinator and the multi-day float cost of
card settlement. Settling instantly in RLUSD on XRPL also avoids card
network interchange fees entirely.

---

## Architecture

```
┌────────────────┐      ┌──────────────────────────────────┐
│  Trip request   │────▶│   FlightAgent orchestrator         │
│ (origin, dest,  │      │   agent/orchestrator.mjs           │
│  dates, price,  │      │   - discovery (agent/discovery.mjs)│
│  time window)   │      │   - ranking (agent/scoring.mjs)    │
└────────────────┘      │   - policy (agent/policy.mjs)      │
                         │   - audit log (agent/auditLog.mjs) │
                         └───────┬──────────────┬─────────────┘
                    GET /quote   │              │  POST /book (x402)
                    (free)       ▼              ▼
                         ┌──────────────┐ ┌──────────────┐
                         │ Aurora Air   │ │ Meridian     │  mock providers
                         │ (provider-a) │ │ Airways (b)  │  providers/
                         └──────┬───────┘ └──────┬───────┘
                                │                 │
                                ▼                 ▼
                         ┌────────────────────────────────┐
                         │   XRP Ledger — Testnet          │
                         │   Company wallet → Provider     │
                         │   wallet, RLUSD Payment tx       │
                         │   xrpl/ (client, wallet, rlusd,  │
                         │   payment, verifyPayment)        │
                         └────────────────────────────────┘
```

### Agent & transaction flow

1. **Discovery** (`agent/discovery.mjs`) — queries every configured
   provider's free `GET /quote` endpoint in parallel; a provider being down
   doesn't block the others.
2. **Ranking** (`agent/scoring.mjs`) — scores each offer against price,
   departure-time fit, and non-stop preference, with a human-readable
   rationale per offer (e.g. *"$0.83 RLUSD, departs 09:15 (preferred
   09:00), non-stop"*).
3. **Policy / authorization** (`agent/policy.mjs`) — three tiers, checked
   *before* any payment code is reachable:
   - `AUTO_APPROVED` — within budget and under the auto-approve limit → agent
     books and pays without human sign-off
   - `NEEDS_APPROVAL` — within budget but above the auto-approve limit →
     held, no payment fires
   - `REJECTED` — exceeds the requester's budget or the company hard cap →
     refused outright
4. **Payment** (`x402/payAndBook.mjs`) — on `AUTO_APPROVED` only: calls the
   winning provider's `POST /book`, receives an **HTTP 402** challenge with
   the exact amount/currency/destination owed, submits a real XRPL
   `Payment` transaction, and retries with the transaction hash as proof.
5. **Verification** (`xrpl/verifyPayment.mjs`) — the provider independently
   checks the referenced transaction on the XRPL ledger (destination,
   amount, currency, `tesSUCCESS`) before confirming — it never trusts the
   client's word for what was paid. Includes replay protection so one
   transaction can't settle two bookings.
6. **Delivery** — the provider returns a confirmed PNR, which the agent
   hands back along with the transaction hash.
7. **Audit trail** (`agent/auditLog.mjs`) — every stage (trip received,
   discovery, ranking, authorization, payment, outcome) is appended to
   `audit-log.jsonl`, so every decision the agent made is inspectable after
   the fact.

### Trust & governance

- **Spending controls**: the policy check runs before payment code is ever
  reachable — an offer that fails policy simply never reaches the payment
  path.
- **Authorization tiers**: auto-book under a threshold, hold for human
  approval above it, refuse outright past a hard cap (see `agent/config.mjs`).
- **Human-in-the-loop approval**: a `NEEDS_APPROVAL` decision is persisted
  to `pending-approvals.json` (`agent/approvalStore.mjs`) — not just held in
  memory — so it survives a page reload or server restart and can be acted
  on later, by anyone with access to the dashboard. The frontend's "Pending
  approvals" panel lists every open item with **Approve**/**Decline**
  buttons. Approving calls `resolveApproval()` (`agent/orchestrator.mjs`),
  which **re-discovers the offer and checks it's still available at the
  approved price** before paying — a fare quoted when the decision was made
  isn't guaranteed to still hold by the time a human gets to it. Declining
  removes the pending item and triggers no payment at all.
- **Traceability**: full decision log per booking in `audit-log.jsonl`,
  including who/what approved or declined a held booking.
- **Payment integrity**: providers price bookings from their own
  server-side quote cache, never from client-supplied values, and reject
  a transaction hash that's already been used for another booking.
- **Failure handling**: a payment that fails on-ledger, or a booking
  confirmation that fails after payment, surfaces as an error rather than
  silently retrying or double-charging.

### Which actions can the agent perform autonomously?

This is the direct answer to the challenge's "which actions can the agent
perform autonomously?" governance question, as actually enforced in code
(`agent/policy.mjs`):

| Action | Autonomous? |
|---|---|
| Query flight quotes from providers | **Always autonomous** — read-only, no cost |
| Rank/score offers against trip preferences | **Always autonomous** — no cost |
| Refuse a booking that exceeds budget or the company hard cap | **Always autonomous** — no money moves either way |
| **Sign and submit the XRPL payment, and confirm the booking** | **Autonomous only if price ≤ auto-approve limit AND price ≤ the requester's own stated budget.** This is the only real financial action in the system, and it's the one action gated by policy. |
| Same payment action, priced between the auto-approve limit and the hard cap | **Requires a human's explicit Approve** — held in `pending-approvals.json` until acted on |
| Same payment action, priced above the hard cap or the requester's budget | **Never allowed, human or not** — outright refusal, no approval path exists |

In short: discovery and ranking are unrestricted because they have no
real-world consequence; the *only* autonomous financial action is the XRPL
payment itself, and it only fires without a human when the price clears
both the requester's own budget and the company's auto-approve threshold.

---

## What's real vs. mocked

Being upfront about this, since it affects how to read the demo:

| Piece | Status |
|---|---|
| XRPL Testnet wallets, RLUSD trustlines, Payment transactions | **Real** — actual on-ledger transactions, see hashes below |
| Payment verification against the ledger | **Real** — checks `tesSUCCESS`, destination, currency, and delivered amount via `account_tx`/`tx` |
| Flight providers (Aurora Air, Meridian Airways) | **Mocked** — two Express services with deterministic pseudo-fares per route, standing in for real airline/OTA APIs |
| Fare amounts | **Scaled down** (~$0.3–1 RLUSD) so a single Testnet RLUSD faucet claim can fully fund an end-to-end demo — not representative of real fare prices |
| x402 challenge/response shape | Modeled on the general x402 pattern; not yet reconciled against the official XRPL x402 Facilitator's exact schema |
| XRPL AI Starter Kit | **Not used** — XRPL calls are hand-rolled directly with `xrpl.js` instead |
| Frontend / UI | **Real** — a live trace panel (`frontend/`) streams each agent stage as it happens |

---

## Setup

**Prerequisites**: Node.js 18+.

```bash
git clone https://github.com/fukutarosie/FlightBookingAgent.git
cd FlightBookingAgent
npm install
cp .env.example .env
```

Leave the wallet seed variables in `.env` blank on first run — each service
will generate and fund a new XRPL Testnet wallet automatically and print the
seed to save.

Start both mock providers (separate terminals):

```bash
npm run provider:a
npm run provider:b
```

The company wallet also needs testnet RLUSD to pay with (XRP alone covers
transaction fees, not the fare itself). Fund it via a Testnet RLUSD faucet,
e.g. [Bithomp's faucet](https://test.bithomp.com/faucet) — paste in the
company wallet address printed on first run, select currency **RLUSD**.

Then run the agent against a trip request:

```bash
npm run agent
```

Trip parameters can be overridden via env vars (see `scripts/run-agent.mjs`):
`TRIP_ORIGIN`, `TRIP_DESTINATION`, `TRIP_DEPART`, `TRIP_RETURN`,
`TRIP_TIME`, `TRIP_MAX_PRICE`, `TRIP_TRAVELER`.

Other scripts:

```bash
npm run test:quotes    # smoke-test both providers' quote/book shape (no real payment)
npm run test:payment   # one real XRPL payment against provider-a directly
```

### Frontend

A live trace panel lets you edit the trip request (origin, destination,
dates, preferred time, price range, traveler name) in a form and watch the
agent's discovery, ranking, authorization decision, payment, and outcome
stream in as they happen — not just a final result.

```bash
npm run frontend
```

Then open [http://localhost:3000](http://localhost:3000). Requires both
providers (`npm run provider:a` / `npm run provider:b`) running first.

---

## Example run

```
$ npm run agent

Decision: BOOKED
Reason: Offer ($0.83) is within budget and under the auto-approve limit ($1) — agent may book without human sign-off.

Booked with provider-a: PNR A2LZ97J
Transaction: https://testnet.xrpl.org/transactions/A7C69D5E9376A94C27452CE4D43B3C60988EDE4B083D873A81F321BDEAC49B90
```

## XRPL transaction hashes (Testnet)

Real, verifiable transactions produced while building and testing this
project:

- [`A7C69D5E9376A94C27452CE4D43B3C60988EDE4B083D873A81F321BDEAC49B90`](https://testnet.xrpl.org/transactions/A7C69D5E9376A94C27452CE4D43B3C60988EDE4B083D873A81F321BDEAC49B90) — booked via `npm run agent` (full orchestrator loop), PNR `A2LZ97J`
- [`9B5FC4397B9209B12C65F841FFFCB738AB01F74C31EAE3E2D5971833401F6B79`](https://testnet.xrpl.org/transactions/9B5FC4397B9209B12C65F841FFFCB738AB01F74C31EAE3E2D5971833401F6B79) — booked via `npm run test:payment`, PNR `ARFEUYH`
- [`C21A0F9FB9E139A8ED2FD2ED369ACCF93B91C4548D958533692B83DDB460A678`](https://testnet.xrpl.org/transactions/C21A0F9FB9E139A8ED2FD2ED369ACCF93B91C4548D958533692B83DDB460A678) — booked via the frontend UI (KUL → BKK), PNR `AV7I6VL`
- [`C76C896E782AC7866BCD192A3385487ADE156EA7915F5A4E85E84E34E220B7F2`](https://testnet.xrpl.org/transactions/C76C896E782AC7866BCD192A3385487ADE156EA7915F5A4E85E84E34E220B7F2) — held as `NEEDS_APPROVAL`, then paid after a human clicked **Approve**, PNR `AJTOWGR`

A parallel `NEEDS_APPROVAL` case was also tested through to **Decline** — no
transaction hash exists for it, which is the point: the payment path is
provably unreachable unless a human approves.

---

## Roadmap / not yet built

- XRPL AI Starter Kit integration in place of hand-rolled `xrpl.js` calls
- Reconcile the 402 challenge shape against the real XRPL x402 Facilitator
- Escrow-based conditional payment release (pay on ticket confirmation
  rather than upfront) as a stronger failure-handling safeguard
- Notify a human when a booking is held for approval (Slack/email) instead
  of relying on someone checking the dashboard

---

## Tech stack

Node.js (ESM) · Express (mock providers) · `xrpl.js` (XRPL Testnet) ·
RLUSD (Testnet issuer `rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV`) · x402-style
payment challenge/response
