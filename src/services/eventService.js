import crypto from 'crypto';
import { query, pool } from '../config/db.js';
import { uploadEventPosters, uploadSlabRegistrationImage } from './storageService.js';
import { BASE_EVENT_SELECT, formatEvent, formatEvents } from './eventQueryHelper.js';

/**
 * Coerces the client-supplied registration object into the canonical shape.
 */
export function normaliseRegistration(raw, eventStartDate) {
  const EMPTY = {
    hasRegistration: false,
    feeType: 'normal',
    amount: 0,
    slabs: [],
    lastDateToRegister: null,
    additionalNote: '',
  };

  let source = raw;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch (_) { return EMPTY; }
  }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return EMPTY;
  }

  const hasRegistration =
    source.hasRegistration === true ||
    source.hasRegistration === 'true' ||
    source.hasRegistration === 1;

  if (!hasRegistration) {
    return {
      hasRegistration: false,
      feeType: 'normal',
      amount: 0,
      slabs: [],
      lastDateToRegister: null,
      additionalNote: typeof source.additionalNote === 'string' ? source.additionalNote.trim().slice(0, 500) : '',
    };
  }

  const feeType = source.feeType === 'slab' ? 'slab' : 'normal';
  let slabs = [];
  if (feeType === 'slab' && Array.isArray(source.slabs)) {
    slabs = source.slabs
      .map((s) => {
        if (!s || typeof s !== 'object') return null;
        const particulars = typeof s.particulars === 'string' ? s.particulars.trim().slice(0, 100) : '';
        const slabAmount = Number(s.amount);
        const validAmount = Number.isFinite(slabAmount) && slabAmount > 0 ? Math.trunc(slabAmount) : 0;
        if (!particulars && validAmount <= 0) return null;
        return { particulars, amount: validAmount };
      })
      .filter(Boolean);
  }

  const numericAmount = Number(source.amount);
  let amount = Number.isFinite(numericAmount) && numericAmount > 0 ? Math.trunc(numericAmount) : 0;

  if (feeType === 'slab' && slabs.length > 0) {
    if (amount <= 0) {
      amount = Math.min(...slabs.map((s) => s.amount));
    }
  }

  let lastDateToRegister = null;
  const rawDate = typeof source.lastDateToRegister === 'string' ? source.lastDateToRegister.trim() : '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    if (!eventStartDate || rawDate <= eventStartDate) {
      lastDateToRegister = rawDate;
    }
  }

  const additionalNote = typeof source.additionalNote === 'string' ? source.additionalNote.trim().slice(0, 500) : '';

  return { hasRegistration: true, feeType, amount, slabs, lastDateToRegister, additionalNote };
}

/**
 * Creates an event in PostgreSQL across normalized sub-tables and uploads its posters
 * directly into the Amazon Lightsail Storage Bucket ('events/' folder).
 */
