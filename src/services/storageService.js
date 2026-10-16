import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { storageClient, BUCKET_NAME, BUCKET_ENDPOINT } from '../config/storageConfig.js';

/**
 * Builds the public URL for an uploaded object in the Lightsail Bucket.
 * 
 * @param {string} key - S3 object key (e.g., 'events/abc.jpg')
 * @returns {string} Fully qualified public URL
 */
export function getPublicUrl(key) {
  let host = BUCKET_ENDPOINT.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (host.startsWith(`${BUCKET_NAME}.`)) {
    return `https://${host}/${key}`;
  }
  return `https://${BUCKET_NAME}.${host}/${key}`;
}

/**
 * Generates an authenticated presigned URL for viewing an S3 object.
 * Valid for up to 7 days (604800 seconds).
 * Works regardless of S3 bucket public access block settings.
 * 
 * @param {string} keyOrUrl - Either the raw S3 key or full HTTPS URL
 * @param {number} [expiresIn=604800] - URL validity in seconds
 * @returns {Promise<string>} Accessible presigned URL
 */
export async function getPresignedViewUrl(keyOrUrl, expiresIn = 604800) {
  if (!keyOrUrl || typeof keyOrUrl !== 'string') return '';

  // If already presigned (contains AWS signature), return as-is
  if (keyOrUrl.includes('X-Amz-Signature=')) return keyOrUrl;

  let key = keyOrUrl;
  if (key.startsWith('http')) {
    const match = key.match(/amazonaws\.com\/(.+)$/);
    if (match) {
      key = decodeURIComponent(match[1]);
    } else {
      // External link not hosted on our S3
      return keyOrUrl;
    }
  }

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    return await getSignedUrl(storageClient, command, { expiresIn });
  } catch (err) {
    console.warn(`Could not generate presigned URL for key "${key}":`, err.message);
    return keyOrUrl;
  }
}

/**
 * Directly uploads a buffer to Amazon Lightsail Bucket without local disk storage.
 * 
 * @param {Object} params
 * @param {string} params.key - Destination key in the bucket (e.g., 'events/evt_123.jpg')
 * @param {Buffer} params.buffer - In-memory file buffer from multer
 * @param {string} params.contentType - MIME type (e.g. 'image/jpeg')
 * @returns {Promise<{ key: string, url: string }>} Upload details
 */
export async function uploadToBucket({ key, buffer, contentType }) {
  if (!buffer || buffer.length === 0) {
    throw new Error(`Cannot upload empty file to bucket for key: "${key}"`);
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentLength: buffer.length,
    ContentType: contentType || 'image/jpeg',
    ACL: 'public-read', // Bucket object public read
  });

  await storageClient.send(command);

  return {
    key,
    url: getPublicUrl(key),
  };
}

/**
 * Uploads event posters to the 'events/' folder in Lightsail Bucket.
 * Single poster: 'events/{eventId}.jpg'
 * Multiple posters: 'events/{eventId}/{index}.jpg'
 * 
 * @param {string} eventId - Unique event identifier
 * @param {Array<Express.Multer.File>} files - Multer memory-storage files
 * @returns {Promise<{ primaryUrl: string, allUrls: string[], allKeys: string[] }>}
 */
export async function uploadEventPosters(eventId, files) {
  if (!files || files.length === 0) {
    return { primaryUrl: '', allUrls: [], allKeys: [] };
  }

  const allUrls = [];
  const allKeys = [];

  if (files.length === 1) {
    const file = files[0];
    const ext = file.originalname?.split('.').pop() || 'jpg';
    const key = `events/${eventId}.${ext}`;

    const { url } = await uploadToBucket({
      key,
      buffer: file.buffer,
      contentType: file.mimetype || 'image/jpeg',
    });

    allUrls.push(url);
    allKeys.push(key);
  } else {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const index = i + 1;
      const ext = file.originalname?.split('.').pop() || 'jpg';
      const key = `events/${eventId}/${index}.${ext}`;

      const { url } = await uploadToBucket({
        key,
        buffer: file.buffer,
        contentType: file.mimetype || 'image/jpeg',
      });

      allUrls.push(url);
      allKeys.push(key);
    }
  }

  return {
    primaryUrl: allUrls[0] || '',
    allUrls,
    allKeys,
  };
}

