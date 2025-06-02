import { MongoClient } from 'mongodb';

let client;
let db;

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = MONGODB_URI ? new URL(MONGODB_URI).pathname.substring(1) : 'pavlov_bot_db'; // Extract DB name or use default

async function connect() {
  if (db) {
    return db;
  }
  if (!MONGODB_URI) {
    console.error("DatabaseService: MONGODB_URI is not defined in .env. Database connection failed.");
    throw new Error("MONGODB_URI not configured.");
  }
  try {
    client = new MongoClient(MONGODB_URI, {
      // useNewUrlParser: true, // No longer needed in v4+ of the driver
      // useUnifiedTopology: true, // No longer needed in v4+ of the driver
    });
    await client.connect();
    db = client.db(DB_NAME);
    console.log(`DatabaseService: Successfully connected to MongoDB at ${MONGODB_URI.split('@').pop().split('/')[0]} - Database: ${DB_NAME}`);
    
    // Optional: Create indexes for collections if they don't exist
    // Example for a future chat_history collection with TTL
    // await db.collection('chat_history').createIndex({ "timestamp": 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 }); // 7 days TTL
    // console.log("DatabaseService: Ensured indexes for collections.");

    return db;
  } catch (err) {
    console.error('DatabaseService: Failed to connect to MongoDB', err);
    process.exit(1); // Exit if DB connection fails
  }
}

async function getDb() {
  if (!db) {
    return await connect();
  }
  return db;
}

async function close() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('DatabaseService: MongoDB connection closed.');
  }
}

export default {
  connect,
  getDb,
  close
}; 