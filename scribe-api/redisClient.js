const { createClient } = require('redis');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

let client = null;
let isConnected = false;

// In-memory fallback DB for session history
const memoryDb = new Map();

async function connectRedis() {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  logger.info(`Connecting to Redis at ${redisUrl}...`);
  
  client = createClient({ url: redisUrl });

  client.on('error', (err) => {
    logger.warn(`Redis client error: ${err.message}. Falling back to in-memory session store.`);
    isConnected = false;
  });

  client.on('connect', () => {
    logger.info('Redis connected successfully.');
  });

  client.on('ready', () => {
    isConnected = true;
    logger.info('Redis client ready.');
  });

  try {
    await client.connect();
  } catch (err) {
    logger.warn(`Failed to connect to Redis: ${err.message}. Using in-memory session store.`);
    isConnected = false;
  }
}

function getSessionKey(application, userId, sessionId) {
  // Key format: scribe:{application}:{userId}:{sessionId}
  return `scribe:${application}:${userId}:${sessionId}`;
}

async function getSessionHistory(application, userId, sessionId) {
  const key = getSessionKey(application, userId, sessionId);
  if (isConnected && client) {
    try {
      const data = await client.get(key);
      return data ? JSON.parse(data) : [];
    } catch (err) {
      logger.error(`Error reading from Redis for key ${key}: ${err.message}`);
    }
  }
  
  // Fallback
  return memoryDb.get(key) || [];
}

async function saveSessionMessage(application, userId, sessionId, sender, message, url = null) {
  const key = getSessionKey(application, userId, sessionId);
  let history = await getSessionHistory(application, userId, sessionId);
  
  // Add new message (store url for assistant messages to support cache lookup)
  const entry = { sender, message, timestamp: new Date().toISOString() };
  if (url !== null) entry.url = url;
  history.push(entry);

  // Limit to maximum 10 messages total (last 5 user and 5 assistant)
  if (history.length > 10) {
    history = history.slice(-10);
  }

  if (isConnected && client) {
    try {
      // Store history with 24 hours expiry (86400 seconds)
      await client.set(key, JSON.stringify(history), {
        EX: 86400
      });
      return history;
    } catch (err) {
      logger.error(`Error writing to Redis for key ${key}: ${err.message}`);
    }
  }

  // Fallback
  memoryDb.set(key, history);
  return history;
}

async function deleteSession(application, userId, sessionId) {
  const key = getSessionKey(application, userId, sessionId);
  logger.info(`Deleting session: ${key}`);
  
  if (isConnected && client) {
    try {
      await client.del(key);
    } catch (err) {
      logger.error(`Error deleting Redis key ${key}: ${err.message}`);
    }
  }
  
  memoryDb.delete(key);
}

async function flushApplicationSessions(application) {
  const pattern = `scribe:${application}:*`;
  logger.info(`Flushing all cached sessions for application '${application}' (pattern: ${pattern})`);

  // Flush from Redis using SCAN (non-blocking, safe for production)
  if (isConnected && client) {
    try {
      let cursor = 0;
      do {
        const reply = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = reply.cursor;
        if (reply.keys.length > 0) {
          await client.del(reply.keys);
          logger.info(`Deleted ${reply.keys.length} Redis session keys for '${application}'`);
        }
      } while (cursor !== 0);
    } catch (err) {
      logger.error(`Error flushing Redis sessions for ${application}: ${err.message}`);
    }
  }

  // Flush in-memory fallback
  for (const key of memoryDb.keys()) {
    if (key.startsWith(`scribe:${application}:`)) {
      memoryDb.delete(key);
    }
  }
}

module.exports = {
  connectRedis,
  getSessionHistory,
  saveSessionMessage,
  deleteSession,
  flushApplicationSessions,
  getIsConnected: () => isConnected
};