/**
 * Uploads a slab registration fee table image to the event's folder:
 * Path: 'events/{eventId}/slab registration fee table/slab_table.{ext}'
 * 
 * @param {string} eventId - Unique event identifier
 * @param {Buffer|Express.Multer.File|string} fileOrBuffer - Multer file, Buffer, or base64
 * @param {string} [mimeType='image/jpeg'] - MIME type
 * @returns {Promise<{ key: string, url: string }>}
 */
export async function uploadSlabRegistrationImage(eventId, fileOrBuffer, mimeType = 'image/jpeg') {
  if (!fileOrBuffer) return { key: '', url: '' };

  let buffer;
  let contentType = mimeType;
  let ext = 'jpg';

  if (fileOrBuffer?.buffer) {
    buffer = fileOrBuffer.buffer;
    contentType = fileOrBuffer.mimetype || mimeType;
    ext = fileOrBuffer.originalname?.split('.').pop() || 'jpg';
  } else if (Buffer.isBuffer(fileOrBuffer)) {
    buffer = fileOrBuffer;
  } else if (typeof fileOrBuffer === 'string') {
    if (fileOrBuffer.startsWith('data:image')) {
      const match = fileOrBuffer.match(/^data:(image\/(\w+));base64,(.+)$/);
      if (match) {
        contentType = match[1];
        ext = match[2] || 'jpg';
        buffer = Buffer.from(match[3], 'base64');
      }
    } else {
      buffer = Buffer.from(fileOrBuffer, 'base64');
    }
  }

  if (!buffer || buffer.length === 0) {
    return { key: '', url: '' };
  }

  const key = `events/${eventId}/slab registration fee table/slab_table.${ext}`;
  const { url } = await uploadToBucket({
    key,
    buffer,
    contentType,
  });

  return { key, url };
}

/**
 * Uploads an ambassador profile avatar to the 'ambassadors/' folder in Lightsail Bucket.
 * Path: 'ambassadors/{userId}.jpg'
 * 
 * @param {string} userId - Unique ambassador user ID
 * @param {Buffer|Express.Multer.File} fileOrBuffer - Multer file object or raw Buffer
 * @param {string} [mimeType='image/jpeg'] - MIME type
 * @returns {Promise<{ key: string, url: string }>}
 */
export async function uploadAmbassadorAvatar(userId, fileOrBuffer, mimeType = 'image/jpeg') {
  let buffer;
  let contentType = mimeType;

  if (fileOrBuffer?.buffer) {
    buffer = fileOrBuffer.buffer;
    contentType = fileOrBuffer.mimetype || mimeType;
  } else if (Buffer.isBuffer(fileOrBuffer)) {
    buffer = fileOrBuffer;
  } else if (typeof fileOrBuffer === 'string') {
    // Handle base64 input if passed as string
    const cleanBase64 = fileOrBuffer.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
    buffer = Buffer.from(cleanBase64, 'base64');
  }

  if (!buffer || buffer.length === 0) {
    throw new Error('Ambassador profile picture buffer is required for upload.');
  }

  const key = `ambassadors/${userId}.jpg`;

  return await uploadToBucket({
    key,
    buffer,
    contentType,
  });
}

/**
 * Uploads support ticket attachment to the 'tickets/' folder in Lightsail Bucket.
 * Path: 'tickets/{ticketId}_{timestamp}.{ext}'
 * 
 * @param {string} ticketId - Unique ticket ID
 * @param {Express.Multer.File} file - Multer memory-storage file
 * @returns {Promise<{ key: string, url: string }>}
 */
export async function uploadTicketAttachment(ticketId, file) {
  if (!file || !file.buffer) {
    return { key: null, url: null };
  }

  const ext = file.originalname?.split('.').pop() || 'jpg';
  const key = `tickets/${ticketId}_${Date.now()}.${ext}`;

  return await uploadToBucket({
    key,
    buffer: file.buffer,
    contentType: file.mimetype || 'image/jpeg',
  });
}

/**
 * Deletes an object from the Lightsail Bucket.
 * 
 * @param {string} key - S3 object key to delete
 */
export async function deleteFromBucket(key) {
  if (!key) return;
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  await storageClient.send(command);
}

export default {
  uploadToBucket,
  uploadEventPosters,
  uploadAmbassadorAvatar,
  uploadTicketAttachment,
  deleteFromBucket,
  getPublicUrl,
  getPresignedViewUrl,
};
