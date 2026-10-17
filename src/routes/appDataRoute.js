import express from 'express';
import {
  getAppData,
  getAppUpdateConfig,
  getOrganizers,
  addPreference,
  addOrganizer,
} from '../controllers/appDataController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', getAppData);
router.get('/organizers', getOrganizers);
router.get('/update-config', getAppUpdateConfig);
router.post('/add-preference', authenticateToken, addPreference);
router.post('/add-organizer', authenticateToken, addOrganizer);

export default router;
