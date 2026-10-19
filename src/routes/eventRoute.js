import express from 'express';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { uploadPosters } from '../middlewares/uploadMiddleware.js';
import {
  createEventController,
  getMyEventsController,
  getApprovedEventsController,
  getAllEventsController,
  getEventLaneController,
  getEventPoolController,
  getEventByIdController,
  shareEventRedirectController,
} from '../controllers/eventController.js';

const router = express.Router();

router.post('/add-event', authenticateToken, uploadPosters, createEventController);
router.get('/my/events', authenticateToken, getMyEventsController);
router.get('/approved', authenticateToken, getApprovedEventsController);
router.get('/all', authenticateToken, getAllEventsController);
router.get('/lane', authenticateToken, getEventLaneController);
router.get('/pool', authenticateToken, getEventPoolController);
router.get('/share/:eventId', shareEventRedirectController);
router.get('/:eventId', getEventByIdController);

export default router;

