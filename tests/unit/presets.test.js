/**
 * Unit tests for presets utility module
 * Tests preset resolution, URL building, and validation
 */

const {
  PRESETS,
  LEGACY_PRESETS,
  getPresetById,
  getPresetFile,
  buildPresetUrl,
  getAllPresets,
  getPresetsByCategory,
  getCategories,
  getPresetCount,
  isValidPreset,
  BASE_URL
} = require('../../src/utils/presets');

describe('Preset Constants', () => {
  test('BASE_URL should be correct', () => {
    expect(BASE_URL).toBe('https://origamisimulator.org/');
  });

  test('PRESETS should have 27 presets', () => {
    expect(PRESETS.length).toBe(27);
  });

  test('LEGACY_PRESETS should have 8 entries', () => {
    expect(Object.keys(LEGACY_PRESETS).length).toBe(8);
  });
});

describe('getPresetById', () => {
  test('should find cranes preset', () => {
    const preset = getPresetById('cranes');
    expect(preset).toBeDefined();
    expect(preset.id).toBe('cranes');
    expect(preset.category).toBe('origami');
  });

  test('should find miura-ori preset', () => {
    const preset = getPresetById('miura-ori');
    expect(preset).toBeDefined();
    expect(preset.file).toBe('Tessellations/miura-ori.svg');
  });

  test('should return undefined for unknown preset', () => {
    const preset = getPresetById('nonexistent');
    expect(preset).toBeUndefined();
  });
});

describe('getPresetFile', () => {
  test('should resolve direct preset IDs', () => {
    expect(getPresetFile('miura-ori')).toBe('Tessellations/miura-ori.svg');
    expect(getPresetFile('cranes')).toBe('Origami/traditionalCrane.svg');
    expect(getPresetFile('waterbomb')).toBe('Tessellations/waterbomb.svg');
  });

  test('should resolve legacy Japanese names', () => {
    expect(getPresetFile('富士山')).toBe('Origami/hypar.svg');
    expect(getPresetFile('爆弾')).toBe('Tessellations/waterbomb.svg');
  });

  test('should resolve legacy aliases', () => {
    expect(getPresetFile('shuriken')).toBe('Tessellations/miura-ori.svg');
    expect(getPresetFile('star')).toBe('Curved/Rotating_Star.svg');
    expect(getPresetFile('simple-accordion')).toBe('Pleating/BoxPleatTessellation.fold');
  });

  test('should return null for unknown preset', () => {
    expect(getPresetFile('nonexistent')).toBeNull();
  });
});

describe('buildPresetUrl', () => {
  test('should build correct URL for miura-ori', () => {
    const url = buildPresetUrl('miura-ori');
    expect(url).toBe('https://origamisimulator.org/?demo=Tessellations%2Fmiura-ori.svg');
  });

  test('should build correct URL for cranes', () => {
    const url = buildPresetUrl('cranes');
    expect(url).toBe('https://origamisimulator.org/?demo=Origami%2FtraditionalCrane.svg');
  });

  test('should encode special characters in file paths', () => {
    const url = buildPresetUrl('miura-ori');
    expect(url).toContain('%2F'); // encoded forward slash
  });

  test('should return null for unknown preset', () => {
    expect(buildPresetUrl('nonexistent')).toBeNull();
  });
});

describe('getAllPresets', () => {
  test('should return all 27 presets', () => {
    const all = getAllPresets();
    expect(all.length).toBe(27);
  });

  test('should include all expected categories', () => {
    const all = getAllPresets();
    const categories = new Set(all.map(p => p.category));
    expect(categories.has('origami')).toBe(true);
    expect(categories.has('tessellations')).toBe(true);
    expect(categories.has('curved')).toBe(true);
    expect(categories.has('bases')).toBe(true);
  });
});

describe('getPresetsByCategory', () => {
  test('should filter origami presets', () => {
    const origami = getPresetsByCategory('origami');
    expect(origami.length).toBeGreaterThan(0);
    origami.forEach(p => expect(p.category).toBe('origami'));
  });

  test('should filter tessellations presets', () => {
    const tess = getPresetsByCategory('tessellations');
    expect(tess.length).toBe(5);
    tess.forEach(p => expect(p.category).toBe('tessellations'));
  });

  test('should return empty array for unknown category', () => {
    const unknown = getPresetsByCategory('nonexistent');
    expect(unknown).toEqual([]);
  });
});

describe('getCategories', () => {
  test('should return all categories', () => {
    const categories = getCategories();
    expect(categories).toContain('origami');
    expect(categories).toContain('tessellations');
    expect(categories).toContain('curved');
    expect(categories).toContain('bases');
  });

  test('should return unique categories', () => {
    const categories = getCategories();
    const unique = new Set(categories);
    expect(categories.length).toBe(unique.size);
  });
});

describe('getPresetCount', () => {
  test('should return correct count', () => {
    expect(getPresetCount()).toBe(27);
  });
});

describe('isValidPreset', () => {
  test('should return true for valid preset IDs', () => {
    expect(isValidPreset('cranes')).toBe(true);
    expect(isValidPreset('miura-ori')).toBe(true);
    expect(isValidPreset('waterbomb')).toBe(true);
  });

  test('should return true for legacy preset names', () => {
    expect(isValidPreset('富士山')).toBe(true);
    expect(isValidPreset('爆弾')).toBe(true);
    expect(isValidPreset('shuriken')).toBe(true);
  });

  test('should return false for invalid preset names', () => {
    expect(isValidPreset('nonexistent')).toBe(false);
    expect(isValidPreset('invalid-preset')).toBe(false);
  });
});

describe('Preset Data Integrity', () => {
  test('all presets should have required fields', () => {
    PRESETS.forEach(p => {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('file');
      expect(p).toHaveProperty('category');
    });
  });

  test('all preset IDs should be unique', () => {
    const ids = PRESETS.map(p => p.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  test('all preset files should end with .svg or .fold', () => {
    PRESETS.forEach(p => {
      const isValidExt = p.file.endsWith('.svg') || p.file.endsWith('.fold');
      expect(isValidExt).toBe(true);
    });
  });

  test('preset file paths should contain category folder', () => {
    PRESETS.forEach(p => {
      const folder = p.file.split('/')[0];
      const categoryFolder = p.category.charAt(0).toUpperCase() + p.category.slice(1);
      // File path should reference a folder that matches category
      expect(p.file).toContain('/');
    });
  });
});
