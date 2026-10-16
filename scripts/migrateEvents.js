import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { pool, query } from '../src/config/db.js';
import { uploadToBucket, getPublicUrl } from '../src/services/storageService.js';
import { normaliseRegistration } from '../src/services/eventService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
const keyPath = path.resolve(__dirname, '../../backend/functions/config/serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('❌ serviceAccountKey.json not found at:', keyPath);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
const fbApp = initializeApp({
  credential: cert(serviceAccount),
  storageBucket: 'codeferme-solutions.firebasestorage.app',
}, 'event-migrator');
const db = getFirestore(fbApp);
const fbBucket = getStorage(fbApp).bucket();

function toDateString(val, fallback = '2026-01-01') {
  if (!val) return fallback;
  if (val.toDate && typeof val.toDate === 'function') {
    return val.toDate().toISOString().split('T')[0];
  }
  if (typeof val === 'string') {
    return val.split('T')[0];
  }
  return fallback;
}

function toTimestamp(val) {
  if (!val) return new Date();
  if (val.toDate && typeof val.toDate === 'function') {
    return val.toDate();
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

function normalizeList(field) {
  if (!field) return [];
  if (Array.isArray(field)) return field.map(String).filter(Boolean);
  if (typeof field === 'string') return [field];
  if (typeof field === 'object') {
    return Object.entries(field)
      .filter(([_, v]) => v === true)
      .map(([k]) => k);
  }
  return [];
}

async function ensureUserExists(client, userId) {
  if (!userId) return null;

  // 1. Check if user already exists in PostgreSQL
  const checkRes = await client.query('SELECT id FROM users WHERE id = $1;', [userId]);
  if (checkRes.rows.length > 0) return userId;

  // 2. Fetch user doc from Firestore
  try {
    const userDoc = await db.collection('EventPath').doc('main').collection('users').doc(userId).get();
    if (userDoc.exists) {
      const u = userDoc.data();
      const username = u.username || `user_${userId.slice(0, 8)}`;
      const email = u.email || `${userId}@eventpath.app`;
      const mobileNumber = u.mobileNumber || `+910000000000`;
      const passwordHash = u.password || 'migrated_user_hash';
      const role = u.role === 'ambassador' ? 'ambassador' : 'user';

      // Check if email or mobile collision exists
      const colCheck = await client.query(
        'SELECT id FROM users WHERE email = $1 OR mobile_number = $2;',
        [email, mobileNumber]
      );
      if (colCheck.rows.length > 0) {
        return colCheck.rows[0].id;
      }

      await client.query(
        `INSERT INTO users (id, username, email, mobile_number, password_hash, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO NOTHING;`,
        [userId, username, email, mobileNumber, passwordHash, role, toTimestamp(u.createdAt)]
      );
      console.log(`    ↳ Migrated user account for event creator: ${username} (${userId})`);
      return userId;
    }
  } catch (err) {
    console.warn(`    ⚠️ Could not migrate creator user ${userId}:`, err.message);
  }

  return null;
}

async function migrateImageToS3(eventId, url, index = 1) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) {
    return { url: '', storageKey: '' };
  }

  // If already on our S3 bucket, skip re-uploading
  if (url.includes('eventpath-images.s3')) {
    const storageKey = url.split('.amazonaws.com/')[1] || '';
    return { url, storageKey };
  }

  try {
    let buffer;
    let contentType = 'image/jpeg';
    let ext = 'jpg';

    // If it's a Firebase Storage URL, download using Admin SDK to bypass public read restrictions
    if (url.includes('firebasestorage.googleapis.com')) {
      const pathMatch = url.match(/\/o\/([^?]+)/);
      if (pathMatch) {
        const rawPath = decodeURIComponent(pathMatch[1]);
        console.log(`    ↳ Downloading from Firebase Storage bucket: ${rawPath}...`);
        const [dlBuf] = await fbBucket.file(rawPath).download();
        buffer = dlBuf;
        ext = rawPath.endsWith('.png') ? 'png' : 'jpg';
        contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
      }
    }

    if (!buffer) {
      console.log(`    ↳ Fetching image from: ${url.slice(0, 60)}...`);
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const arrayBuf = await resp.arrayBuffer();
      buffer = Buffer.from(arrayBuf);
      contentType = resp.headers.get('content-type') || 'image/jpeg';
      ext = contentType.includes('png') ? 'png' : 'jpg';
    }

    const key = index === 1 ? `events/${eventId}.${ext}` : `events/${eventId}/${index}.${ext}`;

    const uploaded = await uploadToBucket({
      key,
      buffer,
      contentType,
    });

    console.log(`    ✓ Uploaded to S3: ${uploaded.url}`);
    return { url: uploaded.url, storageKey: key };
  } catch (err) {
    console.warn(`    ⚠️ Image upload failed for event ${eventId}: ${err.message}. Retaining original URL.`);
    return { url, storageKey: '' };
  }
}

export async function migrateAllEvents() {
  console.log('===================================================================');
  console.log('🚀 EVENTPATH EVENTS MIGRATION: FIRESTORE -> AWS POSTGRESQL + S3');
  console.log('===================================================================\n');

  console.log('[Firestore] Fetching events from EventPath/main/events...');
  const snapshot = await db.collection('EventPath').doc('main').collection('events').get();
  console.log(`[Firestore] Found ${snapshot.size} events to migrate.\n`);

  if (snapshot.size === 0) {
    console.log('No events to migrate.');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < snapshot.docs.length; i++) {
    const doc = snapshot.docs[i];
    const d = doc.data();
    // Generate fresh UUID instead of Firestore doc ID as instructed
    const eventId = crypto.randomUUID();
    const eventName = d.eventName || 'Untitled Event';

    console.log(`[${i + 1}/${snapshot.size}] Processing: "${eventName}"\n    ↳ Firestore ID: ${doc.id} -> New PostgreSQL UUID: ${eventId}`);

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Ensure creator user exists in users table to satisfy foreign key
      const createdBy = await ensureUserExists(client, d.createdBy);

      // 2. Insert into events table
      const mode = ['offline', 'online', 'hybrid'].includes((d.modeOfEvent || d.eventMode || '').toLowerCase())
        ? (d.modeOfEvent || d.eventMode).toLowerCase()
        : 'offline';

      const status = ['pending', 'approved', 'accepted', 'rejected'].includes((d.status || '').toLowerCase())
        ? d.status.toLowerCase()
        : 'approved';

      const createdAt = toTimestamp(d.createdAt);
      const updatedAt = toTimestamp(d.updatedOn || d.updatedAt);

      await client.query(
        `INSERT INTO events (
          id, event_name, description, organized_by, mode_of_event,
          website_url, created_by, creator_role, status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE
        SET event_name = EXCLUDED.event_name,
            description = EXCLUDED.description,
            organized_by = EXCLUDED.organized_by,
            mode_of_event = EXCLUDED.mode_of_event,
            website_url = EXCLUDED.website_url,
            created_by = EXCLUDED.created_by,
            creator_role = EXCLUDED.creator_role,
            status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at;`,
        [
          eventId,
          eventName,
          d.description || '',
          d.organizedBy || 'Independent',
          mode,
          d.websiteUrl || '',
          createdBy,
          d.role || d.creatorRole || 'user',
          status,
          createdAt,
          updatedAt,
        ]
      );

      // 3. Insert into event_schedules
      const startDate = toDateString(d.startDate, '2026-01-01');
      const endDate = toDateString(d.endDate, startDate);
      const startTime = String(d.startTime || '09:00').slice(0, 10);
      const endTime = String(d.endTime || '17:00').slice(0, 10);
      const noOfDays = Math.max(1, parseInt(d.noOfDays, 10) || 1);
      const isCustomDates = Boolean(d.isCustomDates);
      const eventDates = Array.isArray(d.eventDates) ? d.eventDates : [];
      const eventTimings = Array.isArray(d.eventTimings) ? d.eventTimings : [];

      await client.query(
        `INSERT INTO event_schedules (
          event_id, start_date, end_date, start_time, end_time,
          no_of_days, is_custom_dates, event_dates, event_timings, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, CURRENT_TIMESTAMP)
        ON CONFLICT (event_id) DO UPDATE
        SET start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            no_of_days = EXCLUDED.no_of_days,
            is_custom_dates = EXCLUDED.is_custom_dates,
            event_dates = EXCLUDED.event_dates,
            event_timings = EXCLUDED.event_timings,
            updated_at = CURRENT_TIMESTAMP;`,
        [
          eventId,
          startDate,
          endDate,
          startTime,
          endTime,
          noOfDays,
          isCustomDates,
          JSON.stringify(eventDates),
          JSON.stringify(eventTimings),
        ]
      );

      // 4. Insert into event_locations
      const locationPrefs = d.locationPreferences || {};
      await client.query(
        `INSERT INTO event_locations (
          event_id, venue_name, address, maps_url, location_preferences, updated_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, CURRENT_TIMESTAMP)
        ON CONFLICT (event_id) DO UPDATE
        SET venue_name = EXCLUDED.venue_name,
            address = EXCLUDED.address,
            maps_url = EXCLUDED.maps_url,
            location_preferences = EXCLUDED.location_preferences,
            updated_at = CURRENT_TIMESTAMP;`,
        [
          eventId,
          d.venueName || '',
          d.address || '',
          d.mapsUrl || '',
          JSON.stringify(locationPrefs),
        ]
      );

      // 5. Insert into event_registrations
      const normReg = normaliseRegistration(d.registration, startDate);
      await client.query(
        `INSERT INTO event_registrations (
          event_id, has_registration, fee_type, amount, slabs, last_date_to_register, additional_note, updated_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, CURRENT_TIMESTAMP)
        ON CONFLICT (event_id) DO UPDATE
        SET has_registration = EXCLUDED.has_registration,
            fee_type = EXCLUDED.fee_type,
            amount = EXCLUDED.amount,
            slabs = EXCLUDED.slabs,
            last_date_to_register = EXCLUDED.last_date_to_register,
            additional_note = EXCLUDED.additional_note,
            updated_at = CURRENT_TIMESTAMP;`,
        [
          eventId,
          normReg.hasRegistration,
          normReg.feeType,
          normReg.amount,
          JSON.stringify(normReg.slabs || []),
          normReg.lastDateToRegister ? toDateString(normReg.lastDateToRegister, null) : null,
          normReg.additionalNote || '',
        ]
      );

      // 6. Insert into event_preferences
      const rawPrefs = d.preferences || {};
      const categories = normalizeList(rawPrefs.categories || rawPrefs.category);
      const skills = normalizeList(rawPrefs.skills || rawPrefs.skill);
      const eventTypes = normalizeList(rawPrefs.eventTypes || rawPrefs.eventType);
      const interestAreas = normalizeList(rawPrefs.interests || rawPrefs.interest);

      await client.query(
        `INSERT INTO event_preferences (
          event_id, categories, skills, event_types, interest_areas, raw_preferences, updated_at
        )
        VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, CURRENT_TIMESTAMP)
        ON CONFLICT (event_id) DO UPDATE
        SET categories = EXCLUDED.categories,
            skills = EXCLUDED.skills,
            event_types = EXCLUDED.event_types,
            interest_areas = EXCLUDED.interest_areas,
            raw_preferences = EXCLUDED.raw_preferences,
            updated_at = CURRENT_TIMESTAMP;`,
        [
          eventId,
          JSON.stringify(categories),
          JSON.stringify(skills),
          JSON.stringify(eventTypes),
          JSON.stringify(interestAreas),
          JSON.stringify(rawPrefs),
        ]
      );

      // 7. Insert into event_contacts
      const contacts = Array.isArray(d.contacts) ? d.contacts : [];
      const addlDetails = Array.isArray(d.additionalDetails) ? d.additionalDetails : [];

      await client.query(
        `INSERT INTO event_contacts (
          event_id, contacts, additional_details, updated_at
        )
        VALUES ($1, $2::jsonb, $3::jsonb, CURRENT_TIMESTAMP)
        ON CONFLICT (event_id) DO UPDATE
        SET contacts = EXCLUDED.contacts,
            additional_details = EXCLUDED.additional_details,
            updated_at = CURRENT_TIMESTAMP;`,
        [
          eventId,
          JSON.stringify(contacts),
          JSON.stringify(addlDetails),
        ]
      );

      // 8. Migrate Posters to S3 and save into event_media
      // Remove old media rows for this event to avoid duplication
      await client.query('DELETE FROM event_media WHERE event_id = $1;', [eventId]);

      const sourceImages = Array.isArray(d.imageLinks) && d.imageLinks.length > 0
        ? d.imageLinks
        : d.imageLink
        ? [d.imageLink]
        : [];

      for (let imgIdx = 0; imgIdx < sourceImages.length; imgIdx++) {
        const rawImgUrl = sourceImages[imgIdx];
        const isPrimary = imgIdx === 0;

        const { url: s3Url, storageKey } = await migrateImageToS3(eventId, rawImgUrl, imgIdx + 1);

        if (s3Url) {
          await client.query(
            `INSERT INTO event_media (
              event_id, url, storage_key, media_type, display_order, is_primary, created_at
            )
            VALUES ($1, $2, $3, 'poster', $4, $5, CURRENT_TIMESTAMP);`,
            [eventId, s3Url, storageKey || null, imgIdx + 1, isPrimary]
          );
        }
      }

      await client.query('COMMIT');
      console.log(`  ✅ Successfully migrated event: "${eventName}"\n`);
      successCount++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  ❌ Failed to migrate event "${eventName}":`, err.message, '\n');
      failCount++;
    } finally {
      client.release();
    }
  }

  // Update app_stats
  try {
    const totalEventsRes = await query('SELECT count(*) FROM events;');
    const totalCount = parseInt(totalEventsRes.rows[0].count, 10);
    await query(
      `INSERT INTO app_stats (metric_name, count, updated_at)
       VALUES ('total_events_registered', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (metric_name) DO UPDATE SET count = $1, updated_at = CURRENT_TIMESTAMP;`,
      [totalCount]
    );
  } catch (statErr) {
    console.warn('Could not update app_stats:', statErr.message);
  }

  console.log('===================================================================');
  console.log(`🎉 MIGRATION FINISHED! Success: ${successCount}, Failed: ${failCount}`);
  console.log('===================================================================');
}

// Execute directly if run via CLI
if (process.argv[1] && process.argv[1].endsWith('migrateEvents.js')) {
  migrateAllEvents().then(async () => {
    await pool.end();
  }).catch(async (e) => {
    console.error('Fatal migration error:', e);
    await pool.end();
    process.exit(1);
  });
}
