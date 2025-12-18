const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const { setupAuthRoutes, authMiddleware } = require('./auth');

const app = express();

// ===========================================
// Configuration
// ===========================================
const CONFIG = {
  dataDir: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data'),
  bucketName: 'tick8-user-data', // Hardcoded as per plan
  port: process.env.PORT || 3000,
  filenamePattern: /^[a-zA-Z0-9_-]+\.json$/,
  snapshotIdPattern: /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]+$/,
  maxNoteLength: 500,
  maxPageSize: 100,
  defaultPageSize: 15
};

const CORS_OPTIONS = {
  origin: [
    'http://localhost:4200',
    'https://tick8-43c1a.web.app',
    'https://tick8-43c1a.firebaseapp.com'
  ],
  credentials: true
};

// ===========================================
// Storage Adapter Configuration
// ===========================================

// Abstract storage interface
class StorageAdapter {
  async init() { throw new Error('Not implemented'); }
  async exists(filePath) { throw new Error('Not implemented'); }
  async read(filePath) { throw new Error('Not implemented'); }
  async write(filePath, data) { throw new Error('Not implemented'); }
  async delete(filePath) { throw new Error('Not implemented'); }
  async list(dirPath) { throw new Error('Not implemented'); }
  async ensureDir(dirPath) { throw new Error('Not implemented'); }
}

class FileSystemAdapter extends StorageAdapter {
  constructor(baseDir) {
    super();
    this.baseDir = baseDir;
  }

  async init() {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  resolve(filePath) {
    // Prevent directory traversal
    const safePath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
    return path.join(this.baseDir, safePath);
  }

  async exists(filePath) {
    try {
      await fs.access(this.resolve(filePath));
      return true;
    } catch {
      return false;
    }
  }

  async read(filePath) {
    return await fs.readFile(this.resolve(filePath), 'utf8');
  }

  async write(filePath, data) {
    const fullPath = this.resolve(filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  }

  async delete(filePath) {
    await fs.unlink(this.resolve(filePath));
  }

  async list(dirPath) {
    try {
      return await fs.readdir(this.resolve(dirPath));
    } catch {
      return [];
    }
  }

  async ensureDir(dirPath) {
    await fs.mkdir(this.resolve(dirPath), { recursive: true });
  }
}

class GCSAdapter extends StorageAdapter {
  constructor(bucketName) {
    super();
    this.storage = new Storage();
    this.bucket = this.storage.bucket(bucketName);
    this.bucketName = bucketName;
  }

  async init() {
    console.log(`Using GCS Bucket: ${this.bucketName}`);
    // Check if bucket exists, logic could be added here
  }

  async exists(filePath) {
    const [exists] = await this.bucket.file(filePath).exists();
    return exists;
  }

  async read(filePath) {
    const [content] = await this.bucket.file(filePath).download();
    return content.toString('utf8');
  }

  async write(filePath, data) {
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    await this.bucket.file(filePath).save(content);
  }

  async delete(filePath) {
    await this.bucket.file(filePath).delete();
  }

  async list(dirPath) {
    // GCS is flat, so we list by prefix. 
    // Directory path in app usually corresponds to "userEmail/". 
    // We need to ensure it ends with / for prefix matching if it's a directory.
    const prefix = dirPath.endsWith('/') || dirPath === '' ? dirPath : `${dirPath}/`;

    // If asking for root, prefix might be empty or specific user folder
    const [files] = await this.bucket.getFiles({ prefix, delimiter: '/' });

    // Map full paths back to filenames relative to the prefix
    return files.map(f => path.basename(f.name)).filter(name => name !== '');
  }

  async ensureDir(dirPath) {
    // No-op in GCS usually, as folders are virtual.
    // However, creating a 0-byte object ending in / can verify existence, but typically not needed.
  }
}

// Determine which adapter to use
// Use GCS if we are in production (implied by not having a local setting override, or just always try GCS if configured)
// Ideally, check for an environment variable like NODE_ENV or specifically USE_GCS.
// For now, let's default to GCS if we are on Cloud Run (which usually sets K_SERVICE) or explicitly requested.
// But to ensure the local user workflow isn't broken, we might check connection or default to FS if simpler.
// Given strict instructions "Fix Data Persistence", we favor GCS.
// Let's use GCS if keys are present or we can access it; but safer to rely on explicit variable or default.
// Adding a check:
const useGCS = process.env.K_SERVICE || process.env.USE_GCS === 'true';

// Initialize Storage
let storage;
if (useGCS) {
  storage = new GCSAdapter(CONFIG.bucketName);
} else {
  // Fallback to local FS for local development without credentials
  storage = new FileSystemAdapter(CONFIG.dataDir);
  console.log('Using Local File System Storage');
}

// Initialize on startup
// storage.init().catch(console.error);

// ===========================================
// Middleware Setup
// ===========================================
app.use(cors(CORS_OPTIONS));
// Enable pre-flight for all routes
app.options(/.*/, cors(CORS_OPTIONS));

// Security headers for Google Auth (COOP/COEP)
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});

