import { query } from '../config/db.js';
import { BASE_EVENT_SELECT, formatEvents } from './eventQueryHelper.js';

/**
 * Stars (bookmarks) an event for a user.
 */
export async function starEvent(userId, eventId) {
  if (!userId || !eventId) {
    const err = new Error('User ID and Event ID are required.');
    err.status = 400;
    throw err;
  }

  const sql = `
    INSERT INTO user_starred_events (user_id, event_id, created_at)
    VALUES ($1, $2, CURRENT_TIMESTAMP)
    ON CONFLICT (user_id, event_id) DO NOTHING;
  `;
  await query(sql, [userId, eventId]);

  return { success: true };
}

/**
 * Unstars (removes bookmark) an event for a user.
 */
export async function unstarEvent(userId, eventId) {
  if (!userId || !eventId) {
    const err = new Error('User ID and Event ID are required.');
    err.status = 400;
    throw err;
  }

  const sql = `DELETE FROM user_starred_events WHERE user_id = $1 AND event_id = $2;`;
  await query(sql, [userId, eventId]);

  return { success: true };
}

/**
 * Retrieves a user's starred event IDs and the full event details.
 */
export async function getStarredEvents(userId) {
  if (!userId) {
    const err = new Error('User ID is required.');
    err.status = 400;
    throw err;
  }

  const idsRes = await query(
    `SELECT event_id FROM user_starred_events WHERE user_id = $1 ORDER BY created_at DESC;`,
    [userId]
  );
  const starredIds = idsRes.rows.map((r) => r.event_id);

  if (starredIds.length === 0) {
    return { starredIds: [], events: [] };
  }

  const eventsRes = await query(
    `${BASE_EVENT_SELECT}
     INNER JOIN user_starred_events use_star ON e.id = use_star.event_id
     WHERE use_star.user_id = $1
     ORDER BY use_star.created_at DESC;`,
    [userId]
  );

  return {
    starredIds,
    events: await formatEvents(eventsRes.rows),
  };
}

export default {
  starEvent,
  unstarEvent,
  getStarredEvents,
};
