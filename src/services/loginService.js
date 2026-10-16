import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { config } from '../config/envConfig.js';
import { formatPhoneNumber } from './otpService.js';
import { getPresignedViewUrl } from './storageService.js';

/**
 * Authenticates user or ambassador by email or mobile number.
 * Updates FCM device token if provided.
 * Generates JWT session token.
 */
export async function authenticateUser(identifier, password, deviceToken) {
  if (!identifier || !password) {
    const error = new Error('Mobile number/email and password are required.');
    error.status = 400;
    throw error;
  }

  const isEmail = String(identifier).includes('@');
  const formattedIdentifier = String(identifier).trim();
  const searchParam = isEmail ? formattedIdentifier : formatPhoneNumber(formattedIdentifier);

  const sql = isEmail
    ? `SELECT * FROM users WHERE email = $1;`
    : `SELECT * FROM users WHERE mobile_number = $1;`;

  const userRes = await query(sql, [searchParam]);

  if (userRes.rows.length === 0) {
    const error = new Error('No user found.');
    error.status = 401;
    throw error;
  }

  const user = userRes.rows[0];

  // Verify SHA-256 hashed password
  const inputHash = crypto.createHash('sha256').update(password).digest('hex');
  if (user.password_hash !== inputHash) {
    const error = new Error('Invalid password.');
    error.status = 401;
    throw error;
  }

  // Update device token if provided
  let currentDeviceToken = user.device_token || '';
  if (deviceToken && typeof deviceToken === 'string' && deviceToken.trim().length > 0) {
    const trimmedToken = deviceToken.trim();
    await query(
      `UPDATE users SET device_token = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2;`,
      [trimmedToken, user.id]
    );
    currentDeviceToken = trimmedToken;
  }

  // Fetch preferences
  const profileRes = await query(`SELECT preferences, location_preferences FROM user_profiles WHERE user_id = $1;`, [user.id]);
  const profile = profileRes.rows[0] || { preferences: {}, location_preferences: {} };

  // If ambassador, verify approval status
  if (user.role === 'ambassador') {
    const ambRes = await query(`SELECT organization_name, department, picture_url, status, is_approved FROM ambassador_profiles WHERE user_id = $1;`, [user.id]);
    const ambProfile = ambRes.rows[0] || {};

    if (ambProfile.status === 'pending' || ambProfile.is_approved === false) {
      const error = new Error('Your ambassador registration is pending approval. Once approved, you will receive a notification and can log in normally.');
      error.status = 403;
      throw error;
    }

    const token = jwt.sign(
      {
        userId: user.id,
        docId: user.id,
        mobileNumber: user.mobile_number,
        email: user.email,
        role: 'ambassador',
      },
      config.jwtSecret,
      { expiresIn: '30d' }
    );

    return {
      token,
      docId: user.id,
      userId: user.id,
      username: user.username,
      mobileNumber: user.mobile_number,
      email: user.email,
      role: 'ambassador',
      organizationName: ambProfile.organization_name || '',
      department: ambProfile.department || '',
      pictureUrl: ambProfile.picture_url ? await getPresignedViewUrl(ambProfile.picture_url) : '',
      status: ambProfile.status || 'approved',
      isApproved: ambProfile.is_approved !== false,
      deviceToken: currentDeviceToken,
      preferences: profile.preferences || {},
      locationPreferences: profile.location_preferences || {},
    };
  }

  // Standard user JWT
  const token = jwt.sign(
    {
      userId: user.id,
      docId: user.id,
      mobileNumber: user.mobile_number,
      email: user.email,
      role: user.role || 'user',
    },
    config.jwtSecret,
    { expiresIn: '30d' }
  );

  return {
    token,
    docId: user.id,
    userId: user.id,
    username: user.username,
    mobileNumber: user.mobile_number,
    email: user.email,
    role: user.role || 'user',
    deviceToken: currentDeviceToken,
    preferences: profile.preferences || {},
    locationPreferences: profile.location_preferences || {},
  };
}

export default {
  authenticateUser,
};