export async function createEvent(eventData, files, user) {
  const {
    eventName,
    description,
    organizedBy,
    startDate,
    endDate,
    startTime,
    endTime,
    noOfDays,
    eventDates,
    eventTimings,
    isCustomDates,
    venueName,
    address,
    mapsUrl,
    websiteUrl,
    contacts,
    additionalDetails,
    registration,
    preferences,
    locationPreferences,
  } = eventData;

  const rawMode = (eventData.modeOfEvent || eventData.eventMode || 'offline').toString().toLowerCase().trim();
  const modeOfEvent = ['offline', 'online', 'hybrid'].includes(rawMode) ? rawMode : 'offline';

  if (!eventName || !eventName.trim()) {
    const err = new Error('Event name is required.');
    err.status = 400;
    throw err;
  }
  if (modeOfEvent !== 'online') {
    if (!venueName || !venueName.trim()) {
      const err = new Error('Venue name is required.');
      err.status = 400;
      throw err;
    }
    if (!address || !address.trim()) {
      const err = new Error('Address is required.');
      err.status = 400;
      throw err;
    }
  }
  if (!startDate) {
    const err = new Error('Start date is required.');
    err.status = 400;
    throw err;
  }
  const timeToMinutes = (value) => {
    if (!value || typeof value !== 'string') return null;
    const clean = value.trim();
    if (!clean || clean.toLowerCase() === 'not mentioned') return null;
    const match = clean.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  };

  const hasStartTime = startTime && typeof startTime === 'string' && startTime.trim() && startTime.trim().toLowerCase() !== 'not mentioned';
  const hasEndTime = endTime && typeof endTime === 'string' && endTime.trim() && endTime.trim().toLowerCase() !== 'not mentioned';

  const startTimeMin = hasStartTime ? timeToMinutes(startTime) : null;
  const endTimeMin = hasEndTime ? timeToMinutes(endTime) : null;

  if (hasStartTime && startTimeMin === null) {
    const err = new Error('Invalid start time format. Expected HH:MM.');
    err.status = 400;
    throw err;
  }
  if (hasEndTime && endTimeMin === null) {
    const err = new Error('Invalid end time format. Expected HH:MM.');
    err.status = 400;
    throw err;
  }
  if (startTimeMin !== null && endTimeMin !== null && endTimeMin <= startTimeMin) {
    const err = new Error('End time must be after start time.');
    err.status = 400;
    throw err;
  }

  const parsedNoOfDays = Number.isInteger(noOfDays) && noOfDays > 0 ? noOfDays : 1;
  const parsedEventDates = Array.isArray(eventDates) ? eventDates : [];
  const parsedIsCustomDates = isCustomDates === true || isCustomDates === 'true';
  const parsedEventTimings = Array.isArray(eventTimings) ? eventTimings : [];

  const eventId = crypto.randomUUID();

  // 1. Separate posters and slab table image
  const fileList = Array.isArray(files) ? files : [];
  const slabFile = fileList.find((f) => f.fieldname === 'slabImage') || null;
  const posterFiles = fileList.filter((f) => f.fieldname !== 'slabImage');

  // 1a. Upload posters to Amazon Lightsail Bucket ('events/' folder)
  const { allUrls, allKeys } = await uploadEventPosters(eventId, posterFiles);

  // 1b. Upload slab registration fee table image to 'events/{eventId}/slab registration fee table/'
  let slabImageUrl = '';
  let slabImagePath = '';
  const rawSlabImage = slabFile || eventData.slabImageBase64 || eventData.registration?.slabImageBase64 || null;
  if (rawSlabImage) {
    const slabUpload = await uploadSlabRegistrationImage(eventId, rawSlabImage);
    slabImageUrl = slabUpload.url;
    slabImagePath = slabUpload.key;
  }

  const normRegistration = normaliseRegistration(registration, startDate);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 2. Insert Core Event record
    await client.query(`
      INSERT INTO events (id, event_name, description, organized_by, mode_of_event, website_url, created_by, creator_role, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    `, [
      eventId,
      eventName.trim(),
      description || '',
      organizedBy || '',
      modeOfEvent,
      websiteUrl || '',
      user.userId || user.docId || null,
      user.role || 'user',
    ]);

    // 3. Insert Schedule
    await client.query(`
      INSERT INTO event_schedules (event_id, start_date, end_date, start_time, end_time, no_of_days, is_custom_dates, event_dates, event_timings)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb);
    `, [
      eventId,
      startDate,
      endDate || null,
      hasStartTime ? startTime.trim() : (startTime || 'Not mentioned'),
      hasEndTime ? endTime.trim() : (endTime || 'Not mentioned'),
      parsedNoOfDays,
      parsedIsCustomDates,
      JSON.stringify(parsedEventDates),
      JSON.stringify(parsedEventTimings),
    ]);

    // 4. Insert Location
    await client.query(`
      INSERT INTO event_locations (event_id, venue_name, address, maps_url, location_preferences)
      VALUES ($1, $2, $3, $4, $5::jsonb);
    `, [
      eventId,
      venueName ? venueName.trim() : (modeOfEvent === 'online' ? 'Online' : ''),
      address ? address.trim() : (modeOfEvent === 'online' ? 'Virtual Event / Online' : ''),
      mapsUrl || '',
      JSON.stringify(locationPreferences || {}),
    ]);

    // 5. Insert Registration (including slab registration fee table image)
    await client.query(`
      INSERT INTO event_registrations (event_id, has_registration, fee_type, amount, slabs, slab_image_url, slab_image_path, last_date_to_register, additional_note)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9);
    `, [
      eventId,
      normRegistration.hasRegistration,
      normRegistration.feeType,
      normRegistration.amount,
      JSON.stringify(normRegistration.slabs),
      slabImageUrl || null,
      slabImagePath || null,
      normRegistration.lastDateToRegister || null,
      normRegistration.additionalNote,
    ]);

    // 6. Insert Media
    if (allUrls.length > 0) {
      for (let i = 0; i < allUrls.length; i++) {
        await client.query(`
          INSERT INTO event_media (event_id, url, storage_key, media_type, display_order, is_primary)
          VALUES ($1, $2, $3, 'poster', $4, $5);
        `, [eventId, allUrls[i], allKeys[i] || '', i, i === 0]);
      }
    }

    // 7. Insert Preferences
    const rawPrefs = preferences || {};
    await client.query(`
      INSERT INTO event_preferences (event_id, categories, skills, event_types, interest_areas, raw_preferences)
      VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb);
    `, [
      eventId,
      JSON.stringify(rawPrefs.categories || rawPrefs.category || []),
      JSON.stringify(rawPrefs.skills || rawPrefs.skill || []),
      JSON.stringify(rawPrefs.eventTypes || rawPrefs.eventType || []),
      JSON.stringify(rawPrefs.interestAreas || rawPrefs.interest || []),
      JSON.stringify(rawPrefs),
    ]);

    // 8. Insert Contacts & Details
    await client.query(`
      INSERT INTO event_contacts (event_id, contacts, additional_details)
      VALUES ($1, $2::jsonb, $3::jsonb);
    `, [
      eventId,
      JSON.stringify(contacts || []),
      JSON.stringify(additionalDetails || []),
    ]);

    // 9. Update stats counter
    await client.query(`
      UPDATE app_stats SET count = count + 1, updated_at = CURRENT_TIMESTAMP WHERE metric_name IN ('pending_event_count', 'total_events_registered');
    `);

    await client.query('COMMIT');

    // Return the newly created event directly from base tables
    const createdEventRes = await query(`${BASE_EVENT_SELECT} WHERE e.id = $1;`, [eventId]);
    return await formatEvent(createdEventRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Retrieves events created by a specific user.
 */
export async function getMyEvents(userId) {
  const sql = `${BASE_EVENT_SELECT} WHERE e.created_by = $1 ORDER BY e.created_at DESC;`;
  const res = await query(sql, [userId]);
  return await formatEvents(res.rows);
}

/**
 * Retrieves all approved events.
 */
export async function getApprovedEvents() {
  const sql = `${BASE_EVENT_SELECT} WHERE e.status IN ('approved', 'accepted') ORDER BY e.created_at DESC;`;
  const res = await query(sql);
  return await formatEvents(res.rows);
}

/**
 * Retrieves a single event by ID.
 */
export async function getEventById(eventId) {
  const sql = `${BASE_EVENT_SELECT} WHERE e.id = $1;`;
  const res = await query(sql, [eventId]);
  return res.rows[0] ? await formatEvent(res.rows[0]) : null;
}

export default {
  normaliseRegistration,
  createEvent,
  getMyEvents,
  getApprovedEvents,
  getEventById,
};
