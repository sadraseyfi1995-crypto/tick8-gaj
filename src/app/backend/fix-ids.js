const fs = require('fs').promises;
const path = require('path');

/**
 * Fixes sequential IDs in a JSON file containing an array of objects
 * @param {string} filePath - Path to the JSON file
 * @param {number} startId - Starting ID number (default: 1)
 */
async function fixSequentialIds(filePath, startId = 1) {
  try {
    // Check if file exists
    const absolutePath = path.resolve(filePath);
    
    // Read the file
    console.log(`Reading file: ${absolutePath}`);
    const fileContent = await fs.readFile(absolutePath, 'utf-8');
    
    // Parse JSON
    let data;
    try {
      data = JSON.parse(fileContent);
    } catch (parseError) {
      throw new Error(`Invalid JSON in file: ${parseError.message}`);
    }
    
    // Check if data is an array
    if (!Array.isArray(data)) {
      throw new Error('File content must be a JSON array');
    }
    
    // Check if all objects have id property
    const hasIds = data.every(item => typeof item === 'object' && item !== null);
    if (!hasIds) {
      throw new Error('All array items must be objects');
    }
    
    // Check if IDs are sequential
    let needsFix = false;
    for (let i = 0; i < data.length; i++) {
      const expectedId = startId + i;
      if (data[i].id !== expectedId) {
        needsFix = true;
        break;
      }
    }
    
    if (!needsFix) {
      console.log('✓ IDs are already sequential. No changes needed.');
      return { fixed: false, count: data.length };
    }
    
    // Fix IDs
    console.log('✗ IDs are not sequential. Fixing...');
    const originalIds = data.map(item => item.id);
    
    data.forEach((item, index) => {
      item.id = startId + index;
    });
    
    // Write back to file
    const updatedContent = JSON.stringify(data, null, 2);
    await fs.writeFile(absolutePath, updatedContent, 'utf-8');
    
    console.log('✓ IDs fixed successfully!');
    console.log(`  Original IDs: [${originalIds.slice(0, 5).join(', ')}${originalIds.length > 5 ? '...' : ''}]`);
    console.log(`  New IDs: [${data.slice(0, 5).map(item => item.id).join(', ')}${data.length > 5 ? '...' : ''}]`);
    console.log(`  Total objects processed: ${data.length}`);
    
    return { fixed: true, count: data.length };
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`✗ Error: File not found - ${filePath}`);
    } else {
      console.error(`✗ Error: ${error.message}`);
    }
    process.exit(1);
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node fix-ids.js <filename> [startId]

Arguments:
  filename    Path to JSON file containing array of objects
  startId     Starting ID number (optional, default: 1)

Example:
  node fix-ids.js data.json
  node fix-ids.js data.json 0
  node fix-ids.js ./path/to/users.json 100
    `);
    process.exit(0);
  }
  
  const filePath = args[0];
  const startId = args[1] ? parseInt(args[1], 10) : 1;
  
  if (isNaN(startId)) {
    console.error('✗ Error: startId must be a valid number');
    process.exit(1);
  }
  
  fixSequentialIds(filePath, startId);
}

module.exports = { fixSequentialIds };