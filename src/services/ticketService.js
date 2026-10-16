import crypto from 'crypto';
import { query } from '../config/db.js';
import { uploadTicketAttachment } from './storageService.js';

/**
 * Creates a support ticket in PostgreSQL and uploads any attachment
 * directly to the Amazon Lightsail Storage Bucket ('tickets/' folder).
 */
export async function createTicket(userId, ticketData, file) {
  const { username, email, phone, description } = ticketData;

  if (!username || !email || !phone || !description) {
    throw new Error('Username, email, phone, and description are required fields.');
  }

  const ticketId = crypto.randomUUID();

  // Upload attachment image to Lightsail Bucket if present
  let imageUrl = null;
  if (file) {
    const uploadRes = await uploadTicketAttachment(ticketId, file);
    imageUrl = uploadRes.url;
  }

  const sql = `
    INSERT INTO support_tickets (id, user_id, username, email, phone, description, image_url, status, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING *;
  `;

  const res = await query(sql, [
    ticketId,
    userId || null,
    username.trim(),
    email.trim(),
    phone.trim(),
    description.trim(),
    imageUrl,
  ]);

  return {
    ticketId,
    ...res.rows[0],
  };
}

export default {
  createTicket,
};
