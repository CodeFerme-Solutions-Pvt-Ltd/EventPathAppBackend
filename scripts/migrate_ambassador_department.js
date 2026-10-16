import { query } from '../src/config/db.js';

async function migrate() {
  try {
    console.log('Adding department column to ambassador_profiles...');
    await query(`
      ALTER TABLE ambassador_profiles 
      ADD COLUMN IF NOT EXISTS department VARCHAR(255);
    `);

    const result = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'ambassador_profiles' AND column_name = 'department';
    `);
    console.log('Column check:', result.rows);
    console.log('Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
