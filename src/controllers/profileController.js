import { getUserProfile, updateUserPreferences } from '../services/profileService.js';

export async function getProfileController(req, res) {
  try {
    const user = req.user;
    if (!user || (!user.userId && !user.docId)) {
      return res.status(401).json({ error: 'User session invalid. Please log in again.' });
    }

    const userId = user.userId || user.docId;
    const profile = await getUserProfile(userId);

    return res.status(200).json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error('Error in getProfileController:', error);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Failed to fetch user profile.' });
  }
}

export async function updatePreferencesController(req, res) {
  try {
    const user = req.user;
    if (!user || (!user.userId && !user.docId)) {
      return res.status(401).json({ error: 'User session invalid. Please log in again.' });
    }

    const userId = user.userId || user.docId;
    const { preferences, locationPreferences } = req.body;

    const updatedProfile = await updateUserPreferences(userId, {
      preferences,
      locationPreferences,
    });

    return res.status(200).json({
      success: true,
      message: 'Preferences updated successfully.',
      profile: updatedProfile,
    });
  } catch (error) {
    console.error('Error in updatePreferencesController:', error);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message || 'Failed to update user preferences.' });
  }
}

export default {
  getProfileController,
  updatePreferencesController,
};
