import crypto from 'crypto';
import { query, pool } from '../config/db.js';
import { getOrganizersFromDb } from './appDataService.js';
import { formatPhoneNumber } from './otpService.js';
import { uploadAmbassadorAvatar } from './storageService.js';

/**
 * Registers an ambassador in PostgreSQL and uploads their profile photo directly to the
 * Lightsail Storage Bucket ('ambassadors/' folder).
 */
export async function registerAmbassadorInDb(ambassadorData, pictureFile) {
  const {
    username,
    mobileNumber,
    email,
    password,
    organizationName,
    deviceToken,
    pictureBase64,
  } = ambassadorData;

  // 1. Validation
  if (!username || !mobileNumber || !email || !password || !organizationName) {
    throw new Error('Username, mobile number, email, password, and organization name are required.');
  }

  const formattedMobileNumber = formatPhoneNumber(mobileNumber);

  // 2. Validate organization against app_organizers in database
  const validOrganizers = await getOrganizersFromDb();
  const trimmedOrg = organizationName.trim();
  const isValidOrg = validOrganizers.some(
    (org) => org.toLowerCase() === trimmedOrg.toLowerCase()
  );

  if (!isValidOrg) {
    throw new Error('Selected organization is invalid. You must choose an organization from the official Organizers list.');
  }

  // 3. Uniqueness check in users
  const userCheck = await query(
    `SELECT username, email, mobile_number FROM users WHERE username = $1 OR email = $2 OR mobile_number = $3;`,
    [username.trim(), email.trim(), formattedMobileNumber]
  );

  if (userCheck.rows.length > 0) {
    const existing = userCheck.rows[0];
    if (existing.username === username.trim()) throw new Error('This username is already taken.');
    if (existing.mobile_number === formattedMobileNumber) throw new Error('An account with this mobile number is already registered.');
    if (existing.email === email.trim()) throw new Error('An account with this email address is already registered.');
  }

  const userId = crypto.randomUUID();

  // 4. Upload photo to Amazon Lightsail Bucket ('ambassadors/' folder)
  const fileToUpload = pictureFile || pictureBase64;
  if (!fileToUpload) {
    throw new Error('A profile picture is required for ambassador registration.');
  }

  const { url: pictureUrl, key: picturePath } = await uploadAmbassadorAvatar(
    userId,
    fileToUpload,
    pictureFile?.mimetype || 'image/jpeg'
  );

  // 5. Parse preferences
  let preferences = ambassadorData.preferences;
  if (typeof preferences === 'string') {
    try { preferences = JSON.parse(preferences); } catch (_) { preferences = {}; }
  }
  let locationPreferences = ambassadorData.locationPreferences;
  if (typeof locationPreferences === 'string') {
    try { locationPreferences = JSON.parse(locationPreferences); } catch (_) { locationPreferences = {}; }
  }

  // 6. Hash password
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert into users
    await client.query(`
      INSERT INTO users (id, username, email, mobile_number, password_hash, role, device_token, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'ambassador', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `, [userId, username.trim(), email.trim(), formattedMobileNumber, passwordHash, deviceToken || null]);

    // Insert into ambassador_profiles (valid_till = 1 year from registration, certificate_issued = false)
    const ambInsertRes = await client.query(`
      INSERT INTO ambassador_profiles (user_id, organization_name, picture_url, picture_path, status, is_approved, valid_till, certificate_issued, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 'pending', false, CURRENT_TIMESTAMP + INTERVAL '1 year', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING valid_till, certificate_issued;
    `, [userId, trimmedOrg, pictureUrl, picturePath]);

    const validTill = ambInsertRes.rows[0]?.valid_till;
    const certificateIssued = ambInsertRes.rows[0]?.certificate_issued ?? false;

    // Insert into user_profiles
    await client.query(`
      INSERT INTO user_profiles (user_id, preferences, location_preferences, created_at, updated_at)
      VALUES ($1, $2::jsonb, $3::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `, [userId, JSON.stringify(preferences || {}), JSON.stringify(locationPreferences || {})]);

    await client.query('COMMIT');

    return {
      docId: userId,
      userId,
      username: username.trim(),
      email: email.trim(),
      mobileNumber: formattedMobileNumber,
      role: 'ambassador',
      organizationName: trimmedOrg,
      pictureUrl,
      status: 'pending',
      isApproved: false,
      validTill,
      certificateIssued,
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
  registerAmbassadorInDb,
};
