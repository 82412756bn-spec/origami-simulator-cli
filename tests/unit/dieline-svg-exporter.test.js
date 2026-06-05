/**
 * Unit tests for dieline-svg-exporter
 */

const { DielineSVGExporter } = require('../../src/utils/dieline-svg-exporter');

describe('DielineSVGExporter', () => {
  const sampleDieline = {
    file_spec: 1.1,
    frame_title: 'Test Box 100×60×30mm',
    box_dimensions: { width: 100, height: 60, depth: 30 },
    thickness: 1,
    vertices_coords: [
      [0, 0, 0],
      [100, 0, 0],
      [100, 60, 0],
      [0, 60, 0],
    ],
    edges_vertices: [
      [0, 1], [1, 2], [2, 3], [3, 0],
    ],
    edges_assignment: ['B', 'B', 'B', 'B'],
    faces_vertices: [[0, 1, 2, 3]],
  };

  describe('constructor', () => {
    test('should accept default options', () => {
      const exporter = new DielineSVGExporter();
      expect(exporter.options.dpi).toBe(96);
    });

    test('should accept custom options', () => {
      const exporter = new DielineSVGExporter({
        width: 1000,
        height: 800,
        margin: 30,
        cutColor: '#ff0000',
      });
      expect(exporter.options.width).toBe(1000);
      expect(exporter.options.cutColor).toBe('#ff0000');
    });
  });

  describe('export', () => {
    test('should return valid SVG string', () => {
      const exporter = new DielineSVGExporter();
      const svg = exporter.export(sampleDieline);

      expect(svg).toContain('<?xml');
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });

    test('should include title', () => {
      const exporter = new DielineSVGExporter();
      const svg = exporter.export(sampleDieline);

      expect(svg).toContain('Test Box 100×60×30mm');
    });

    test('should include legend', () => {
      const exporter = new DielineSVGExporter();
      const svg = exporter.export(sampleDieline);

      expect(svg).toContain('Cut line');
      expect(svg).toContain('Mountain');
      expect(svg).toContain('Valley');
    });

    test('should use correct line classes', () => {
      const mountainDieline = {
        ...sampleDieline,
        edges_assignment: ['B', 'M', 'B', 'V'],
      };

      const exporter = new DielineSVGExporter();
      const svg = exporter.export(mountainDieline);

      expect(svg).toContain('class="cut-line"');
      expect(svg).toContain('class="mountain-line"');
      expect(svg).toContain('class="valley-line"');
    });

    test('should include dimensions', () => {
      const exporter = new DielineSVGExporter();
      const svg = exporter.export(sampleDieline);

      expect(svg).toContain('100mm');
      expect(svg).toContain('60mm');
    });

    test('should respect showLabels=false', () => {
      const exporter = new DielineSVGExporter({ showLabels: false });
      const svg = exporter.export(sampleDieline);

      expect(svg).not.toContain('Legend:');
    });

    test('should respect showTitle=false', () => {
      const exporter = new DielineSVGExporter({ showTitle: false });
      const svg = exporter.export(sampleDieline);

      expect(svg).not.toContain('Test Box');
    });

    test('should respect showDimensions=false', () => {
      const exporter = new DielineSVGExporter({ showDimensions: false });
      const svg = exporter.export(sampleDieline);

      expect(svg).not.toContain('Width:');
    });
  });

  describe('getEdgeClass', () => {
    test('should map B to cut-line', () => {
      const exporter = new DielineSVGExporter();
      expect(exporter.getEdgeClass('B')).toBe('cut-line');
    });

    test('should map M to mountain-line', () => {
      const exporter = new DielineSVGExporter();
      expect(exporter.getEdgeClass('M')).toBe('mountain-line');
    });

    test('should map V to valley-line', () => {
      const exporter = new DielineSVGExporter();
      expect(exporter.getEdgeClass('V')).toBe('valley-line');
    });

    test('should default to cut-line', () => {
      const exporter = new DielineSVGExporter();
      expect(exporter.getEdgeClass('X')).toBe('cut-line');
    });
  });

  describe('calculateBounds', () => {
    test('should calculate correct bounds', () => {
      const exporter = new DielineSVGExporter();
      const bounds = exporter.calculateBounds([
        [0, 0],
        [100, 50],
      ]);

      expect(bounds.minX).toBe(0);
      expect(bounds.maxX).toBe(100);
      expect(bounds.minY).toBe(0);
      expect(bounds.maxY).toBe(50);
      expect(bounds.width).toBe(100);
      expect(bounds.height).toBe(50);
    });
  });
});
