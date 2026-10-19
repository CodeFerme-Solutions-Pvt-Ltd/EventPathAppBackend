import express from 'express';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import {
  getHiringAlertsController,
  createHiringAlertController,
} from '../controllers/hiringAlertController.js';

const router = express.Router();

router.get('/', authenticateToken, getHiringAlertsController);
router.post('/', authenticateToken, createHiringAlertController);

export default router;
