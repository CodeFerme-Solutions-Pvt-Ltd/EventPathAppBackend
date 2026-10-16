import crypto from 'crypto';
import { query } from '../config/db.js';
import { whatsappService } from '../whatsapp/whatsappService.js';

/**
 * Normalizes phone number format (+91 prefix for 10-digit Indian numbers).
 */
export function formatPhoneNumber(number) {
  if (!number) return '';
  const cleaned = String(number).replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  return number.startsWith('+') ? `+${cleaned}` : `+${cleaned}`;
}

/**
 * Generates and sends a 6-digit OTP via WhatsApp, storing hashed OTP in PostgreSQL.
 * Enforces a 60-second cooldown rate limit and a 10-minute expiry.
 */
export async function sendOtp(mobileNumber) {
  if (!mobileNumber || String(mobileNumber).trim() === '') {
    const error = new Error('Mobile number is required.');
    error.status = 400;
    throw error;
  }

  const formattedMobileNumber = formatPhoneNumber(mobileNumber);

  // Check 60-second rate-limiting cooldown
  const checkSql = `SELECT created_at FROM otps WHERE mobile_number = $1;`;
  const existing = await query(checkSql, [formattedMobileNumber]);

  if (existing.rows.length > 0) {
    const lastCreated = new Date(existing.rows[0].created_at).getTime();
    const now = Date.now();
    const cooldownMs = 60 * 1000;

    if (now - lastCreated < cooldownMs) {
      const secondsLeft = Math.ceil((cooldownMs - (now - lastCreated)) / 1000);
      const error = new Error(`Please wait ${secondsLeft} seconds before requesting another OTP.`);
      error.status = 429;
      throw error;
    }
  }

  // Generate 6-digit secure OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Insert or update in PostgreSQL otps table
  const upsertSql = `
    INSERT INTO otps (mobile_number, otp_hash, attempts, expires_at, created_at)
    VALUES ($1, $2, 0, $3, CURRENT_TIMESTAMP)
    ON CONFLICT (mobile_number) DO UPDATE
    SET otp_hash = EXCLUDED.otp_hash,
        attempts = 0,
        expires_at = EXCLUDED.expires_at,
        created_at = CURRENT_TIMESTAMP;
  `;
  await query(upsertSql, [formattedMobileNumber, otpHash, expiresAt]);

  console.log(`[Auth] OTP generated for ${formattedMobileNumber}: ${otp} (Expires in 10 mins)`);

  // Dispatch OTP via WhatsApp
  await whatsappService({
    to: formattedMobileNumber,
    type: 'OTP_AUTH',
    data: { otp },
  });

  return { success: true, formattedMobileNumber };
}

/**
 * Verifies entered OTP with brute-force attempt protection (max 3 failed tries).
 */
export async function verifyOtp(mobileNumber, otp) {
  if (!mobileNumber || !otp) {
    const error = new Error('Mobile number and OTP are required.');
    error.status = 400;
    throw error;
  }

  const formattedMobileNumber = formatPhoneNumber(mobileNumber);
  const selectSql = `SELECT otp_hash, attempts, expires_at FROM otps WHERE mobile_number = $1;`;
  const res = await query(selectSql, [formattedMobileNumber]);

  if (res.rows.length === 0) {
    const error = new Error('No OTP requested for this mobile number, or it has expired.');
    error.status = 400;
    throw error;
  }

  const { otp_hash, attempts, expires_at } = res.rows[0];

  // Expiry check
  if (new Date(expires_at).getTime() < Date.now()) {
    await query(`DELETE FROM otps WHERE mobile_number = $1;`, [formattedMobileNumber]);
    const error = new Error('OTP has expired. Please request a new one.');
    error.status = 400;
    throw error;
  }

  // Brute-force check (3 attempts max)
  if (attempts >= 3) {
    await query(`DELETE FROM otps WHERE mobile_number = $1;`, [formattedMobileNumber]);
    const error = new Error('Too many incorrect OTP attempts. Please request a new OTP.');
    error.status = 400;
    throw error;
  }

  const inputHash = crypto.createHash('sha256').update(String(otp).trim()).digest('hex');

  if (inputHash !== otp_hash) {
    await query(`UPDATE otps SET attempts = attempts + 1 WHERE mobile_number = $1;`, [formattedMobileNumber]);
    const error = new Error('Invalid OTP.');
    error.status = 400;
    throw error;
  }

  // Success: delete OTP so it cannot be reused
  await query(`DELETE FROM otps WHERE mobile_number = $1;`, [formattedMobileNumber]);

  return { success: true, formattedMobileNumber };
}

export default {
  formatPhoneNumber,
  sendOtp,
  verifyOtp,
};
