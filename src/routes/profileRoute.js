import express from 'express';
import { getProfileController, updatePreferencesController } from '../controllers/profileController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', authenticateToken, getProfileController);
router.put('/preferences', authenticateToken, updatePreferencesController);

export default router;
