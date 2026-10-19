import { createEvent, getMyEvents, getApprovedEvents, getEventById } from '../services/eventService.js';
import { getPreferredEvents, getDistrictEvents } from '../services/preferencesService.js';
import { getEventLaneEvents } from '../services/eventLaneService.js';
import { getEventPoolEvents } from '../services/eventPoolService.js';
import { getAllEvents } from '../services/allEventsService.js';

export async function createEventController(req, res) {
  try {
    const user = req.user;
    if (!user || (!user.userId && !user.docId)) {
      return res.status(401).json({ error: 'User session invalid. Please log in again.' });
    }

    const eventData = req.body;
    if (!eventData || typeof eventData !== 'object') {
      return res.status(400).json({ error: 'Invalid request body.' });
    }

    // Safely parse JSON strings from multipart request
    ['contacts', 'additionalDetails', 'registration', 'preferences', 'locationPreferences', 'eventDates', 'eventTimings'].forEach((key) => {
      if (typeof eventData[key] === 'string') {
        try { eventData[key] = JSON.parse(eventData[key]); } catch (_) {}
      }
    });

    if (typeof eventData.isCustomDates === 'string') {
      eventData.isCustomDates = eventData.isCustomDates === 'true';
    }
    if (eventData.noOfDays !== undefined) {
      eventData.noOfDays = parseInt(eventData.noOfDays, 10) || 1;
    }

    const result = await createEvent(eventData, req.files || [], user);

    return res.status(201).json({
      success: true,
      message: 'Event submitted successfully for review.',
      eventId: result.event_id,
      event: result,
    });
  } catch (error) {
    console.error('Error in createEventController:', error);
    const status = error.status || 400;
    return res.status(status).json({ error: error.message || 'Failed to create event.' });
  }
}

export async function getMyEventsController(req, res) {
  try {
    const user = req.user;
    if (!user || (!user.userId && !user.docId)) {
      return res.status(401).json({ error: 'User session invalid. Please log in again.' });
    }

    const userId = user.userId || user.docId;
    const events = await getMyEvents(userId);

    return res.status(200).json({
      success: true,
      events,
    });
  } catch (error) {
    console.error('Error in getMyEventsController:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch user events.' });
  }
}

export async function getApprovedEventsController(req, res) {
  try {
    const events = await getAllEvents();
    return res.status(200).json({
      success: true,
      events,
    });
  } catch (error) {
    console.error('Error in getApprovedEventsController:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch events.' });
  }
}

export async function getAllEventsController(req, res) {
  try {
    const events = await getAllEvents();
    return res.status(200).json({
      success: true,
      events,
    });
  } catch (error) {
    console.error('Error in getAllEventsController:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch all events.' });
  }
}

export async function getPreferredEventsController(req, res) {
  try {
    const user = req.user;
    if (!user || (!user.userId && !user.docId)) {
      return res.status(401).json({ error: 'User session invalid. Please log in again.' });
    }

    const userId = req.query.userId || user.userId || user.docId;
    const isDistrictOnly = req.query.districtOnly === 'true' || req.query.lane === 'true';
    const events = isDistrictOnly
      ? await getEventLaneEvents(userId)
      : await getEventPoolEvents(userId);

    return res.status(200).json({
      success: true,
      events,
    });
  } catch (error) {
    console.error('Error in getPreferredEventsController:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch preferred events.' });
  }
}

export async function getDistrictEventsController(req, res) {
  try {
    const user = req.user;
    if (!user || (!user.userId && !user.docId)) {
      return res.status(401).json({ error: 'User session invalid. Please log in again.' });
    }

    const userId = req.query.userId || user.userId || user.docId;
    const events = await getEventLaneEvents(userId);

    return res.status(200).json({
      success: true,
      events,
    });
  } catch (error) {
    console.error('Error in getDistrictEventsController:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch district events.' });
  }
}

