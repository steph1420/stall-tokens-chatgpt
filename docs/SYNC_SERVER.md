# Sync server (Go) — design (Q-SYNC-GO, Q-SHEET-FLUSH, Q-GO-HOST, Q-GO-PUSH B, Q-GO-WHEN B)
Written by Pos, 16 Nov 2026, 23:40 IST; revised 16 Nov 2026, 23:36 IST for Q-GO-HOST (t80u); revised 16 Nov 2026, 23:45 IST for Q-GO-PUSH B and Q-GO-WHEN B. **Design for 2.2.0; no server code in 2.1.0.**

**Locks this follows (Steve)**
- **Q-SYNC-GO (t77u):** devices sync directly with a Go server using JSON, not through Google Sheets. Devices report regularly; the server sends updates to any device that is behind. A quick check tells whether a device is up to date.
- **Q-SHEET-FLUSH (t78u):** the server keeps the Google Sheet updated and never sleeps with unsent changes.
- **Q-GO-HOST (t80u, 23:28 IST):** "Go server writes to Google Sheets. On every restart, It'll read from sheets and triangulate with devices to figure out the latest info." The Google Sheet hidden `ops` log is the durable store. The server keeps no database of its own as source of truth. An in-memory or throwaway on-disk cache for speed is fine; losing it is harmless. Hosted on Render free.
- **Q-GO-WHEN B (16 Nov 23:44 IST):** 2.1.0 ships on the current Code.gs bridge with the digest freshness check added. This Go server is built in 2.2.0, as its own release, Beta first.
- **Q-GO-PUSH B (16 Nov 23:44 IST):** devices keep heartbeat polling and add an SSE live stream (`GET /v1/stream`) while a screen is open.

**Also follows**
- Q-HARM-10, unchanged: op log, Lamport + version vectors, duplicates ignored, seq gaps resent, Sheet edits come in as writer `sheet`, conflicts are recorded and never silent. Never newest-timestamp-wins.
- Q-SYNC-ALL and Q-RECEIPT-SYNC C: every change is an op; no images are synced.
- The earlier spec `handovers/pos/state/SPEC_SHEET_2026-11-16.md` (a Go server on Render). **Q-GO-HOST supersedes that spec's "database as the source of truth, the Sheet as a mirror":** the Sheet hidden ops log is the durable store; the server is a live cache and a flush path.
- 07-stack-reference (the LFPS Go relay pattern) and LFPS-SOW `SERVER_SHEET_V2_PLAN` §12, except where Q-GO-HOST differs on the store.

## 1. Shape
```
devices (PWA, IndexedDB op log)  ⇄  JSON over HTTPS  ⇄  Go server (in-memory / throwaway cache only)
                                                              │  durable store (Sheets API, service account)
                                                              ▼
                                                     Google Sheet "Stall Tokens — Data (v2)"
                                                     hidden `ops` log = source of truth
                                                     (readable info tabs are projections)
```
- The app's `Transport` interface (ARCHITECTURE §4.3) gains a `goTransport` adapter. The contract, fold and screens don't change.
- The Apps Script `Code.gs` transport stays as a **fallback** (§7).

## 2. Repo layout (`server/` in stall-tokens; Go 1.23, exact pins in `go.mod`/`go.sum`)
```
server/
  cmd/stallsync/main.go          start-up, config from env, rebuild from the Sheet, graceful shutdown (SIGTERM → flush pending Sheet writes)
  internal/op/                   the op contract in Go (mirrors src/contract/op.ts; contract tests share JSON fixtures)
  internal/store/                in-memory op cache (optional throwaway on-disk cache; losing it is harmless): ops, writers, pending_flush. Rebuilt from the Sheet on every boot.
  internal/digest/               freshness digest (§4)
  internal/api/                  HTTP handlers: heartbeat, push, pull, health; auth middleware
  internal/mirror/               Sheet durable store: debounce/batch writer, Sheets API client behind an interface + fake. Ack to a device only after the Sheet write lands.
  internal/sheetin/              Sheet edits → ops from writer `sheet` (diff of info tabs vs last flushed values)
  internal/*/..._test.go         table tests; `go test -race ./...` in CI
  Dockerfile, render.yaml        Render free (Q-GO-HOST)
```
06 rules apply to the server too: 0, 1, 4 (each outside system has an interface and a fake), 6, 7, 10–13. It carries a version string, and all limits and URLs live in one config block.

