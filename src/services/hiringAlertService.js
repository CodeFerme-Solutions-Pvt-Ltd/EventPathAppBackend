import crypto from 'crypto';
import { query } from '../config/db.js';

/**
 * Formats a raw PostgreSQL hiring_alerts row with both camelCase and snake_case properties.
 */
export function formatHiringAlert(row) {
  if (!row) return null;

  const id = row.id;
  const companyName = row.company_name || '';
  const positionName = row.position_name || '';
  const description = row.description || '';
  const applyLink = row.apply_link || '';
  const location = row.location || '';
  const contactName = row.contact_name || '';
  const contactInfo = row.contact_info || '';

  return {
    id,
    _id: id,
    companyName,
    company_name: companyName,
    positionName,
    position_name: positionName,
    role: positionName,
    description,
    applyLink,
    apply_link: applyLink,
    location,
    contactName,
    contact_name: contactName,
    contactInfo,
    contact_info: contactInfo,
    contact: {
      name: contactName,
      phoneOrEmail: contactInfo,
      info: contactInfo,
    },
    createdAt: row.created_at,
    created_at: row.created_at,
    updatedAt: row.updated_at,
    updated_at: row.updated_at,
  };
}

/**
 * Fetches all hiring alerts ordered by created_at descending.
 */
export async function getAllHiringAlerts() {
  const sql = `
    SELECT 
      id,
      company_name,
      position_name,
      description,
      apply_link,
      location,
      contact_name,
      contact_info,
      created_at,
      updated_at
    FROM hiring_alerts
    ORDER BY created_at DESC;
  `;
  const res = await query(sql);
  return res.rows.map(formatHiringAlert);
}

/**
 * Creates a new hiring alert in PostgreSQL.
 */
export async function createHiringAlert(data) {
  const {
    companyName,
    positionName,
    role,
    description,
    applyLink,
    location,
    contactName,
    contactInfo,
    contact,
  } = data;

  const effectiveCompany = (companyName || data.company_name || '').trim();
  const effectivePosition = (positionName || role || data.position_name || '').trim();

  if (!effectiveCompany) {
    const error = new Error('Company name is required.');
    error.status = 400;
    throw error;
  }
  if (!effectivePosition) {
    const error = new Error('Position name or role is required.');
    error.status = 400;
    throw error;
  }

  const id = crypto.randomUUID();
  const effectiveDescription = (description || '').trim();
  const effectiveApplyLink = (applyLink || data.apply_link || '').trim();
  const effectiveLocation = (location || '').trim();

  // Handle contact as object { name, phoneOrEmail } or separate fields
  let resolvedContactName = (contactName || data.contact_name || '').trim();
  let resolvedContactInfo = (contactInfo || data.contact_info || '').trim();

  if (contact && typeof contact === 'object') {
    if (!resolvedContactName && contact.name) resolvedContactName = String(contact.name).trim();
    if (!resolvedContactInfo) {
      resolvedContactInfo = String(contact.phoneOrEmail || contact.phone || contact.email || contact.info || '').trim();
    }
  }

  const sql = `
    INSERT INTO hiring_alerts (
      id,
      company_name,
      position_name,
      description,
      apply_link,
      location,
      contact_name,
      contact_info,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING *;
  `;

  const res = await query(sql, [
    id,
    effectiveCompany,
    effectivePosition,
    effectiveDescription,
    effectiveApplyLink,
    effectiveLocation,
    resolvedContactName,
    resolvedContactInfo,
  ]);

  return formatHiringAlert(res.rows[0]);
}

export default {
  formatHiringAlert,
  getAllHiringAlerts,
  createHiringAlert,
};
