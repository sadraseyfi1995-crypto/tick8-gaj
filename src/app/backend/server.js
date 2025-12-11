const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { setupAuthRoutes, optionalAuthMiddleware } = require('./auth');

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

  /**
   * Apply daily decay rules to all courses
   */
  static async applyDailyDecay() {
    const courses = await this.loadCourses();
    const today = new Date().toISOString().split('T')[0];

    // Check if already run today
    const stateFile = path.join(CONFIG.dataDir, 'server_state.json');
    let state = {};
    if (this.fileExists(stateFile)) {
      state = JSON.parse(await fs.readFile(stateFile, 'utf-8'));
    }

    if (state.lastDecay === today) {
      console.log('Daily decay already run today.');
      return { run: false, message: 'Already run today' };
    }

    console.log('Running daily decay...');
    let totalModified = 0;

    for (const course of courses) {
      try {
        const vocab = await this.loadVocabFile(course.filename);
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

          const avgFilled = Math.round(totalFilled / pageItems.length);

          // Apply decay to each item on this page
          for (let i = pageStart; i < pageEnd; i++) {
            const item = vocab[i];

            // Skip items without states
            if (!item.states || item.states.length === 0) continue;

            const currentFilled = item.states.filter(s => s !== 'none').length;

            // Only decay if item has more filled states than average
            if (currentFilled > avgFilled) {
              const toRemove = currentFilled - avgFilled;
              let removed = 0;

              // Remove from rightmost positions first (7 → 0)
              for (let pos = item.states.length - 1; pos >= 0 && removed < toRemove; pos--) {
                if (item.states[pos] !== 'none') {
                  item.states[pos] = 'none';
                  removed++;
                  modified = true;
                }
              }
            }
          }
        }

        if (modified) {
          await this.saveToFile(course.filename, vocab);
          totalModified++;
          console.log(`Applied decay to course: ${course.name}`);
        }
      } catch (err) {
        console.error(`Error applying decay to course ${course.name}:`, err);
      }
    }

    // Update state
    state.lastDecay = today;
    await fs.writeFile(stateFile, JSON.stringify(state, null, 2), 'utf-8');

    console.log(`Daily decay complete. Modified ${totalModified} course(s).`);
    return {
      run: true,
      message: `Daily decay applied to ${totalModified} course(s)`
    };
  }
}

// API Routes
/**
 * POST /api/maintenance/decay
 * Trigger daily decay manually
 */
