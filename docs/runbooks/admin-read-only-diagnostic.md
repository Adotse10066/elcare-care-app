# Admin Read-Only Diagnostic

**Purpose:** Confirm indexer sync state and dependency health without modifying any data.

Run this check first when investigating a support request about stale data, unexpected contract state, or slow UI updates. Share the output before attempting any write operation or state-changing command.

---

## Step 1 — Check the Indexer Health Endpoint

`GET /health` requires no authentication and performs no writes.

```bash
curl -s http://localhost:4000/health | jq '{
  status,
  sync_lag: .checks.sync_lag,
  database:  .checks.database,
  version:   .version
}'
```

**Expected healthy output:**

```json
{
  "status": "ok",
  "sync_lag": { "status": "ok", "latencyMs": 3, "lagLedgers": 4 },
  "database": { "status": "ok", "latencyMs": 12 },
  "version": { "app": "1.0.0", "gitSha": "abc1234" }
}
```

**Fields to include in your support report:**

| Field | What to look for |
|---|---|
| `status` | Top-level health: `"ok"`, `"degraded"`, or `"down"` |
| `checks.sync_lag.lagLedgers` | Ledgers behind chain tip — > 100 indicates meaningful lag |
| `checks.sync_lag.status` | `"ok"` / `"degraded"` / `"down"` |
| `checks.database.status` | Database connectivity |
| `checks.database.latencyMs` | DB query round-trip — > 500 ms warrants investigation |
| `version.app` | Confirms which indexer build is running |

No tokens, secrets, or credentials are returned by this endpoint.

---

## Step 2 — Read the Admin Dashboard Sync Indicator

1. Open the admin dashboard in a browser (wallet connection is not required to view the indicator).
2. Look for the **stale-data banner** directly below the page header.
   - No banner → indexer is healthy and SSE stream is connected.
   - Yellow banner → indexer is lagging or SSE is disconnected.
   - Red banner with `critical_reorg` → do **not** treat on-chain data as final until the notice clears.
3. The session timer in the header shows minutes remaining in the current admin session — protected controls are disabled once this reaches zero.

No write operation is performed by reading this view.

---

## Safe / Unsafe Boundary

| Action | Safe (read-only) |
|---|---|
| `GET /health` (no auth required) | Yes |
| Reading the admin dashboard sync indicator | Yes |
| `GET /health/details` (requires `HEALTH_DETAILS_TOKEN`) | Yes — read-only, but needs the bearer token |
| Any `POST /admin/*` endpoint | **No** — write operation |
| Any smart-contract transaction from the admin panel | **No** — on-chain write |

Never share the value of `HEALTH_DETAILS_TOKEN` in a support report.

---

## Related Runbooks

- [Stalled Ingestion](./stalled-ingestion.md) — when `lagLedgers` is high or `sync_lag.status` is `"degraded"`
- [Database Outage](./database-outage.md) — when `database.status` is `"down"`
- [Compromised Admin Key](./compromised-admin-key.md) — when unexpected state changes are visible
