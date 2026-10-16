import { pool } from '../src/config/db.js';

async function updateEventsToSuperadmin() {
  const client = await pool.connect();

  try {
    console.log('🚀 [Events Update] Updating all existing events to superadmin...');

    // 1. Drop foreign key constraint on created_by if present so 'superadmin' is unrestricted
    await client.query(`
      ALTER TABLE events DROP CONSTRAINT IF EXISTS events_created_by_fkey;
    `);
    console.log('✔ Foreign key constraint events_created_by_fkey dropped/checked.');

    // 2. Also ensure a superadmin user exists in users table just in case other queries join on users
    await client.query(`
      INSERT INTO users (id, username, email, mobile_number, password_hash, role)
      VALUES (
        'superadmin',
        'superadmin',
        'superadmin@eventpath.app',
        '0000000000',
        'SUPERADMIN_LOCKED_ACCOUNT',
        'admin'
      )
      ON CONFLICT DO NOTHING;
    `);
    console.log('✔ Superadmin user verified in users table.');

    // 3. Update all existing events
    const updateRes = await client.query(`
      UPDATE events
      SET created_by = 'superadmin',
          creator_role = 'superadmin',
          updated_at = CURRENT_TIMESTAMP;
    `);
    console.log(`✔ Successfully updated ${updateRes.rowCount} events in "events" table.`);

    // 4. Verify the updated rows
    const verifyRes = await client.query(`
      SELECT id, event_name, created_by, creator_role 
      FROM events 
      LIMIT 5;
    `);
    console.log('\nSample updated events:');
    console.table(verifyRes.rows);

    // 5. Total count check
    const countRes = await client.query(`
      SELECT 
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE created_by = 'superadmin') as superadmin_created_by,
        COUNT(*) FILTER (WHERE creator_role = 'superadmin') as superadmin_creator_role
      FROM events;
    `);
    console.log('\nVerification summary:');
    console.table(countRes.rows);

    console.log('✅ [Events Update] All existing events are now created_by: "superadmin" and creator_role: "superadmin"!');
    process.exit(0);
  } catch (err) {
    console.error('❌ [Events Update] Failed:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

updateEventsToSuperadmin();
