import crypto from 'crypto';
import { query, pool } from '../config/db.js';

/**
 * Registers a standard user in PostgreSQL.
 * Creates an entry in `users` and linked profile in `user_profiles`.
 * Increments `app_stats.user_count`.
 */
export async function registerUserInDb(userData) {
  const {
    username,
    mobileNumber,
    email,
    password,
    deviceToken,
    preferences,
    locationPreferences,
  } = userData;

  const role = 'user';

  // 1. Uniqueness validation
  const existingCheck = await query(
    `SELECT username, email, mobile_number FROM users WHERE username = $1 OR email = $2 OR mobile_number = $3;`,
    [username, email, mobileNumber]
  );

  if (existingCheck.rows.length > 0) {
    const existing = existingCheck.rows[0];
    if (existing.username === username) throw new Error('This username is already taken.');
    if (existing.mobile_number === mobileNumber) throw new Error('A user with this mobile number is already registered.');
    if (existing.email === email) throw new Error('A user with this email address is already registered.');
  }

  // 2. Hash password (SHA-256 for backward compatibility with existing credentials)
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  const userId = crypto.randomUUID();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 3. Insert into users
    const insertUserSql = `
      INSERT INTO users (id, username, email, mobile_number, password_hash, role, device_token, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `;
    await client.query(insertUserSql, [
      userId,
      username,
      email,
      mobileNumber,
      passwordHash,
      role,
      deviceToken || null,
    ]);

    // 4. Insert into user_profiles
    const insertProfileSql = `
      INSERT INTO user_profiles (user_id, preferences, location_preferences, created_at, updated_at)
      VALUES ($1, $2::jsonb, $3::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `;
    await client.query(insertProfileSql, [
      userId,
      JSON.stringify(preferences || {}),
      JSON.stringify(locationPreferences || {}),
    ]);

    // 5. Increment user_count in app_stats
    await client.query(`
      UPDATE app_stats SET count = count + 1, updated_at = CURRENT_TIMESTAMP WHERE metric_name = 'user_count';
    `);

    await client.query('COMMIT');

    return {
      docId: userId,
      userId,
      role,
      username,
      preferences: preferences || {},
      locationPreferences: locationPreferences || {},
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default {
  registerUserInDb,
};
