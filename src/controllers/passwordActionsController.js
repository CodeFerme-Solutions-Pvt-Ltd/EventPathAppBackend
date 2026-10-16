import {
  forgotPassword,
  verifyForgotPasswordOtp,
  resetPassword,
} from '../services/passwordActionsService.js';

export async function forgotPasswordController(req, res) {
  try {
    const { mobileNumber } = req.body;
    const result = await forgotPassword(mobileNumber);
    return res.status(200).json({
      success: true,
      message: 'Password reset OTP sent successfully via WhatsApp.',
      ...result,
    });
  } catch (error) {
    console.error('Error in forgotPasswordController:', error.message);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
}

export async function verifyForgotPasswordOtpController(req, res) {
  try {
    const { mobileNumber, otp } = req.body;
    const result = await verifyForgotPasswordOtp(mobileNumber, otp);
    return res.status(200).json({
      success: true,
      message: 'OTP verified. You may now reset your password.',
      ...result,
    });
  } catch (error) {
    console.error('Error in verifyForgotPasswordOtpController:', error.message);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
}

export async function resetPasswordController(req, res) {
  try {
    const { token, newPassword } = req.body;
    const result = await resetPassword(token, newPassword);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in resetPasswordController:', error.message);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
}

export default {
  forgotPasswordController,
  verifyForgotPasswordOtpController,
  resetPasswordController,
};