## 3. Endpoints (JSON, HTTPS; header `Authorization: Bearer <stall key>`; protocol 3)
| Endpoint | Request | Response |
| --- | --- | --- |
| `POST /v1/heartbeat` | `{ device, app_version, digest }` | `{ state: "latest" \| "behind" \| "ahead" \| "diverged", ops?: Op[] (missing, up to batch), want?: {writer, fromSeq}[], server_digest, sheet: {last_at, pending} }` |
| `POST /v1/ops` (push) | `{ ops: Op[] }` | `{ stored: opId[], resend: {writer, fromSeq}[] }`. Idempotent by `op_id`. `stored` is returned only after those ops have been written to the Sheet. |
| `GET /v1/ops?after=<cursor>&limit=` (pull) | — | `{ ops, cursor }` (cursor = hidden `ops` tab row, or the last `op_id` in the batch) |
| `GET /v1/health` | — | `{ ok, version, ops, writers, sheet: {last_at, pending, last_error, rebuilt_at} }` (no secrets) |
| `GET /v1/stream` | SSE | `ops` events as they are written to the Sheet (Q-GO-PUSH B). Used while a screen is open; the heartbeat poll remains the fallback. |

## 4. Freshness digest (the "quick way to check", t77u)
- `digest = { vv: {writer: maxSeq}, count: totalOps, sum: first 8 hex chars of SHA-256(sorted opIds joined by "\n") }`.
- The server compares it per writer against the cache it rebuilt from the Sheet (and any ops flushed since):
  - every `vv` entry and the count equal **and** the sum matches → `latest`;
  - the device is missing seqs → `behind`, and the server sends those ops in the same reply;
  - the device has seqs the Sheet (and cache) lack → `ahead`, and the server lists `want`, so the device pushes them; the server writes them to the Sheet, then acks;
  - same vv but a different sum → `diverged` (a hole in the middle), so both sides exchange their op-id lists for the writers involved.
- The device sends a heartbeat every `CONFIG.sync.heartbeatMs` (15 s when visible, 60 s when hidden), and at once after any local op (debounced 500 ms), on app open, and when the device comes back online.
- Cost: one small POST; the reply is empty when `latest`.

## 5. Offline-first (unchanged on the device)
- Every op is saved to IndexedDB first, then queued in the transport outbox (Q-HARM-2). While offline, the outbox grows and the Sync dot shows a cloud with a slash. On reconnect: heartbeat → push → pull.
- **Ack after the Sheet write.** The server does not confirm a push until those ops are in the hidden `ops` log. Devices keep the ops in the outbox until that ack arrives. If the server dies before the flush, the device still has the ops and will push them again (idempotent by `op_id`). Nothing is lost.
- Ops are idempotent and the fold sorts by Lamport order, so any arrival order gives the same state.

## 6. Sheet as the durable store (Q-GO-HOST + Q-SHEET-FLUSH)
- The hidden `ops` log is the only source of truth. The readable info tabs are projections, rewritten from the fold, as Code.gs does now.
- A flush worker batches pending ops every `mirrorDebounceMs` (2 s; max batch 500) and writes the `ops` log and the projections in as few Sheets API calls as possible.
- **Sheet write quotas.** The Sheets API rate-limits writes (and has a daily cap). One write per op would blow the quota. Batching and the 2 s debounce are required, not optional. On HTTP 429 or a quota error: log it (STYLE_GUIDE 13), back off with a limit, surface the last error on `/v1/health` and in Settings › Sync, and keep the ops un-acked so devices retry. Never silently drop a write.
- **Never sleeps with unsent changes:**
  - On SIGTERM: stop taking requests, flush pending ops to the Sheet (up to `shutdownFlushMs` 20 s), then exit.
  - The in-memory `pending_flush` queue is not durable. Recovery is: devices still hold un-acked ops (§5), and on boot the server rebuilds from the Sheet then reconciles with those devices (§6a).
  - Retries use backoff with a limit and are logged (STYLE_GUIDE 13). The last error shows in `/v1/health` and in the app's Settings › Sync ("Sheet updated 23:41 · 0 waiting").
  - On Render free (which idles after about 15 minutes with no traffic): the server refuses to idle while `pending_flush` isn't empty. A keep-alive ping from the device's heartbeat keeps it awake while devices are active. Once the Sheet is flushed, sleeping is fine: the next cold start rebuilds from the Sheet (§6a).
