import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyAllSchemas() {
  const schemaDir = __dirname;

  // Find all .sql files in schema directory and sort them numerically/alphabetically
  const files = fs
    .readdirSync(schemaDir)
    .filter((file) => file.endsWith('.sql') && file !== 'schema.sql')
    .sort();

  if (files.length === 0) {
    console.error('[Schema Migration] No SQL schema files found in', schemaDir);
    process.exit(1);
  }

  console.log(`[Schema Migration] Found ${files.length} schema files to apply:`);
  files.forEach((f) => console.log(`  - ${f}`));

  const client = await pool.connect();

  try {
    console.log('\n[Schema Migration] Connecting to PostgreSQL database...');
    await client.query('BEGIN');

    for (const file of files) {
      const filePath = path.join(schemaDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      console.log(`[Schema Migration] Applying: ${file}...`);
      await client.query(sql);
    }

    await client.query('COMMIT');
    console.log('\n✅ [Schema Migration] All schemas applied successfully to database!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ [Schema Migration] Migration failed. Rolled back all changes.');
    console.error('Error detail:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

applyAllSchemas();
