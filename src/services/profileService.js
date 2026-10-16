import { query } from '../config/db.js';
import { getPresignedViewUrl } from './storageService.js';

/**
 * Fetches user profile data from users, user_profiles, and ambassador_profiles tables.
 * 
 * @param {string} userId - User's unique ID
 * @returns {Promise<Object>} Consolidated user profile
 */
export async function getUserProfile(userId) {
  if (!userId) {
    const error = new Error('User ID is required to retrieve profile details.');
    error.status = 400;
    throw error;
  }

  const sql = `
    SELECT 
      u.id AS "docId",
      u.id AS "userId",
      u.username,
      u.email,
      u.mobile_number AS "mobileNumber",
      u.role,
      u.device_token AS "deviceToken",
      COALESCE(p.preferences, '{}'::jsonb) AS preferences,
      COALESCE(p.location_preferences, '{}'::jsonb) AS "locationPreferences",
      amb.organization_name AS "organizationName",
      amb.picture_url AS "pictureUrl",
      amb.status AS "ambassadorStatus",
      COALESCE(amb.status, 'approved') AS "status",
      amb.is_approved AS "isApproved",
      amb.valid_till AS "validTill",
      COALESCE(amb.certificate_issued, false) AS "certificateIssued",
      u.created_at AS "createdAt",
      u.updated_at AS "updatedAt"
    FROM users u
    LEFT JOIN user_profiles p ON u.id = p.user_id
    LEFT JOIN ambassador_profiles amb ON u.id = amb.user_id
    WHERE u.id = $1;
  `;

  const res = await query(sql, [userId]);

  if (res.rows.length === 0) {
    const error = new Error('User profile details not found.');
    error.status = 404;
    throw error;
  }

  const profile = res.rows[0];
  if (profile.pictureUrl) {
    profile.pictureUrl = await getPresignedViewUrl(profile.pictureUrl);
  }

  return profile;
}

/**
 * Updates user preferences in user_profiles table.
 * 
 * @param {string} userId - User's unique ID
 * @param {Object} updatePayload - { preferences, locationPreferences }
 */
export async function updateUserPreferences(userId, { preferences, locationPreferences }) {
  if (!userId) {
    const error = new Error('User ID is required to update preferences.');
    error.status = 400;
    throw error;
  }

  // Ensure user_profiles row exists (upsert)
  const upsertSql = `
    INSERT INTO user_profiles (user_id, preferences, location_preferences, updated_at)
    VALUES ($1, COALESCE($2::jsonb, '{}'::jsonb), COALESCE($3::jsonb, '{}'::jsonb), CURRENT_TIMESTAMP)
    ON CONFLICT (user_id) DO UPDATE
    SET preferences = CASE WHEN $2::jsonb IS NOT NULL THEN $2::jsonb ELSE user_profiles.preferences END,
        location_preferences = CASE WHEN $3::jsonb IS NOT NULL THEN $3::jsonb ELSE user_profiles.location_preferences END,
        updated_at = CURRENT_TIMESTAMP
    RETURNING preferences, location_preferences;
  `;

  await query(upsertSql, [
    userId,
    preferences ? JSON.stringify(preferences) : null,
    locationPreferences ? JSON.stringify(locationPreferences) : null,
  ]);

  return await getUserProfile(userId);
}

export default {
  getUserProfile,
  updateUserPreferences,
};
