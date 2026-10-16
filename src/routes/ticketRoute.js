import express from 'express';
import { createTicketController } from '../controllers/ticketController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { uploadTicketAttachment } from '../middlewares/uploadMiddleware.js';

const router = express.Router();

router.post('/create', authenticateToken, uploadTicketAttachment, createTicketController);

export default router;
