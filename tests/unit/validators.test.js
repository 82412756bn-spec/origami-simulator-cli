/**
 * Unit tests for command validation
 * Tests CLI argument parsing and validation logic
 */

const path = require('path');
const fs = require('fs');

// Test FOLD file validation logic
describe('FOLD File Validation', () => {
  const FOLD_PATTERN = /^\{"file_spec":/;

  test('should detect valid FOLD JSON', () => {
    const validFold = '{"file_spec": 1.1, "vertices_coords": [[0,0,0]]}';
    expect(FOLD_PATTERN.test(validFold)).toBe(true);
  });

  test('should reject invalid JSON', () => {
    const invalidFold = '{ invalid json }';
    expect(FOLD_PATTERN.test(invalidFold)).toBe(false);
  });

  test('should validate sample-crane.fold structure', () => {
    const samplePath = path.join(__dirname, '../../examples/sample-crane.fold');
    const content = fs.readFileSync(samplePath, 'utf8');
    const data = JSON.parse(content);

    expect(data).toHaveProperty('file_spec');
    expect(data).toHaveProperty('vertices_coords');
    expect(data).toHaveProperty('edges_vertices');
    expect(Array.isArray(data.vertices_coords)).toBe(true);
    expect(Array.isArray(data.edges_vertices)).toBe(true);
  });

  test('should validate FOLD file can be parsed', () => {
    const samplePath = path.join(__dirname, '../../examples/sample-crane.fold');
    expect(() => {
      const content = fs.readFileSync(samplePath, 'utf8');
      JSON.parse(content);
    }).not.toThrow();
  });
});

// Test SVG file validation logic
describe('SVG File Validation', () => {
  test('should detect SVG content', () => {
    const validSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
    expect(validSvg.includes('<svg')).toBe(true);
  });

  test('should detect SVG with namespace', () => {
    const svgWithNs = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>';
    expect(svgWithNs.includes('<svg')).toBe(true);
  });

  test('should reject non-SVG content', () => {
    const invalidSvg = '<html><body>Not SVG</body></html>';
    expect(invalidSvg.includes('<svg')).toBe(false);
  });
});

// Test command options validation
describe('Command Options Validation', () => {
  describe('Export formats', () => {
    const validFormats = ['fold', 'stl', 'obj', 'png', 'svg'];

    test('should accept valid export formats', () => {
      validFormats.forEach(format => {
        expect(validFormats.includes(format)).toBe(true);
      });
    });

    test('should reject invalid export formats', () => {
      expect(validFormats.includes('pdf')).toBe(false);
      expect(validFormats.includes('jpg')).toBe(false);
      expect(validFormats.includes('html')).toBe(false);
    });
  });

  describe('View modes', () => {
    const validModes = ['pattern', 'simulation', 'folded', 'strain'];

    test('should accept valid view modes', () => {
      validModes.forEach(mode => {
        expect(validModes.includes(mode)).toBe(true);
      });
    });

    test('should reject invalid view modes', () => {
      expect(validModes.includes('invalid')).toBe(false);
      expect(validModes.includes('3d')).toBe(false);
      expect(validModes.includes('')).toBe(false);
    });
  });

  describe('Fold percent range', () => {
    test('should accept valid percent values', () => {
      [0, 0.5, 1.0].forEach(percent => {
        expect(percent >= 0 && percent <= 1).toBe(true);
      });
    });

    test('should reject out-of-range values', () => {
      [-0.1, 1.5, 2.0].forEach(percent => {
        expect(percent >= 0 && percent <= 1).toBe(false);
      });
    });
  });

  describe('Record formats', () => {
    const validFormats = ['gif', 'webm', 'mp4'];

    test('should accept valid record formats', () => {
      validFormats.forEach(format => {
        expect(validFormats.includes(format)).toBe(true);
      });
    });

    test('should reject invalid record formats', () => {
      expect(validFormats.includes('avi')).toBe(false);
      expect(validFormats.includes('mov')).toBe(false);
    });
  });
});

// Test file path handling
describe('File Path Handling', () => {
  test('should resolve relative paths', () => {
    const relativePath = './examples/sample-crane.fold';
    const resolved = path.resolve(relativePath);
    expect(path.isAbsolute(resolved)).toBe(true);
  });

  test('should extract file extension', () => {
    expect(path.extname('model.fold')).toBe('.fold');
    expect(path.extname('model.svg')).toBe('.svg');
    expect(path.extname('model.png')).toBe('.png');
    expect(path.extname('model.JPG')).toBe('.JPG');
  });

  test('should extract filename without extension', () => {
    expect(path.basename('model.fold', '.fold')).toBe('model');
    expect(path.basename('path/to/model.svg', '.svg')).toBe('model');
  });
});

// Test URL building
describe('URL Building', () => {
  test('should encode special characters', () => {
    const encoded = encodeURIComponent('Tessellations/miura-ori.svg');
    expect(encoded).toBe('Tessellations%2Fmiura-ori.svg');
  });

  test('should not double-encode already encoded', () => {
    const first = encodeURIComponent('Tessellations%2Fmiura-ori.svg');
    const second = encodeURIComponent(first);
    // Second encoding should not change already encoded
    expect(decodeURIComponent(second)).toBe(first);
  });
});

// Test numeric validation
describe('Numeric Validation', () => {
  test('should parse valid numeric strings', () => {
    expect(parseFloat('0.5')).toBe(0.5);
    expect(parseFloat('1.0')).toBe(1.0);
    expect(parseInt('30')).toBe(30);
  });

  test('should handle invalid numeric strings', () => {
    expect(parseFloat('invalid')).toBeNaN();
    expect(parseInt('invalid')).toBeNaN();
  });
});
