import { starEvent, unstarEvent, getStarredEvents } from '../services/starService.js';

export async function starEventController(req, res) {
  try {
    const user = req.user;
    const userId = user.userId || user.docId;
    const { eventId } = req.params;

    const result = await starEvent(userId, eventId);
    return res.status(200).json({
      success: true,
      message: 'Event starred successfully.',
      ...result,
    });
  } catch (error) {
    console.error('Error in starEventController:', error);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Failed to star event.' });
  }
}

export async function unstarEventController(req, res) {
  try {
    const user = req.user;
    const userId = user.userId || user.docId;
    const { eventId } = req.params;

    const result = await unstarEvent(userId, eventId);
    return res.status(200).json({
      success: true,
      message: 'Event unstarred successfully.',
      ...result,
    });
  } catch (error) {
    console.error('Error in unstarEventController:', error);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Failed to unstar event.' });
  }
}

export async function getStarredEventsController(req, res) {
  try {
    const user = req.user;
    const userId = user.userId || user.docId;

    const result = await getStarredEvents(userId);
    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Error in getStarredEventsController:', error);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Failed to fetch starred events.' });
  }
}

export default {
  starEventController,
  unstarEventController,
  getStarredEventsController,
};