- **Sheet edits:** `sheetin` polls the info tabs every `sheetPollMs` (30 s) and diffs them against the last flushed values. Each changed cell becomes an op from writer `sheet` (the Sheet wins a true clash, Q-HARM-10). Invalid rows are listed in `conflicts`, never silently dropped (LFPS-SOW kit).
- **Auth to Google:** a service account JSON in the host's secret store only. Never in the repo, the app or chat. Steve shares the Sheet with the service account's email.

## 6a. Restart and reconcile (Q-GO-HOST)
On every start or cold start:
1. The process begins with an empty cache.
2. It reads the Sheet's hidden `ops` log and rebuilds the in-memory (or throwaway on-disk) cache: ops, writers, digests, projections.
3. As each device heartbeats, the server compares digests (§4):
   - device behind → send the missing ops from the rebuilt cache;
   - device ahead → ask for those ops, write them to the Sheet, then ack;
   - diverged → exchange op-id lists and repair, then flush any recovered ops to the Sheet.
This is how the server "triangulates with devices to figure out the latest info." Ops that never reached the Sheet (a crash before flush) come back from the devices that still hold them.

## 7. What happens to Code.gs 2.0.0 (already deployed)
- It stays deployed as the **fallback transport** and the **Sheet-edit hook**. If the Go server is down, the app can still sync through Code.gs (a transport list setting; ops are idempotent, so both paths can run).
- When the Go server is live, Code.gs stops writing projections (the server owns them) and keeps only its `onEdit` hook, which posts edits to the server's `sheet` intake. This is cheaper than polling.
- The 60-day compaction (Q-SHEET-COMPACT A) moves to the server in 2.2.0: Drive backup of the Sheet first, then compact the hidden `ops` log. In 2.1.0, Code.gs 2.1.0 does it as BUILD_PLAN §5 says (Q-GO-WHEN B).

## 8. Auth and secrets
- The stall key is a server env secret. Devices hold it in their sync settings (it's per-device and never synced, FEATURES §0.1) and get it through sign-in links. It is never in the repo; the leak scan checks for it.
- Rate limit per device. A wrong key gets 401 and the app shows "Sync key not right".
- Beta (Q-BETA-PATH B) has no server config by default and must never point at Steve's real server unless he sets it on that device.

## 9. Tests
- Go: table tests for the digest, idempotent push, gap resend and the diverged case; a Sheet writer with a fake Sheets client (debounce, batching, 429 backoff); crash before the Sheet write → no ack, device resends, write lands, then ack; SIGTERM flush; boot rebuild from a Sheet fixture; device-ahead after restart → ops written back to the Sheet; `sheetin` diffs → `sheet` ops; `go test -race`.
- Shared JSON fixtures between Vitest and Go (the same ops must give the same fold hash on both sides).
- TS: `goTransport` against a fake server; outbox held until a Sheet-write ack; the existing transport contract tests.

## 10. Locked choices (no open Q-IDs left on this design)
- **Q-GO-HOST** (t80u, 23:28 IST): Render free; Sheet hidden `ops` log = durable store; no server database as source of truth. See §1, §6 and §6a.
- **Q-GO-PUSH B** (16 Nov 23:44 IST): heartbeat polling plus an SSE stream while a screen is open (near-instant kitchen tickets, plain HTTP, auto-reconnect). A was polling only; C was WebSocket.
- **Q-GO-WHEN B** (16 Nov 23:44 IST): 2.1.0 ships on the current Code.gs bridge with the digest freshness check added; this server is 2.2.0, Beta first. A was build it inside 2.1.0; C was the Go server first.