app.use(express.json({ limit: '10mb' }));
setupAuthRoutes(app);

// ===========================================
// Utility Functions
// ===========================================

/**
 * Check if a file exists (async version) - DEPRECATED in favor of storage.exists, but kept for minimal refactor if needed?
 * No, replacing calls is better.
 */
// async function fileExists(filepath) { ... } -> We will replace functions usage with storage.exists

/**
 * Sanitize email for use in file paths
 * Prevents path traversal attacks
 */
function sanitizeEmail(email) {
  if (!email || typeof email !== 'string') {
    throw new AppError('Invalid email', 400);
  }
  // Normalize to lowercase and remove any path-dangerous characters
  const sanitized = email.toLowerCase().replace(/[^a-z0-9@._-]/g, '_');
  // Additional safety: ensure no path traversal - not strictly needed for GCS keys but good practice
  if (sanitized.includes('..') || sanitized.includes('/') || sanitized.includes('\\')) {
    throw new AppError('Invalid email format', 400);
  }
  return sanitized;
}

/**
 * Sanitize filename to prevent path traversal attacks
 */
function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') {
    throw new AppError('Invalid filename', 400);
  }
  if (!CONFIG.filenamePattern.test(name)) {
    throw new AppError(
      'Invalid filename format. Use alphanumeric, hyphens, underscores, and .json extension only.',
      400
    );
  }
  return name;
}

/**
 * Validate snapshot ID format
 */
function validateSnapshotId(id) {
  if (!id || typeof id !== 'string') {
    throw new AppError('Invalid snapshot ID', 400);
  }
  if (!CONFIG.snapshotIdPattern.test(id)) {
    throw new AppError('Invalid snapshot ID format', 400);
  }
  return id;
}

/**
 * Validate vocab list format
 */
function validateVocabList(list) {
  if (!Array.isArray(list)) {
    throw new AppError('Content must be an array', 400);
  }

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== 'object') {
      throw new AppError(`Invalid item at index ${i}: must be an object`, 400);
    }
    if (!item.id || !item.word || !item.answer) {
      throw new AppError(`Invalid item at index ${i}: must have id, word, and answer`, 400);
    }
  }
}

/**
 * Validate course update fields (whitelist approach)
 */
function sanitizeCourseUpdate(updates) {
  const allowed = ['name', 'pageSize', 'order'];
  const sanitized = {};

  for (const key of allowed) {
    if (updates[key] !== undefined) {
      sanitized[key] = updates[key];
    }
  }

  // Validate pageSize if present
  if (sanitized.pageSize !== undefined) {
    const pageSize = parseInt(sanitized.pageSize, 10);
    if (isNaN(pageSize) || pageSize < 1 || pageSize > CONFIG.maxPageSize) {
      throw new AppError(`pageSize must be between 1 and ${CONFIG.maxPageSize}`, 400);
    }
    sanitized.pageSize = pageSize;
  }

  return sanitized;
}

// ===========================================
// Custom Error Class
// ===========================================
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

// ===========================================
// UserFileService - Handles per-user data storage
// ===========================================
class UserFileService {
  /**
   * Get user data directory path (relative to storage root)
   */
  static getUserDataDir(email) {
    const sanitizedEmail = sanitizeEmail(email);
    return `users/${sanitizedEmail}`;
  }

  /**
   * Get user state file path (relative)
   */
  static getStateFilePath(email) {
    return `${this.getUserDataDir(email)}/server_state.json`;
  }

