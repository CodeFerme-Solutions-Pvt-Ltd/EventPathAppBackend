import { getAllHiringAlerts, createHiringAlert } from '../services/hiringAlertService.js';

export async function getHiringAlertsController(req, res) {
  try {
    const alerts = await getAllHiringAlerts();
    return res.status(200).json({
      success: true,
      alerts,
    });
  } catch (error) {
    console.error('Error in getHiringAlertsController:', error);
    return res.status(500).json({
      error: error.message || 'Failed to fetch hiring alerts.',
    });
  }
}

export async function createHiringAlertController(req, res) {
  try {
    const alertData = req.body;
    if (!alertData || typeof alertData !== 'object') {
      return res.status(400).json({ error: 'Invalid request body.' });
    }

    const alert = await createHiringAlert(alertData);
    return res.status(201).json({
      success: true,
      message: 'Hiring alert created successfully.',
      alert,
    });
  } catch (error) {
    console.error('Error in createHiringAlertController:', error);
    const status = error.status || 500;
    return res.status(status).json({
      error: error.message || 'Failed to create hiring alert.',
    });
  }
}

export default {
  getHiringAlertsController,
  createHiringAlertController,
};
