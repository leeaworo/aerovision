const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const isProduction = process.env.VERCEL === '1';

// Target path outside your project directory
const targetDir = 'C:\\sky_shield\\dicon-offline-tiles';
const dbPath = path.join(targetDir, 'dicon_registry.db');

// Ensure C:\sky_shield\dicon-offline-tiles exists locally before connecting
if (!isProduction && !fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Connect directly to Turso on Vercel, or replicate one-way to dicon_registry.db locally
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
        syncInterval: 60, // Pulls cloud updates every 60s when internet is available
        offline: true,    // Prevents crashes if you run locally without internet
      }
);

async function initDatabase() {
  try {
    if (isProduction) {
      const schemaPath = path.resolve(__dirname, '../database/schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await db.executeMultiple(schemaSql);
        console.log('Database tables verified/created successfully.');
      }
    } else {
      await db.sync();
      console.log('Synced cloud database to local replica at:', dbPath);
    }
  } catch (err) {
    console.error('Database initialization/sync notice:', err.message);
  }
}

initDatabase();

module.exports = db;
