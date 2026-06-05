/**
 * File utilities for OrigamiSimulator CLI
 * Handles file validation and operations
 */

const path = require('path');
const fs = require('fs');

/**
 * Check if file exists
 */
function fileExists(filePath) {
  return fs.existsSync(filePath);
}

/**
 * Get file extension (lowercase)
 */
function getFileExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

/**
 * Validate if file is a supported format
 */
function isValidModelFile(filePath) {
  const ext = getFileExtension(filePath);
  return ext === '.fold' || ext === '.svg';
}

/**
 * Validate if file is a supported dieline format (PDF/EPS/AI/SVG/FOLD)
 */
function isValidDielineFile(filePath) {
  const ext = getFileExtension(filePath);
  return ['.pdf', '.eps', '.ai', '.svg', '.fold'].includes(ext);
}

/**
 * Read file content
 */
function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Validate FOLD file structure
 */
function validateFoldFile(filePath) {
  if (!fileExists(filePath)) {
    return { valid: false, error: 'File not found' };
  }

  const ext = getFileExtension(filePath);
  if (ext !== '.fold') {
    return { valid: false, error: 'Not a FOLD file' };
  }

  try {
    const content = readFile(filePath);
    const data = JSON.parse(content);

    const hasCoords = Array.isArray(data.vertices_coords);
    const hasEdges = Array.isArray(data.edges_vertices);
    const hasFaces = Array.isArray(data.faces_vertices);

    return {
      valid: true,
      vertices: hasCoords ? data.vertices_coords.length : 0,
      edges: hasEdges ? data.edges_vertices.length : 0,
      faces: hasFaces ? data.faces_vertices.length : 0
    };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

/**
 * Validate SVG file structure
 */
function validateSvgFile(filePath) {
  if (!fileExists(filePath)) {
    return { valid: false, error: 'File not found' };
  }

  const ext = getFileExtension(filePath);
  if (ext !== '.svg') {
    return { valid: false, error: 'Not an SVG file' };
  }

  try {
    const content = readFile(filePath);
    if (content.includes('<svg') || content.includes('<SVG')) {
      return { valid: true };
    }
    return { valid: false, error: 'Invalid SVG structure' };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

/**
 * Create directory if not exists
 */
function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Get file stats
 */
function getFileStats(filePath) {
  if (!fileExists(filePath)) {
    return null;
  }
  return fs.statSync(filePath);
}

module.exports = {
  fileExists,
  getFileExtension,
  isValidModelFile,
  isValidDielineFile,
  readFile,
  validateFoldFile,
  validateSvgFile,
  ensureDirectory,
  getFileStats
};