export async function getEventLaneController(req, res) {
  try {
    const user = req.user;
    if (!user || (!user.userId && !user.docId)) {
      return res.status(401).json({ error: 'User session invalid. Please log in again.' });
    }

    const userId = req.query.userId || user.userId || user.docId;
    const events = await getEventLaneEvents(userId);

    return res.status(200).json({
      success: true,
      events,
    });
  } catch (error) {
    console.error('Error in getEventLaneController:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch Event Lane events.' });
  }
}

export async function getEventPoolController(req, res) {
  try {
    const user = req.user;
    if (!user || (!user.userId && !user.docId)) {
      return res.status(401).json({ error: 'User session invalid. Please log in again.' });
    }

    const userId = req.query.userId || user.userId || user.docId;
    const events = await getEventPoolEvents(userId);

    return res.status(200).json({
      success: true,
      events,
    });
  } catch (error) {
    console.error('Error in getEventPoolController:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch Event Pool events.' });
  }
}

export async function getEventByIdController(req, res) {
  try {
    const { eventId } = req.params;
    if (!eventId) {
      return res.status(400).json({ error: 'Event ID is required.' });
    }

    const event = await getEventById(eventId);
    if (!event) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    return res.status(200).json({
      success: true,
      event,
    });
  } catch (error) {
    console.error('Error in getEventByIdController:', error);
    return res.status(500).json({ error: 'Failed to fetch event details.' });
  }
}

export async function shareEventRedirectController(req, res) {
  try {
    const { eventId } = req.params;
    if (!eventId) {
      return res.status(400).send('Event ID is required');
    }

    const event = (await getEventById(eventId)) || { event_name: 'Event Invitation', description: 'Join us for this exciting event!' };

    const htmlResponse = `
<!DOCTYPE html>
<html>
<head>
    <title>EventPath - ${event.event_name || 'Event'}</title>
    <meta property="og:title" content="${event.event_name || 'Event Invitation'}" />
    <meta property="og:description" content="${event.description || 'Check out this event on EventPath!'}" />
    <meta property="og:image" content="${event.image_link || ''}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; text-align: center; padding: 50px 20px; background-color: #F5F5F7; color: #1A1A2E; }
        .card { max-width: 480px; margin: 0 auto; background: white; padding: 30px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border: 1px solid #E5E7EB; }
        .logo { font-size: 26px; font-weight: 800; color: #6C63FF; margin-bottom: 24px; letter-spacing: -0.5px; }
        h2 { font-size: 22px; font-weight: 700; margin-bottom: 12px; }
        p { font-size: 14px; color: #6B7280; line-height: 1.6; margin-bottom: 24px; }
        .btn { display: block; padding: 14px 24px; background-color: #6C63FF; color: white; text-decoration: none; border-radius: 12px; font-weight: bold; font-size: 15px; box-shadow: 0 4px 12px rgba(108, 99, 255, 0.2); }
        .btn:hover { background-color: #5b52e0; }
    </style>
</head>
<body>
    <div class="card">
        <div class="logo">EventPath</div>
        <h2>${event.event_name || 'Untitled Event'}</h2>
        <p>${event.description ? (event.description.length > 150 ? event.description.substring(0, 147) + '...' : event.description) : 'Check out this event details inside the EventPath App.'}</p>
        <p style="font-weight: 500; color: #1A1A2E;">Redirecting to the EventPath Mobile App...</p>
        <a href="eventpath://event/${eventId}" class="btn">Open App Directly</a>
    </div>
    <script>
        window.location.href = "eventpath://event/${eventId}";
    </script>
</body>
</html>
    `;
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(htmlResponse);
  } catch (e) {
    console.error('Error in shareEventRedirectController:', e);
    return res.status(500).send('Internal Server Error');
  }
}

export default {
  createEventController,
  getMyEventsController,
  getApprovedEventsController,
  getAllEventsController,
  getPreferredEventsController,
  getDistrictEventsController,
  getEventLaneController,
  getEventPoolController,
  getEventByIdController,
  shareEventRedirectController,
};
