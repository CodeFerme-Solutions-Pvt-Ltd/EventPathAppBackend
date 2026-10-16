import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, query } from '../src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIREBASE_APP_DATA_URL = 'https://eventpathappbackend-j7sckmz5ka-el.a.run.app/api/app-data';

async function fetchSourceData() {
  console.log(`[AppData Migration] Fetching live data from Firebase backend (${FIREBASE_APP_DATA_URL})...`);
  try {
    const res = await fetch(FIREBASE_APP_DATA_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const json = await res.json();
    if (json.appData) {
      console.log('✅ [AppData Migration] Successfully fetched live AppData from Firebase.');
      return json.appData;
    }
  } catch (err) {
    console.warn('⚠️ [AppData Migration] Network fetch from Firebase failed:', err.message);
  }

  // Fallback to local asset seed
  const fallbackPath = path.resolve(__dirname, '../../eventpath/assets/app_data.json');
  console.log(`[AppData Migration] Loading local fallback seed from ${fallbackPath}...`);
  const raw = fs.readFileSync(fallbackPath, 'utf8');
  return JSON.parse(raw);
}

export async function migrateAppData() {
  const source = await fetchSourceData();

  // Normalize key names (Firebase sometimes uses capitalized or lowercase keys)
  const eventPrefsRaw = source.EventPreferences || source.eventPreferences || {};
  const locPrefsRaw = source.LocationPreferences || source.locationPreferences || {};
  const organizersRaw = source.Organizers || source.organizers || {};

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Migrate Event Preferences
    console.log('\n[AppData Migration] Migrating Event Preferences...');
    const canonicalOrder = [
      'eventTypes',
      'categories',
      'Technical Events',
      'Non Technical Events',
      'Sports',
      'skills',
    ];

    const allPrefKeys = Array.from(
      new Set([...canonicalOrder, ...Object.keys(eventPrefsRaw)])
    );

    let prefOrderIdx = 0;
    for (const rawKey of allPrefKeys) {
      // Find matching key case-insensitively
      const actualKey = Object.keys(eventPrefsRaw).find(
        (k) => k.toLowerCase() === rawKey.toLowerCase()
      ) || rawKey;

      const rawValues = eventPrefsRaw[actualKey] || [];
      const valuesArray = Array.isArray(rawValues)
        ? rawValues
        : typeof rawValues === 'object'
        ? Object.keys(rawValues)
        : [];

      if (valuesArray.length === 0) continue;

      const canonicalKey = rawKey === 'skills' || rawKey.toLowerCase() === 'skills'
        ? 'skills'
        : actualKey;

      const displayTitle =
        canonicalKey === 'eventTypes'
          ? 'Event Types'
          : canonicalKey === 'categories'
          ? 'Categories'
          : canonicalKey === 'skills'
          ? 'Skills'
          : canonicalKey;

      await client.query(
        `INSERT INTO app_event_preferences (preference_key, display_title, values, display_order, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, CURRENT_TIMESTAMP)
         ON CONFLICT (preference_key) DO UPDATE
         SET display_title = EXCLUDED.display_title,
             values = EXCLUDED.values,
             display_order = EXCLUDED.display_order,
             updated_at = CURRENT_TIMESTAMP;`,
        [canonicalKey, displayTitle, JSON.stringify(valuesArray), prefOrderIdx++]
      );

      console.log(`  ✓ Inserted ${canonicalKey} (${valuesArray.length} items)`);
    }

    // 2. Migrate Location Preferences (States -> Districts)
    console.log('\n[AppData Migration] Migrating Location Preferences...');
    let stateIdx = 0;
    for (const [stateName, districts] of Object.entries(locPrefsRaw)) {
      const districtsArray = Array.isArray(districts) ? districts : [];

      await client.query(
        `INSERT INTO app_location_preferences (state_name, districts, display_order, updated_at)
         VALUES ($1, $2::jsonb, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (state_name) DO UPDATE
         SET districts = EXCLUDED.districts,
             display_order = EXCLUDED.display_order,
             updated_at = CURRENT_TIMESTAMP;`,
        [stateName.trim(), JSON.stringify(districtsArray), stateIdx++]
      );
    }
    console.log(`  ✓ Inserted ${stateIdx} States & Districts`);

    // 3. Migrate Organizers
    console.log('\n[AppData Migration] Migrating Organizers...');
    const organizerNames = Array.isArray(organizersRaw)
      ? organizersRaw
      : organizersRaw.names && Array.isArray(organizersRaw.names)
      ? organizersRaw.names
      : typeof organizersRaw === 'object'
      ? Object.keys(organizersRaw)
      : [];

    let orgCount = 0;
    for (const name of organizerNames) {
      if (!name || typeof name !== 'string' || !name.trim()) continue;
      await client.query(
        `INSERT INTO app_organizers (name, is_active, created_at)
         VALUES ($1, true, CURRENT_TIMESTAMP)
         ON CONFLICT (name) DO NOTHING;`,
        [name.trim()]
      );
      orgCount++;
    }
    console.log(`  ✓ Inserted ${orgCount} verified Organizers`);

    await client.query('COMMIT');
    console.log('\n🎉 [AppData Migration] Migration completed successfully with 0 errors!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ [AppData Migration] Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Execute directly if run via CLI
if (process.argv[1] && process.argv[1].endsWith('migrateAppData.js')) {
  migrateAppData().then(async () => {
    await pool.end();
  }).catch(async (e) => {
    await pool.end();
    process.exit(1);
  });
}
