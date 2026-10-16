import { getPresignedViewUrl } from './storageService.js';

/**
 * Base SQL query projection and joins for unified event retrieval without a database view.
 * Ensures clean YYYY-MM-DD date serialization directly from PostgreSQL.
 */
export const BASE_EVENT_SELECT = `
  SELECT
    e.id AS event_id,
    e.event_name,
    e.description,
    e.organized_by,
    e.mode_of_event,
    e.website_url,
    e.created_by,
    e.creator_role,
    e.status,
    e.created_at,
    e.updated_at,
    -- Schedule
    TO_CHAR(s.start_date, 'YYYY-MM-DD') AS start_date,
    TO_CHAR(s.end_date, 'YYYY-MM-DD') AS end_date,
    s.start_time,
    s.end_time,
    s.no_of_days,
    s.is_custom_dates,
    coalesce(s.event_dates, '[]'::jsonb) AS event_dates,
    coalesce(s.event_timings, '[]'::jsonb) AS event_timings,
    -- Location
    l.venue_name,
    l.address,
    l.maps_url,
    coalesce(l.location_preferences, '{}'::jsonb) AS location_preferences,
    -- Registration
    jsonb_build_object(
      'hasRegistration', coalesce(r.has_registration, false),
      'feeType', coalesce(r.fee_type, 'normal'),
      'amount', coalesce(r.amount, 0),
      'slabs', coalesce(r.slabs, '[]'::jsonb),
      'slabImageUrl', coalesce(r.slab_image_url, ''),
      'lastDateToRegister', TO_CHAR(r.last_date_to_register, 'YYYY-MM-DD'),
      'note', coalesce(r.additional_note, ''),
      'additionalNote', coalesce(r.additional_note, '')
    ) AS registration,
    -- Preferences
    coalesce(p.raw_preferences, '{}'::jsonb) AS preferences,
    coalesce(p.categories, '[]'::jsonb) AS categories,
    coalesce(p.skills, '[]'::jsonb) AS skills,
    coalesce(p.event_types, '[]'::jsonb) AS event_types,
    coalesce(p.interest_areas, '[]'::jsonb) AS interest_areas,
    -- Media (Primary image URL and all image URLs ordered by display_order)
    (
      SELECT m.url 
      FROM event_media m 
      WHERE m.event_id = e.id 
      ORDER BY m.is_primary DESC, m.display_order ASC 
      LIMIT 1
    ) AS image_link,
    coalesce((
      SELECT jsonb_agg(m.url ORDER BY m.display_order ASC) 
      FROM event_media m 
      WHERE m.event_id = e.id
    ), '[]'::jsonb) AS image_links,
    -- Contacts & Additional Details
    coalesce(c.contacts, '[]'::jsonb) AS contacts,
    coalesce(c.additional_details, '[]'::jsonb) AS additional_details
  FROM events e
  LEFT JOIN event_schedules s ON e.id = s.event_id
  LEFT JOIN event_locations l ON e.id = l.event_id
  LEFT JOIN event_registrations r ON e.id = r.event_id
  LEFT JOIN event_preferences p ON e.id = p.event_id
  LEFT JOIN event_contacts c ON e.id = c.event_id
`;

/**
 * Formats a single PostgreSQL event record into a rich model containing both
 * camelCase (Flutter frontend) and snake_case (legacy/DB) properties, with
 * fully accessible presigned S3 URLs for event posters.
 * 
 * @param {Object} row - Raw row from PostgreSQL BASE_EVENT_SELECT
 * @returns {Promise<Object>} Fully hydrated event object
 */
