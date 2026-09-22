'use strict';
require('dotenv').config();
const mongoose = require('mongoose');

// Fail fast instead of buffering queries when DB is not connected.
mongoose.set('bufferCommands', false);

let connected = false;

async function connectDB() {
  if (connected) return mongoose.connection;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[MongoDB] MONGODB_URI not set — running without database');
    return null;
  }

  try {
    await mongoose.connect(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 5000 });
    connected = true;
    console.log('[MongoDB] Connected');

    // Ensure TTL index for chat_history (expire after 30 days)
    try {
      const db = mongoose.connection.db;
      if (db) {
        await db.collection('chat_history').createIndex({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
      }
    } catch (e) {
      console.warn('[MongoDB] Failed to ensure chat_history TTL index:', e.message);
    }

    return mongoose.connection;
  } catch (err) {
    console.error('[MongoDB] Connection failed:', err.message);
    process.exit(1);
  }
}

module.exports = { connectDB, getConnection: () => mongoose.connection };
