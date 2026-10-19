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
    // Handle comma or semicolon separated lists if present
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
 * Checks if any term in `sourceList` matches any term in `targetList`,
 * or if any term appears within the combined text.
 */
/**
 * Checks if any user preference term matches any event term or appears in event text.
 * userTerms: terms selected by user
 * eventTerms: terms tagged on the event
 * eventText: title + description + organizer of event
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
 * Checks if the event matches the user's preferred district.
 */
function matchesDistrict(event, userDistricts) {
  if (!userDistricts || userDistricts.length === 0) return false;

  const eventLocPrefs = event.location_preferences || {};
  const eventDistricts = extractList(
    eventLocPrefs.selectedDistricts ||
    eventLocPrefs.districts ||
    eventLocPrefs.district ||
    event.district ||
    event.selectedDistrict
  );

  const address = normalize(event.address);
  const venue = normalize(event.venue_name);

  return userDistricts.some((userDist) => {
    if (eventDistricts.some(ed => ed === userDist || ed.includes(userDist) || userDist.includes(ed))) {
      return true;
    }
    if (address && address.includes(userDist)) return true;
    if (venue && venue.includes(userDist)) return true;
    return false;
  });
}

/**
 * Checks if a category string indicates "Open to All".
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
 * Core event lane matcher. Evaluates an event against the user's preferences:
 * 1. Location: Must match user's preferred district.
 * 2. In that location:
 *    - Sports: Matches if event is a sports event and user selected matching sports options.
 *    - Categories & Tech/Non-Tech:
 *      * If event category is "Open to All", ignores category and matches based on Technical and Non-Technical events.
 *      * Otherwise, event category MUST match user's selected categories, and in those categories picks Technical and Non-Technical events.
 */
export function matchEventForLane(event, userFilterCriteria) {
  const {
    userDistricts,
    userCategories,
    userTechEvents,
    userNonTechEvents,
    userSports,
    userWantsSports,
    hasTechOrNonTechSelection,
  } = userFilterCriteria;

  // 1. Mandatory Location Check (District matching)
  if (!matchesDistrict(event, userDistricts)) {
    return false;
  }

  // Event metadata extraction
  const eventPrefs = event.preferences || event.raw_preferences || {};
  const eventCategories = extractList(event.categories || eventPrefs.categories || eventPrefs.category);
  const eventTechEvents = extractList(eventPrefs['Technical Events'] || eventPrefs.technicalEvents || eventPrefs.technical_events);
  const eventNonTechEvents = extractList(eventPrefs['Non Technical Events'] || eventPrefs.nonTechnicalEvents || eventPrefs.non_technical_events);
  const eventSports = extractList(eventPrefs['Sports'] || eventPrefs.sports);
  const eventTypes = extractList(event.event_types || eventPrefs.eventTypes || eventPrefs.eventType);

  const title = normalize(event.event_name);
  const desc = normalize(event.description);
  const organizer = normalize(event.organized_by);
  const combinedText = `${title} ${desc} ${organizer}`;

  // 2. Branch A: Sports Match ("and make sports according to user selected options")
  const isSportsEvent =
    eventSports.length > 0 ||
    eventCategories.some(c => c.includes('sports') || c === 'sport') ||
    eventTypes.some(t => t.includes('sports') || t === 'sport') ||
    ['football', 'cricket', 'volleyball', 'basketball', 'chess', 'badminton', 'tennis', 'table tennis',
     'kabaddi', 'kabbadi', 'kho-kho', 'hockey', 'karate', 'swimming', 'archery'].some(k => combinedText.includes(k));

  if (isSportsEvent && userWantsSports) {
    if (userSports.length > 0) {
      if (matchesTerms(userSports, eventSports, combinedText)) {
        return true;
      }
    } else {
      // User opted for general Sports in eventTypes without specific sport filter
      return true;
    }
  }

  // 3. Branch B: Category and Technical / Non-Technical Events
  const isOpenToAll = isOpenToAllCategory(eventCategories, combinedText);

  if (isOpenToAll) {
    // "(if category is open to all) then ignore the category of event and show based on tech and non tech events"
    const techMatched = userTechEvents.length > 0 && matchesTerms(userTechEvents, eventTechEvents, combinedText);
    const nonTechMatched = userNonTechEvents.length > 0 && matchesTerms(userNonTechEvents, eventNonTechEvents, combinedText);

    if (techMatched || nonTechMatched) {
      return true;
    }

    // If user has not picked specific sub-events, but picked categories
    if (!hasTechOrNonTechSelection && userCategories.length > 0) {
      return true;
    }
  } else {
    // Regular category: MUST match the category selected by the user
    const categoryMatched =
      userCategories.length > 0 &&
      matchesTerms(userCategories, eventCategories, combinedText);

    if (!categoryMatched) {
      return false;
    }

    // "in selected categories of user pick the technical Events and non technical events"
    if (hasTechOrNonTechSelection) {
      const techMatched = userTechEvents.length > 0 && matchesTerms(userTechEvents, eventTechEvents, combinedText);
      const nonTechMatched = userNonTechEvents.length > 0 && matchesTerms(userNonTechEvents, eventNonTechEvents, combinedText);

      if (techMatched || nonTechMatched) {
        return true;
      }

      // If event has no specific tech/non-tech sub-events tagged, allow category match
      const hasSubEventTags = eventTechEvents.length > 0 || eventNonTechEvents.length > 0;
      if (!hasSubEventTags) {
        return true;
      }
    } else {
      // User only selected categories and no specific tech/non-tech events
      return true;
    }
  }

  return false;
}

