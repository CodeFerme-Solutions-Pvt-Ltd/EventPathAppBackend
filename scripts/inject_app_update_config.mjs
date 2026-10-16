import { pool } from '../src/config/db.js';

/**
 * App Update Config Injection Script (.mjs)
 * Injects app update configuration matching UpdateScreen in eventpath frontend.
 *
 * Usage:
 *   node scripts/inject_app_update_config.mjs
 *   node scripts/inject_app_update_config.mjs --version 3.10.4 --available true
 */
async function injectAppUpdateConfig() {
  const client = await pool.connect();

  try {
    console.log('🚀 [App Update Config] Starting injection into PostgreSQL...');

    // 1. Ensure table and view exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_update_config (
          id VARCHAR(50) PRIMARY KEY DEFAULT 'default',
          title VARCHAR(255) NOT NULL DEFAULT 'Newer Version Available',
          update_link TEXT NOT NULL DEFAULT 'https://play.google.com/store/apps/details?id=com.codeferme.eventpath',
          about_update TEXT NOT NULL DEFAULT 'New performance improvements and bug fixes. A newer version is available. Update and continue the usage.',
          latest_version VARCHAR(50) NOT NULL DEFAULT '3.10.3',
          is_update_available BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE OR REPLACE VIEW app_update_config_view AS
      SELECT 
          id,
          title,
          update_link AS "updateLink",
          about_update AS "aboutUpdate",
          latest_version AS "latestVersion",
          is_update_available AS "isUpdateAvailable",
          created_at,
          updated_at
      FROM app_update_config;
    `);

    // 2. Parse command-line overrides if any
    const args = process.argv.slice(2);
    let title = 'Newer Version Available';
    let updateLink = 'https://play.google.com/store/apps/details?id=com.codeferme.eventpath';
    let aboutUpdate = 'New performance improvements and bug fixes. A newer version is available. Update and continue the usage.';
    let latestVersion = '3.10.3';
    let isUpdateAvailable = false;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--title' && args[i + 1]) title = args[++i];
      if (args[i] === '--link' && args[i + 1]) updateLink = args[++i];
      if (args[i] === '--about' && args[i + 1]) aboutUpdate = args[++i];
      if (args[i] === '--version' && args[i + 1]) latestVersion = args[++i];
      if (args[i] === '--available') isUpdateAvailable = args[++i] === 'true' || args[i] === '1';
    }

    // 3. Upsert the app update config
    const upsertSql = `
      INSERT INTO app_update_config (
        id,
        title,
        update_link,
        about_update,
        latest_version,
        is_update_available,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        update_link = EXCLUDED.update_link,
        about_update = EXCLUDED.about_update,
        latest_version = EXCLUDED.latest_version,
        is_update_available = EXCLUDED.is_update_available,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

    const res = await client.query(upsertSql, [
      'default',
      title,
      updateLink,
      aboutUpdate,
      latestVersion,
      isUpdateAvailable,
    ]);

    // 4. Query from camelCase view to match frontend UpdateScreen
    const viewRes = await client.query(`SELECT * FROM app_update_config_view WHERE id = 'default';`);
    const configData = viewRes.rows[0];

    console.log('\n✅ [App Update Config] Injected successfully into table "app_update_config"!');
    console.log('------------------------------------------------------------');
    console.log('Config formatted for frontend UpdateScreen:');
    console.log(JSON.stringify(configData, null, 2));
    console.log('------------------------------------------------------------');

    process.exit(0);
  } catch (err) {
    console.error('❌ [App Update Config] Injection failed:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

injectAppUpdateConfig();
