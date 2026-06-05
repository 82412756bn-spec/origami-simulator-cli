/**
 * Unit tests for materials module
 */

const {
  MATERIALS,
  getMaterial,
  listMaterials,
  calculateMaterialFoldAngle,
  validateMaterialForBox,
} = require('../../src/templates/packaging/materials');

describe('Materials Module', () => {
  describe('MATERIALS registry', () => {
    test('should have at least 5 materials', () => {
      const keys = Object.keys(MATERIALS);
      expect(keys.length).toBeGreaterThanOrEqual(5);
    });

    test('each material should have required properties', () => {
      for (const [id, mat] of Object.entries(MATERIALS)) {
        expect(mat.thickness).toBeDefined();
        expect(mat.density).toBeDefined();
        expect(mat.elasticityFactor).toBeDefined();
        expect(mat.maxAngleReduction).toBeDefined();
        expect(mat.recommended).toBeDefined();
      }
    });

    test('should include common materials', () => {
      expect(MATERIALS).toHaveProperty('cardboard-1mm');
      expect(MATERIALS).toHaveProperty('cardboard-2mm');
      expect(MATERIALS).toHaveProperty('kraft-paper');
    });
  });

  describe('getMaterial', () => {
    test('should return material by name', () => {
      const mat = getMaterial('cardboard-1mm');
      expect(mat.thickness).toBe(1.0);
      expect(mat.name).toContain('Cardboard');
    });

    test('should throw for unknown material', () => {
      expect(() => {
        getMaterial('unknown-material');
      }).toThrow('Unknown material');
    });
  });

  describe('listMaterials', () => {
    test('should return array of materials', () => {
      const materials = listMaterials();
      expect(Array.isArray(materials)).toBe(true);
      expect(materials.length).toBeGreaterThan(0);
      expect(materials[0]).toHaveProperty('id');
      expect(materials[0]).toHaveProperty('thickness');
    });
  });

  describe('calculateMaterialFoldAngle', () => {
    test('should return 180 for zero thickness', () => {
      const angle = calculateMaterialFoldAngle({ thickness: 0 }, 'M');
      expect(angle).toBe(180);
    });

    test('should return -180 for zero thickness valley', () => {
      const angle = calculateMaterialFoldAngle({ thickness: 0 }, 'V');
      expect(angle).toBe(-180);
    });

    test('should reduce angle for real material', () => {
      const mat = MATERIALS['cardboard-1mm'];
      const mAngle = calculateMaterialFoldAngle(mat, 'M');
      const vAngle = calculateMaterialFoldAngle(mat, 'V');

      expect(mAngle).toBeLessThan(180);
      expect(mAngle).toBeGreaterThan(150);
      expect(vAngle).toBeGreaterThan(-180);
      expect(vAngle).toBeLessThan(-150);
    });

    test('should respect material max reduction', () => {
      const mat = MATERIALS['cardboard-3mm'];
      const mAngle = calculateMaterialFoldAngle(mat, 'M');
      const reduction = 180 - mAngle;

      expect(reduction).toBeLessThanOrEqual(mat.maxAngleReduction);
    });

    test('should accept explicit angle override', () => {
      const mat = MATERIALS['cardboard-1mm'];
      const angle = calculateMaterialFoldAngle(mat, 'M', 150);
      expect(angle).toBe(150);
    });
  });

  describe('validateMaterialForBox', () => {
    test('should return suitable for recommended box', () => {
      const mat = MATERIALS['cardboard-1mm'];
      const result = validateMaterialForBox(mat, 'mailer');
      expect(result.suitable).toBe(true);
    });

    test('should return warning for non-recommended box', () => {
      const mat = MATERIALS['tissue-paper'];
      const result = validateMaterialForBox(mat, 'rigid-box');
      expect(result.suitable).toBe(false);
      expect(result.warning).toBeTruthy();
    });

    test('should suggest alternative for non-recommended', () => {
      const mat = MATERIALS['tissue-paper'];
      const result = validateMaterialForBox(mat, 'folding-carton');
      expect(result.suggestion).toBeTruthy();
    });
  });
});
