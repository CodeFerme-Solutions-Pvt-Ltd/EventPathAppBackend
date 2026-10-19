import { query } from '../config/db.js';
import { getUserProfile } from './profileService.js';
import { BASE_EVENT_SELECT, formatEvents } from './eventQueryHelper.js';

/**
 * Normalizes a string for robust matching: trims whitespace and lowercases.
 */
function normalize(str) {
  return String(str || '').toLowerCase().trim();
}

/**
 * Safely extracts normalized string values from an array, string, or boolean object map.
 */
function extractList(field) {
  if (!field) return [];
  if (Array.isArray(field)) {
    return field.map(normalize).filter(Boolean);
  }
  if (typeof field === 'string') {
    const trimmed = normalize(field);
    if (!trimmed) return [];
    if (trimmed.includes(',')) {
      return trimmed.split(',').map(s => normalize(s)).filter(Boolean);
    }
    return [trimmed];
  }
  if (typeof field === 'object') {
    const values = [];
    for (const [key, val] of Object.entries(field)) {
      if (val === true) {
        values.push(normalize(key));
      } else if (Array.isArray(val)) {
        values.push(...val.map(normalize).filter(Boolean));
      } else if (typeof val === 'string' && val.trim()) {
        values.push(normalize(val));
      }
    }
    return values;
  }
  return [];
}

/**
 * Checks if any user preference term matches any event term or appears in event text.
 */
function matchesTerms(userTerms, eventTerms, eventText = '') {
  if (!Array.isArray(userTerms) || userTerms.length === 0) return false;

  const eventSet = new Set((eventTerms || []).map(normalize));
  for (const rawUserTerm of userTerms) {
    const userTerm = normalize(rawUserTerm);
    if (!userTerm) continue;

    // 1. Exact match in event terms
    if (eventSet.has(userTerm)) return true;

    // 2. Substring match with event terms
    for (const eventTerm of eventSet) {
      if (eventTerm.includes(userTerm) || userTerm.includes(eventTerm)) {
        return true;
      }
    }

    // 3. Fallback: Check if event text mentions the user term
    if (eventText && eventText.includes(userTerm)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if an event is "Open to All".
 */
function isOpenToAllCategory(categories, eventText = '') {
  if (Array.isArray(categories)) {
    const found = categories.some((cat) => {
      const c = normalize(cat);
      return c === 'open to all' ||
             c === 'all' ||
             c === 'opentoall' ||
             c.includes('open to all') ||
             c.includes('open for all');
    });
    if (found) return true;
  }
  if (eventText) {
    if (eventText.includes('open to all') || eventText.includes('open for all')) {
      return true;
    }
  }
  return false;
}

/**
 * Core event pool matcher:
 * - Location: NO location restriction (shows in all locations / online).
 * - Category based: Matches events belonging to the user's selected categories (or "Open to All").
 * - Shows ALL technical events, ALL non-technical events, and ALL sports events for matching categories.
 * - Sports: Shows sports events in all locations if user has sports in their preferences.
 * 
 * @param {Object} event - Raw event row from PostgreSQL
 * @param {Object} userCriteria - User's extracted preferences
 * @returns {boolean} Whether event qualifies for Event Pool
 */
export function matchEventForPool(event, userCriteria) {
  const { userCategories, userWantsSports } = userCriteria;

  // If user has no categories and does not want sports, pool is empty
  if (userCategories.length === 0 && !userWantsSports) {
    return false;
  }

  const eventPrefs = event.preferences || event.raw_preferences || {};
  const eventCategories = extractList(event.categories || eventPrefs.categories || eventPrefs.category);
  const eventSports = extractList(eventPrefs['Sports'] || eventPrefs.sports);
  const eventTypes = extractList(event.event_types || eventPrefs.eventTypes || eventPrefs.eventType);

  const title = normalize(event.event_name);
  const desc = normalize(event.description);
  const organizer = normalize(event.organized_by);
  const combinedText = `${title} ${desc} ${organizer}`;

  // 1. Sports in all locations
  const isSportsEvent =
    eventSports.length > 0 ||
    eventCategories.some(c => c.includes('sports') || c === 'sport') ||
    eventTypes.some(t => t.includes('sports') || t === 'sport') ||
    ['football', 'cricket', 'volleyball', 'basketball', 'chess', 'badminton', 'tennis', 'table tennis',
     'kabaddi', 'kabbadi', 'kho-kho', 'hockey', 'karate', 'swimming', 'archery'].some(k => combinedText.includes(k));

  if (isSportsEvent && userWantsSports) {
    return true;
  }

  // 2. Open to All category (available to all users with category preferences)
  if (userCategories.length > 0 && isOpenToAllCategory(eventCategories, combinedText)) {
    return true;
  }

  // 3. User Selected Category Match (shows ALL technical & non-technical events in that category)
  if (userCategories.length > 0 && matchesTerms(userCategories, eventCategories, combinedText)) {
    return true;
  }

  return false;
}

/**
 * Service function for Event Pool:
 * Fetches approved events across ALL locations matching user's selected categories,
 * showing all technical, non-technical, and sports events.
 * 
 * @param {string} userId - User's ID
 * @returns {Promise<Array<Object>>} Formatted events for Event Pool
 */
export async function getEventPoolEvents(userId) {
  if (!userId) {
    const error = new Error('User ID is required for Event Pool.');
    error.status = 400;
    throw error;
  }

  // 1. Fetch user profile and preferences
  const user = await getUserProfile(userId);
  const userPrefs = user.preferences || {};

  // Extract user's selected categories
  const userCategories = extractList(userPrefs.categories || userPrefs.category);

  // Extract sports preferences (user may have selected Sports in categories, Sports list, or eventTypes)
  const userSports = extractList(userPrefs['Sports'] || userPrefs.sports);
  const userEventTypes = extractList(userPrefs.eventTypes || userPrefs.eventType);
  const userWantsSports =
    userSports.length > 0 ||
    userCategories.some(c => c.includes('sports') || c === 'sport') ||
    userEventTypes.some(t => t.includes('sports') || t === 'sport');

  if (userCategories.length === 0 && !userWantsSports) {
    return [];
  }

  const userCriteria = {
    userCategories,
    userWantsSports,
  };

  // 2. Fetch all approved events from PostgreSQL (all locations)
  const res = await query(
    `${BASE_EVENT_SELECT} WHERE e.status IN ('approved', 'accepted') ORDER BY e.created_at DESC;`
  );

  // 3. Filter events matching Event Pool criteria
  const matchedEvents = res.rows.filter((event) => matchEventForPool(event, userCriteria));

  // 4. Hydrate presigned S3 URLs and return canonical event objects
  return await formatEvents(matchedEvents);
}

export default {
  getEventPoolEvents,
  matchEventForPool,
};
