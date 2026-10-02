/**
 * Posts the seed built by build-seed.ts to the database's one-time seed door
 * (supabase/seed/one_time_door.sql). The door checks a random token, loads an empty database
 * in one transaction, and locks itself after one use.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_KEY=<publishable key> \
 *   SEED_TOKEN_FILE=<file holding the token> \
 *   node scripts/db/load-seed.mjs <seed.json>
 *
 * Only the publishable key is used here. Never put a secret key in this repo or its scripts.
 */
import { readFileSync } from 'node:fs';

const seedPath = process.argv[2];
const { SUPABASE_URL, SUPABASE_KEY, SEED_TOKEN_FILE } = process.env;
if (!seedPath || !SUPABASE_URL || !SUPABASE_KEY || !SEED_TOKEN_FILE) {
  console.error(
    'usage: SUPABASE_URL=… SUPABASE_KEY=… SEED_TOKEN_FILE=… node scripts/db/load-seed.mjs <seed.json>',
  );
  process.exit(1);
}

const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/seed_load`, {
  method: 'POST',
  headers: {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    p_token: readFileSync(SEED_TOKEN_FILE, 'utf8').trim(),
    p_data: JSON.parse(readFileSync(seedPath, 'utf8')),
  }),
});
console.log(response.status, await response.text());
if (!response.ok) process.exit(1);
