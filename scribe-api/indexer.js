const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const winston = require('winston');
const natural = require('natural');

const TfIdf = natural.TfIdf;

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

// Common English stopwords to filter out of search queries
const STOPWORDS = new Set([
  'what', 'is', 'it', 'how', 'do', 'you', 'a', 'an', 'the', 'for', 'to', 
  'in', 'on', 'at', 'by', 'of', 'and', 'or', 'but', 'are', 'this', 'that',
  'who', 'where', 'when', 'why', 'can', 'we', 'i', 'me', 'my', 'your', 'he',
  'she', 'they', 'them', 'us', 'our'
]);

class DocumentIndexer {
  constructor(dataDir = 'data') {
    this.dataDir = path.resolve(dataDir);
    // structure: Map { appCode => [doc1, doc2, ...] }
    this.index = new Map();
    // structure: Map { appCode => TfIdf }
    this.tfidfs = new Map();
  }

  getRepoPath(appCode) {
    return path.join(this.dataDir, appCode);
  }

  stemString(text) {
    if (!text) return '';
    return text.toLowerCase()
      .split(/\W+/)
      .filter(Boolean)
      .map(t => natural.PorterStemmer.stem(t))
      .join(' ');
  }

  /**
   * Recursively crawls a folder and extracts markdown documents.
   */
  async indexDirectory(appCode, repoPath) {
    const docs = [];
    
    const walk = (dir) => {
      const list = fs.readdirSync(dir);
      list.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (file.endsWith('.md')) {
          try {
            const relPath = path.relative(repoPath, fullPath);
            const doc = this.parseMarkdownFile(fullPath, relPath, appCode);
            docs.push(doc);
          } catch (err) {
            logger.error(`Error processing file ${fullPath}: ${err.message}`);
          }
        }
      });
    };

    if (fs.existsSync(repoPath)) {
      walk(repoPath);
    }
    
    this.index.set(appCode, docs);
    
    // Initialize TF-IDF for this application
    const tfidf = new TfIdf();
    docs.forEach((doc) => {
      // Build a search document. We repeat the title and keywords to give them extra weight
      const searchBody = `${doc.title} ${doc.title} ${doc.title} ${doc.keywords.join(' ')} ${doc.keywords.join(' ')} ${doc.content}`;
      const stemmedBody = this.stemString(searchBody);
      tfidf.addDocument(stemmedBody);
    });
    this.tfidfs.set(appCode, tfidf);
    
    logger.info(`Successfully indexed ${docs.length} files with TF-IDF for application '${appCode}'`);
    return docs.length;
  }

  /**
   * Parses front-matter metadata and file content.
   */
  parseMarkdownFile(filePath, relPath, appCode) {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Split front matter
    const frontMatterReg = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
    const match = content.match(frontMatterReg);
    
    let meta = {};
    let body = content;

    if (match) {
      const frontMatterText = match[1];
      body = match[2];
      try {
        meta = yaml.load(frontMatterText) || {};
      } catch (e) {
        logger.error(`YAML parse error in ${filePath}: ${e.message}`);
      }
    }

    // Clean metadata keys (lowercase)
    const cleanedMeta = {};
    for (const key of Object.keys(meta)) {
      cleanedMeta[key.toLowerCase()] = meta[key];
    }

    const fileBasename = path.basename(filePath, '.md');
    
    // Normalize keywords
    let keywords = cleanedMeta.keywords || [];
    if (typeof keywords === 'string') {
      keywords = keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    } else if (Array.isArray(keywords)) {
      keywords = keywords.map(k => String(k).trim().toLowerCase()).filter(Boolean);
    } else {
      keywords = [];
    }

    return {
      file_path: relPath,
      title: cleanedMeta.title || fileBasename.charAt(0).toUpperCase() + fileBasename.slice(1),
      application: cleanedMeta.application || appCode,
      module: cleanedMeta.module || 'General',
      url: cleanedMeta.url || `/${fileBasename}`,
      menu: cleanedMeta.menu || `General > ${fileBasename.charAt(0).toUpperCase() + fileBasename.slice(1)}`,
      keywords: keywords,
      content: body.trim()
    };
  }

  /**
   * Performs basic NLP greeting and utility checks.
   */
  detectGreeting(query) {
    const clean = query.toLowerCase().trim().replace(/[?!.]/g, '');
    
    // 1. Time queries
    if (clean.includes('time is it') || clean.includes('what time') || clean === 'time') {
      const now = new Date();
      const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `The current time is **${timeString}**.`;
    }

    // 2. Date queries
    if (clean.includes('date today') || clean.includes('what is the date') || clean.includes("today's date") || clean === 'date' || clean === 'today') {
      const now = new Date();
      const dateString = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      return `Today is **${dateString}**.`;
    }

    // 3. Identity / Name queries
    if (clean.includes('who are you') || clean.includes('your name') || clean.includes('what is scribe')) {
      return "I'm Scribe, your product documentation assistant. I can guide you through our product features and help you navigate. Ask me anything about Nmail or EmaCloud!";
    }

    // 4. Greetings
    const greetings = ['hi', 'hello', 'hey', 'yo', 'good morning', 'good afternoon', 'good evening', 'howdy', 'sup', 'whats up', 'how are you', 'how are you doing'];
    if (greetings.includes(clean) || greetings.some(g => clean.startsWith(g + ' ') || clean === g)) {
      return "Hello! I'm Scribe, your documentation assistant. Ask me a question about Nmail or EmaCloud features!";
    }
    
    // 5. Thanks
    const thanks = ['thanks', 'thank you', 'ty', 'appreciate it', 'awesome'];
    if (thanks.includes(clean) || thanks.some(t => clean.startsWith(t + ' '))) {
      return "You're very welcome! Let me know if you need help with anything else.";
    }

    return null;
  }

  /**
   * Performs Phase 1 scoring search.
   * Leverages TF-IDF to filter out irrelevant matching.
   */
  search(appCode, query) {
    const docs = this.index.get(appCode) || [];
    if (!query) {
      return docs.map(d => ({ score: 1, doc: d }));
    }

    const queryLower = query.toLowerCase().trim();
    const allQueryTokens = queryLower.split(/\W+/).filter(Boolean);
    
    // Filter out common stopwords to avoid generic word matching
    const queryTokens = allQueryTokens.filter(t => !STOPWORDS.has(t));

    // If query has only stopwords remaining, treat it as a generic request with no specific matches
    if (queryTokens.length === 0) {
      return [];
    }

    const queryTokensStemmed = queryTokens.map(t => natural.PorterStemmer.stem(t));
    const stemmedQuery = queryTokensStemmed.join(' ');

    // Retrieve TF-IDF matches for this query (stemmed search)
    const tfidf = this.tfidfs.get(appCode);
    const tfidfScores = {};
    if (tfidf && stemmedQuery) {
      tfidf.tfidfs(stemmedQuery, (idx, measure) => {
        tfidfScores[idx] = measure;
      });
    }

    const results = [];

    docs.forEach((doc, idx) => {
      const tfidfMeasure = tfidfScores[idx] || 0;
      
      let score = 0;
      const matches = [];

      // 1. Title matching (unstemmed & stemmed checks)
      const titleLower = doc.title.toLowerCase();
      const titleTokens = titleLower.split(/\W+/).filter(Boolean);
      const stemmedTitleTokens = titleTokens.map(t => natural.PorterStemmer.stem(t));
      
      if (titleLower === queryLower) {
        score += 100;
        matches.push('exact_title');
      } else if (titleLower.includes(queryLower)) {
        score += 50;
        matches.push('substring_title');
      } else {
        const queryStemmedStr = queryTokensStemmed.join(' ');
        const titleStemmedStr = stemmedTitleTokens.join(' ');
        if (titleStemmedStr === queryStemmedStr) {
          score += 80;
          matches.push('stemmed_exact_title');
        } else if (titleStemmedStr.includes(queryStemmedStr)) {
          score += 40;
          matches.push('stemmed_substring_title');
        } else {
          const titleTokenMatches = queryTokensStemmed.filter(t => stemmedTitleTokens.includes(t)).length;
          if (titleTokenMatches > 0) {
            score += titleTokenMatches * 15;
            matches.push('title_tokens');
          }
        }
      }

      // 2. Keyword matching (stemmed keyword checks)
      const stemmedKeywords = doc.keywords.map(k => natural.PorterStemmer.stem(k));
      const keywordMatches = queryTokensStemmed.filter(t => stemmedKeywords.includes(t)).length;
      if (keywordMatches > 0) {
        score += keywordMatches * 30;
        matches.push('keywords');
      }

      // 3. File path / name matching
      const pathLower = doc.file_path.toLowerCase();
      if (pathLower.includes(queryLower)) {
        score += 40;
        matches.push('file_path');
      }

      // 4. Content matching (TF-IDF weighted)
      if (tfidfMeasure > 0) {
        score += Math.min(tfidfMeasure * 40, 50);
        matches.push('tfidf_content');
      }

      // Skip document if TF-IDF overlap is very low AND no direct title/keyword/path match is found
      if (tfidfMeasure < 0.05 && matches.length === 0) {
        return;
      }

      if (score > 0) {
        results.push({ score, matches, doc });
      }
    });

    // Sort descending by score
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * Natural language query interface returning a structured answer card.
   */
  queryAnswer(appCode, query) {
    // 1. Detect greetings / chat intents first
    const greeting = this.detectGreeting(query);
    if (greeting) {
      return {
        answer: greeting,
        url: null,
        document: null,
        isSmallTalk: true
      };
    }

    // 2. Search index
    const searchResults = this.search(appCode, query);
    
    if (searchResults.length === 0) {
      return {
        answer: `I'm sorry, I couldn't find any documentation matching your question in the '${appCode}' workspace. Try typing key terms like "watchdog" or "campaign".`,
        url: null,
        document: null,
        isSmallTalk: false
      };
    }

    const bestMatch = searchResults[0];
    const doc = bestMatch.doc;

    // Formulate a structured guidance response
    const answer = `${doc.title} is available under **${doc.menu}**.\n\n### Description:\n${this.extractSummary(doc.content)}`;

    return {
      answer: answer,
      url: doc.url,
      document: doc
    };
  }

  extractSummary(content) {
    const lines = content.split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
      
    if (lines.length === 0) return '';
    
    const summary = lines.slice(0, 3).join('\n\n');
    return summary.length > 400 ? summary.substring(0, 397) + '...' : summary;
  }
}

module.exports = DocumentIndexer;