export async function formatEvent(row) {
  if (!row) return null;

  const eventId = row.event_id || row.id || row.eventId;
  const eventName = row.event_name || row.eventName || 'Untitled Event';
  const organizedBy = row.organized_by || row.organizedBy || 'Unknown Organizer';
  const modeOfEvent = (row.mode_of_event || row.modeOfEvent || row.eventMode || 'offline').toLowerCase().trim();
  const startDate = row.start_date || row.startDate || '';
  const endDate = row.end_date || row.endDate || '';
  const startTime = row.start_time || row.startTime || '';
  const endTime = row.end_time || row.endTime || '';
  const venueName = row.venue_name || row.venueName || '';
  const address = row.address || '';
  const mapsUrl = row.maps_url || row.mapsUrl || '';
  const websiteUrl = row.website_url || row.websiteUrl || '';
  const noOfDays = Number(row.no_of_days ?? row.noOfDays ?? 1);
  const isCustomDates = row.is_custom_dates === true || row.isCustomDates === true;
  const eventDates = Array.isArray(row.event_dates) ? row.event_dates : (row.eventDates || []);
  const eventTimings = Array.isArray(row.event_timings) ? row.event_timings : (row.eventTimings || []);
  const locationPreferences = row.location_preferences || row.locationPreferences || {};
  const contacts = Array.isArray(row.contacts) ? row.contacts : [];
  const additionalDetails = Array.isArray(row.additional_details) ? row.additional_details : (row.additionalDetails || []);

  // Registration object
  const rawReg = row.registration || {};
  const registration = {
    hasRegistration: rawReg.hasRegistration === true || rawReg.has_registration === true,
    feeType: rawReg.feeType || rawReg.fee_type || 'normal',
    amount: Number(rawReg.amount || 0),
    slabs: Array.isArray(rawReg.slabs) ? rawReg.slabs : [],
    slabImageUrl: rawReg.slabImageUrl || rawReg.slab_image_url || '',
    lastDateToRegister: rawReg.lastDateToRegister || rawReg.last_date_to_register || null,
    note: rawReg.note || rawReg.additionalNote || rawReg.additional_note || '',
    additionalNote: rawReg.additionalNote || rawReg.additional_note || rawReg.note || '',
  };

  if (registration.slabImageUrl) {
    registration.slabImageUrl = await getPresignedViewUrl(registration.slabImageUrl);
  }

  // Preferences object
  const prefs = row.preferences || row.raw_preferences || {};
  const eventTypes = row.event_types || prefs.eventTypes || prefs.eventType || [];
  const categories = row.categories || prefs.categories || prefs.category || [];
  const skills = row.skills || prefs.skills || prefs.skill || [];
  const interestAreas = row.interest_areas || prefs.interestAreas || prefs.interests || prefs.interest || [];

  // Media (Generate accessible presigned URLs for private/Lightsail S3 objects)
  const rawLinks = Array.isArray(row.image_links) ? row.image_links : (row.imageLinks || []);
  const rawPrimary = row.image_link || row.imageLink || (rawLinks.length > 0 ? rawLinks[0] : '');

  const imageLinks = await Promise.all(rawLinks.map((url) => getPresignedViewUrl(url)));
  const imageLink = rawPrimary ? await getPresignedViewUrl(rawPrimary) : (imageLinks[0] || '');

  // Geography top-level fields for fast filtering
  const states = locationPreferences.selectedStates || [];
  const districts = locationPreferences.selectedDistricts || [];
  const state = states[0] || '';
  const district = districts[0] || '';

  return {
    // Both camelCase (Flutter) & snake_case (legacy/PostgreSQL)
    id: eventId,
    _id: eventId,
    eventId,
    event_id: eventId,

    eventName,
    event_name: eventName,

    description: row.description || '',

    organizedBy,
    organized_by: organizedBy,

    modeOfEvent,
    eventMode: modeOfEvent,
    mode_of_event: modeOfEvent,

    websiteUrl,
    website_url: websiteUrl,

    startDate,
    start_date: startDate,

    endDate,
    end_date: endDate,

    startTime,
    start_time: startTime,

    endTime,
    end_time: endTime,

    noOfDays,
    no_of_days: noOfDays,

    isCustomDates,
    is_custom_dates: isCustomDates,

    eventDates,
    event_dates: eventDates,

    eventTimings,
    event_timings: eventTimings,

    venueName,
    venue_name: venueName,

    address,

    mapsUrl,
    maps_url: mapsUrl,

    state,
    district,
    locationPreferences,
    location_preferences: locationPreferences,

    registration,
    slabImageUrl: registration.slabImageUrl || '',
    slab_image_url: registration.slabImageUrl || '',

    preferences: prefs,
    eventTypes,
    categories,
    skills,
    interestAreas,
    interests: interestAreas,

    imageLink,
    image_link: imageLink,

    imageLinks,
    image_links: imageLinks,

    contacts,
    additionalDetails,
    additional_details: additionalDetails,

    status: row.status || 'approved',
    createdBy: row.created_by || row.createdBy || null,
    created_by: row.created_by || null,
    creatorRole: row.creator_role || row.creatorRole || 'user',
    creator_role: row.creator_role || 'user',

    createdAt: row.created_at || row.createdAt,
    created_at: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
    updated_at: row.updated_at || row.updatedAt,
  };
}

/**
 * Hydrates an array of PostgreSQL event rows into the canonical format.
 * 
 * @param {Array<Object>} rows - Array of raw rows from PostgreSQL BASE_EVENT_SELECT
 * @returns {Promise<Array<Object>>} Formatted events
 */
export async function formatEvents(rows) {
  if (!Array.isArray(rows)) return [];
  return await Promise.all(rows.map(formatEvent));
}

export default {
  BASE_EVENT_SELECT,
  formatEvent,
  formatEvents,
};
