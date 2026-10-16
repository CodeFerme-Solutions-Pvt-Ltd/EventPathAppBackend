import express from 'express';
import { registerUser } from '../controllers/registrationController.js';
import { registerAmbassador } from '../controllers/ambassadorController.js';
import { uploadAmbassadorPicture } from '../middlewares/uploadMiddleware.js';

const router = express.Router();

// User registration
router.post('/register', registerUser);

// Ambassador registration with avatar picture
router.post('/register-ambassador', uploadAmbassadorPicture, registerAmbassador);

export default router;
