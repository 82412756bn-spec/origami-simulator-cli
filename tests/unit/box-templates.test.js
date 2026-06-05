/**
 * Unit tests for box-templates module
 */

const {
  generateFoldingCarton,
  generateMailerBox,
  generatePizzaBox,
  generateTube,
  generateAircraftBox,
  generateTemplate,
  getTemplateGenerators,
  getAvailableTemplates,
  calculateFoldAngle,
  DEFAULT_THICKNESS,
} = require('../../src/templates/packaging/box-templates');
const {
  validateDimensions,
  validateDieline,
  validateTemplate,
  getValidTypes,
  getValidCategories,
} = require('../../src/templates/packaging/validator');

describe('Box Templates - Fold Angle Calculation', () => {
  test('should calculate fold angles correctly', () => {
    expect(calculateFoldAngle(0, 'M')).toBe(180);
    expect(calculateFoldAngle(0, 'V')).toBe(-180);
    expect(calculateFoldAngle(1, 'M')).toBe(177);
    expect(calculateFoldAngle(1, 'V')).toBe(-177);
    expect(calculateFoldAngle(3, 'M')).toBe(171);
    expect(calculateFoldAngle(3, 'V')).toBe(-171);
  });

  test('should have correct default thickness', () => {
    expect(DEFAULT_THICKNESS).toBe(1.0);
  });
});

describe('Box Templates - Generators', () => {
  describe('generateFoldingCarton', () => {
    test('should generate dieline with correct structure', () => {
      const dieline = generateFoldingCarton({ width: 100, height: 60, depth: 30 });

      expect(dieline.file_spec).toBe(1.1);
      expect(dieline.vertices_coords).toBeDefined();
      expect(dieline.edges_vertices).toBeDefined();
      expect(dieline.faces_vertices).toBeDefined();
      expect(dieline.box_dimensions.width).toBe(100);
    });

    test('should use default dimensions and thickness', () => {
      const dieline = generateFoldingCarton({});

      expect(dieline.box_dimensions.width).toBe(100);
      expect(dieline.box_dimensions.height).toBe(60);
      expect(dieline.box_dimensions.depth).toBe(30);
      expect(dieline.thickness).toBe(DEFAULT_THICKNESS);
    });

    test('should have boundary and fold edges', () => {
      const dieline = generateFoldingCarton({});
      const boundaries = dieline.edges_assignment.filter(a => a === 'B').length;
      const folds = dieline.edges_assignment.filter(a => a === 'M' || a === 'V').length;
      expect(boundaries).toBeGreaterThan(0);
      expect(folds).toBeGreaterThan(0);
    });

    test('should calculate fold angles based on thickness', () => {
      const thin = generateFoldingCarton({ thickness: 0 });
      const normal = generateFoldingCarton({ thickness: 1 });

      const thinMountain = thin.edges_foldAngle.filter((a, i) => thin.edges_assignment[i] === 'M')[0];
      const normalMountain = normal.edges_foldAngle.filter((a, i) => normal.edges_assignment[i] === 'M')[0];

      expect(thinMountain).toBe(180);
      expect(normalMountain).toBe(177);
    });
  });

  describe('generateMailerBox', () => {
    test('should generate dieline', () => {
      const dieline = generateMailerBox({ width: 120, height: 80, depth: 40 });

      expect(dieline.box_type).toBe('mailer');
      expect(dieline.vertices_coords.length).toBeGreaterThan(0);
    });
  });

  describe('generatePizzaBox', () => {
    test('should generate square dieline', () => {
      const dieline = generatePizzaBox({ width: 300, height: 300, depth: 40 });

      expect(dieline.box_type).toBe('pizza');
      expect(dieline.faces_vertices.length).toBe(2); // Outer and inner lid
    });

    test('should have mountain folds for lid', () => {
      const dieline = generatePizzaBox({ width: 300, height: 300, depth: 40 });
      const mountainCount = dieline.edges_assignment.filter(a => a === 'M').length;
      expect(mountainCount).toBe(4); // 4 lid folds
    });
  });

  describe('generateTube', () => {
    test('should generate tube with multiple segments', () => {
      const dieline = generateTube({ width: 50, height: 120, diameter: 30 });

      expect(dieline.box_type).toBe('tube');
      expect(dieline.vertices_coords.length).toBe(12); // 12 segments
      expect(dieline.edges_vertices.length).toBe(12); // 12 edges
    });

    test('should have fold angles', () => {
      const dieline = generateTube({ width: 50, height: 120, diameter: 30 });
      const valleyCount = dieline.edges_assignment.filter(a => a === 'V').length;
      expect(valleyCount).toBeGreaterThan(0);
    });
  });

  describe('generateAircraftBox', () => {
    test('should generate aircraft box dieline', () => {
      const dieline = generateAircraftBox({ width: 200, height: 100, depth: 60 });

      expect(dieline.box_type).toBe('aircraft');
      expect(dieline.vertices_coords.length).toBe(12);
      expect(dieline.faces_vertices.length).toBe(1); // Flat dieline has 1 face
    });

    test('should have mountain and valley folds', () => {
      const dieline = generateAircraftBox({ width: 200, height: 100, depth: 60 });
      const mountainCount = dieline.edges_assignment.filter(a => a === 'M').length;
      const valleyCount = dieline.edges_assignment.filter(a => a === 'V').length;
      expect(mountainCount).toBeGreaterThan(0);
      expect(valleyCount).toBeGreaterThan(0);
    });
  });

  describe('generateTemplate', () => {
    test('should generate template by name', () => {
      const dieline = generateTemplate('folding-carton', { width: 100, height: 60, depth: 30 });
      expect(dieline.box_type).toBe('folding-carton');
    });

    test('should throw error for unknown template', () => {
      expect(() => {
        generateTemplate('unknown-template', {});
      }).toThrow('Unknown template');
    });

    test('should accept alias for carton', () => {
      const dieline = generateTemplate('carton', { width: 100, height: 60, depth: 30 });
      expect(dieline.box_type).toBe('folding-carton');
    });
  });

  describe('getTemplateGenerators', () => {
    test('should return all generators', () => {
      const generators = getTemplateGenerators();
      expect(Object.keys(generators)).toContain('folding-carton');
      expect(Object.keys(generators)).toContain('mailer');
      expect(Object.keys(generators)).toContain('pizza');
      expect(Object.keys(generators)).toContain('tube');
      expect(Object.keys(generators)).toContain('aircraft');
    });
  });

  describe('getAvailableTemplates', () => {
    test('should return template metadata', () => {
      const templates = getAvailableTemplates();
      expect(templates.length).toBeGreaterThan(0);
      expect(templates[0]).toHaveProperty('id');
      expect(templates[0]).toHaveProperty('name');
      expect(templates[0]).toHaveProperty('nameCN');
      expect(templates[0]).toHaveProperty('category');
    });
  });
});