  /**
   * Load user state
   */
  static async loadState(email) {
    const stateFile = this.getStateFilePath(email);
    if (!(await storage.exists(stateFile))) {
      return {};
    }
    const raw = await storage.read(stateFile);
    return JSON.parse(raw);
  }

  /**
   * Save user state
   */
  static async saveState(email, state) {
    const stateFile = this.getStateFilePath(email);
    await storage.write(stateFile, state);
  }

  /**
   * Load courses for a user (scans directory)
   */
  static async loadCourses(email) {
    const userDir = this.getUserDataDir(email);

    // Ensure directory exists (mostly for FS adapter)
    await storage.ensureDir(userDir);

    const files = await storage.list(userDir);
    const courses = [];

    for (const file of files) {
      if (CONFIG.filenamePattern.test(file)) {
        try {
          const filePath = `${userDir}/${file}`;
          const content = await storage.read(filePath);
          const data = JSON.parse(content);

          let courseMeta = {
            filename: file,
            name: file.replace('.json', '').replace(/_/g, ' '),
            size: 0,
            pageSize: CONFIG.defaultPageSize
          };

          if (Array.isArray(data)) {
            courseMeta.size = data.length;
          } else {
            courseMeta.size = data.content?.length || 0;
            if (data.metadata?.pageSize) {
              courseMeta.pageSize = data.metadata.pageSize;
            }
            if (data.metadata?.order) {
              courseMeta.order = data.metadata.order;
            }
            if (data.metadata?.name) {
              courseMeta.name = data.metadata.name;
            }
          }
          courses.push(courseMeta);
        } catch (err) {
          console.error(`Error reading course file ${file}:`, err.message);
        }
      }
    }
    return courses;
  }

  /**
   * Load vocab file for a user
   */
  static async loadVocabFile(email, filename) {
    const sanitized = sanitizeFilename(filename);
    const filepath = `${this.getUserDataDir(email)}/${sanitized}`;

    if (!(await storage.exists(filepath))) {
      throw new AppError('File not found', 404);
    }

    const raw = await storage.read(filepath);
    const data = JSON.parse(raw);

    // Return the full object if it's the new format, OR wrap legacy array
    if (Array.isArray(data)) {
      // Convert to new format structure on the fly for consistency in services?
      // Actually DecayService expects an array or needs to handle object.
      // Let's standardise on returning the content array for processing?
      // No, DecayService.applyDecay might need metadata? 
      // Current DecayService logic: "const result = vocab.map..." - it expects ARRAY.
      // So we must return the CONTENT array.
      return data;
    } else {
      return data.content;
    }
  }

  /**
   * Save vocab file for a user
   * NOTE: This carefully handles preserving metadata if it exists
   */
  static async saveVocabFile(email, filename, newContent) {
    const sanitized = sanitizeFilename(filename);
    const filepath = `${this.getUserDataDir(email)}/${sanitized}`;

    let dataToSave = newContent;

    if (await storage.exists(filepath)) {
      const existingRaw = await storage.read(filepath);
      const existing = JSON.parse(existingRaw);

      if (!Array.isArray(existing)) {
        // It's the new format, preserve metadata
        existing.content = newContent;
        dataToSave = existing;
      }
    }

    await storage.write(filepath, dataToSave);
  }

  /**
   * Delete vocab file for a user
   */
  static async deleteVocabFile(email, filename) {
    const sanitized = sanitizeFilename(filename);
    const filepath = `${this.getUserDataDir(email)}/${sanitized}`;

    if (await storage.exists(filepath)) {
      await storage.delete(filepath);
    }
  }

  // ===========================================
  // Snapshot Methods
  // ===========================================

  /**
   * Get snapshots directory for a user
   */
  static getSnapshotsDir(email) {
    return `${this.getUserDataDir(email)}/snapshots`;
  }

