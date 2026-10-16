import express from 'express';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { uploadAmbassadorPicture } from '../middlewares/uploadMiddleware.js';
import {
  getAllAmbassadorsController,
  submitAmbassadorRequestController,
  getAmbassadorRequestStatusController,
  checkOrganizationAmbassadorController,
} from '../controllers/ambassadorController.js';

const router = express.Router();

// GET /api/ambassadors - Fetch all approved ambassadors
router.get('/', authenticateToken, getAllAmbassadorsController);

// GET /api/ambassadors/check-organization - Check if organization already has an ambassador
router.get('/check-organization', authenticateToken, checkOrganizationAmbassadorController);

// POST /api/ambassadors/request - Request ambassador role for a regular user
router.post('/request', authenticateToken, uploadAmbassadorPicture, submitAmbassadorRequestController);

// GET /api/ambassadors/request/status - Check current ambassador request status
router.get('/request/status', authenticateToken, getAmbassadorRequestStatusController);

export default router;
