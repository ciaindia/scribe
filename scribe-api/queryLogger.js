const fs = require('fs');
const path = require('path');

// Resolve LOGS_DIR: supports relative (from scribe-api/) or absolute paths
const rawLogsDir = process.env.LOGS_DIR || './logs';
const LOGS_DIR = path.isAbsolute(rawLogsDir)
  ? rawLogsDir
  : path.resolve(__dirname, rawLogsDir);

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * Returns the path for today's query log file.
 * Files rotate daily: logs/queries-2026-06-12.jsonl
 */
function getTodayLogPath() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(LOGS_DIR, `queries-${today}.jsonl`);
}

/**
 * Appends a query entry to today's log file.
 * Each line is a self-contained JSON object (JSONL format).
 *
 * @param {Object} entry
 * @param {string} entry.application  - App code (e.g. 'nmail')
 * @param {string} entry.userId       - User identifier
 * @param {string} entry.sessionId    - Session ID
 * @param {string} entry.question     - Raw user question
 * @param {string|null} entry.url     - Matched doc URL, or null if no match
 * @param {boolean} entry.cacheHit    - Whether answer came from session cache
 * @param {string} entry.answerType   - 'doc_match' | 'small_talk' | 'no_match'
 */
function logQuery(entry) {
  const record = {
    ts: new Date().toISOString(),
    application: entry.application,
    userId: entry.userId,
    sessionId: entry.sessionId,
    question: entry.question,
    url: entry.url || null,
    cacheHit: entry.cacheHit || false,
    answerType: entry.answerType || 'unknown'
  };

  try {
    fs.appendFileSync(getTodayLogPath(), JSON.stringify(record) + '\n', 'utf8');
  } catch (err) {
    // Non-fatal — never crash the API over a logging failure
    console.error(`[QueryLogger] Failed to write log: ${err.message}`);
  }
}

/**
 * Reads all log files (or just today's) and returns parsed entries.
 * @param {number} days - How many days back to read (default: all)
 */
function readLogs(days = null) {
  const files = fs.readdirSync(LOGS_DIR)
    .filter(f => f.startsWith('queries-') && f.endsWith('.jsonl'))
    .sort()
    .reverse(); // newest first

  const targetFiles = days ? files.slice(0, days) : files;
  const entries = [];

  for (const file of targetFiles) {
    const filePath = path.join(LOGS_DIR, file);
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch (_) {
        // skip malformed lines
      }
    }
  }

  return entries;
}

/**
 * Summarizes log entries into analytics.
 * Returns: total queries, top questions, unanswered questions, per-app breakdown.
 */
function summarize(entries) {
  const questionCount = {};
  const unanswered = {};
  const perApp = {};
  let cacheHits = 0;

  for (const e of entries) {
    // Count per question
    const q = e.question.toLowerCase().trim();
    questionCount[q] = (questionCount[q] || 0) + 1;

    // Track unanswered (no doc match, not small talk)
    if (e.answerType === 'no_match') {
      unanswered[q] = (unanswered[q] || 0) + 1;
    }

    // Per application breakdown
    if (!perApp[e.application]) {
      perApp[e.application] = { total: 0, noMatch: 0, cacheHits: 0 };
    }
    perApp[e.application].total++;
    if (e.answerType === 'no_match') perApp[e.application].noMatch++;
    if (e.cacheHit) perApp[e.application].cacheHits++;

    if (e.cacheHit) cacheHits++;
  }

  // Sort top questions by frequency
  const topQuestions = Object.entries(questionCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([question, count]) => ({ question, count }));

  // Sort unanswered by frequency (these = gaps in your docs)
  const docGaps = Object.entries(unanswered)
    .sort((a, b) => b[1] - a[1])
    .map(([question, count]) => ({ question, count }));

  return {
    totalQueries: entries.length,
    cacheHitRate: entries.length > 0
      ? `${((cacheHits / entries.length) * 100).toFixed(1)}%`
      : '0%',
    topQuestions,
    docGaps,
    perApp
  };
}

module.exports = { logQuery, readLogs, summarize };