app.post('/api/maintenance/decay', async (req, res) => {
  try {
    const result = await FileService.applyDailyDecay();
    res.json(result);
  } catch (err) {
    console.error('Error running daily decay:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/vocab-files/:filename
 * Load a vocab file by filename
 */
app.get('/api/vocab-files/:filename', async (req, res) => {
  try {
    const data = await FileService.loadVocabFile(req.params.filename);
    res.json(data);
  } catch (err) {
    console.error('Error loading vocab file:', err);

    const statusCode = err.statusCode || 500;
    const message = err.statusCode === 404
      ? 'File not found'
      : err.message === 'Invalid filename format. Use alphanumeric, hyphens, underscores, and .json extension only.'
        ? err.message
        : 'Could not load file';

    res.status(statusCode).json({ error: message });
  }
});

/**
 * PATCH /api/vocab-files/:courseId/:id
 * Update a specific vocab item
 */
app.patch('/api/vocab-files/:courseId/:id', async (req, res) => {
  const filename = `${req.params.courseId}.json`;
  const itemId = req.params.id;
  const updates = req.body;

  try {
    // Load vocab file
    const vocab = await FileService.loadVocabFile(filename);

    // Find item to update
    const itemIndex = vocab.findIndex(item => item.id == itemId);

    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Update item
    const updatedItem = {
      ...vocab[itemIndex],
      states: updates,
      lastUpdated: new Date().toISOString()
    };

    vocab[itemIndex] = updatedItem;

    // Save changes
    const sanitized = FileService.sanitizeFilename(filename);
    await FileService.saveToFile(sanitized, vocab);

    res.json({
      success: true,
      item: updatedItem
    });
  } catch (err) {
    console.error('Error updating vocab item:', err);

    const statusCode = err.statusCode || 500;
    const message = err.statusCode === 404
      ? 'File not found'
      : err.message === 'Invalid filename format. Use alphanumeric, hyphens, underscores, and .json extension only.'
        ? err.message
        : 'Unable to save changes';

    res.status(statusCode).json({ error: message });
  }
});

/**
 * GET /api/courses
 * Get all courses
 */
app.get('/api/courses', async (req, res) => {
  try {
    const courses = await FileService.loadCourses();
    res.json(courses);
  } catch (err) {
    console.error('Error loading courses:', err);
    res.status(500).json({ error: 'Could not load courses' });
  }
});

/**
 * POST /api/courses
 * Create a new course
 */
app.post('/api/courses', async (req, res) => {
  const { name, pageSize, content } = req.body;

  if (!name || !content) {
    return res.status(400).json({ error: 'Name and content are required' });
  }

  try {
    // Validate content format
    FileService.validateVocabList(content);

    const courses = await FileService.loadCourses();

    // Generate filename
    const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const filename = `${sanitizedName}-${Date.now()}.json`;

    // Save content file
    await FileService.saveToFile(filename, content);

    // Add to courses
    const newCourse = {
      name,
      filename,
      pageSize: pageSize || 15,
      order: courses.length + 1
    };
    courses.push(newCourse);
    await FileService.saveCourses(courses);

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
 * Append data to an existing course
 */
app.post('/api/courses/:id/append', async (req, res) => {
  const courseId = req.params.id;
  const { content } = req.body;

  if (!content || !Array.isArray(content)) {
    return res.status(400).json({ error: 'Content array is required' });
  }

  try {
    // Validate content format
    FileService.validateVocabList(content);

    const courses = await FileService.loadCourses();
    const course = courses.find(c => c.filename === `${courseId}.json`);

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Load existing data
    const vocab = await FileService.loadVocabFile(course.filename);

    // Find max ID
    const maxId = vocab.reduce((max, item) => Math.max(max, parseInt(item.id) || 0), 0);

    // Re-index new items
    const newItems = content.map((item, index) => ({
      ...item,
      id: (maxId + 1 + index).toString(),
      states: item.states || [], // Ensure states exist
      lastUpdated: new Date().toISOString()
    }));

    // Append and save
    const updatedVocab = vocab.concat(newItems);
    await FileService.saveToFile(course.filename, updatedVocab);

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
 * Update course metadata
 */
app.put('/api/courses/:id', async (req, res) => {
  const courseId = req.params.id;
  const updates = req.body;

  try {
    const courses = await FileService.loadCourses();
    const courseIndex = courses.findIndex(c => c.filename === `${courseId}.json`);

    if (courseIndex === -1) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Update fields
    courses[courseIndex] = {
      ...courses[courseIndex],
      ...updates,
      // Prevent updating filename via this endpoint for safety
      filename: courses[courseIndex].filename
    };

    await FileService.saveCourses(courses);
    res.json({ success: true, course: courses[courseIndex] });
  } catch (err) {
    console.error('Error updating course:', err);
    res.status(500).json({ error: 'Could not update course' });
  }
});

/**
 * DELETE /api/courses/:id
 * Delete a course and its corresponding file
 */
app.delete('/api/courses/:id', async (req, res) => {
  const courseId = req.params.id;

  try {
    // Load courses
    const courses = await FileService.loadCourses();

    // Find course by filename (id + .json)
    const courseIndex = courses.findIndex(c => c.filename === `${courseId}.json`);

    if (courseIndex === -1) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const course = courses[courseIndex];

    // Delete the data file
    try {
      await FileService.deleteFile(course.filename);
    } catch (err) {
      console.warn(`Could not delete file ${course.filename}:`, err);
    }

    // Remove from mapping
    courses.splice(courseIndex, 1);
    await FileService.saveCourses(courses);

    res.json({ success: true, message: `Course '${course.name}' deleted` });
  } catch (err) {
    console.error('Error deleting course:', err);
    res.status(500).json({ error: 'Could not delete course' });
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