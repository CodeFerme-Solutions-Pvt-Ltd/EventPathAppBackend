import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { pool } from '../src/config/db.js';
import { uploadToBucket } from '../src/services/storageService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const keyPath = path.resolve(__dirname, '../../backend/functions/config/serviceAccountKey.json');
const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

const fbApp = initializeApp({
  credential: cert(serviceAccount),
  storageBucket: 'codeferme-solutions.firebasestorage.app',
}, 'fix-media-migrator');

const bucket = getStorage(fbApp).bucket();

async function fixMedia() {
  console.log('Searching for event_media entries with Firebase Storage URLs...');
  const res = await pool.query("SELECT id, event_id, url, is_primary, display_order FROM event_media WHERE url LIKE '%firebasestorage%' ORDER BY event_id, display_order;");

  console.log(`Found ${res.rows.length} rows to migrate to S3.`);

  for (const row of res.rows) {
    const { id, event_id, url, is_primary, display_order } = row;
    try {
      // Extract the file path in Firebase Storage from the URL
      // E.g.: .../o/events%2FDRv4PtjuFcd0H8y7Dh2i%2Fposter_1_1792035378907.jpg?alt=media
      const pathMatch = url.match(/\/o\/([^?]+)/);
      if (!pathMatch) {
        console.warn(`Could not parse storage path from url: ${url}`);
        continue;
      }
      const rawPath = decodeURIComponent(pathMatch[1]);
      console.log(`Downloading "${rawPath}" from Firebase Storage...`);
      
      const [buffer] = await bucket.file(rawPath).download();
      const ext = rawPath.endsWith('.png') ? 'png' : 'jpg';
      const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
      
      const s3Key = display_order === 1
        ? `events/${event_id}.${ext}`
        : `events/${event_id}/${display_order}.${ext}`;

      console.log(`Uploading to AWS S3 key: "${s3Key}" (${buffer.length} bytes)...`);
      const { url: s3Url } = await uploadToBucket({
        key: s3Key,
        buffer,
        contentType,
      });

      console.log(`Updating database row ${id} with S3 URL: ${s3Url}`);
      await pool.query(
        'UPDATE event_media SET url = $1, storage_key = $2 WHERE id = $3;',
        [s3Url, s3Key, id]
      );
      console.log(`✓ Fixed media for event ${event_id} (order: ${display_order})`);
    } catch (err) {
      console.error(`❌ Failed to migrate row ${id} (${url}):`, err.message);
    }
  }

  console.log('\n--- Final Verification of event_media ---');
  const allMedia = await pool.query('SELECT event_id, url, is_primary, display_order FROM event_media ORDER BY event_id, display_order;');
  console.log(`Total event_media rows: ${allMedia.rows.length}`);
  const remainingFb = allMedia.rows.filter(r => r.url.includes('firebasestorage'));
  console.log(`Remaining Firebase URLs: ${remainingFb.length}`);
  for (const m of allMedia.rows) {
    console.log(`  [${m.event_id}] order=${m.display_order} primary=${m.is_primary} -> ${m.url}`);
  }

  process.exit(0);
}

fixMedia().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