describe('Box Templates - Validators', () => {
  describe('validateDimensions', () => {
    test('should pass valid dimensions', () => {
      const result = validateDimensions({ width: 100, height: 60, depth: 30 });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should fail zero dimensions', () => {
      const result = validateDimensions({ width: 0, height: 60, depth: 30 });
      expect(result.valid).toBe(false);
    });

    test('should fail negative dimensions', () => {
      const result = validateDimensions({ width: -10, height: 60, depth: 30 });
      expect(result.valid).toBe(false);
    });

    test('should fail oversized dimensions', () => {
      const result = validateDimensions({ width: 3000, height: 60, depth: 30 });
      expect(result.valid).toBe(false);
    });

    test('should fail undersized dimensions', () => {
      const result = validateDimensions({ width: 5, height: 60, depth: 30 });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateDieline', () => {
    test('should pass valid dieline', () => {
      const dieline = generateFoldingCarton({ width: 100, height: 60, depth: 30 });
      const result = validateDieline(dieline);
      expect(result.valid).toBe(true);
    });

    test('should fail missing vertices_coords', () => {
      const result = validateDieline({ edges_vertices: [], faces_vertices: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing or invalid vertices_coords');
    });

    test('should fail missing edges_vertices', () => {
      const result = validateDieline({ vertices_coords: [[0,0,0]], faces_vertices: [] });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing or invalid edges_vertices');
    });

    test('should warn about missing edges_assignment', () => {
      const dieline = generateFoldingCarton({});
      delete dieline.edges_assignment;
      const result = validateDieline(dieline);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('validateTemplate', () => {
    test('should pass valid template', () => {
      const dieline = generateFoldingCarton({ width: 100, height: 60, depth: 30 });
      const template = {
        name: 'Test Template',
        type: 'folding-carton',
        dimensions: { width: 100, height: 60, depth: 30 },
        dieline,
      };
      const result = validateTemplate(template);
      expect(result.valid).toBe(true);
    });

    test('should fail missing name', () => {
      const dieline = generateFoldingCarton({});
      const template = {
        type: 'folding-carton',
        dimensions: { width: 100, height: 60, depth: 30 },
        dieline,
      };
      const result = validateTemplate(template);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Template missing name');
    });

    test('should fail missing type', () => {
      const dieline = generateFoldingCarton({});
      const template = {
        name: 'Test',
        dimensions: { width: 100, height: 60, depth: 30 },
        dieline,
      };
      const result = validateTemplate(template);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Template missing type');
    });
  });

  describe('getValidTypes', () => {
    test('should return array of valid types', () => {
      const types = getValidTypes();
      expect(Array.isArray(types)).toBe(true);
      expect(types).toContain('folding-carton');
    });
  });

  describe('getValidCategories', () => {
    test('should return array of valid categories', () => {
      const categories = getValidCategories();
      expect(Array.isArray(categories)).toBe(true);
      expect(categories).toContain('carrier');
      expect(categories).toContain('mailer');
    });
  });
});