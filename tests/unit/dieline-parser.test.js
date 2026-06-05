/**
 * Unit tests for dieline-parser module
 */

const path = require('path');
const fs = require('fs');
const DielineParser = require('../../src/utils/dieline-parser');

describe('DielineParser', () => {
  describe('isValidDielineFile', () => {
    test('should return true for PDF files', () => {
      expect(DielineParser.isValidDielineFile('dieline.pdf')).toBe(true);
      expect(DielineParser.isValidDielineFile('path/to/dieline.PDF')).toBe(true);
    });

    test('should return true for EPS files', () => {
      expect(DielineParser.isValidDielineFile('dieline.eps')).toBe(true);
      expect(DielineParser.isValidDielineFile('path/to/dieline.EPS')).toBe(true);
    });

    test('should return true for AI files', () => {
      expect(DielineParser.isValidDielineFile('dieline.ai')).toBe(true);
      expect(DielineParser.isValidDielineFile('path/to/dieline.AI')).toBe(true);
    });

    test('should return true for SVG files', () => {
      expect(DielineParser.isValidDielineFile('dieline.svg')).toBe(true);
      expect(DielineParser.isValidDielineFile('path/to/dieline.SVG')).toBe(true);
    });

    test('should return true for FOLD files', () => {
      expect(DielineParser.isValidDielineFile('dieline.fold')).toBe(true);
      expect(DielineParser.isValidDielineFile('path/to/dieline.FOLD')).toBe(true);
    });

    test('should return false for other extensions', () => {
      expect(DielineParser.isValidDielineFile('image.png')).toBe(false);
      expect(DielineParser.isValidDielineFile('document.doc')).toBe(false);
      expect(DielineParser.isValidDielineFile('file.jpg')).toBe(false);
    });
  });

  describe('parseFOLD', () => {
    test('should parse FOLD file correctly', async () => {
      const parser = new DielineParser();
      const samplePath = path.join(__dirname, '../../examples/sample-crane.fold');
      const result = await parser.parse(samplePath);

      expect(result.file_spec).toBe(1.1);
      expect(result.frame_title).toBe('Test Crane');
      expect(result.vertices_coords).toHaveLength(5);
      expect(result.edges_vertices).toHaveLength(8);
      expect(result.faces_vertices).toHaveLength(4);
    });
  });

  describe('parsePDF', () => {
    test('should parse PDF file and extract dimensions', async () => {
      const parser = new DielineParser({ debug: false });
      const samplePath = path.join(__dirname, '../../test/samples/test-dieline.pdf');
      const result = await parser.parse(samplePath);

      expect(result.pageWidth).toBe(200);
      expect(result.pageHeight).toBe(150);
      expect(result.vertices_coords).toHaveLength(4);
      expect(result.edges_vertices).toHaveLength(4);
      expect(result.faces_vertices).toHaveLength(1);
    });
  });

  describe('exportToFold', () => {
    test('should export FOLD format correctly', async () => {
      const parser = new DielineParser();
      const samplePath = path.join(__dirname, '../../examples/sample-crane.fold');
      const foldData = await parser.parse(samplePath);

      const outputPath = '/tmp/test-export-fold.json';
      parser.exportToFold(outputPath, foldData);

      expect(fs.existsSync(outputPath)).toBe(true);

      const exported = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      expect(exported.file_spec).toBe(1.1);
      expect(exported.vertices_coords).toHaveLength(5);

      fs.unlinkSync(outputPath);
    });
  });

  describe('exportToSVG', () => {
    test('should export SVG format correctly', async () => {
      const parser = new DielineParser();
      const samplePath = path.join(__dirname, '../../examples/sample-crane.fold');
      const foldData = await parser.parse(samplePath);

      const outputPath = '/tmp/test-export.svg';
      parser.exportToSVG(outputPath, foldData);

      expect(fs.existsSync(outputPath)).toBe(true);

      const svgContent = fs.readFileSync(outputPath, 'utf8');
      expect(svgContent).toContain('<svg');
      expect(svgContent).toContain('</svg>');

      fs.unlinkSync(outputPath);
    });
  });

  describe('parseSVGPath', () => {
    test('should parse SVG path data correctly', () => {
      const parser = new DielineParser();
      const commands = parser.parseSVGPath('M 10 10 L 20 20 L 30 30 Z');

      expect(commands).toHaveLength(4);
      expect(commands[0]).toEqual({ type: 'M', x: 10, y: 10 });
      expect(commands[1]).toEqual({ type: 'L', x: 20, y: 20 });
      expect(commands[2]).toEqual({ type: 'L', x: 30, y: 30 });
      expect(commands[3]).toEqual({ type: 'Z' });
    });

    test('should parse relative path commands', () => {
      const parser = new DielineParser();
      const commands = parser.parseSVGPath('M 10 10 m 5 5 l 10 10');

      expect(commands[0]).toEqual({ type: 'M', x: 10, y: 10 });
      expect(commands[1]).toEqual({ type: 'M', x: 15, y: 15 });
      expect(commands[2]).toEqual({ type: 'L', x: 25, y: 25 });
    });

    test('should parse curve commands', () => {
      const parser = new DielineParser();
      const commands = parser.parseSVGPath('M 0 0 C 1 1, 2 2, 3 3');

      expect(commands[0]).toEqual({ type: 'M', x: 0, y: 0 });
      expect(commands[1]).toEqual({ type: 'C', x1: 1, y1: 1, x2: 2, y2: 2, x: 3, y: 3 });
    });
  });

  describe('edgesToFaces', () => {
    test('should convert edges to faces for rectangular loop', () => {
      const parser = new DielineParser();
      const edges = [[0, 1], [1, 2], [2, 3], [3, 0]];
      const faces = parser.edgesToFaces(edges);

      expect(faces).toHaveLength(1);
      expect(faces[0]).toContain(0);
      expect(faces[0]).toContain(1);
      expect(faces[0]).toContain(2);
      expect(faces[0]).toContain(3);
    });

    test('should return empty array for insufficient edges', () => {
      const parser = new DielineParser();
      const edges = [[0, 1]];
      const faces = parser.edgesToFaces(edges);

      expect(faces).toHaveLength(0);
    });
  });

  describe('constructor options', () => {
    test('should accept scale option', () => {
      const parser = new DielineParser({ scale: 50 });
      const vertices = parser.generateBoxVertices(100, 50);

      expect(vertices[1]).toEqual([2, 0, 0]); // 100/50
      expect(vertices[2]).toEqual([2, 1, 0]); // 50/50
    });

    test('should accept debug option', () => {
      const parser = new DielineParser({ debug: true });
      expect(parser.options.debug).toBe(true);
    });
  });
});