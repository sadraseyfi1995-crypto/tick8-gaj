const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { setupAuthRoutes, authMiddleware, optionalAuthMiddleware } = require('./auth');

const app = express();

// Configuration
const CONFIG = {
  dataDir: path.join(__dirname, 'data'),
  port: process.env.PORT || 3000,
  filenamePattern: /^[a-zA-Z0-9_\-]+\.json$/
};

// Middleware
const corsOptions = {
  origin: [
    'http://localhost:4200',
    'https://tick8-43c1a.web.app',
    'https://tick8-43c1a.firebaseapp.com'
  ],
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());

// Setup authentication routes
setupAuthRoutes(app);

/**
 * UserFileService - Handles per-user data storage
 */
class UserFileService {
  /**
   * Get user data directory path
   * @param {string} email - User email
   * @returns {string} User data directory path
   */
  static getUserDataDir(email) {
    return path.join(CONFIG.dataDir, 'users', email);
  }

  /**
   * Ensure user data directory exists, copy default data if new user
   * @param {string} email - User email
   */
  static async ensureUserDataDir(email) {
    const userDir = this.getUserDataDir(email);

    if (!fsSync.existsSync(userDir)) {
      await fs.mkdir(userDir, { recursive: true });

      // Copy default courses.json if it exists
      const defaultCoursesPath = path.join(CONFIG.dataDir, 'courses.json');
      if (fsSync.existsSync(defaultCoursesPath)) {
        const courses = JSON.parse(await fs.readFile(defaultCoursesPath, 'utf-8'));
        await fs.writeFile(path.join(userDir, 'courses.json'), JSON.stringify(courses, null, 2), 'utf-8');

        // Copy each course file
        for (const course of courses) {
          const srcPath = path.join(CONFIG.dataDir, course.filename);
          if (fsSync.existsSync(srcPath)) {
            const destPath = path.join(userDir, course.filename);
            await fs.copyFile(srcPath, destPath);
          }
        }
      }
    }
  }

  /**
   * Load courses for a user
   * @param {string} email - User email
   * @returns {Promise<Array>} Courses list
   */
  static async loadCourses(email) {
    await this.ensureUserDataDir(email);
    const filepath = path.join(this.getUserDataDir(email), 'courses.json');
    if (!fsSync.existsSync(filepath)) {
      return [];
    }
    const raw = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(raw);
  }

  /**
   * Save courses for a user
   * @param {string} email - User email
   * @param {Array} courses - Courses list
   */
  static async saveCourses(email, courses) {
    await this.ensureUserDataDir(email);
    const filepath = path.join(this.getUserDataDir(email), 'courses.json');
    await fs.writeFile(filepath, JSON.stringify(courses, null, 2), 'utf-8');
  }

  /**
   * Load vocab file for a user
   * @param {string} email - User email
   * @param {string} filename - Vocab filename
   * @returns {Promise<Array>} Vocab data
   */
  static async loadVocabFile(email, filename) {
    await this.ensureUserDataDir(email);
    const sanitized = FileService.sanitizeFilename(filename);
    const filepath = path.join(this.getUserDataDir(email), sanitized);

    if (!fsSync.existsSync(filepath)) {
      const error = new Error('File not found');
      error.statusCode = 404;
      throw error;
    }

    const raw = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(raw);
  }

