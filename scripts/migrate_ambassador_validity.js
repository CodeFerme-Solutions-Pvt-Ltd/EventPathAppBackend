import { query } from '../src/config/db.js';

async function migrate() {
  try {
    console.log('Adding valid_till and certificate_issued columns...');
    await query(`
      ALTER TABLE ambassador_profiles 
      ADD COLUMN IF NOT EXISTS valid_till TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 year'),
      ADD COLUMN IF NOT EXISTS certificate_issued BOOLEAN NOT NULL DEFAULT false;
    `);

    console.log('Backfilling existing ambassador rows...');
    await query(`
      UPDATE ambassador_profiles 
      SET valid_till = created_at + INTERVAL '1 year' 
      WHERE valid_till IS NULL;
    `);

    const result = await query(`
      SELECT user_id, organization_name, status, valid_till, certificate_issued 
      FROM ambassador_profiles;
    `);
    console.log('Updated ambassador profiles:', result.rows);
    console.log('Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
