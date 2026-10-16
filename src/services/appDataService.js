import { query } from '../config/db.js';

/**
 * Dynamically retrieves all taxonomies, categories, locations, and organizers.
 * Follows exact client response structure.
 * 
 * @returns {Promise<Object>} Formatted AppData object
 */
export async function getAppDataFromDb() {
  const appData = {};

  // 1. Fetch Event Preferences ordered by display_order
  const eventPrefsRes = await query(
    `SELECT preference_key, values FROM app_event_preferences ORDER BY display_order ASC;`
  );
  const eventPreferences = {};
  for (const row of eventPrefsRes.rows) {
    eventPreferences[row.preference_key] = row.values || [];
  }
  appData.EventPreferences = eventPreferences;

  // 2. Fetch Location Preferences ordered by display_order
  const locPrefsRes = await query(
    `SELECT state_name, districts FROM app_location_preferences ORDER BY display_order ASC;`
  );
  const locationPreferences = {};
  for (const row of locPrefsRes.rows) {
    locationPreferences[row.state_name] = row.districts || [];
  }
  appData.LocationPreferences = locationPreferences;

  // 3. Fetch Organizers
  const orgsRes = await query(
    `SELECT name FROM app_organizers WHERE is_active = true ORDER BY name ASC;`
  );
  const organizersList = orgsRes.rows.map((r) => r.name);
  appData.Organizers = {
    names: organizersList,
  };

  // 4. Fetch App Update Config
  appData.UpdateConfig = await getAppUpdateConfigFromDb();

  return appData;
}

/**
 * Retrieves the active app update configuration for mobile clients.
 * Formatted directly for UpdateScreen in frontend eventpath.
 * 
 * @returns {Promise<Object>}
 */
export async function getAppUpdateConfigFromDb() {
  try {
    const res = await query(
      `SELECT * FROM app_update_config_view WHERE id = 'default' LIMIT 1;`
    );
    if (res.rows.length > 0) {
      const row = res.rows[0];
      return {
        title: row.title,
        updateLink: row.updateLink,
        aboutUpdate: row.aboutUpdate,
        latestVersion: row.latestVersion,
        isUpdateAvailable: row.isUpdateAvailable,
      };
    }
  } catch (err) {
    console.warn('Notice: app_update_config table not queried:', err.message);
  }

  return {
    title: 'Newer Version Available',
    updateLink: 'https://play.google.com/store/apps/details?id=com.codeferme.eventpath',
    aboutUpdate: 'New performance improvements and bug fixes. A newer version is available. Update and continue the usage.',
    latestVersion: '3.10.3',
    isUpdateAvailable: false,
  };
}

/**
 * Returns a sorted list of all active organizer names.
 * 
 * @returns {Promise<string[]>}
 */
export async function getOrganizersFromDb() {
  const res = await query(
    `SELECT name FROM app_organizers WHERE is_active = true ORDER BY name ASC;`
  );
  return res.rows.map((r) => r.name);
}

/**
 * Adds an organizer to the database.
 * 
 * @param {string} name - Organizer name
 * @returns {Promise<{success: boolean, name: string}>}
 */
export async function addOrganizerToDb(name) {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Valid organizer name is required.');
  }

  const trimmed = name.trim();
  const sql = `
    INSERT INTO app_organizers (name, is_active, created_at)
    VALUES ($1, true, CURRENT_TIMESTAMP)
    ON CONFLICT (name) DO NOTHING;
  `;
  await query(sql, [trimmed]);

  return { success: true, name: trimmed };
}

/**
 * Appends a value to an event preference category.
 * 
 * @param {string} preferenceKey - e.g. 'categories', 'skills'
 * @param {string} value - Value to add
 */
export async function addPreferenceToDb(preferenceKey, value) {
  if (!preferenceKey || !value) {
    throw new Error('Preference key and value are required.');
  }

  const trimmedValue = value.trim();

  // Check if category exists
  const checkSql = `SELECT values FROM app_event_preferences WHERE preference_key = $1;`;
  const existing = await query(checkSql, [preferenceKey]);

  if (existing.rows.length === 0) {
    // Insert new category
    const insertSql = `
      INSERT INTO app_event_preferences (preference_key, display_title, values, display_order)
      VALUES ($1, $1, $2::jsonb, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM app_event_preferences));
    `;
    await query(insertSql, [preferenceKey, JSON.stringify([trimmedValue])]);
  } else {
    // Append if not present in values array
    const currentValues = existing.rows[0].values || [];
    if (!currentValues.includes(trimmedValue)) {
      currentValues.push(trimmedValue);
      const updateSql = `
        UPDATE app_event_preferences
        SET values = $1::jsonb, updated_at = CURRENT_TIMESTAMP
        WHERE preference_key = $2;
      `;
      await query(updateSql, [JSON.stringify(currentValues), preferenceKey]);
    }
  }

  return { success: true, preferenceKey, value: trimmedValue };
}

export default {
  getAppDataFromDb,
  getOrganizersFromDb,
  addOrganizerToDb,
  addPreferenceToDb,
};
