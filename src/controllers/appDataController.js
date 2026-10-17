import {
  getAppDataFromDb,
  getAppUpdateConfigFromDb,
  addPreferenceToDb,
  addOrganizerToDb,
} from '../services/appDataService.js';

export async function getAppData(req, res) {
  try {
    const data = await getAppDataFromDb();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Error in getAppData:', error);
    return res.status(500).json({ error: 'Failed to retrieve application configuration data.' });
  }
}

export async function getAppUpdateConfig(req, res) {
  try {
    const config = await getAppUpdateConfigFromDb();
    return res.status(200).json(config);
  } catch (error) {
    console.error('Error in getAppUpdateConfig:', error);
    return res.status(500).json({ error: 'Failed to retrieve app update configuration.' });
  }
}

export async function addPreference(req, res) {
  try {
    const { key, value } = req.body;
    if (!key || !value) {
      return res.status(400).json({ error: 'Both key and value are required.' });
    }

    const result = await addPreferenceToDb(key, value);
    return res.status(200).json({
      success: true,
      message: 'Preference added successfully.',
      ...result,
    });
  } catch (error) {
    console.error('Error in addPreference:', error);
    return res.status(500).json({ error: error.message || 'Failed to add preference.' });
  }
}

export async function addOrganizer(req, res) {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Organizer name is required.' });
    }

    const result = await addOrganizerToDb(name);
    return res.status(200).json({
      success: true,
      message: 'Organizer added successfully.',
      ...result,
    });
  } catch (error) {
    console.error('Error in addOrganizer:', error);
    return res.status(500).json({ error: error.message || 'Failed to add organizer.' });
  }
}

export async function getOrganizers(req, res) {
  try {
    const { getOrganizersFromDb } = await import('../services/appDataService.js');
    const organizers = await getOrganizersFromDb();
    return res.status(200).json({
      success: true,
      organizers,
    });
  } catch (error) {
    console.error('Error in getOrganizers:', error);
    return res.status(500).json({ success: false, error: 'Failed to retrieve organizers.' });
  }
}

export default {
  getAppData,
  getAppUpdateConfig,
  getOrganizers,
  addPreference,
  addOrganizer,
};