  /**
   * Create a snapshot of all user data
   */
  static async createSnapshot(email, note = '') {
    const snapshotsDir = this.getSnapshotsDir(email);
    // storage.ensureDir not strictly needed for GCS but good for FS
    await storage.ensureDir(snapshotsDir);

    // Sanitize note
    const sanitizedNote = String(note || '').slice(0, CONFIG.maxNoteLength);

    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const timestamp = now.getTime();
    const id = `${date}-${timestamp}`;

    // Load current data - use internal helper which returns metadata-rich course objects
    const courses = await this.loadCourses(email);
    const vocabFiles = {};

    const loadPromises = courses.map(async (course) => {
      try {
        // We want the FULL file content (metadata + content) for backup, not just content array
        // So we bypass loadVocabFile which we just modified to return array
        const filepath = `${this.getUserDataDir(email)}/${course.filename}`;
        const raw = await storage.read(filepath);
        vocabFiles[course.filename] = JSON.parse(raw);
      } catch (err) {
        console.warn(`Could not load ${course.filename} for snapshot:`, err.message);
      }
    });

    await Promise.all(loadPromises);

    const snapshot = {
      id,
      date,
      createdAt: now.toISOString(),
      note: sanitizedNote,
      courses,
      vocabFiles
    };

    const filepath = `${snapshotsDir}/snapshot-${id}.json`;
    await storage.write(filepath, snapshot);

    return { id, date, createdAt: snapshot.createdAt, note: sanitizedNote };
  }

  /**
   * List all snapshots for a user
   */
  static async listSnapshots(email) {
    const snapshotsDir = this.getSnapshotsDir(email);

    if (!(await storage.exists(snapshotsDir)) && !process.env.K_SERVICE) {
      // For local FS, if dir doesn't exist, list fails or returns empty? 
      // storage.list should handle it.
      // But checking exists is safer.
      // On GCS exists might check object existence. Folder existence is vague.
      // Better to just try listing.
    }

    try {
      const files = await storage.list(snapshotsDir);
      const snapshotPromises = files
        .filter(file => file.startsWith('snapshot-') && file.endsWith('.json'))
        .map(async (file) => {
          try {
            const filepath = `${snapshotsDir}/${file}`;
            const content = await storage.read(filepath);
            const data = JSON.parse(content);
            return {
              id: data.id,
              date: data.date,
              createdAt: data.createdAt,
              note: data.note || ''
            };
          } catch (err) {
            console.warn(`Could not read snapshot ${file}:`, err.message);
            return null;
          }
        });

      const snapshots = (await Promise.all(snapshotPromises)).filter(Boolean);
      // Sort by createdAt descending (newest first)
      snapshots.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return snapshots;
    } catch (err) {
      // If directory doesn't exist or other error
      return [];
    }
  }

  /**
   * Restore a snapshot
   */
  static async restoreSnapshot(email, snapshotId) {
    const validatedId = validateSnapshotId(snapshotId);
    const snapshotsDir = this.getSnapshotsDir(email);
    const filepath = `${snapshotsDir}/snapshot-${validatedId}.json`;

    if (!(await storage.exists(filepath))) {
      throw new AppError('Snapshot not found', 404);
    }

    const raw = await storage.read(filepath);
    const snapshot = JSON.parse(raw);

    // Restore vocab files
    const restorePromises = Object.entries(snapshot.vocabFiles).map(
      async ([filename, data]) => {
        const destPath = `${this.getUserDataDir(email)}/${filename}`;
        await storage.write(destPath, data);
      }
    );

    await Promise.all(restorePromises);

    return { restored: true, snapshotId: validatedId };
  }

  /**
   * Delete a snapshot
   */
  static async deleteSnapshot(email, snapshotId) {
    const validatedId = validateSnapshotId(snapshotId);
    const snapshotsDir = this.getSnapshotsDir(email);
    const filepath = `${snapshotsDir}/snapshot-${validatedId}.json`;

    if (!(await storage.exists(filepath))) {
      throw new AppError('Snapshot not found', 404);
    }

    await storage.delete(filepath);
    return { deleted: true, snapshotId: validatedId };
  }

  /**
   * Check and create automatic weekly snapshot if needed
   */
  static async checkAutoSnapshot(email) {
    try {
      const state = await this.loadState(email);

      const now = new Date();
      const weekNumber = Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));

      if (state.lastAutoSnapshotWeek === weekNumber) {
        return { created: false };
      }

      // Create automatic snapshot
      const snapshot = await this.createSnapshot(email, 'Auto-weekly backup');

      // Update state
      state.lastAutoSnapshotWeek = weekNumber;
      await this.saveState(email, state);