  /**
   * Save vocab file for a user
   * @param {string} email - User email
   * @param {string} filename - Vocab filename
   * @param {Array} data - Vocab data
   */
  static async saveVocabFile(email, filename, data) {
    await this.ensureUserDataDir(email);
    const sanitized = FileService.sanitizeFilename(filename);
    const filepath = path.join(this.getUserDataDir(email), sanitized);
    const tmpPath = `${filepath}.tmp`;

    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmpPath, filepath);
  }

  /**
   * Delete vocab file for a user
   * @param {string} email - User email
   * @param {string} filename - Vocab filename
   */
  static async deleteVocabFile(email, filename) {
    const sanitized = FileService.sanitizeFilename(filename);
    const filepath = path.join(this.getUserDataDir(email), sanitized);
    if (fsSync.existsSync(filepath)) {
      await fs.unlink(filepath);
    }
  }

  // ==================== Snapshot Methods ====================

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

    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const timestamp = now.getTime();
    const id = `${date}-${timestamp}`;

    // Load current data
    const courses = await this.loadCourses(email);
    const vocabFiles = {};
    for (const course of courses) {
      try {
        vocabFiles[course.filename] = await this.loadVocabFile(email, course.filename);
      } catch (err) {
        console.warn(`Could not load ${course.filename} for snapshot`);
      }
    }

    const snapshot = {
      id,
      date,
      createdAt: now.toISOString(),
      note,
      courses,
      vocabFiles
    };

    const filepath = path.join(snapshotsDir, `snapshot-${id}.json`);
    await fs.writeFile(filepath, JSON.stringify(snapshot, null, 2), 'utf-8');

    return { id, date, createdAt: snapshot.createdAt, note };
  }

  /**
   * List all snapshots for a user
   */
  static async listSnapshots(email) {
    const snapshotsDir = this.getSnapshotsDir(email);
    if (!fsSync.existsSync(snapshotsDir)) {
      return [];
    }

    const files = await fs.readdir(snapshotsDir);
    const snapshots = [];

    for (const file of files) {
      if (file.startsWith('snapshot-') && file.endsWith('.json')) {
        const filepath = path.join(snapshotsDir, file);
        const content = JSON.parse(await fs.readFile(filepath, 'utf-8'));
        snapshots.push({
          id: content.id,
          date: content.date,
          createdAt: content.createdAt,
          note: content.note || ''
        });
      }
    }

    // Sort by createdAt descending (newest first)
    snapshots.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return snapshots;
  }

  /**
   * Restore a snapshot
   */
  static async restoreSnapshot(email, snapshotId) {
    const snapshotsDir = this.getSnapshotsDir(email);
    const filepath = path.join(snapshotsDir, `snapshot-${snapshotId}.json`);

    if (!fsSync.existsSync(filepath)) {
      const error = new Error('Snapshot not found');
      error.statusCode = 404;
      throw error;
    }

    const snapshot = JSON.parse(await fs.readFile(filepath, 'utf-8'));

    // Restore courses
    await this.saveCourses(email, snapshot.courses);

    // Restore vocab files
    for (const [filename, data] of Object.entries(snapshot.vocabFiles)) {
      await this.saveVocabFile(email, filename, data);
    }

    return { restored: true, snapshotId };
  }

  /**
   * Delete a snapshot
   */
  static async deleteSnapshot(email, snapshotId) {
    const snapshotsDir = this.getSnapshotsDir(email);
    const filepath = path.join(snapshotsDir, `snapshot-${snapshotId}.json`);

    if (!fsSync.existsSync(filepath)) {
      const error = new Error('Snapshot not found');
      error.statusCode = 404;
      throw error;
    }

    await fs.unlink(filepath);
    return { deleted: true, snapshotId };
  }

  /**
   * Check and create automatic weekly snapshot if needed
   */
  static async checkAutoSnapshot(email) {
    try {
      await this.ensureUserDataDir(email);
      const userDir = this.getUserDataDir(email);
      const stateFile = path.join(userDir, 'server_state.json');

      let state = {};
      if (fsSync.existsSync(stateFile)) {
        state = JSON.parse(await fs.readFile(stateFile, 'utf-8'));
      }

      const now = new Date();
      const weekNumber = Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));

      if (state.lastAutoSnapshotWeek === weekNumber) {
        return { created: false };
      }

      // Create automatic snapshot
      const snapshot = await this.createSnapshot(email, 'Auto-weekly backup');

      // Update state
      state.lastAutoSnapshotWeek = weekNumber;
      await fs.writeFile(stateFile, JSON.stringify(state, null, 2), 'utf-8');

      console.log(`Auto-snapshot created for ${email}: ${snapshot.id}`);
      return { created: true, snapshot };
    } catch (err) {
      console.error('Error creating auto-snapshot:', err);
      return { created: false, error: err.message };
    }
  }
}

// Utilities
class FileService {
  /**
   * Sanitize filename to prevent path traversal attacks
   * @param {string} name - The filename to sanitize
   * @returns {string} Sanitized filename
   * @throws {Error} If filename is invalid
   */
  static sanitizeFilename(name) {
    if (!CONFIG.filenamePattern.test(name)) {
      throw new Error('Invalid filename format. Use alphanumeric, hyphens, underscores, and .json extension only.');
    }
    return name;
  }

  /**
   * Get full file path
   * @param {string} filename - Sanitized filename
   * @returns {string} Full file path
   */
  static getFilePath(filename) {
    return path.join(CONFIG.dataDir, filename);
  }

