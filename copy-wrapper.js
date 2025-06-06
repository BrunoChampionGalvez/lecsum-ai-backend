const fs = require('fs');
const path = require('path');

// Source and destination paths
const sourcePath = path.join(__dirname, 'src', 'modules', 'ai', 'gemini-wrapper.mjs');
const destPath = path.join(__dirname, 'dist', 'modules', 'ai', 'gemini-wrapper.mjs');

// Ensure the destination directory exists
const destDir = path.dirname(destPath);
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

// Copy the file
try {
  fs.copyFileSync(sourcePath, destPath);
  console.log(`Successfully copied wrapper from ${sourcePath} to ${destPath}`);
} catch (error) {
  console.error('Error copying wrapper file:', error);
  process.exit(1);
}
