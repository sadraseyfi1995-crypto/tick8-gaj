const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const { setupAuthRoutes, authMiddleware } = require('./auth');

const app = express();

// ===========================================
// Configuration
// ===========================================
const CONFIG = {
  dataDir: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data'),
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
// Middleware Setup
// ===========================================
app.use(cors(CORS_OPTIONS));
app.use(express.json({ limit: '10mb' }));
setupAuthRoutes(app);

// ===========================================
// Utility Functions
// ===========================================

/**
 * Check if a file exists (async version)
 */
async function fileExists(filepath) {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

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
  // Additional safety: ensure no path traversal
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
  // Track directories being initialized to prevent race conditions
  static initializingUsers = new Map();

  /**
   * Get user data directory path
   */
  static getUserDataDir(email) {
    const sanitizedEmail = sanitizeEmail(email);
    return path.join(CONFIG.dataDir, 'users', sanitizedEmail);
  }

  /**
   * Get user state file path
   */
  static getStateFilePath(email) {
    return path.join(this.getUserDataDir(email), 'server_state.json');
  }

  /**
   * Ensure user data directory exists, copy default data if new user
   * Uses locking to prevent race conditions
   */
  static async ensureUserDataDir(email) {
    const sanitizedEmail = sanitizeEmail(email);
    const userDir = this.getUserDataDir(email);

    // Check if already initializing (race condition prevention)
    if (this.initializingUsers.has(sanitizedEmail)) {
      await this.initializingUsers.get(sanitizedEmail);
      return;
    }

    // Check if directory already exists
    if (await fileExists(userDir)) {
      return;
    }

    // Create a promise for initialization and store it
    const initPromise = this._initializeUserDir(email, userDir);
    this.initializingUsers.set(sanitizedEmail, initPromise);

    try {
      await initPromise;
    } finally {
      this.initializingUsers.delete(sanitizedEmail);
    }
  }

  /**
   * Internal: Initialize user directory
   */
  static async _initializeUserDir(email, userDir) {
    await fs.mkdir(userDir, { recursive: true });

    const defaultCoursesPath = path.join(CONFIG.dataDir, 'courses.json');
    if (!(await fileExists(defaultCoursesPath))) {
      // No default courses, create empty courses file
      await this.atomicWrite(path.join(userDir, 'courses.json'), []);
      return;
    }

    const courses = JSON.parse(await fs.readFile(defaultCoursesPath, 'utf-8'));
    await this.atomicWrite(path.join(userDir, 'courses.json'), courses);

    // Copy each course file
    const copyPromises = courses.map(async (course) => {
      const srcPath = path.join(CONFIG.dataDir, course.filename);
      if (await fileExists(srcPath)) {
        const destPath = path.join(userDir, course.filename);
        await fs.copyFile(srcPath, destPath);
      }
    });

    await Promise.all(copyPromises);
  }

  /**
   * Atomic write with cleanup on failure
   */
  static async atomicWrite(filepath, data) {
    const tmpPath = `${filepath}.tmp.${Date.now()}`;

    try {
      await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tmpPath, filepath);
    } catch (err) {
      // Clean up temp file on failure
      try {
        await fs.unlink(tmpPath);
      } catch {
        // Ignore cleanup errors
      }
      throw err;
    }
  }

  /**
   * Load user state
   */
  static async loadState(email) {
    const stateFile = this.getStateFilePath(email);
    if (!(await fileExists(stateFile))) {
      return {};
    }
    const raw = await fs.readFile(stateFile, 'utf-8');
    return JSON.parse(raw);
  }

  /**
   * Save user state
   */
  static async saveState(email, state) {
    await this.ensureUserDataDir(email);
    const stateFile = this.getStateFilePath(email);
    await this.atomicWrite(stateFile, state);
  }

  /**
   * Load courses for a user
   */
  static async loadCourses(email) {
    await this.ensureUserDataDir(email);
    const filepath = path.join(this.getUserDataDir(email), 'courses.json');

    if (!(await fileExists(filepath))) {
      return [];
    }

    const raw = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(raw);
  }

  /**
   * Save courses for a user
   */
  static async saveCourses(email, courses) {
    await this.ensureUserDataDir(email);
    const filepath = path.join(this.getUserDataDir(email), 'courses.json');
    await this.atomicWrite(filepath, courses);
  }

  /**
   * Load vocab file for a user
   */
  static async loadVocabFile(email, filename) {
    await this.ensureUserDataDir(email);
    const sanitized = sanitizeFilename(filename);
    const filepath = path.join(this.getUserDataDir(email), sanitized);

    if (!(await fileExists(filepath))) {
      throw new AppError('File not found', 404);
    }

    const raw = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(raw);
  }

  /**
   * Save vocab file for a user
   */
  static async saveVocabFile(email, filename, data) {
    await this.ensureUserDataDir(email);
    const sanitized = sanitizeFilename(filename);
    const filepath = path.join(this.getUserDataDir(email), sanitized);
    await this.atomicWrite(filepath, data);
  }

  /**
   * Delete vocab file for a user
   */
  static async deleteVocabFile(email, filename) {
    const sanitized = sanitizeFilename(filename);
    const filepath = path.join(this.getUserDataDir(email), sanitized);

    if (await fileExists(filepath)) {
      await fs.unlink(filepath);
    }
  }

  // ===========================================
  // Snapshot Methods
  // ===========================================

  /**
   * Get snapshots directory for a user
   */
  static getSnapshotsDir(email) {
    return path.join(this.getUserDataDir(email), 'snapshots');
  }

  /**
   * Create a snapshot of all user data
   */
  static async createSnapshot(email, note = '') {
    await this.ensureUserDataDir(email);
    const snapshotsDir = this.getSnapshotsDir(email);
    await fs.mkdir(snapshotsDir, { recursive: true });

    // Sanitize note
    const sanitizedNote = String(note || '').slice(0, CONFIG.maxNoteLength);

    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const timestamp = now.getTime();
    const id = `${date}-${timestamp}`;

    // Load current data
    const courses = await this.loadCourses(email);
    const vocabFiles = {};

    const loadPromises = courses.map(async (course) => {
      try {
        vocabFiles[course.filename] = await this.loadVocabFile(email, course.filename);
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

    const filepath = path.join(snapshotsDir, `snapshot-${id}.json`);
    await this.atomicWrite(filepath, snapshot);

    return { id, date, createdAt: snapshot.createdAt, note: sanitizedNote };
  }

  /**
   * List all snapshots for a user
   */
  static async listSnapshots(email) {
    const snapshotsDir = this.getSnapshotsDir(email);

    if (!(await fileExists(snapshotsDir))) {
      return [];
    }

    const files = await fs.readdir(snapshotsDir);
    const snapshotPromises = files
      .filter(file => file.startsWith('snapshot-') && file.endsWith('.json'))
      .map(async (file) => {
        try {
          const filepath = path.join(snapshotsDir, file);
          const content = JSON.parse(await fs.readFile(filepath, 'utf-8'));
          return {
            id: content.id,
            date: content.date,
            createdAt: content.createdAt,
            note: content.note || ''
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
  }

  /**
   * Restore a snapshot
   */
  static async restoreSnapshot(email, snapshotId) {
    const validatedId = validateSnapshotId(snapshotId);
    const snapshotsDir = this.getSnapshotsDir(email);
    const filepath = path.join(snapshotsDir, `snapshot-${validatedId}.json`);

    if (!(await fileExists(filepath))) {
      throw new AppError('Snapshot not found', 404);
    }

    const snapshot = JSON.parse(await fs.readFile(filepath, 'utf-8'));

    // Restore courses
    await this.saveCourses(email, snapshot.courses);

    // Restore vocab files
    const restorePromises = Object.entries(snapshot.vocabFiles).map(
      ([filename, data]) => this.saveVocabFile(email, filename, data)
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
    const filepath = path.join(snapshotsDir, `snapshot-${validatedId}.json`);

    if (!(await fileExists(filepath))) {
      throw new AppError('Snapshot not found', 404);
    }

    await fs.unlink(filepath);
    return { deleted: true, snapshotId: validatedId };
  }

  /**
   * Check and create automatic weekly snapshot if needed
   */
  static async checkAutoSnapshot(email) {
    try {
      await this.ensureUserDataDir(email);
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
    You are a vocabulary generator.
    Convert the following user prompt into a JSON array of vocabulary items.
    Each item MUST have these exact fields: "id" (string number, starting from "1"), "word" (target language), and "answer" (native language/definition).
    Output ONLY the valid JSON array. No markdown formatting, no explanations.
    Example output: [{"id": "1", "word": "Hola", "answer": "Hello"}, {"id": "2", "word": "Adiós", "answer": "Goodbye"}]
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
 * Load a vocab file by filename
 */
app.get('/api/vocab-files/:filename', authMiddleware, asyncHandler(async (req, res) => {
  const data = await UserFileService.loadVocabFile(req.user.email, req.params.filename);
  res.json(data);
}));

/**
 * PATCH /api/vocab-files/:courseId/:id
 * Update a specific vocab item
 */
app.patch('/api/vocab-files/:courseId/:id', authMiddleware, asyncHandler(async (req, res) => {
  const email = req.user.email;
  const filename = `${req.params.courseId}.json`;
  const itemId = String(req.params.id); // Ensure string comparison
  const updates = req.body;

  // Validate updates is an array (states)
  if (!Array.isArray(updates)) {
    throw new AppError('Updates must be an array of states', 400);
  }

  console.log(`📝 PATCH - User: ${sanitizeEmail(email)}, File: ${filename}, ID: ${itemId}`);

  const vocab = await UserFileService.loadVocabFile(email, filename);
  const itemIndex = vocab.findIndex(item => String(item.id) === itemId); // Strict comparison

  if (itemIndex === -1) {
    throw new AppError('Item not found', 404);
  }

  const updatedItem = {
    ...vocab[itemIndex],
    states: updates,
    lastUpdated: new Date().toISOString()
  };

  vocab[itemIndex] = updatedItem;
  await UserFileService.saveVocabFile(email, filename, vocab);

  console.log(`✓ Saved changes for card ${itemId}`);
  res.json({ success: true, item: updatedItem });
}));

// ===========================================
// Course Routes
// ===========================================

/**
 * GET /api/courses
 * Get all courses (also triggers auto-snapshot)
 */
app.get('/api/courses', authMiddleware, asyncHandler(async (req, res) => {
  const email = req.user.email;

  // Check for automatic weekly snapshot (non-blocking)
  UserFileService.checkAutoSnapshot(email).catch(err => {
    console.error('Auto-snapshot background error:', err.message);
  });

  const courses = await UserFileService.loadCourses(email);
  res.json(courses);
}));

/**
 * POST /api/courses
 * Create a new course
 */
app.post('/api/courses', authMiddleware, asyncHandler(async (req, res) => {
  const email = req.user.email;
  const { name, pageSize, content } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new AppError('Name is required', 400);
  }

  if (!content) {
    throw new AppError('Content is required', 400);
  }

  validateVocabList(content);

  const courses = await UserFileService.loadCourses(email);
  const sanitizedName = name.trim().replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  const filename = `${sanitizedName}-${Date.now()}.json`;

  await UserFileService.saveVocabFile(email, filename, content);

  const validPageSize = Math.min(
    Math.max(parseInt(pageSize, 10) || CONFIG.defaultPageSize, 1),
    CONFIG.maxPageSize
  );

  const newCourse = {
    name: name.trim(),
    filename,
    pageSize: validPageSize,
    order: courses.length + 1
  };

  courses.push(newCourse);
  await UserFileService.saveCourses(email, courses);

  res.json({ success: true, course: newCourse });
}));

/**
 * POST /api/courses/:id/append
 * Append data to an existing course
 */
app.post('/api/courses/:id/append', authMiddleware, asyncHandler(async (req, res) => {
  const email = req.user.email;
  const courseId = req.params.id;
  const { content } = req.body;

  if (!content || !Array.isArray(content)) {
    throw new AppError('Content array is required', 400);
  }

  validateVocabList(content);

  const courses = await UserFileService.loadCourses(email);
  const course = courses.find(c => c.filename === `${courseId}.json`);

  if (!course) {
    throw new AppError('Course not found', 404);
  }

  const vocab = await UserFileService.loadVocabFile(email, course.filename);
  const maxId = vocab.reduce((max, item) => Math.max(max, parseInt(item.id, 10) || 0), 0);

  const newItems = content.map((item, index) => ({
    ...item,
    id: String(maxId + 1 + index),
    states: item.states || [],
    lastUpdated: new Date().toISOString()
  }));

  const updatedVocab = vocab.concat(newItems);
  await UserFileService.saveVocabFile(email, course.filename, updatedVocab);

  res.json({ success: true, added: newItems.length });
}));

/**
 * PUT /api/courses/:id
 * Update course metadata
 */
app.put('/api/courses/:id', authMiddleware, asyncHandler(async (req, res) => {
  const email = req.user.email;
  const courseId = req.params.id;
  const updates = sanitizeCourseUpdate(req.body); // Whitelist fields

  const courses = await UserFileService.loadCourses(email);
  const courseIndex = courses.findIndex(c => c.filename === `${courseId}.json`);

  if (courseIndex === -1) {
    throw new AppError('Course not found', 404);
  }

  courses[courseIndex] = {
    ...courses[courseIndex],
    ...updates,
    filename: courses[courseIndex].filename // Preserve filename
  };

  await UserFileService.saveCourses(email, courses);
  res.json({ success: true, course: courses[courseIndex] });
}));

/**
 * DELETE /api/courses/:id
 * Delete a course and its file
 */
app.delete('/api/courses/:id', authMiddleware, asyncHandler(async (req, res) => {
  const email = req.user.email;
  const courseId = req.params.id;

  const courses = await UserFileService.loadCourses(email);
  const courseIndex = courses.findIndex(c => c.filename === `${courseId}.json`);

  if (courseIndex === -1) {
    throw new AppError('Course not found', 404);
  }

  const course = courses[courseIndex];

  // Delete file (ignore errors if already deleted)
  try {
    await UserFileService.deleteVocabFile(email, course.filename);
  } catch (err) {
    console.warn(`Could not delete file ${course.filename}:`, err.message);
  }

  courses.splice(courseIndex, 1);
  await UserFileService.saveCourses(email, courses);

  res.json({ success: true, message: `Course '${course.name}' deleted` });
}));

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