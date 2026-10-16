import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import { formatPhoneNumber, sendOtp, verifyOtp } from './otpService.js';
import { config } from '../config/envConfig.js';

/**
 * Initiates forgot password flow: checks user existence and triggers OTP.
 */
export async function forgotPassword(mobileNumber) {
  if (!mobileNumber || String(mobileNumber).trim() === '') {
    const error = new Error('Mobile number is required.');
    error.status = 400;
    throw error;
  }

  const formattedMobileNumber = formatPhoneNumber(mobileNumber);

  // Check if user exists in users table
  const checkRes = await query(`SELECT id FROM users WHERE mobile_number = $1;`, [formattedMobileNumber]);
  if (checkRes.rows.length === 0) {
    const error = new Error('A user with this mobile number is not registered.');
    error.status = 404;
    throw error;
  }

  return await sendOtp(mobileNumber);
}

/**
 * Verifies forgot password OTP and returns a 15-minute reset authorization token.
 */
export async function verifyForgotPasswordOtp(mobileNumber, otp) {
  const result = await verifyOtp(mobileNumber, otp);

  const token = jwt.sign(
    { mobileNumber: result.formattedMobileNumber, action: 'reset-password' },
    config.jwtSecret,
    { expiresIn: '15m' }
  );

  return {
    success: true,
    token,
    mobileNumber: result.formattedMobileNumber,
  };
}

/**
 * Resets user password using the short-lived reset token.
 */
export async function resetPassword(token, newPassword) {
  if (!token) {
    const error = new Error('Reset token is required.');
    error.status = 400;
    throw error;
  }
  if (!newPassword || newPassword.length < 6) {
    const error = new Error('Password must be at least 6 characters.');
    error.status = 400;
    throw error;
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwtSecret);
  } catch (err) {
    const error = new Error('Invalid or expired reset token.');
    error.status = 401;
    throw error;
  }

  if (decoded.action !== 'reset-password' || !decoded.mobileNumber) {
    const error = new Error('Invalid reset token action.');
    error.status = 400;
    throw error;
  }

  const formattedMobileNumber = decoded.mobileNumber;
  const passwordHash = crypto.createHash('sha256').update(newPassword).digest('hex');

  const updateRes = await query(
    `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE mobile_number = $2 RETURNING id;`,
    [passwordHash, formattedMobileNumber]
  );

  if (updateRes.rows.length === 0) {
    const error = new Error('User not found.');
    error.status = 404;
    throw error;
  }

  return {
    success: true,
    message: 'Password reset successful.',
  };
}

export default {
  forgotPassword,
  verifyForgotPasswordOtp,
  resetPassword,
};
