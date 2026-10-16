import express from 'express';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { getPreferredEventsController, getDistrictEventsController } from '../controllers/eventController.js';

const router = express.Router();

router.get('/', authenticateToken, getPreferredEventsController);
router.get('/district', authenticateToken, getDistrictEventsController);

export default router;
