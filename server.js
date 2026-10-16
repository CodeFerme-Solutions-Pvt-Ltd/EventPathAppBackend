import app from './src/app.js';
import { config } from './src/config/envConfig.js';
import { pool } from './src/config/db.js';

const PORT = config.port;

const server = app.listen(PORT, () => {
  console.log(`🚀 EventPath AWS Backend is running on port ${PORT}...`);
  console.log(`📡 Environment: ${config.nodeEnv}`);
});

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('\n🛑 Gracefully shutting down...');
  server.close(async () => {
    await pool.end();
    console.log('🔒 Database pool closed. Server terminated.');
    process.exit(0);
  });
});
