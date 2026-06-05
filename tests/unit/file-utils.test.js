/**
 * Unit tests for file-utils module
 */

const path = require('path');
const {
  fileExists,
  getFileExtension,
  isValidModelFile,
  validateFoldFile,
  validateSvgFile,
  ensureDirectory,
  getFileStats
} = require('../../src/utils/file-utils');

describe('fileExists', () => {
  test('should return true for existing file', () => {
    const samplePath = path.join(__dirname, '../../examples/sample-crane.fold');
    expect(fileExists(samplePath)).toBe(true);
  });

  test('should return false for non-existing file', () => {
    expect(fileExists('/nonexistent/path/file.fold')).toBe(false);
  });
});

describe('getFileExtension', () => {
  test('should return extension in lowercase', () => {
    expect(getFileExtension('model.FOLD')).toBe('.fold');
    expect(getFileExtension('model.SVG')).toBe('.svg');
    expect(getFileExtension('model.Png')).toBe('.png');
  });

  test('should return empty string for no extension', () => {
    expect(getFileExtension('filename')).toBe('');
  });
});

describe('isValidModelFile', () => {
  test('should return true for .fold files', () => {
    expect(isValidModelFile('model.fold')).toBe(true);
    expect(isValidModelFile('path/to/model.FOLD')).toBe(true);
  });

  test('should return true for .svg files', () => {
    expect(isValidModelFile('model.svg')).toBe(true);
    expect(isValidModelFile('path/to/model.SVG')).toBe(true);
  });

  test('should return false for other extensions', () => {
    expect(isValidModelFile('model.obj')).toBe(false);
    expect(isValidModelFile('model.stl')).toBe(false);
    expect(isValidModelFile('model.json')).toBe(false);
    expect(isValidModelFile('filename')).toBe(false);
  });
});

describe('validateFoldFile', () => {
  test('should validate sample-crane.fold', () => {
    const samplePath = path.join(__dirname, '../../examples/sample-crane.fold');
    const result = validateFoldFile(samplePath);
    expect(result.valid).toBe(true);
    expect(result.vertices).toBeGreaterThan(0);
    expect(result.edges).toBeGreaterThan(0);
  });

  test('should reject non-existent file', () => {
    const result = validateFoldFile('/nonexistent/file.fold');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('File not found');
  });

  test('should reject non-fold file', () => {
    const result = validateFoldFile(__filename); // this JS file
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Not a FOLD file');
  });
});

describe('validateSvgFile', () => {
  test('should reject non-existent file', () => {
    const result = validateSvgFile('/nonexistent/file.svg');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('File not found');
  });

  test('should reject non-svg file', () => {
    const samplePath = path.join(__dirname, '../../examples/sample-crane.fold');
    const result = validateSvgFile(samplePath);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Not an SVG file');
  });

  test('should reject svg file with invalid content', () => {
    const fs = require('fs');
    const tmpFile = '/tmp/invalid-svg-test.svg';
    fs.writeFileSync(tmpFile, 'This is not an SVG file content');
    const result = validateSvgFile(tmpFile);
    fs.unlinkSync(tmpFile);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid SVG structure');
  });
});

describe('ensureDirectory', () => {
  test('should not throw for existing directory', () => {
    expect(() => ensureDirectory(__dirname)).not.toThrow();
  });

  test('should not throw for temp directory', () => {
    const tempDir = '/tmp/origami-test-' + Date.now();
    expect(() => ensureDirectory(tempDir)).not.toThrow();
  });
});

describe('getFileStats', () => {
  test('should return stats for existing file', () => {
    const samplePath = path.join(__dirname, '../../examples/sample-crane.fold');
    const stats = getFileStats(samplePath);
    expect(stats).not.toBeNull();
    expect(stats.size).toBeGreaterThan(0);
    expect(stats.isFile()).toBe(true);
  });

  test('should return null for non-existent file', () => {
    const stats = getFileStats('/nonexistent/file.fold');
    expect(stats).toBeNull();
  });
});
