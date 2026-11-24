const path = require('path');
const fs = require('fs');
require('dotenv').config();

const isProduction = process.env.VERCEL === '1';

// Use pure HTTP client on Vercel (avoids native Linux binary crashes),
// and full client locally for SQLite file replication
const { createClient } = isProduction
  ? require('@libsql/client/web')
  : require('@libsql/client');

const targetDir = 'C:\\sky_shield\\dicon-offline-tiles';
const dbPath = path.join(targetDir, 'dicon_registry.db');

if (!isProduction && !fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const db = createClient(
  isProduction
    ? {
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      }
    : {
        url: `file:${dbPath}`,
        syncUrl: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_READ_ONLY_TOKEN,
        syncInterval: 60,
        offline: true,
      }
);

async function initDatabase() {
  try {
    if (!isProduction) {
      await db.sync();
      console.log('Synced cloud database to local replica at:', dbPath);
    }
  } catch (err) {
    console.error('Database sync notice:', err.message);
  }
}

initDatabase();

module.exports = db;
