import { pool } from './src/config/db.js';

async function testConnection() {
  console.log('[Database Connection Test] Attempting connection to Amazon Lightsail PostgreSQL...');
  console.log(`Host: ${process.env.PGHOST}`);
  console.log(`Port: ${process.env.PGPORT}`);
  console.log(`Database: ${process.env.PGDATABASE}`);
  console.log(`User: ${process.env.PGUSER}`);
  console.log(`SSL: ${process.env.PGSSL}`);

  try {
    const client = await pool.connect();
    console.log('✅ Connected to database pool!');

    const res = await client.query('SELECT version(), current_database(), current_user, NOW() as current_time;');
    console.log('\n--- Connection Diagnostics ---');
    console.log('Database Name :', res.rows[0].current_database);
    console.log('Current User  :', res.rows[0].current_user);
    console.log('Server Time   :', res.rows[0].current_time);
    console.log('Version       :', res.rows[0].version);
    console.log('------------------------------\n');

    client.release();
    console.log('🎉 Database connection test SUCCESSFUL!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Database connection test FAILED:');
    console.error('Error Code   :', err.code);
    console.error('Error Message:', err.message);
    if (err.detail) console.error('Error Detail :', err.detail);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testConnection();