      console.log(`Auto-snapshot created for ${sanitizeEmail(email)}: ${snapshot.id}`);
      return { created: true, snapshot };
    } catch (err) {
      // Log error but don't fail the request
      console.error('Error creating auto-snapshot:', err.message);
      return { created: false, error: err.message };
    }
  }
}

// ===========================================
// Decay Service
// ===========================================
class DecayService {
  /**
   * Apply decay algorithm to vocab items
   * Returns a new array (doesn't mutate input)
   */
  static applyDecay(vocab, pageSize) {
    // Clone the vocab array and items to avoid mutations
    const result = vocab.map(item => ({ ...item, states: [...(item.states || [])] }));
    let modified = false;

    // Process each page independently
    for (let pageStart = 0; pageStart < result.length; pageStart += pageSize) {
      const pageEnd = Math.min(pageStart + pageSize, result.length);
      const pageItems = result.slice(pageStart, pageEnd);

      // Calculate average filled states for this page
      const totalFilled = pageItems.reduce((sum, item) => {
        return sum + (item.states?.filter(s => s !== 'none').length || 0);
      }, 0);

      const avgFilled = Math.floor(totalFilled / pageItems.length);

      // Apply decay to each item on this page
      for (let i = pageStart; i < pageEnd; i++) {
        const item = result[i];
        if (!item.states || item.states.length === 0) continue;

        const currentFilled = item.states.filter(s => s !== 'none').length;

        if (currentFilled > avgFilled) {
          // Decay: remove states from the end
          const toRemove = currentFilled - avgFilled;
          let removed = 0;
          for (let pos = item.states.length - 1; pos >= 0 && removed < toRemove; pos--) {
            if (item.states[pos] !== 'none') {
              item.states[pos] = 'none';
              removed++;
              modified = true;
            }
          }
        } else if (currentFilled < avgFilled) {
          // Boost: add states from the beginning
          const toAdd = avgFilled - currentFilled;
          let added = 0;
          for (let pos = 0; pos < item.states.length && added < toAdd; pos++) {
            if (item.states[pos] === 'none') {
              item.states[pos] = 'boost';
              added++;
              modified = true;
            }
          }
        }
      }
    }

    return { vocab: result, modified };
  }
}

// ===========================================
// Route Handlers
// ===========================================

/**
 * Async route wrapper for error handling
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// ===========================================
// Maintenance Routes
// ===========================================

/**
 * POST /api/maintenance/decay
 * Trigger daily decay for the logged-in user
 */
app.post('/api/maintenance/decay', authMiddleware, asyncHandler(async (req, res) => {
  const email = req.user.email;
  const today = new Date().toISOString().split('T')[0];

  // Check if already run today for this user
  const state = await UserFileService.loadState(email);

  if (state.lastDecay === today) {
    return res.json({ run: false, message: 'Already run today' });
  }

  const courses = await UserFileService.loadCourses(email);
  let totalModified = 0;

  for (const course of courses) {
    try {
      const vocab = await UserFileService.loadVocabFile(email, course.filename);
      const pageSize = course.pageSize || CONFIG.defaultPageSize;

      const { vocab: updatedVocab, modified } = DecayService.applyDecay(vocab, pageSize);

      if (modified) {
        console.log(`⚠️  DECAY: Modifying course ${course.name} for user ${sanitizeEmail(email)}`);
        await UserFileService.saveVocabFile(email, course.filename, updatedVocab);
        totalModified++;
      }
    } catch (err) {
      console.error(`Error applying decay to course ${course.name}:`, err.message);
    }
  }

  // Save per-user state
  state.lastDecay = today;
  await UserFileService.saveState(email, state);

  res.json({ run: true, message: `Daily decay applied to ${totalModified} course(s)` });
}));

// ===========================================
// AI Generation Routes
// ===========================================

const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'fake_key_for_build');
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

/**
 * POST /api/generate-vocab
 * Generate vocab list from prompt
 */
