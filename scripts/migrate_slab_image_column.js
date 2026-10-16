import { query } from '../src/config/db.js';

async function migrate() {
  try {
    console.log('Adding slab_image_url and slab_image_path columns to event_registrations...');
    await query(`
      ALTER TABLE event_registrations 
      ADD COLUMN IF NOT EXISTS slab_image_url TEXT,
      ADD COLUMN IF NOT EXISTS slab_image_path TEXT;
    `);

    const result = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'event_registrations';
    `);
    console.log('event_registrations columns:', result.rows);
    console.log('Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
