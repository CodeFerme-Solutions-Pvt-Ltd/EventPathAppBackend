import { getEventLaneEvents } from './eventLaneService.js';
import { getEventPoolEvents } from './eventPoolService.js';

/**
 * Fetches approved events for Event Pool via eventPoolService.
 * (Category based across all locations, showing all technical, non-technical, and sports events).
 */
export async function getPreferredEvents(userId) {
  return await getEventPoolEvents(userId);
}

/**
 * Fetches approved events for Event Lane via eventLaneService.
 * (Location, Categories, Tech/Non-Tech events, and Sports matching).
 */
export async function getDistrictEvents(userId) {
  return await getEventLaneEvents(userId);
}

export default {
  getPreferredEvents,
  getDistrictEvents,
};


