import express from 'express';
import { getAppData, addPreference, addOrganizer } from '../controllers/appDataController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', getAppData);
router.post('/add-preference', authenticateToken, addPreference);
router.post('/add-organizer', authenticateToken, addOrganizer);

export default router;