app.post('/api/generate-vocab', authMiddleware, asyncHandler(async (req, res) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    throw new AppError('Prompt is required', 400);
  }

  if (!process.env.GEMINI_API_KEY) {
    throw new AppError('Server is not configured for AI generation (missing key)', 503);
  }

  const systemPrompt = `
    You are a flashcard content generator.
    Convert the following user prompt into a JSON array of learning items.
    Each item MUST have these exact fields: "id" (string number, starting from "1"), "word" (question/term/front-side), and "answer" (answer/definition/back-side).
    Output ONLY the valid JSON array. No markdown formatting, no explanations.
    Example output: [{"id": "1", "word": "Capital of France", "answer": "Paris"}, {"id": "2", "word": "H2O", "answer": "Water"}]
    User Prompt: ${prompt}
  `;

  try {
    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    const text = response.text();

    // Clean up potential markdown formatting code blocks
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const vocabList = JSON.parse(cleanText);
    validateVocabList(vocabList); // Reuse existing validator

    res.json(vocabList);
  } catch (err) {
    console.error('AI Generation Error:', err);
    throw new AppError('Failed to generate content: ' + err.message, 500);
  }
}));

// ===========================================
// Vocab Routes
// ===========================================

/**
 * GET /api/vocab-files/:filename
 * Load a specific vocab file (course content)
 */
