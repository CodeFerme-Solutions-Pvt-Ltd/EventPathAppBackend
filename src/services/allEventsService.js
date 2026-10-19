import { query } from '../config/db.js';
import { BASE_EVENT_SELECT, formatEvents } from './eventQueryHelper.js';

/**
 * Service function for All Events:
 * Fetches all approved events in the system without any preference or category filtering.
 * Returns every approved event ordered by creation date descending.
 * 
 * @returns {Promise<Array<Object>>} Formatted list of all approved events
 */
export async function getAllEvents() {
  const sql = `${BASE_EVENT_SELECT} WHERE e.status IN ('approved', 'accepted') ORDER BY e.created_at DESC;`;
  const res = await query(sql);
  return await formatEvents(res.rows);
}

export default {
  getAllEvents,
};
