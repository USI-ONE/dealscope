/**
 * Verify the new peak-day billing math.
 *
 * For each client × tier, show:
 *   - distinct devices that touched in the month (old behavior)
 *   - per-day distinct counts in the month
 *   - peak day + peak count (new behavior)
 *   - delta
 *
 *   node scripts/verify-peak-billing.cjs 2026-05
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
const { Client } = require("pg");

async function main() {
  const month = process.argv[2] ?? "2026-05";
  const [y, m] = month.split("-").map(Number);
  const monthStart = `${month}-01`;
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  console.log(`Comparing OLD (distinct across month) vs NEW (peak daily distinct)`);
  console.log(`Month: ${month} (${monthStart} → ${monthEnd})\n`);

  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  const c = new Client({ connectionString: url });
  await c.connect();

  // 1) OLD behavior: distinct hardware ids per (client × tier) across whole month.
  const oldRows = await c.query(
    `select cl.name as client, hh.billing_tier,
            count(distinct hh.hardware_id)::int as old_count
       from hardware_heartbeats hh
       join hardware h on h.id = hh.hardware_id
       join clients cl on cl.id = hh.client_id
      where hh.heartbeat_date between $1 and $2
        and (h.not_on_contract is null or h.not_on_contract <> '1')
        and hh.billing_tier = 'full_compute_node'
      group by cl.name, hh.billing_tier
      order by cl.name`,
    [monthStart, monthEnd],
  );

  // 2) NEW behavior: peak same-day distinct hardware count.
  const newRows = await c.query(
    `select sub.client, max(sub.daily_distinct)::int as peak,
            (array_agg(sub.heartbeat_date order by sub.daily_distinct desc))[1] as peak_date
       from (
         select cl.name as client, hh.heartbeat_date,
                count(distinct hh.hardware_id)::int as daily_distinct
           from hardware_heartbeats hh
           join hardware h on h.id = hh.hardware_id
           join clients cl on cl.id = hh.client_id
          where hh.heartbeat_date between $1 and $2
            and (h.not_on_contract is null or h.not_on_contract <> '1')
            and hh.billing_tier = 'full_compute_node'
          group by cl.name, hh.heartbeat_date
       ) sub
      group by sub.client
      order by sub.client`,
    [monthStart, monthEnd],
  );
  const peakByClient = new Map(
    newRows.rows.map((r) => [r.client, { peak: r.peak, date: r.peak_date }]),
  );

  console.log(
    `Client                                   OLD    NEW (peak)  Peak date   Δ    Effect`,
  );
  console.log("─".repeat(100));
  let totalOld = 0,
    totalNew = 0;
  for (const o of oldRows.rows) {
    const np = peakByClient.get(o.client);
    const oldN = o.old_count;
    const newN = np?.peak ?? 0;
    totalOld += oldN;
    totalNew += newN;
    const delta = newN - oldN;
    const effect =
      delta > 0
        ? `+${delta} (peak HIGHER than distinct-over-month — impossible?)`
        : delta < 0
          ? `${delta} (avoided over-billing — devices churned in/out)`
          : "no change";
    const peakDate = np?.date ? new Date(np.date).toISOString().slice(0, 10) : "—";
    console.log(
      `${o.client.padEnd(40)} ${String(oldN).padStart(4)} ${String(newN).padStart(12)} ${peakDate.padEnd(11)} ${String(delta).padStart(4)}  ${effect}`,
    );
  }
  console.log("─".repeat(100));
  console.log(
    `TOTALS                                   ${String(totalOld).padStart(4)} ${String(totalNew).padStart(12)}              ${totalNew - totalOld}`,
  );

  // 3) Drill into AHP's daily counts so we can see the curve.
  const ahp = await c.query(
    `select hh.heartbeat_date, count(distinct hh.hardware_id)::int as n
       from hardware_heartbeats hh
       join hardware h on h.id = hh.hardware_id
       join clients cl on cl.id = hh.client_id
      where cl.name = 'AHP'
        and hh.heartbeat_date between $1 and $2
        and (h.not_on_contract is null or h.not_on_contract <> '1')
        and hh.billing_tier = 'full_compute_node'
      group by hh.heartbeat_date
      order by hh.heartbeat_date`,
    [monthStart, monthEnd],
  );
  if (ahp.rows.length > 0) {
    console.log(`\nAHP daily compute-node counts for ${month}:`);
    let max = 0,
      maxDate = null;
    for (const r of ahp.rows) {
      const n = r.n;
      const bar = "█".repeat(Math.min(60, n));
      console.log(
        `  ${new Date(r.heartbeat_date).toISOString().slice(0, 10)}  ${String(n).padStart(4)}  ${bar}`,
      );
      if (n > max) {
        max = n;
        maxDate = r.heartbeat_date;
      }
    }
    console.log(`  Peak: ${max} on ${new Date(maxDate).toISOString().slice(0, 10)}`);
  }

  await c.end();
}

main().catch((e) => {
  console.error("FATAL:", e.message ?? e);
  process.exit(1);
});
