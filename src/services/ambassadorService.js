import crypto from 'crypto';
import { query, pool } from '../config/db.js';
import { formatPhoneNumber } from './otpService.js';
import { uploadAmbassadorAvatar, getPresignedViewUrl } from './storageService.js';

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
    department,
    deviceToken,
    pictureBase64,
  } = ambassadorData;

  // 1. Validation
  const trimmedOrg = organizationName && typeof organizationName === 'string' ? organizationName.trim() : '';
  if (!username || !mobileNumber || !email || !password || !trimmedOrg) {
    throw new Error('Username, mobile number, email, password, and organization name are required.');
  }

  const formattedMobileNumber = formatPhoneNumber(mobileNumber);
  const trimmedDept = department && typeof department === 'string' ? department.trim() : null;

  // 2. Check if organization already has an active ambassador
  const hasAmbassador = await checkOrganizationHasAmbassador(trimmedOrg);
  if (hasAmbassador) {
    throw new Error("Your organization already has an ambassador. You can't create an ambassador profile.");
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
      INSERT INTO ambassador_profiles (user_id, organization_name, department, picture_url, picture_path, status, is_approved, valid_till, certificate_issued, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', false, CURRENT_TIMESTAMP + INTERVAL '1 year', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING valid_till, certificate_issued;
    `, [userId, trimmedOrg, trimmedDept, pictureUrl, picturePath]);

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
      department: trimmedDept || '',
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

/**
 * Fetches all active/approved ambassador profiles from PostgreSQL.
 */
export async function getAllAmbassadors() {
  const sql = `
    SELECT 
      u.id AS "userId",
      u.id AS "docId",
      u.username,
      u.role,
      amb.organization_name AS "organizationName",
      amb.department AS "department",
      amb.picture_url AS "pictureUrl",
      amb.status AS "status",
      amb.is_approved AS "isApproved",
      amb.created_at AS "createdAt"
    FROM ambassador_profiles amb
    JOIN users u ON amb.user_id = u.id
    WHERE amb.status = 'approved' AND amb.is_approved = true
    ORDER BY amb.created_at DESC;
  `;
  const res = await query(sql);
  const ambassadors = await Promise.all(
    res.rows.map(async (row) => {
      let pictureUrl = row.pictureUrl;
      if (pictureUrl) {
        pictureUrl = await getPresignedViewUrl(pictureUrl);
      }
      return {
        ...row,
        pictureUrl,
      };
    })
  );
  return ambassadors;
}

/**
 * Creates a new request from an existing standard user to become an Ambassador.
 * Stored in the dedicated `ambassador_requests` table.
 */
export async function createAmbassadorRequest({ userId, organizationName, department, pictureBase64 }, pictureFile) {
  if (!userId) {
    throw new Error('User ID is required.');
  }

  // 1. Verify user exists and check role
  const userCheck = await query('SELECT id, username, email, role FROM users WHERE id = $1;', [userId]);
  if (userCheck.rows.length === 0) {
    throw new Error('User not found.');
  }
  const user = userCheck.rows[0];
  if (user.role === 'ambassador') {
    throw new Error('You are already registered as an Ambassador.');
  }

  // 2. Validate organization name
  const trimmedOrg = organizationName && typeof organizationName === 'string' ? organizationName.trim() : '';
  if (!trimmedOrg) {
    throw new Error('Organization / Campus name is required.');
  }
  const trimmedDept = department && typeof department === 'string' ? department.trim() : null;

  // 3. Check if organization already has an active ambassador
  const hasAmbassador = await checkOrganizationHasAmbassador(trimmedOrg);
  if (hasAmbassador) {
    throw new Error('Your college already has an ambassador.');
  }

  // 4. Check for existing pending request
  const existingPending = await query(
    `SELECT id, status, created_at FROM ambassador_requests WHERE user_id = $1 AND status = 'pending';`,
    [userId]
  );
  if (existingPending.rows.length > 0) {
    throw new Error('You already have an ambassador request pending review.');
  }

  // 4. Upload photo to Amazon Lightsail Bucket
  const fileToUpload = pictureFile || pictureBase64;
  if (!fileToUpload) {
    throw new Error('A photo is required for your ambassador request.');
  }

  const { url: pictureUrl, key: picturePath } = await uploadAmbassadorAvatar(
    userId,
    fileToUpload,
    pictureFile?.mimetype || 'image/jpeg'
  );

  // 5. Insert into ambassador_requests table
  const requestId = crypto.randomUUID();
  await query(
    `INSERT INTO ambassador_requests (id, user_id, organization_name, department, picture_url, picture_path, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
    [requestId, userId, trimmedOrg, trimmedDept, pictureUrl, picturePath]
  );

  return {
    id: requestId,
    userId,
    organizationName: trimmedOrg,
    department: trimmedDept || '',
    pictureUrl,
    status: 'pending',
  };
}

/**
 * Gets the latest ambassador request status for a user.
 */
export async function getAmbassadorRequestStatus(userId) {
  if (!userId) return null;

  const res = await query(
    `SELECT id, user_id AS "userId", organization_name AS "organizationName", department, picture_url AS "pictureUrl", status, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM ambassador_requests
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1;`,
    [userId]
  );

  if (res.rows.length === 0) {
    return null;
  }

  const row = res.rows[0];
  let pictureUrl = row.pictureUrl;
  if (pictureUrl) {
    pictureUrl = await getPresignedViewUrl(pictureUrl);
  }

  return {
    ...row,
    pictureUrl,
  };
}

/**
 * Checks if an approved ambassador already exists for a given organization/campus.
 */
export async function checkOrganizationHasAmbassador(organizationName) {
  if (!organizationName || typeof organizationName !== 'string') return false;
  const trimmed = organizationName.trim();
  if (!trimmed) return false;

  const res = await query(
    `SELECT user_id, organization_name 
     FROM ambassador_profiles 
     WHERE LOWER(TRIM(organization_name)) = LOWER(TRIM($1)) 
       AND is_approved = true 
       AND status = 'approved'
     LIMIT 1;`,
    [trimmed]
  );

  return res.rows.length > 0;
}

export default {
  registerAmbassadorInDb,
  getAllAmbassadors,
  createAmbassadorRequest,
  getAmbassadorRequestStatus,
  checkOrganizationHasAmbassador,
};
