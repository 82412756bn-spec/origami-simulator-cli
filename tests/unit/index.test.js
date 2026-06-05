/**
 * Unit tests for main CLI module (index.js)
 * Tests exported functions after refactoring to support module import
 */

// Mock playwright before requiring the module
jest.mock('playwright', () => require('../mocks/playwright'));

// Suppress console noise during tests
const originalWarn = console.warn;
const originalError = console.error;

beforeAll(() => {
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.warn = originalWarn;
  console.error = originalError;
});

describe('Exported Constants', () => {
  let exports;

  beforeAll(() => {
    exports = require('../../src/index.js');
  });

  test('should export VERSION', () => {
    expect(exports.VERSION).toBe('0.2.0');
  });

  test('should export BASE_URL', () => {
    expect(exports.BASE_URL).toBe('https://origamisimulator.org/');
  });

  test('should export PRESETS array with 27 items', () => {
    expect(Array.isArray(exports.PRESETS)).toBe(true);
    expect(exports.PRESETS.length).toBe(27);
  });

  test('should export PRESET_IDS array', () => {
    expect(Array.isArray(exports.PRESET_IDS)).toBe(true);
    expect(exports.PRESET_IDS.length).toBe(27);
    expect(exports.PRESET_IDS).toContain('cranes');
    expect(exports.PRESET_IDS).toContain('miura-ori');
  });

  test('should export LEGACY_PRESETS object', () => {
    expect(typeof exports.LEGACY_PRESETS).toBe('object');
    expect(exports.LEGACY_PRESETS['富士山']).toBe('hypar');
    expect(exports.LEGACY_PRESETS['爆弾']).toBe('waterbomb');
  });
});

describe('getPresetById', () => {
  let getPresetById;

  beforeAll(() => {
    getPresetById = require('../../src/index.js').getPresetById;
  });

  test('should find cranes preset', () => {
    const preset = getPresetById('cranes');
    expect(preset).toBeDefined();
    expect(preset.id).toBe('cranes');
    expect(preset.name).toBe('Crane (3D)');
    expect(preset.category).toBe('origami');
  });

  test('should find miura-ori preset', () => {
    const preset = getPresetById('miura-ori');
    expect(preset).toBeDefined();
    expect(preset.file).toBe('Tessellations/miura-ori.svg');
  });

  test('should return undefined for unknown preset', () => {
    expect(getPresetById('nonexistent')).toBeUndefined();
    expect(getPresetById('')).toBeUndefined();
  });
});

describe('getPresetFile', () => {
  let getPresetFile;

  beforeAll(() => {
    getPresetFile = require('../../src/index.js').getPresetFile;
  });

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
    expect(getPresetFile('square')).toBe('Bases/squareBase.svg');
  });

  test('should return null for unknown preset', () => {
    expect(getPresetFile('nonexistent')).toBeNull();
  });
});

describe('buildPresetUrl', () => {
  let buildPresetUrl;

  beforeAll(() => {
    buildPresetUrl = require('../../src/index.js').buildPresetUrl;
  });

  test('should build correct URL for miura-ori', () => {
    const url = buildPresetUrl('miura-ori');
    expect(url).toBe('https://origamisimulator.org/?demo=Tessellations%2Fmiura-ori.svg');
  });

  test('should build correct URL for cranes', () => {
    const url = buildPresetUrl('cranes');
    expect(url).toBe('https://origamisimulator.org/?demo=Origami%2FtraditionalCrane.svg');
  });

  test('should encode special characters', () => {
    const url = buildPresetUrl('miura-ori');
    expect(url).toContain('%2F'); // encoded forward slash
  });

  test('should return null for unknown preset', () => {
    expect(buildPresetUrl('nonexistent')).toBeNull();
  });
});

describe('launchBrowser', () => {
  let launchBrowser;

  beforeAll(() => {
    launchBrowser = require('../../src/index.js').launchBrowser;
  });

  test('should launch browser and return page objects', async () => {
    const result = await launchBrowser();
    expect(result).toHaveProperty('browser');
    expect(result).toHaveProperty('page');
    expect(result).toHaveProperty('context');
    await result.browser.close();
  });

  test('should accept custom timeout', async () => {
    const result = await launchBrowser(120000);
    expect(result).toHaveProperty('browser');
    await result.browser.close();
  });
});

describe('waitForPageReady', () => {
  let waitForPageReady;

  beforeAll(() => {
    waitForPageReady = require('../../src/index.js').waitForPageReady;
  });

  test('should wait for page without error', async () => {
    const mockPage = {
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      waitForFunction: jest.fn().mockResolvedValue(undefined)
    };
    await expect(waitForPageReady(mockPage)).resolves.not.toThrow();
  });

  test('should handle canvas not found gracefully', async () => {
    const mockPage = {
      waitForTimeout: jest.fn().mockResolvedValue(undefined),
      waitForFunction: jest.fn().mockRejectedValue(new Error('timeout'))
    };
    await expect(waitForPageReady(mockPage)).resolves.not.toThrow();
  });
});

describe('PRESETS data integrity', () => {
  let PRESETS;

  beforeAll(() => {
    PRESETS = require('../../src/index.js').PRESETS;
  });

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

  test('preset IDs should match PRESET_IDS export', () => {
    const PRESET_IDS = require('../../src/index.js').PRESET_IDS;
    const presetIds = PRESETS.map(p => p.id).sort();
    expect(presetIds).toEqual(PRESET_IDS.sort());
  });
});