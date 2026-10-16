import { query } from '../config/db.js';
import { getUserProfile } from './profileService.js';
import { BASE_EVENT_SELECT, formatEvents } from './eventQueryHelper.js';

function normalize(str) {
  return String(str || '').toLowerCase().trim();
}

function extractPreferenceValues(field) {
  if (!field) return [];
  if (Array.isArray(field)) {
    return field.map(normalize).filter(Boolean);
  }
  if (typeof field === 'string') {
    return [normalize(field)].filter(Boolean);
  }
  if (typeof field === 'object') {
    const values = [];
    for (const [k, v] of Object.entries(field)) {
      if (v === true) {
        values.push(normalize(k));
      } else if (Array.isArray(v)) {
        values.push(...v.map(normalize).filter(Boolean));
      }
    }
    return values;
  }
  return [];
}

/**
 * Fetches approved events matching user preferences across categories, skills,
 * event types, technical/non-technical interest, and states/districts.
 */
export async function getPreferredEvents(userId) {
  if (!userId) {
    const error = new Error('User ID is required.');
    error.status = 400;
    throw error;
  }

  // 1. Fetch user preferences
  const user = await getUserProfile(userId);
  const userPrefs = user.preferences || {};
  const userLocationPrefs = user.locationPreferences || {};

  const userPrefCategories = extractPreferenceValues(userPrefs.categories || userPrefs.category);
  const userPrefSkills = extractPreferenceValues(userPrefs.skills || userPrefs.skill);

  const customUserPrefEntries = Object.entries(userPrefs).filter(
    ([key]) => !['eventType', 'eventTypes', 'interest', 'interestAreas'].includes(key)
  );

  const userEventTypes = extractPreferenceValues(userPrefs.eventTypes || userPrefs.eventType);
  const preferInstitutional = userEventTypes.some(t => t.includes('institutional') && !t.includes('non'));
  const preferNonInstitutional = userEventTypes.some(t => t.includes('noninstitutional') || t.includes('non-institutional') || t.includes('non institutional'));

  const userInterests = extractPreferenceValues(userPrefs.interestAreas || userPrefs.interest);
  const preferTechnical = userInterests.some(t => t.includes('technical') && !t.includes('non'));
  const preferNonTechnical = userInterests.some(t => t.includes('nontechnical') || t.includes('non-technical') || t.includes('non technical'));

  // Only district is considered as a location preference, state alone is ignored
  const userDistricts = extractPreferenceValues(userLocationPrefs.selectedDistricts || userLocationPrefs.districts || userLocationPrefs.district);

  const hasAnyUserPrefs =
    userPrefCategories.length > 0 ||
    userPrefSkills.length > 0 ||
    preferInstitutional ||
    preferNonInstitutional ||
    preferTechnical ||
    preferNonTechnical ||
    userDistricts.length > 0 ||
    customUserPrefEntries.some(([_, v]) => extractPreferenceValues(v).length > 0);

  if (!hasAnyUserPrefs) {
    return [];
  }

  // 2. Fetch approved events from base tables
  const res = await query(
    `${BASE_EVENT_SELECT} WHERE e.status IN ('approved', 'accepted') ORDER BY e.created_at DESC;`
  );
  const allEvents = res.rows;

  // 3. Filter matching events
  const matchedEvents = allEvents.filter((event) => {
    const eventPrefs = event.preferences || {};
    const eventLocPrefs = event.location_preferences || {};

    const title = normalize(event.event_name);
    const desc = normalize(event.description);
    const organizer = normalize(event.organized_by);
    const venue = normalize(event.venue_name);
    const address = normalize(event.address);
    const combinedText = `${title} ${desc} ${organizer} ${venue} ${address}`;

    // A. Match Categories
    const eventCategories = extractPreferenceValues(eventPrefs.categories || eventPrefs.category);
    if (userPrefCategories.some(cat => eventCategories.includes(cat) || combinedText.includes(cat))) {
      return true;
    }

    // B. Match Skills
    const eventSkills = extractPreferenceValues(eventPrefs.skills || eventPrefs.skill);
    if (userPrefSkills.some(skill => eventSkills.includes(skill) || combinedText.includes(skill))) {
      return true;
    }

    // C. Dynamic Custom Preferences
    for (const [key, userVal] of customUserPrefEntries) {
      const userTerms = extractPreferenceValues(userVal);
      if (userTerms.length === 0) continue;
      const eventTerms = extractPreferenceValues(eventPrefs[key]);
      if (userTerms.some(term => eventTerms.includes(term) || combinedText.includes(term))) {
        return true;
      }
    }

    // D. Match Event Type (Institutional / Non-Institutional)
    const eventTypes = extractPreferenceValues(eventPrefs.eventTypes || eventPrefs.eventType);
    const eventIsInst =
      eventTypes.some(t => t.includes('institutional') && !t.includes('non')) ||
      ['college', 'university', 'school', 'institute', 'academy', 'department', 'dept', 'campus'].some(k => organizer.includes(k));
    const eventIsNonInst =
      eventTypes.some(t => t.includes('noninstitutional') || t.includes('non-institutional') || t.includes('non institutional'));

    if (preferInstitutional && eventIsInst) return true;
    if (preferNonInstitutional && eventIsNonInst) return true;

    // E. Match Interests (Technical / Non-Technical)
    const eventInterests = extractPreferenceValues(eventPrefs.interestAreas || eventPrefs.interest);
    const eventIsTech =
      eventInterests.some(t => t.includes('technical') && !t.includes('non')) ||
      ['tech', 'hackathon', 'code', 'coding', 'flutter', 'ai', 'ml', 'software', 'developer', 'cyber', 'robot', 'web'].some(k => title.includes(k) || desc.includes(k));
    const eventIsNonTech =
      eventInterests.some(t => t.includes('nontechnical') || t.includes('non-technical') || t.includes('non technical')) ||
      ['dance', 'music', 'cultural', 'art', 'drama', 'sports', 'game', 'fun', 'fest'].some(k => title.includes(k) || desc.includes(k));

    if (preferTechnical && eventIsTech) return true;
    if (preferNonTechnical && eventIsNonTech) return true;

    // F. Location Matching (District only — state alone is NOT considered a preference match)
    if (userDistricts.length > 0) {
      const eventDistricts = extractPreferenceValues(eventLocPrefs.selectedDistricts || eventLocPrefs.districts || eventLocPrefs.district);
      if (userDistricts.some(dist => eventDistricts.includes(dist) || address.includes(dist) || venue.includes(dist))) {
        return true;
      }
    }

    return false;
  });

  return await formatEvents(matchedEvents);
}

export default {
  getPreferredEvents,
};
