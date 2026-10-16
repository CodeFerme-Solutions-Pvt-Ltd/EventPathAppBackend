import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { pool, query } from '../src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const keyPath = path.resolve(__dirname, '../../backend/functions/config/serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('❌ serviceAccountKey.json not found at:', keyPath);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
const fbApp = initializeApp({ credential: cert(serviceAccount) }, 'user-migrator');
const db = getFirestore(fbApp);

const IGNORED_MOBILE_SUBSTRING = '6374912165';

function toTimestamp(val) {
  if (!val) return new Date();
  if (val.toDate && typeof val.toDate === 'function') {
    return val.toDate();
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

export async function migrateAllUsers() {
  console.log('===================================================================');
  console.log('🚀 EVENTPATH USERS & USERDETAILS MIGRATION: FIRESTORE -> POSTGRESQL');
  console.log('===================================================================\n');

  console.log('[Firestore] Fetching users from EventPath/main/users...');
  const usersSnap = await db.collection('EventPath').doc('main').collection('users').get();
  console.log(`[Firestore] Found ${usersSnap.size} user documents.`);

  console.log('[Firestore] Fetching userDetails from EventPath/main/userDetails...');
  const detailsSnap = await db.collection('EventPath').doc('main').collection('userDetails').get();
  console.log(`[Firestore] Found ${detailsSnap.size} userDetails documents.\n`);

  // Map userDetails by docId for O(1) lookup
  const userDetailsMap = new Map();
  detailsSnap.forEach((doc) => {
    userDetailsMap.set(doc.id, doc.data());
  });

  let successCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < usersSnap.docs.length; i++) {
    const doc = usersSnap.docs[i];
    const u = doc.data();
    const docId = doc.id;
    const mobile = String(u.mobileNumber || '').trim();

    // 1. Filter out ignored mobile number 6374912165
    if (mobile.includes(IGNORED_MOBILE_SUBSTRING)) {
      console.log(`⏭️  [${i + 1}/${usersSnap.size}] Skipping ignored user: "${u.username}" (Mobile: ${mobile}, DocID: ${docId})`);
      skippedCount++;
      continue;
    }

    // 2. Generate a fresh UUID as instructed
    const newUserId = crypto.randomUUID();
    const fallbackHex = crypto.randomBytes(4).toString('hex');
    const username = (u.username || `user_${fallbackHex}`).trim();
    const email = (u.email || `${newUserId}@eventpath.app`).trim().toLowerCase();
    const passwordHash = u.password || 'migrated_user_hash';
    const role = ['user', 'ambassador', 'admin'].includes((u.role || '').toLowerCase())
      ? u.role.toLowerCase()
      : 'user';
    const deviceToken = u.deviceToken || null;
    const createdAt = toTimestamp(u.createdAt);
    const updatedAt = toTimestamp(u.updatedAt || u.updatedOn || u.createdAt);

    // 3. Extract profile details
    const details = userDetailsMap.get(docId) || {};
    const preferences = details.preferences || {};
    const locationPreferences = details.locationPreferences || {};

    console.log(`[${i + 1}/${usersSnap.size}] Migrating: "${username}"\n    ↳ Firestore DocID: ${docId} -> New PostgreSQL UUID: ${newUserId}`);

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 4. Insert into users table
      await client.query(
        `INSERT INTO users (
          id, username, email, mobile_number, password_hash, role, device_token, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE
        SET username = EXCLUDED.username,
            email = EXCLUDED.email,
            mobile_number = EXCLUDED.mobile_number,
            password_hash = EXCLUDED.password_hash,
            role = EXCLUDED.role,
            device_token = EXCLUDED.device_token,
            updated_at = EXCLUDED.updated_at;`,
        [
          newUserId,
          username,
          email,
          mobile,
          passwordHash,
          role,
          deviceToken,
          createdAt,
          updatedAt,
        ]
      );

      // 5. Insert into user_profiles table
      await client.query(
        `INSERT INTO user_profiles (
          user_id, preferences, location_preferences, created_at, updated_at
        )
        VALUES ($1, $2::jsonb, $3::jsonb, $4, $5)
        ON CONFLICT (user_id) DO UPDATE
        SET preferences = EXCLUDED.preferences,
            location_preferences = EXCLUDED.location_preferences,
            updated_at = EXCLUDED.updated_at;`,
        [
          newUserId,
          JSON.stringify(preferences),
          JSON.stringify(locationPreferences),
          createdAt,
          updatedAt,
        ]
      );

      await client.query('COMMIT');
      console.log(`  ✅ Successfully migrated user: "${username}"\n`);
      successCount++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  ❌ Failed to migrate user "${username}":`, err.message, '\n');
      failedCount++;
    } finally {
      client.release();
    }
  }

  // Update app_stats metric for total users
  try {
    const countRes = await query('SELECT count(*) FROM users;');
    const totalUsers = parseInt(countRes.rows[0].count, 10);
    await query(
      `INSERT INTO app_stats (metric_name, count, updated_at)
       VALUES ('total_users_registered', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (metric_name) DO UPDATE SET count = $1, updated_at = CURRENT_TIMESTAMP;`,
      [totalUsers]
    );
    console.log(`📊 Updated app_stats (total_users_registered: ${totalUsers})`);
  } catch (statErr) {
    console.warn('Could not update total_users_registered stat:', statErr.message);
  }

  console.log('===================================================================');
  console.log(`🎉 USERS MIGRATION FINISHED!`);
  console.log(`   Migrated: ${successCount}`);
  console.log(`   Skipped:  ${skippedCount} (Mobile: ${IGNORED_MOBILE_SUBSTRING})`);
  console.log(`   Failed:   ${failedCount}`);
  console.log('===================================================================');
}

// Execute directly if run via CLI
if (process.argv[1] && process.argv[1].endsWith('migrateUsers.js')) {
  migrateAllUsers().then(async () => {
    await pool.end();
  }).catch(async (e) => {
    console.error('Fatal user migration error:', e);
    await pool.end();
    process.exit(1);
  });
}
