# Cron troubleshooting — daily billing snapshot

The daily cron writes per-device heartbeat rows (`hardware_heartbeats`)
and tier snapshots (`client_tier_snapshots`) that drive monthly
compute-node billing. The new peak-day billing math only works if
that table accumulates one row per device per day.

## Health check — has the cron actually been running?

```sh
# From repo root, with .env.local pointing at prod DB:
node -e '
  const path = require("path");
  require("dotenv").config({ path: path.resolve(".env.local") });
  const { Client } = require("pg");
  (async () => {
    const c = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
    await c.connect();
    const r = await c.query("select min(heartbeat_date) as oldest, max(heartbeat_date) as newest, count(distinct heartbeat_date) as days from hardware_heartbeats");
    console.log(r.rows[0]);
    await c.end();
  })();
'
```

**Healthy:** `newest` is yesterday or today (depending on time of
day, since cron fires at 02:00 UTC) and `days` is ≥ ~28 for any
month-long billing run.

**Broken:** `days` is 1 or 2 and the most recent date is several days
ago — the cron is not firing.

## Three likely failure modes

### 1. `CRON_SECRET` env var missing in Vercel

The route bails with 401 if `Authorization: Bearer <secret>` doesn't
match. In production we don't want the dev-mode bypass.

**Fix:**

1. Pick a random 32+ char string: `openssl rand -hex 32`
2. **Vercel dashboard → Project → Settings → Environment Variables**
3. Add `CRON_SECRET` for **Production** scope. Save.
4. Redeploy (or push any commit) so the new env var binds.
5. Add the same value as a **GitHub repo secret** named
   `CRON_BEARER_TOKEN`, prefixed with `Bearer ` (e.g.
   `Bearer 8f3a1e7c…`). The backup workflow uses it as the `Authorization`
   header — must match exactly.

### 2. Vercel plan cron limits

| Plan | Daily crons allowed | Schedule resolution |
|---|---|---|
| Hobby | 2 jobs total | Once per day max |
| Pro | 40 jobs total | Any cron expression |
| Enterprise | Unlimited | Any |

Our `vercel.json` is now down to **2 crons** (daily + weekly-renewal),
so we fit Hobby. The three pre-existing routes
(`/snapshot-tiers`, `/sync-vendor-seats`, `/renewal-reminders`) are
still callable directly for manual debug, but the only Vercel-managed
cron is `/api/cron/daily`.

**Check current plan:** Vercel dashboard → Project → Settings → top-of-page
plan badge. If on Hobby and you want more granular scheduling, upgrade
to Pro (\$20/user/mo).

### 3. Cron registered but not firing

Sometimes Vercel cron silently skips runs — quota issues, region
problems, or a cold-start timeout on the function call.

**Check the Vercel logs:**

1. Dashboard → Project → **Logs** tab
2. Filter `path` = `/api/cron/daily`
3. Look for entries with `x-vercel-cron` header set.

If there's no entry for the last 24 h, Vercel didn't fire the cron.
The GitHub Actions backup (`.github/workflows/daily-cron-backup.yml`)
runs 30 min later and should catch this.

## Manual recovery — run today's capture from your laptop

```sh
# Captures today's heartbeats for every org, every active hardware.
# Idempotent — re-running on the same day no-ops.
pnpm exec tsx scripts/capture-heartbeats-now.ts
```

Use this when:
- The cron didn't fire and you need today's heartbeats before EOD.
- You added a new client mid-month and want their first heartbeat
  before tomorrow's cron run.
- You're catching up after a Vercel outage.

For the vendor-seat side (Liongard, BD, TitanHQ, Ingram, UniFi), the
Integrations dashboard has a per-connection **Sync now** button that
calls `runSeatSync` directly — same code path as the cron.

## Verifying it's fixed

After enabling CRON_SECRET + redeploying (or pushing a commit):

1. Open Vercel logs at the daily 02:00 UTC tick — should see a
   200 OK response to `/api/cron/daily`.
2. The next morning, re-run the health check above. `days` should be
   one higher than yesterday.
3. After ~7 days of clean runs, the new peak-day billing math will
   start producing meaningfully different numbers than the legacy
   high-water-mark fallback.

## Quick command reference

```sh
# Manually trigger today's run from your machine (writes prod DB):
pnpm exec tsx scripts/capture-heartbeats-now.ts

# Verify peak-day billing math for a month:
node scripts/verify-peak-billing.cjs 2026-06

# Tail recent heartbeat-day coverage:
node -e '
  const { Client } = require("pg");
  require("dotenv").config({ path: ".env.local" });
  (async () => {
    const c = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL });
    await c.connect();
    const r = await c.query("select heartbeat_date::date as d, count(*) as rows, count(distinct hardware_id) as devices from hardware_heartbeats group by 1 order by 1 desc limit 14");
    for (const row of r.rows) console.log(new Date(row.d).toISOString().slice(0,10), row.rows, "rows /", row.devices, "devices");
    await c.end();
  })();
'
```
