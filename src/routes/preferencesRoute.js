import express from 'express';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { getPreferredEventsController } from '../controllers/eventController.js';

const router = express.Router();

router.get('/', authenticateToken, getPreferredEventsController);

export default router;
