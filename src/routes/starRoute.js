import express from 'express';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import {
  starEventController,
  unstarEventController,
  getStarredEventsController,
} from '../controllers/starController.js';

const router = express.Router();

// Retrieve all starred events
router.get('/', authenticateToken, getStarredEventsController);

// Flutter app paths (/stars/star/:eventId and /stars/unstar/:eventId)
router.post('/star/:eventId', authenticateToken, starEventController);
router.post('/unstar/:eventId', authenticateToken, unstarEventController);
router.delete('/unstar/:eventId', authenticateToken, unstarEventController);

// RESTful fallback aliases (/stars/:eventId)
router.post('/:eventId', authenticateToken, starEventController);
router.delete('/:eventId', authenticateToken, unstarEventController);

export default router;
