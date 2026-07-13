#!/usr/bin/env node
/**
 * weekly-usage-report.cjs — aggregate usage pulse for a WTWT instance,
 * pushed via ntfy.sh. Counts only — no titles, no names — so it answers
 * "is it being used?" without spying on what anyone watches.
 *
 * Runs ON THE PI via cron (Sundays 6pm), e.g. for the Montreal instance:
 *   0 18 * * 0 cd ~/movie-night-montreal && WTWT_DATA_DIR=~/movie-night-montreal-data WTWT_REPORT_NAME="Montreal Movie Night" /usr/bin/node scripts/weekly-usage-report.cjs >> ~/movie-night-montreal-data/report.log 2>&1
 *
 * Env: WTWT_DATA_DIR (default ~/movie-night-data), WTWT_REPORT_NAME
 * (default "Movie Night"), NTFY_TOPIC (default anguspi-casey-alerts).
 */
const os = require('os');
const path = require('path');

let Database;
try {
  Database = require('better-sqlite3');
} catch {
  Database = require(path.join(__dirname, '..', 'server', 'node_modules', 'better-sqlite3'));
}

const dataDir = process.env.WTWT_DATA_DIR
  ? process.env.WTWT_DATA_DIR.replace(/^~/, os.homedir())
  : path.join(os.homedir(), 'movie-night-data');
const NAME = process.env.WTWT_REPORT_NAME || 'Movie Night';
const TOPIC = process.env.NTFY_TOPIC || 'anguspi-casey-alerts';

const db = new Database(path.join(dataDir, 'movies.db'), { readonly: true });
const one = (sql) => Object.values(db.prepare(sql).get())[0];

// All timestamps are UTC (SQLite CURRENT_TIMESTAMP); "-7 days" matches that.
const week = {
  viewings: one(`SELECT COUNT(*) FROM viewings WHERE created_at >= datetime('now','-7 days')`),
  // Seeded titles (those a seed list item points at) don't count as activity.
  titles: one(`SELECT COUNT(*) FROM titles WHERE created_at >= datetime('now','-7 days')
               AND id NOT IN (SELECT title_id FROM list_items WHERE source = 'seed')`),
  listChanges: one(
    `SELECT COUNT(*) FROM list_items WHERE added_at >= datetime('now','-7 days') AND source IS NOT 'seed'`
  ),
  stars: one(`SELECT COUNT(*) FROM shortlists WHERE created_at >= datetime('now','-7 days')`),
};
const totals = {
  viewings: one(`SELECT COUNT(*) FROM viewings`),
  titles: one(`SELECT COUNT(*) FROM titles`),
};
// Most recent write of any kind (seed rows excluded so a fresh instance reads
// as "no activity yet" rather than looking active from day one).
const lastActivity = one(`
  SELECT MAX(ts) FROM (
    SELECT MAX(created_at) ts FROM viewings
    UNION ALL SELECT MAX(added_at) FROM list_items WHERE source IS NOT 'seed'
    UNION ALL SELECT MAX(created_at) FROM shortlists
  )`);
db.close();

const active = week.viewings + week.titles + week.listChanges + week.stars > 0;
const agoDays = lastActivity
  ? Math.floor((Date.now() - Date.parse(lastActivity + 'Z')) / 86400000)
  : null;
const agoText =
  lastActivity === null
    ? 'no activity yet'
    : agoDays === 0
      ? 'last activity today'
      : `last activity ${agoDays} day${agoDays === 1 ? '' : 's'} ago`;

const lines = active
  ? [
      `${week.viewings} viewing${week.viewings === 1 ? '' : 's'} logged (${totals.viewings} total)`,
      `${week.titles} title${week.titles === 1 ? '' : 's'} added, ${week.listChanges} list change${week.listChanges === 1 ? '' : 's'}, ${week.stars} star${week.stars === 1 ? '' : 's'}`,
      agoText,
    ]
  : [`Quiet week — no activity (${agoText})`];

const message = lines.join('\n');

// Header values must stay ASCII (Node fetch rejects raw UTF-8 there);
// ntfy renders the tag as an emoji next to the title instead.
fetch(`https://ntfy.sh/${TOPIC}`, {
  method: 'POST',
  headers: {
    Title: `${NAME} - weekly usage`,
    Priority: 'low',
    Tags: active ? 'bar_chart' : 'zzz',
  },
  body: message,
})
  .then((res) => {
    if (!res.ok) throw new Error(`ntfy HTTP ${res.status}`);
    console.log(`[${new Date().toISOString()}] report sent: ${message.replace(/\n/g, ' | ')}`);
  })
  .catch((err) => {
    console.error(`[${new Date().toISOString()}] REPORT FAILED: ${err.message}`);
    process.exit(1);
  });
