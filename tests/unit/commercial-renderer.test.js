/**
 * Unit tests for commercial-renderer module
 */

const {
  CommercialRenderer,
  MATERIAL_PRESETS,
  HDRI_PRESETS,
  CAMERA_ANGLES,
} = require('../../src/utils/commercial-renderer');

describe('Commercial Renderer - Material Presets', () => {
  test('should have at least 5 material presets', () => {
    const count = Object.keys(MATERIAL_PRESETS).length;
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('each material should have required PBR properties', () => {
    for (const [id, mat] of Object.entries(MATERIAL_PRESETS)) {
      expect(mat.color).toBeDefined();
      expect(typeof mat.roughness).toBe('number');
      expect(typeof mat.metalness).toBe('number');
      expect(mat.roughness).toBeGreaterThanOrEqual(0);
      expect(mat.roughness).toBeLessThanOrEqual(1);
      expect(mat.metalness).toBeGreaterThanOrEqual(0);
      expect(mat.metalness).toBeLessThanOrEqual(1);
    }
  });

  test('should have cardboard material', () => {
    expect(MATERIAL_PRESETS).toHaveProperty('cardboard');
    expect(MATERIAL_PRESETS.cardboard.name).toBeTruthy();
  });

  test('should have metal material', () => {
    expect(MATERIAL_PRESETS).toHaveProperty('metal');
    expect(MATERIAL_PRESETS.metal.metalness).toBeGreaterThan(0.5);
  });

  test('listMaterials should return array', () => {
    const materials = CommercialRenderer.listMaterials();
    expect(Array.isArray(materials)).toBe(true);
    expect(materials.length).toBeGreaterThan(0);
    expect(materials[0]).toHaveProperty('id');
    expect(materials[0]).toHaveProperty('name');
  });
});

describe('Commercial Renderer - HDRI Presets', () => {
  test('should have at least 4 HDRI presets', () => {
    expect(Object.keys(HDRI_PRESETS).length).toBeGreaterThanOrEqual(4);
  });

  test('should have studio preset', () => {
    expect(HDRI_PRESETS).toHaveProperty('studio');
    expect(HDRI_PRESETS.studio.name).toBeTruthy();
  });

  test('each HDRI should have lighting properties', () => {
    for (const [id, hdri] of Object.entries(HDRI_PRESETS)) {
      expect(hdri.ambientIntensity).toBeDefined();
      expect(hdri.keyLightIntensity).toBeDefined();
    }
  });

  test('listHDRI should return array', () => {
    const hdris = CommercialRenderer.listHDRI();
    expect(Array.isArray(hdris)).toBe(true);
    expect(hdris[0]).toHaveProperty('id');
    expect(hdris[0]).toHaveProperty('name');
  });
});

describe('Commercial Renderer - Camera Angles', () => {
  test('should have at least 4 camera angles', () => {
    expect(Object.keys(CAMERA_ANGLES).length).toBeGreaterThanOrEqual(4);
  });

  test('each angle should have position', () => {
    for (const [id, angle] of Object.entries(CAMERA_ANGLES)) {
      expect(angle.position).toBeDefined();
      expect(angle.position).toHaveLength(3);
    }
  });

  test('listAngles should return array', () => {
    const angles = CommercialRenderer.listAngles();
    expect(Array.isArray(angles)).toBe(true);
    expect(angles[0]).toHaveProperty('id');
    expect(angles[0]).toHaveProperty('name');
  });

  test('should have hero shot angles (30°, 45°, 60°)', () => {
    expect(CAMERA_ANGLES).toHaveProperty('30');
    expect(CAMERA_ANGLES).toHaveProperty('45');
    expect(CAMERA_ANGLES).toHaveProperty('60');
  });
});

describe('Commercial Renderer - Constructor', () => {
  test('should accept default options', () => {
    const renderer = new CommercialRenderer();
    expect(renderer.options.width).toBe(1920);
    expect(renderer.options.height).toBe(1080);
    expect(renderer.options.dpi).toBe(150);
  });

  test('should accept custom options', () => {
    const renderer = new CommercialRenderer({
      width: 4096,
      height: 4096,
      dpi: 300,
      material: 'kraft-paper',
      hdri: 'sunset',
      angle: '45',
    });
    expect(renderer.options.width).toBe(4096);
    expect(renderer.options.dpi).toBe(300);
    expect(renderer.options.material).toBe('kraft-paper');
    expect(renderer.options.hdri).toBe('sunset');
  });

  test('should default to 150 DPI', () => {
    const renderer = new CommercialRenderer();
    expect(renderer.options.dpi).toBe(150);
  });
});

describe('Commercial Renderer - Triangulation', () => {
  test('should triangulate a quad', () => {
    const renderer = new CommercialRenderer();
    const triangles = renderer.triangulate([0, 1, 2, 3]);
    expect(triangles).toEqual([0, 1, 2, 0, 2, 3]);
  });

  test('should triangulate a triangle', () => {
    const renderer = new CommercialRenderer();
    const triangles = renderer.triangulate([0, 1, 2]);
    expect(triangles).toEqual([0, 1, 2]);
  });

  test('should triangulate a pentagon', () => {
    const renderer = new CommercialRenderer();
    const triangles = renderer.triangulate([0, 1, 2, 3, 4]);
    expect(triangles).toEqual([0, 1, 2, 0, 2, 3, 0, 3, 4]);
  });
});

describe('Commercial Renderer - Box Detection', () => {
  test('should detect a box FOLD (6 faces, 8 vertices)', () => {
    const renderer = new CommercialRenderer();
    const boxFOLD = {
      vertices_coords: [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
      faces_vertices: [[0,1,2,3],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]],
    };
    expect(renderer.isBoxGeometry(boxFOLD)).toBe(true);
  });

  test('should NOT detect a plane as box', () => {
    const renderer = new CommercialRenderer();
    const planeFOLD = {
      vertices_coords: [[0,0,0],[1,0,0],[1,1,0],[0,1,0]],
      faces_vertices: [[0,1,2,3]],
    };
    expect(renderer.isBoxGeometry(planeFOLD)).toBe(false);
  });

  test('should NOT detect non-quad face as box', () => {
    const renderer = new CommercialRenderer();
    const triangleFOLD = {
      vertices_coords: [[0,0,0],[1,0,0],[0.5,1,0],[0.5,0.5,1],[0,0,1],[1,0,1],[0,1,1],[0,0,1]],
      faces_vertices: [[0,1,2],[3,4,5,6,7]],
    };
    expect(renderer.isBoxGeometry(triangleFOLD)).toBe(false);
  });
});