app.get('/api/vocab-files/:filename', authMiddleware, async (req, res, next) => {
  try {
    const userEmail = sanitizeEmail(req.user.email);
    const filename = sanitizeFilename(req.params.filename);
    const filePath = `${userEmail}/${filename}`;

    if (!(await storage.exists(filePath))) {
      throw new AppError('File not found', 404);
    }

    const content = await storage.read(filePath);
    const data = JSON.parse(content);

    // Return just the array content for the frontend
    if (Array.isArray(data)) {
      res.json(data);
    } else {
      res.json(data.content || []);
    }
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/vocab-files/:courseId/:id
 * Update a specific vocab item
 */
app.patch('/api/vocab-files/:courseId/:id', authMiddleware, async (req, res, next) => {
  try {
    const userEmail = sanitizeEmail(req.user.email);
    // Sanitize the course ID by creating the full filename first
    // req.params.courseId might be "German", so we append .json then sanitize
    const filename = sanitizeFilename(`${req.params.courseId}.json`);
    const itemId = String(req.params.id);
    const updates = req.body;

    // Validate updates is an array (states)
    if (!Array.isArray(updates)) {
      throw new AppError('Updates must be an array of states', 400);
    }

    const filePath = `${userEmail}/${filename}`;

    if (!(await storage.exists(filePath))) {
      throw new AppError('Course not found', 404);
    }

    const content = await storage.read(filePath);
    let data = JSON.parse(content);
    let vocab = [];

    // Backward compat check
    if (Array.isArray(data)) {
      vocab = data;
    } else {
      vocab = data.content;
    }

    // Find item
    const itemIndex = vocab.findIndex(item => String(item.id) === itemId);

    if (itemIndex === -1) {
      throw new AppError('Item not found', 404);
    }

    // Update item
    const updatedItem = {
      ...vocab[itemIndex],
      states: updates,
      lastUpdated: new Date().toISOString()
    };

    vocab[itemIndex] = updatedItem;

    // Write back attempting to preserve format
    if (Array.isArray(data)) {
      await storage.write(filePath, vocab);
    } else {
      data.content = vocab;
      await storage.write(filePath, data);
    }

    res.json({ success: true, item: updatedItem });
  } catch (err) {
    next(err);
  }
});

// ===========================================
// API Enpoints
// ===========================================

/**
 * GET /api/courses
 * List all available courses for the authenticated user
 */
app.get('/api/courses', authMiddleware, async (req, res, next) => {
  try {
    const userEmail = sanitizeEmail(req.user.email);
    // Use user-specific path: userEmail/
    // Ensure directory exists if using FS (GCS lazy creates)
    await storage.ensureDir(userEmail);

    const files = await storage.list(userEmail);
    const courses = [];

    for (const file of files) {
      if (CONFIG.filenamePattern.test(file)) {
        try {
          // Path format: userEmail/filename
          const filePath = `${userEmail}/${file}`;
          const content = await storage.read(filePath);
          const data = JSON.parse(content);

          let courseMeta = {
            filename: file,
            name: file.replace('.json', '').replace(/_/g, ' '),
            size: 0,
            pageSize: CONFIG.defaultPageSize
          };

          if (Array.isArray(data)) {
            courseMeta.size = data.length;
          } else {
            courseMeta.size = data.content?.length || 0;
            if (data.metadata?.pageSize) {
              courseMeta.pageSize = data.metadata.pageSize;
            }
            if (data.metadata?.order) {
              courseMeta.order = data.metadata.order;
            }
          }
          courses.push(courseMeta);
        } catch (err) {
          console.error(`Error reading course file ${file}:`, err);
          // Skip invalid files
        }
      }
    }

    // Sort courses by order
    courses.sort((a, b) => (a.order || 0) - (b.order || 0));

    res.json(courses);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/courses
 * Create a new course
 */
app.post('/api/courses', authMiddleware, async (req, res, next) => {
  try {
    const { name, content, pageSize } = req.body;

    if (!name || !content || !Array.isArray(content)) {
      throw new AppError('Invalid input. Name and content array are required.', 400);
    }

    // Validate content structure
    validateVocabList(content);

    const userEmail = sanitizeEmail(req.user.email);
    // Sanitize spaces first
    const safeName = name.replace(/\s+/g, '_');
    const safeFilename = sanitizeFilename(`${safeName}.json`);

    const filePath = `${userEmail}/${safeFilename}`;

    if (await storage.exists(filePath)) {
      throw new AppError('Course with this name already exists', 409);
    }

    // New format: Object with metadata
    const newCourseData = {
      metadata: {
        created: new Date().toISOString(),
        name: name, // Original name
        pageSize: parseInt(pageSize) || CONFIG.defaultPageSize
      },
      content: content
    };

    await storage.write(filePath, newCourseData);

    res.status(201).json({ message: 'Course created', filename: safeFilename });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/courses/:id
 * Get a specific course
 */
app.get('/api/courses/:id', authMiddleware, async (req, res, next) => {
  try {
    const userEmail = sanitizeEmail(req.user.email);
    const courseId = sanitizeFilename(`${req.params.id}.json`);
    const filePath = `${userEmail}/${courseId}`;

    if (!(await storage.exists(filePath))) {
      throw new AppError('Course not found', 404);
    }

    const content = await storage.read(filePath);
    const data = JSON.parse(content);

    // Return backward compatible array? or full object?
    // Frontend uses: .loadVocabFile from this? NO.
    // Frontend uses /api/vocab-files.
    // This endpoint seems unused or redundant? 
    // Wait, let's check frontend usage. data-handler calls 'getCourses' (list)
    // and 'getAll' -> api/vocab-files.
    // 'server.js' defines it.
    // I will return parsed content logic same as /vocab-files just in case.
    if (Array.isArray(data)) {
      res.json(data);
    } else {
      res.json(data.content || []);
    }
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/courses/:id
 * Update course metadata
 */
app.put('/api/courses/:id', authMiddleware, async (req, res, next) => {
  try {
    const userEmail = sanitizeEmail(req.user.email);
    const courseId = sanitizeFilename(`${req.params.id}.json`);
    const filePath = `${userEmail}/${courseId}`;
    const updates = sanitizeCourseUpdate(req.body);

    if (!(await storage.exists(filePath))) {
      throw new AppError('Course not found', 404);
    }

    // Read current data
    const rawContent = await storage.read(filePath);
    let data = JSON.parse(rawContent);

    // Migrate if legacy array
    if (Array.isArray(data)) {
      data = {
        metadata: {
          created: new Date().toISOString(),
          pageSize: CONFIG.defaultPageSize
        },
        content: data
      };
    }

    // Update metadata
    if (updates.pageSize) data.metadata.pageSize = updates.pageSize;
    if (updates.order !== undefined) data.metadata.order = updates.order;
    // name is handled separately via rename below, but we can store it too
    if (updates.name) data.metadata.name = updates.name;

    // Handle rename
    if (updates.name) {
      const newName = updates.name.replace(/\s+/g, '_');
      const newFilename = sanitizeFilename(`${newName}.json`);
      const newFilePath = `${userEmail}/${newFilename}`;

      if (newFilename !== courseId) {
        if (await storage.exists(newFilePath)) {
          throw new AppError('Course with this name already exists', 409);
        }
        await storage.write(newFilePath, data);
        await storage.delete(filePath);

        res.json({ success: true, course: updates });
        return;
      }
    }

    // Write back (if no rename)
    await storage.write(filePath, data);

    res.json({ success: true, course: updates });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/courses/:id/append
 * Append content to an existing course
 */
app.post('/api/courses/:id/append', authMiddleware, async (req, res, next) => {
  try {
    const { content } = req.body;

    if (!content || !Array.isArray(content)) {
      throw new AppError('Invalid input. Content array is required.', 400);
    }

    // Validate content structure
    validateVocabList(content);

    const userEmail = sanitizeEmail(req.user.email);
    const courseId = sanitizeFilename(`${req.params.id}.json`);
    const filePath = `${userEmail}/${courseId}`;

    if (!(await storage.exists(filePath))) {
      throw new AppError('Course not found', 404);
    }

    // Read current data
    const rawContent = await storage.read(filePath);
    let data = JSON.parse(rawContent);

    // Handle both legacy array and new object format
    let existingContent;
    if (Array.isArray(data)) {
      existingContent = data;
    } else {
      existingContent = data.content || [];
    }

    // Find the highest existing ID to ensure new IDs don't conflict
    let maxId = 0;
    existingContent.forEach(item => {
      const numId = parseInt(item.id);
      if (!isNaN(numId) && numId > maxId) {
        maxId = numId;
      }
    });

    // Re-number the incoming content to avoid ID conflicts
    const newContent = content.map((item, index) => ({
      ...item,
      id: String(maxId + index + 1)
    }));

    // Append new content
    const updatedContent = [...existingContent, ...newContent];

    // Write back in the same format
    if (Array.isArray(data)) {
      await storage.write(filePath, updatedContent);
    } else {
      data.content = updatedContent;
      await storage.write(filePath, data);
    }

    res.json({
      success: true,
      message: 'Content appended successfully',
      added: newContent.length,
      total: updatedContent.length
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/courses/:id
 * Delete a course
 */
app.delete('/api/courses/:id', authMiddleware, async (req, res, next) => {
  try {
    const userEmail = sanitizeEmail(req.user.email);
    const courseId = sanitizeFilename(`${req.params.id}.json`);
    const filePath = `${userEmail}/${courseId}`;

    if (await storage.exists(filePath)) {
      await storage.delete(filePath);
    }
    // Idempotent success
    res.json({ success: true, message: 'Course deleted' });
  } catch (err) {
    next(err);
  }
});

// ===========================================
// Snapshot Routes
// ===========================================

/**
 * POST /api/snapshots
 * Create a snapshot
 */
app.post('/api/snapshots', authMiddleware, asyncHandler(async (req, res) => {
  const { note } = req.body;
  const result = await UserFileService.createSnapshot(req.user.email, note || '');
  res.json({ success: true, snapshot: result });
}));

/**
 * GET /api/snapshots
 * List all snapshots
 */
app.get('/api/snapshots', authMiddleware, asyncHandler(async (req, res) => {
  const snapshots = await UserFileService.listSnapshots(req.user.email);
  res.json(snapshots);
}));

/**
 * POST /api/snapshots/:id/restore
 * Restore a snapshot
 */
app.post('/api/snapshots/:id/restore', authMiddleware, asyncHandler(async (req, res) => {
  const result = await UserFileService.restoreSnapshot(req.user.email, req.params.id);
  res.json({ success: true, ...result });
}));

/**
 * DELETE /api/snapshots/:id
 * Delete a snapshot
 */
app.delete('/api/snapshots/:id', authMiddleware, asyncHandler(async (req, res) => {
  const result = await UserFileService.deleteSnapshot(req.user.email, req.params.id);
  res.json({ success: true, ...result });
}));

// ===========================================
// Error Handling
// ===========================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  // Log error details
  console.error('Error:', err.message);
  if (!err.isOperational) {
    console.error('Stack:', err.stack);
  }

  // Determine status code
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal server error';

  res.status(statusCode).json({ error: message });
});

// ===========================================
// Server Startup
// ===========================================
app.listen(CONFIG.port, () => {
  console.log(`✓ Server listening on port ${CONFIG.port}`);
  console.log(`✓ Data directory: ${CONFIG.dataDir}`);
});

module.exports = { app, UserFileService, DecayService, AppError };