  /**
   * Check if file exists
   * @param {string} filepath - Full file path
   * @returns {boolean}
   */
  static fileExists(filepath) {
    return fsSync.existsSync(filepath);
  }

  /**
   * Load JSON data from file
   * @param {string} filename - Sanitized filename
   * @returns {Promise<Array>} Parsed JSON data
   */
  static async loadFromFile(filename) {
    const filepath = this.getFilePath(filename);
    const raw = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(raw);
  }

  /**
   * Save JSON data to file atomically
   * @param {string} filename - Sanitized filename
   * @param {*} data - Data to save
   */
  static async saveToFile(filename, data) {
    const filepath = this.getFilePath(filename);
    const tmpPath = `${filepath}.tmp`;

    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmpPath, filepath);
  }

  /**
   * Load and validate a vocab file
   * @param {string} filename - Filename to load
   * @returns {Promise<Array>} Vocab data
   */
  static async loadVocabFile(filename) {
    const sanitized = this.sanitizeFilename(filename);
    const filepath = this.getFilePath(sanitized);

    if (!this.fileExists(filepath)) {
      const error = new Error('File not found');
      error.statusCode = 404;
      throw error;
    }

    return await this.loadFromFile(sanitized);
  }

  /**
   * Load courses mapping
   * @returns {Promise<Array>} Courses list
   */
  static async loadCourses() {
    const filepath = path.join(CONFIG.dataDir, 'courses.json');
    if (!this.fileExists(filepath)) {
      return [];
    }
    const raw = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(raw);
  }

  /**
   * Save courses mapping
   * @param {Array} courses - Courses list
   */
  static async saveCourses(courses) {
    const filepath = path.join(CONFIG.dataDir, 'courses.json');
    await fs.writeFile(filepath, JSON.stringify(courses, null, 2), 'utf-8');
  }

  /**
   * Delete a file
   * @param {string} filename - Filename to delete
   */
  static async deleteFile(filename) {
    const sanitized = this.sanitizeFilename(filename);
    const filepath = this.getFilePath(sanitized);
    if (this.fileExists(filepath)) {
      await fs.unlink(filepath);
    }
  }

  /**
   * Validate vocab list format
   * @param {Array} list - List to validate
   * @throws {Error} If invalid format
   */
  static validateVocabList(list) {
    if (!Array.isArray(list)) {
      throw new Error('Content must be an array');
    }

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item.id || !item.word || !item.answer) {
        throw new Error(`Invalid item at index ${i}: must have id, word, and answer`);
      }
    }
  }

  // Note: Daily decay is now handled per-user in the POST /api/maintenance/decay endpoint
  // This ensures each user's data is processed independently with their own state tracking
}

// ===========================================
// API Routes (All require authentication)
// ===========================================

/**
 * POST /api/maintenance/decay
 * Trigger daily decay manually for the logged-in user
 */
