/**
 * Unit tests for box-batch-generator
 */

const fs = require('fs');
const path = require('path');
const { BoxBatchGenerator } = require('../../src/utils/box-batch-generator');

describe('BoxBatchGenerator', () => {
  const testOutputDir = '/tmp/test-batch-output';

  afterEach(() => {
    // Clean up
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }
  });

  describe('constructor', () => {
    test('should accept output dir option', () => {
      const gen = new BoxBatchGenerator({ outputDir: testOutputDir });
      expect(gen.options.outputDir).toBe(testOutputDir);
    });
  });

  describe('generateThicknessVariants', () => {
    test('should generate all thickness variants', () => {
      const gen = new BoxBatchGenerator({ outputDir: testOutputDir });
      const results = gen.generateThicknessVariants('mailer', {
        width: 100, height: 60, depth: 30,
      }, [0.5, 1, 2]);

      expect(results).toHaveLength(3);
      expect(fs.existsSync(results[0].path)).toBe(true);
    });

    test('should create output directory if not exists', () => {
      const gen = new BoxBatchGenerator({ outputDir: testOutputDir });
      expect(fs.existsSync(testOutputDir)).toBe(false);

      gen.generateThicknessVariants('mailer', {
        width: 100, height: 60, depth: 30,
      });

      expect(fs.existsSync(testOutputDir)).toBe(true);
    });

    test('should include file stats in results', () => {
      const gen = new BoxBatchGenerator({ outputDir: testOutputDir });
      const results = gen.generateThicknessVariants('mailer', {
        width: 100, height: 60, depth: 30,
      });

      expect(results[0]).toHaveProperty('thickness');
      expect(results[0]).toHaveProperty('path');
      expect(results[0]).toHaveProperty('vertices');
      expect(results[0]).toHaveProperty('edges');
    });
  });

  describe('generateReport', () => {
    test('should generate markdown report', () => {
      const gen = new BoxBatchGenerator({ outputDir: testOutputDir });
      const variants = [
        { thickness: 1, path: '/tmp/a.fold', vertices: 12, edges: 14 },
        { thickness: 2, path: '/tmp/b.fold', vertices: 12, edges: 14 },
      ];

      const report = gen.generateReport(variants);

      expect(report).toContain('# Box Template Comparison');
      expect(report).toContain('| Thickness |');
      expect(report).toContain('1mm');
      expect(report).toContain('2mm');
    });
  });
});