/**
 * Service function for Event Lane:
 * Fetches approved events matching user preferences:
 * - Location: User's preferred district.
 * - Categories: User's selected categories.
 * - Technical & Non-Technical: In selected categories, picks matching tech and non-tech events
 *   (or ignores category if event category is "Open to All").
 * - Sports: According to user's selected sports options.
 * 
 * @param {string} userId - User's ID
 * @returns {Promise<Array<Object>>} Formatted events for Event Lane
 */
export async function getEventLaneEvents(userId) {
  if (!userId) {
    const error = new Error('User ID is required for Event Lane.');
    error.status = 400;
    throw error;
  }

  // 1. Fetch user profile and preferences
  const user = await getUserProfile(userId);
  const userPrefs = user.preferences || {};
  const userLocationPrefs = user.locationPreferences || {};

  // Extract user's preferred districts
  const userDistricts = extractList(
    userLocationPrefs.selectedDistricts ||
    userLocationPrefs.districts ||
    userLocationPrefs.district
  );

  // If user has not set any district preference, Event Lane cannot localize
  if (userDistricts.length === 0) {
    return [];
  }

  // Extract user's event preferences
  const userCategories = extractList(userPrefs.categories || userPrefs.category);
  const userTechEvents = extractList(
    userPrefs['Technical Events'] ||
    userPrefs.technicalEvents ||
    userPrefs.technical_events
  );
  const userNonTechEvents = extractList(
    userPrefs['Non Technical Events'] ||
    userPrefs.nonTechnicalEvents ||
    userPrefs.non_technical_events
  );
  const userSports = extractList(
    userPrefs['Sports'] ||
    userPrefs.sports
  );

  const userEventTypes = extractList(userPrefs.eventTypes || userPrefs.eventType);
  const userWantsSports = userSports.length > 0 || userEventTypes.some(t => t.includes('sports'));

  const hasTechOrNonTechSelection = userTechEvents.length > 0 || userNonTechEvents.length > 0;

  const filterCriteria = {
    userDistricts,
    userCategories,
    userTechEvents,
    userNonTechEvents,
    userSports,
    userWantsSports,
    hasTechOrNonTechSelection,
  };

  // 2. Fetch all approved events from PostgreSQL
  const res = await query(
    `${BASE_EVENT_SELECT} WHERE e.status IN ('approved', 'accepted') ORDER BY e.created_at DESC;`
  );

  // 3. Filter events matching Event Lane criteria
  const matchedEvents = res.rows.filter((event) => matchEventForLane(event, filterCriteria));

  // 4. Hydrate presigned S3 URLs and return canonical event objects
  return await formatEvents(matchedEvents);
}

export default {
  getEventLaneEvents,
  matchEventForLane,
};