app.post('/api/maintenance/decay', authMiddleware, async (req, res) => {
  try {
    const email = req.user.email;
    const today = new Date().toISOString().split('T')[0];

    // Check if already run today for this user
    const userDir = UserFileService.getUserDataDir(email);
    const stateFile = path.join(userDir, 'server_state.json');
    let state = {};
    if (fsSync.existsSync(stateFile)) {
      state = JSON.parse(await fs.readFile(stateFile, 'utf-8'));
    }

    if (state.lastDecay === today) {
      return res.json({ run: false, message: 'Already run today' });
    }

    const courses = await UserFileService.loadCourses(email);
    let totalModified = 0;

    for (const course of courses) {
      try {
        const vocab = await UserFileService.loadVocabFile(email, course.filename);
        const pageSize = course.pageSize || 15;
        let modified = false;

        // Process each page independently
        for (let pageStart = 0; pageStart < vocab.length; pageStart += pageSize) {
          const pageEnd = Math.min(pageStart + pageSize, vocab.length);
          const pageItems = vocab.slice(pageStart, pageEnd);

          // Calculate average filled states for this page
          const totalFilled = pageItems.reduce((sum, item) => {
            return sum + (item.states?.filter(s => s !== 'none').length || 0);
          }, 0);

          // Use floor instead of round to be more conservative with decay
          // This prevents removing marks when the distribution is already balanced
          const avgFilled = Math.floor(totalFilled / pageItems.length);

          // Apply decay to each item on this page
          for (let i = pageStart; i < pageEnd; i++) {
            const item = vocab[i];
            if (!item.states || item.states.length === 0) continue;

            const currentFilled = item.states.filter(s => s !== 'none').length;

            // Only modify if item has MORE filled states than average (decay)
            if (currentFilled > avgFilled) {
              const toRemove = currentFilled - avgFilled;
              let removed = 0;
              for (let pos = item.states.length - 1; pos >= 0 && removed < toRemove; pos--) {
                if (item.states[pos] !== 'none') {
                  item.states[pos] = 'none';
                  removed++;
                  modified = true;
                }
              }
            }
            // Only boost if item has FEWER filled states than average
            else if (currentFilled < avgFilled) {
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
            // If currentFilled === avgFilled, do nothing (no changes needed)
          }
        }

        if (modified) {
          await UserFileService.saveVocabFile(email, course.filename, vocab);
          totalModified++;
        }
      } catch (err) {
        console.error(`Error applying decay to course ${course.name}:`, err);
      }
    }

    // Save per-user state
    state.lastDecay = today;
    await fs.writeFile(stateFile, JSON.stringify(state, null, 2), 'utf-8');

    res.json({ run: true, message: `Daily decay applied to ${totalModified} course(s)` });
  } catch (err) {
    console.error('Error running daily decay:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/vocab-files/:filename
 * Load a vocab file by filename for the logged-in user
 */
app.get('/api/vocab-files/:filename', authMiddleware, async (req, res) => {
  try {
    const data = await UserFileService.loadVocabFile(req.user.email, req.params.filename);
    res.json(data);
  } catch (err) {
    console.error('Error loading vocab file:', err);
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ error: err.message || 'Could not load file' });
  }
});

/**
 * PATCH /api/vocab-files/:courseId/:id
 * Update a specific vocab item for the logged-in user
 */
app.patch('/api/vocab-files/:courseId/:id', authMiddleware, async (req, res) => {
  const email = req.user.email;
  const filename = `${req.params.courseId}.json`;
  const itemId = req.params.id;
  const updates = req.body;

  try {
    const vocab = await UserFileService.loadVocabFile(email, filename);
    const itemIndex = vocab.findIndex(item => item.id == itemId);

    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const updatedItem = {
      ...vocab[itemIndex],
      states: updates,
      lastUpdated: new Date().toISOString()
    };

    vocab[itemIndex] = updatedItem;
    await UserFileService.saveVocabFile(email, filename, vocab);

    res.json({ success: true, item: updatedItem });
  } catch (err) {
    console.error('Error updating vocab item:', err);
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ error: err.message || 'Unable to save changes' });
  }
});

/**
 * GET /api/courses
 * Get all courses for the logged-in user
 * Also triggers automatic weekly snapshot
 */
app.get('/api/courses', authMiddleware, async (req, res) => {
  try {
    const email = req.user.email;

    // Check for automatic weekly snapshot
    await UserFileService.checkAutoSnapshot(email);

    const courses = await UserFileService.loadCourses(email);
    res.json(courses);
  } catch (err) {
    console.error('Error loading courses:', err);
    res.status(500).json({ error: 'Could not load courses' });
  }
});

/**
 * POST /api/courses
 * Create a new course for the logged-in user
 */
app.post('/api/courses', authMiddleware, async (req, res) => {
  const email = req.user.email;
  const { name, pageSize, content } = req.body;

  if (!name || !content) {
    return res.status(400).json({ error: 'Name and content are required' });
  }

  try {
    FileService.validateVocabList(content);

    const courses = await UserFileService.loadCourses(email);
    const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const filename = `${sanitizedName}-${Date.now()}.json`;

    await UserFileService.saveVocabFile(email, filename, content);

    const newCourse = {
      name,
      filename,
      pageSize: pageSize || 15,
      order: courses.length + 1
    };
    courses.push(newCourse);
    await UserFileService.saveCourses(email, courses);

    res.json({ success: true, course: newCourse });
  } catch (err) {
    console.error('Error creating course:', err);
    if (err.message.startsWith('Invalid item') || err.message === 'Content must be an array') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Could not create course' });
  }
});

/**
 * POST /api/courses/:id/append
 * Append data to an existing course for the logged-in user
 */
app.post('/api/courses/:id/append', authMiddleware, async (req, res) => {
  const email = req.user.email;
  const courseId = req.params.id;
  const { content } = req.body;

  if (!content || !Array.isArray(content)) {
    return res.status(400).json({ error: 'Content array is required' });
  }

  try {
    FileService.validateVocabList(content);

    const courses = await UserFileService.loadCourses(email);
    const course = courses.find(c => c.filename === `${courseId}.json`);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const vocab = await UserFileService.loadVocabFile(email, course.filename);
    const maxId = vocab.reduce((max, item) => Math.max(max, parseInt(item.id) || 0), 0);

    const newItems = content.map((item, index) => ({
      ...item,
      id: (maxId + 1 + index).toString(),
      states: item.states || [],
      lastUpdated: new Date().toISOString()
    }));

    const updatedVocab = vocab.concat(newItems);
    await UserFileService.saveVocabFile(email, course.filename, updatedVocab);

    res.json({ success: true, added: newItems.length });
  } catch (err) {
    console.error('Error appending to course:', err);
    if (err.message.startsWith('Invalid item') || err.message === 'Content must be an array') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Could not append to course' });
  }
});

/**
 * PUT /api/courses/:id
 * Update course metadata for the logged-in user
 */
app.put('/api/courses/:id', authMiddleware, async (req, res) => {
  const email = req.user.email;
  const courseId = req.params.id;
  const updates = req.body;

  try {
    const courses = await UserFileService.loadCourses(email);
    const courseIndex = courses.findIndex(c => c.filename === `${courseId}.json`);

    if (courseIndex === -1) {
      return res.status(404).json({ error: 'Course not found' });
    }

    courses[courseIndex] = {
      ...courses[courseIndex],
      ...updates,
      filename: courses[courseIndex].filename
    };

    await UserFileService.saveCourses(email, courses);
    res.json({ success: true, course: courses[courseIndex] });
  } catch (err) {
    console.error('Error updating course:', err);
    res.status(500).json({ error: 'Could not update course' });
  }
});

/**
 * DELETE /api/courses/:id
 * Delete a course and its file for the logged-in user
 */
app.delete('/api/courses/:id', authMiddleware, async (req, res) => {
  const email = req.user.email;
  const courseId = req.params.id;

  try {
    const courses = await UserFileService.loadCourses(email);
    const courseIndex = courses.findIndex(c => c.filename === `${courseId}.json`);

    if (courseIndex === -1) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const course = courses[courseIndex];

    try {
      await UserFileService.deleteVocabFile(email, course.filename);
    } catch (err) {
      console.warn(`Could not delete file ${course.filename}:`, err);
    }

    courses.splice(courseIndex, 1);
    await UserFileService.saveCourses(email, courses);

    res.json({ success: true, message: `Course '${course.name}' deleted` });
  } catch (err) {
    console.error('Error deleting course:', err);
    res.status(500).json({ error: 'Could not delete course' });
  }
});

// ===========================================
// Snapshot API Routes
// ===========================================

/**
 * POST /api/snapshots
 * Create a snapshot of current user data
 */
app.post('/api/snapshots', authMiddleware, async (req, res) => {
  try {
    const { note } = req.body;
    const result = await UserFileService.createSnapshot(req.user.email, note || '');
    res.json({ success: true, snapshot: result });
  } catch (err) {
    console.error('Error creating snapshot:', err);
    res.status(500).json({ error: 'Could not create snapshot' });
  }
});

/**
 * GET /api/snapshots
 * List all snapshots for the logged-in user
 */
app.get('/api/snapshots', authMiddleware, async (req, res) => {
  try {
    const snapshots = await UserFileService.listSnapshots(req.user.email);
    res.json(snapshots);
  } catch (err) {
    console.error('Error listing snapshots:', err);
    res.status(500).json({ error: 'Could not list snapshots' });
  }
});

/**
 * POST /api/snapshots/:id/restore
 * Restore a snapshot
 */
app.post('/api/snapshots/:id/restore', authMiddleware, async (req, res) => {
  try {
    const result = await UserFileService.restoreSnapshot(req.user.email, req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Error restoring snapshot:', err);
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ error: err.message || 'Could not restore snapshot' });
  }
});

/**
 * DELETE /api/snapshots/:id
 * Delete a snapshot
 */
app.delete('/api/snapshots/:id', authMiddleware, async (req, res) => {
  try {
    const result = await UserFileService.deleteSnapshot(req.user.email, req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Error deleting snapshot:', err);
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({ error: err.message || 'Could not delete snapshot' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(CONFIG.port, () => {
  console.log(`✓ Server listening on port ${CONFIG.port}`);
  console.log(`✓ Data directory: ${CONFIG.dataDir}`);
});