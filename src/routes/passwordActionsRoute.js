import express from 'express';
import {
  forgotPasswordController,
  verifyForgotPasswordOtpController,
  resetPasswordController,
} from '../controllers/passwordActionsController.js';

const router = express.Router();

router.post('/forgot-password', forgotPasswordController);
router.post('/verify-forgot-password-otp', verifyForgotPasswordOtpController);
router.post('/reset-password', resetPasswordController);

export default router;
