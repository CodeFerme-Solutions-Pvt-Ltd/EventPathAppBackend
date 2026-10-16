import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { pool } from '../src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const keyPath = path.resolve(__dirname, '../../backend/functions/config/serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
const fbApp = initializeApp({ credential: cert(serviceAccount) }, 'diff-syncer');
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

async function syncUsers() {
  const client = await pool.connect();

  try {
    console.log('===================================================================');
    console.log('🔍 CHECKING FIRESTORE VS POSTGRESQL USERS & USERDETAILS');
    console.log('===================================================================\n');

    // 1. Fetch from Firestore
    const usersSnap = await db.collection('EventPath').doc('main').collection('users').get();
    const detailsSnap = await db.collection('EventPath').doc('main').collection('userDetails').get();

    const userDetailsMap = new Map();
    detailsSnap.forEach((doc) => {
      userDetailsMap.set(doc.id, doc.data());
    });

    // 2. Fetch existing from PostgreSQL
    const pgUsersRes = await client.query(`
      SELECT u.id, u.username, u.email, u.mobile_number, u.role, u.device_token,
             p.preferences, p.location_preferences
      FROM users u
      LEFT JOIN user_profiles p ON u.id = p.user_id;
    `);

    // Index PG users by mobile_number, email, and username
    const pgByMobile = new Map();
    const pgByEmail = new Map();
    const pgByUsername = new Map();

    pgUsersRes.rows.forEach((row) => {
      if (row.mobile_number) pgByMobile.set(row.mobile_number.trim(), row);
      if (row.email) pgByEmail.set(row.email.trim().toLowerCase(), row);
      if (row.username) pgByUsername.set(row.username.trim().toLowerCase(), row);
    });

    console.log(`[Firestore] Found ${usersSnap.size} users, ${detailsSnap.size} userDetails.`);
    console.log(`[PostgreSQL] Found ${pgUsersRes.rows.length} existing users.\n`);

    let newCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    let skippedCount = 0;

    for (const doc of usersSnap.docs) {
      const u = doc.data();
      const docId = doc.id;
      const mobile = String(u.mobileNumber || '').trim();

      // Skip ignored test mobile
      if (mobile.includes(IGNORED_MOBILE_SUBSTRING)) {
        skippedCount++;
        continue;
      }

      const email = (u.email || '').trim().toLowerCase();
      const username = (u.username || '').trim();
      const role = ['user', 'ambassador', 'admin'].includes((u.role || '').toLowerCase())
        ? u.role.toLowerCase()
        : 'user';
      const deviceToken = u.deviceToken || null;
      const createdAt = toTimestamp(u.createdAt);
      const updatedAt = toTimestamp(u.updatedAt || u.updatedOn || u.createdAt);

      const details = userDetailsMap.get(docId) || {};
      const preferences = details.preferences || {};
      const locationPreferences = details.locationPreferences || {};

      // Check if user already exists in PostgreSQL
      const existing = (mobile && pgByMobile.get(mobile)) ||
                       (email && pgByEmail.get(email)) ||
                       (username && pgByUsername.get(username.toLowerCase()));

      if (!existing) {
        // --- NEW USER: INSERT ---
        newCount++;
        const newUserId = crypto.randomUUID();
        const fallbackHex = crypto.randomBytes(4).toString('hex');
        const effectiveUsername = username || `user_${fallbackHex}`;
        const effectiveEmail = email || `${newUserId}@eventpath.app`;
        const passwordHash = u.password || 'migrated_user_hash';

        console.log(`✨ [NEW USER ${newCount}] Inserting: "${effectiveUsername}" (Mobile: ${mobile}, Email: ${effectiveEmail}, Role: ${role})`);

        await client.query('BEGIN');
        try {
          await client.query(`
            INSERT INTO users (
              id, username, email, mobile_number, password_hash, role, device_token, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
          `, [
            newUserId,
            effectiveUsername,
            effectiveEmail,
            mobile,
            passwordHash,
            role,
            deviceToken,
            createdAt,
            updatedAt,
          ]);

          await client.query(`
            INSERT INTO user_profiles (
              user_id, preferences, location_preferences, created_at, updated_at
            ) VALUES ($1, $2::jsonb, $3::jsonb, $4, $5);
          `, [
            newUserId,
            JSON.stringify(preferences),
            JSON.stringify(locationPreferences),
            createdAt,
            updatedAt,
          ]);

          await client.query('COMMIT');
          console.log(`   ✅ Inserted into PostgreSQL with UUID: ${newUserId}`);
        } catch (insertErr) {
          await client.query('ROLLBACK');
          console.error(`   ❌ Failed to insert new user "${effectiveUsername}":`, insertErr.message);
        }
      } else {
        // --- EXISTING USER: CHECK FOR UPDATES ---
        const userId = existing.id;
        let needsUserUpdate = false;
        let needsProfileUpdate = false;

        // Check if role, device_token or password has changed
        if (role !== existing.role || (deviceToken && deviceToken !== existing.device_token)) {
          needsUserUpdate = true;
        }

        // Check if preferences or locationPreferences in userDetails has data
        const currentPrefsStr = JSON.stringify(existing.preferences || {});
        const newPrefsStr = JSON.stringify(preferences || {});
        const currentLocStr = JSON.stringify(existing.location_preferences || {});
        const newLocStr = JSON.stringify(locationPreferences || {});

        if (newPrefsStr !== currentPrefsStr || newLocStr !== currentLocStr || !existing.preferences) {
          needsProfileUpdate = true;
        }

        if (needsUserUpdate || needsProfileUpdate) {
          updatedCount++;
          console.log(`🔄 [UPDATE ${updatedCount}] Updating: "${existing.username}" (${existing.id})`);
          await client.query('BEGIN');
          try {
            if (needsUserUpdate) {
              await client.query(`
                UPDATE users
                SET role = $1,
                    device_token = coalesce($2, device_token),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3;
              `, [role, deviceToken, userId]);
              console.log(`   ↳ Updated user table credentials/role: ${role}`);
            }

            if (needsProfileUpdate) {
              await client.query(`
                INSERT INTO user_profiles (
                  user_id, preferences, location_preferences, created_at, updated_at
                ) VALUES ($1, $2::jsonb, $3::jsonb, $4, $5)
                ON CONFLICT (user_id) DO UPDATE SET
                  preferences = EXCLUDED.preferences,
                  location_preferences = EXCLUDED.location_preferences,
                  updated_at = CURRENT_TIMESTAMP;
              `, [
                userId,
                JSON.stringify(preferences),
                JSON.stringify(locationPreferences),
                createdAt,
                updatedAt,
              ]);
              console.log(`   ↳ Updated user_profiles with fresh preferences & locationPreferences`);
            }

            await client.query('COMMIT');
            console.log(`   ✅ Finished updating "${existing.username}"`);
          } catch (updateErr) {
            await client.query('ROLLBACK');
            console.error(`   ❌ Failed to update "${existing.username}":`, updateErr.message);
          }
        } else {
          unchangedCount++;
        }
      }
    }

    // Update app_stats metric
    const totalUsersRes = await client.query('SELECT count(*) FROM users;');
    const totalProfilesRes = await client.query('SELECT count(*) FROM user_profiles;');
    const finalUserCount = parseInt(totalUsersRes.rows[0].count, 10);
    const finalProfileCount = parseInt(totalProfilesRes.rows[0].count, 10);

    await client.query(`
      INSERT INTO app_stats (metric_name, count, updated_at)
      VALUES ('user_count', $1, CURRENT_TIMESTAMP)
      ON CONFLICT (metric_name) DO UPDATE SET count = $1, updated_at = CURRENT_TIMESTAMP;
    `, [finalUserCount]);

    console.log('\n===================================================================');
    console.log('🎉 SYNC COMPLETE SUMMARY:');
    console.log(`   New users added:      ${newCount}`);
    console.log(`   Existing users updated: ${updatedCount}`);
    console.log(`   Unchanged users:      ${unchangedCount}`);
    console.log(`   Skipped users:        ${skippedCount} (Test mobile)`);
    console.log(`   Total PG users:       ${finalUserCount}`);
    console.log(`   Total PG profiles:    ${finalProfileCount}`);
    console.log('===================================================================');

    process.exit(0);
  } catch (err) {
    console.error('Fatal sync error:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

syncUsers();
