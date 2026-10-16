import { sendOtp as sendOtpService, verifyOtp as verifyOtpService } from '../services/otpService.js';

export async function sendOtp(req, res) {
  try {
    const { mobileNumber } = req.body;
    const result = await sendOtpService(mobileNumber);
    return res.status(200).json({
      success: true,
      message: 'OTP sent successfully via WhatsApp.',
      ...result,
    });
  } catch (error) {
    console.error('Error in sendOtp:', error.message);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
}

export async function verifyOtp(req, res) {
  try {
    const { mobileNumber, otp } = req.body;
    const result = await verifyOtpService(mobileNumber, otp);
    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully.',
      ...result,
    });
  } catch (error) {
    console.error('Error in verifyOtp:', error.message);
    const status = error.status || 500;
    return res.status(status).json({ error: error.message });
  }
}

export default {
  sendOtp,
  verifyOtp,
};
