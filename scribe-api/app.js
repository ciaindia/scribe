const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const winston = require('winston');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const redisClient = require('./redisClient');
const DocumentIndexer = require('./indexer');
const queryLogger = require('./queryLogger');

// Setup logging
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

const app = express();
const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || 'scribe-secret-key-12345';

// Enable CORS and body parsers
app.use(cors());
app.use(express.json());

// Initialize indexer
const indexer = new DocumentIndexer(path.join(__dirname, 'data'));

// Load applications helper
function getApplications() {
  const filePath = path.join(__dirname, 'applications.json');
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      logger.error(`Error reading applications.json: ${err.message}`);
    }
  }
  return [];
}

// Public Endpoint: Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Endpoint: Reindex Application Docs
app.post('/api/reindex', async (req, res) => {
  const { application } = req.body;

  if (!application) {
    return res.status(400).json({ error: 'Application code is required' });
  }

  const apps = getApplications();
  const appConfig = apps.find(a => a.code === application);

  if (!appConfig) {
    return res.status(404).json({ error: 'Application config not found' });
  }

  try {
    logger.info(`Reindexing started for application: ${application}`);
    const repoPath = indexer.getRepoPath(application);
    const fileCount = await indexer.indexDirectory(application, repoPath);

    // Invalidate all cached session answers for this application so stale
    // responses are not served after doc changes.
    await redisClient.flushApplicationSessions(application);
    
    res.json({
      status: 'success',
      message: `Successfully indexed application documentation`,
      filesIndexed: fileCount
    });
  } catch (err) {
    logger.error(`Reindex error for ${application}: ${err.message}`);
    res.status(500).json({ error: `Reindex failed: ${err.message}` });
  }
});

// Endpoint: Chat Query
app.post('/api/chat', async (req, res) => {
  const { application, sessionId, question, userId } = req.body;

  if (!application || !sessionId || !question) {
    return res.status(400).json({ error: 'application, sessionId, and question are required' });
  }

  const normalizedUserId = userId || 'defaultUser';

  try {
    // 1. Load the last 10 messages from the session context window
    const history = await redisClient.getSessionHistory(application, normalizedUserId, sessionId);

    // 2. Cache-first lookup: scan history for an exact previous answer (case-insensitive)
    //    Pairs are stored as [user, assistant, user, assistant, ...]
    const questionNormalized = question.trim().toLowerCase();
    let cachedResult = null;

    for (let i = 0; i < history.length - 1; i++) {
      const entry = history[i];
      if (
        entry.sender === 'user' &&
        entry.message.trim().toLowerCase() === questionNormalized
      ) {
        const nextEntry = history[i + 1];
        if (nextEntry && nextEntry.sender === 'assistant') {
          cachedResult = { answer: nextEntry.message, url: nextEntry.url || null };
          break;
        }
      }
    }

    let answer, url, answerType;

    if (cachedResult) {
      // Serve from session cache — skip indexer
      logger.info(`Cache hit for question '${question}' in session ${sessionId}`);
      answer = cachedResult.answer;
      url = cachedResult.url;
      answerType = cachedResult.url ? 'doc_match' : 'small_talk';
    } else {
      // 3. Cache miss — run through the NLP indexer
      const queryResult = indexer.queryAnswer(application, question);
      answer = queryResult.answer;
      url = queryResult.url;
      answerType = queryResult.url ? 'doc_match' : (queryResult.isSmallTalk ? 'small_talk' : 'no_match');

      // Persist both messages so future identical questions can be served from cache
      await redisClient.saveSessionMessage(application, normalizedUserId, sessionId, 'user', question);
      await redisClient.saveSessionMessage(application, normalizedUserId, sessionId, 'assistant', answer, url);
    }

    // Log query for analytics
    queryLogger.logQuery({
      application,
      userId: normalizedUserId,
      sessionId,
      question,
      url,
      cacheHit: !!cachedResult,
      answerType
    });

    // 4. Return response
    res.json({ answer, url });
  } catch (err) {
    logger.error(`Chat handler error: ${err.message}`);
    res.status(500).json({ error: `Failed to process query: ${err.message}` });
  }
});

// Endpoint: Get Session History
app.get('/api/session', async (req, res) => {
  const { application, sessionId, userId } = req.query;

  if (!application || !sessionId) {
    return res.status(400).json({ error: 'application and sessionId are required' });
  }

  const normalizedUserId = userId || 'defaultUser';

  try {
    const history = await redisClient.getSessionHistory(application, normalizedUserId, sessionId);
    res.json(history);
  } catch (err) {
    logger.error(`Get session history error: ${err.message}`);
    res.status(500).json({ error: `Failed to fetch session history: ${err.message}` });
  }
});

// Endpoint: Delete Session
app.delete('/api/session', async (req, res) => {
  const { application, sessionId, userId } = req.body;

  if (!application || !sessionId) {
    return res.status(400).json({ error: 'application and sessionId are required' });
  }

  const normalizedUserId = userId || 'defaultUser';

  try {
    await redisClient.deleteSession(application, normalizedUserId, sessionId);
    res.json({ status: 'success', message: 'Session history deleted' });
  } catch (err) {
    logger.error(`Delete session error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint: Query Analytics
app.get('/api/analytics', (req, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days) : null;
    const application = req.query.application || null;

    let entries = queryLogger.readLogs(days);

    // Filter by application if specified
    if (application) {
      entries = entries.filter(e => e.application === application);
    }

    const summary = queryLogger.summarize(entries);
    res.json(summary);
  } catch (err) {
    logger.error(`Analytics error: ${err.message}`);
    res.status(500).json({ error: `Failed to generate analytics: ${err.message}` });
  }
});

// Initialize Redis and start server
async function startServer() {
  await redisClient.connectRedis();
  
  // Auto-index local directories on boot if they exist
  const apps = getApplications();
  for (const appConfig of apps) {
    try {
      const repoPath = indexer.getRepoPath(appConfig.code);
      if (fs.existsSync(repoPath)) {
        logger.info(`Auto-indexing local path on boot: ${repoPath}`);
        await indexer.indexDirectory(appConfig.code, repoPath);
      }
    } catch (err) {
      logger.warn(`Failed to auto-index local repo ${appConfig.code} on boot: ${err.message}`);
    }
  }

  app.listen(PORT, () => {
    logger.info(`Scribe API running on http://localhost:${PORT}`);
  });
}

startServer();

module.exports = app; // For testing
