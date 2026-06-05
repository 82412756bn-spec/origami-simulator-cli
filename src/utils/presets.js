/**
 * Preset utilities - extracted for testability
 * These functions handle preset resolution and URL building
 */

const BASE_URL = 'https://origamisimulator.org/';

// Complete preset list from origamisimulator.org
const PRESETS = [
  { id: 'cranes', name: 'Crane (3D)', file: 'Origami/traditionalCrane.svg', category: 'origami' },
  { id: 'flapping-bird', name: 'Flapping Bird', file: 'Origami/flappingBird.svg', category: 'origami' },
  { id: 'flat-crane', name: 'Crane (flat)', file: 'Origami/flat_crane.svg', category: 'origami' },
  { id: 'hypar', name: 'Hypar', file: 'Origami/hypar.svg', category: 'origami' },
  { id: 'square-twist', name: 'Square Twist', file: 'Origami/singlesquaretwist.svg', category: 'origami' },
  { id: 'bird-base', name: 'Bird Base', file: 'Bases/birdBase.svg', category: 'bases' },
  { id: 'boat-base', name: 'Boat Base', file: 'Bases/boatBase.svg', category: 'bases' },
  { id: 'frog-base', name: 'Frog Base', file: 'Bases/frogBase.svg', category: 'bases' },
  { id: 'square-base', name: 'Square Base', file: 'Bases/squareBase.svg', category: 'bases' },
  { id: 'waterbomb-base', name: 'Waterbomb Base', file: 'Bases/waterbombBase.svg', category: 'bases' },
  { id: 'miura-ori', name: 'Miura-Ori', file: 'Tessellations/miura-ori.svg', category: 'tessellations' },
  { id: 'waterbomb', name: 'Waterbomb', file: 'Tessellations/waterbomb.svg', category: 'tessellations' },
  { id: 'flower-tower', name: 'Flower Tower', file: 'Tessellations/FTpoly7.svg', category: 'tessellations' },
  { id: 'lang-honeycomb', name: 'Lang Honeycomb', file: 'Tessellations/langHoneycomb.svg', category: 'tessellations' },
  { id: 'huffman-extruded', name: 'Huffman Extruded Boxes', file: 'Tessellations/huffmanExtrudedBoxes.svg', category: 'tessellations' },
  { id: 'leafy-opus', name: 'Leafy Opus', file: 'Curved/Leafy_Opus_T-69.svg', category: 'curved' },
  { id: 'shell14', name: 'Shell 14', file: 'Curved/shell14.svg', category: 'curved' },
  { id: 'rotating-star', name: 'Rotating Star', file: 'Curved/Rotating_Star.svg', category: 'curved' },
  { id: 'box-pleat-tess', name: 'Box Pleat Tessellation', file: 'Pleating/BoxPleatTessellation.fold', category: 'pleating' },
  { id: 'box-pleat-pyramid', name: 'Box Pleat Pyramid', file: 'Pleating/BoxPleatPyramid.fold', category: 'pleating' },
  { id: 'airplane', name: 'Paper Airplane', file: 'Origami/airplane.svg', category: 'origami' },
  { id: 'lang-cardinal', name: 'Lang Cardinal', file: 'Origami/langCardinal.svg', category: 'origami' },
  { id: 'lang-orchid', name: 'Lang Orchid', file: 'Origami/langOrchid.svg', category: 'origami' },
  { id: 'kirigami-triangle', name: 'Kirigami Auxetic Triangle', file: 'Kirigami/auxetic_triangle.svg', category: 'kirigami' },
  { id: 'popup-simple', name: 'Simple Popup', file: 'Popup/popupSimple.svg', category: 'popup' },
  { id: 'bistable-curved', name: 'Bistable Curved Pleat', file: 'Bistable/curvedPleatSimple.svg', category: 'bistable' },
  { id: 'polygami-cross', name: 'Polygami Cross', file: 'Polygami/polygamiCross.svg', category: 'polygami' },
];

// Legacy preset names for backward compatibility
const LEGACY_PRESETS = {
  'cranes': 'cranes',
  'flapping-bird': 'flapping-bird',
  'square': 'square-base',
  '富士山': 'hypar',
  '爆弾': 'waterbomb',
  'simple-accordion': 'box-pleat-tess',
  'star': 'rotating-star',
  'shuriken': 'miura-ori'
};

/**
 * Get preset by ID
 */
function getPresetById(id) {
  return PRESETS.find(p => p.id === id);
}

/**
 * Get preset file path by ID (resolves legacy names)
 */
function getPresetFile(id) {
  const resolvedId = LEGACY_PRESETS[id] || id;
  const preset = getPresetById(resolvedId);
  return preset ? preset.file : null;
}

/**
 * Build URL for loading a preset
 */
function buildPresetUrl(id) {
  const presetFile = getPresetFile(id);
  if (!presetFile) return null;
  return `${BASE_URL}?demo=${encodeURIComponent(presetFile)}`;
}

/**
 * Get all presets
 */
function getAllPresets() {
  return PRESETS;
}

/**
 * Get presets by category
 */
function getPresetsByCategory(category) {
  return PRESETS.filter(p => p.category === category);
}

/**
 * Get all categories
 */
function getCategories() {
  return [...new Set(PRESETS.map(p => p.category))];
}

/**
 * Get preset count
 */
function getPresetCount() {
  return PRESETS.length;
}

/**
 * Validate if preset exists
 */
function isValidPreset(id) {
  return PRESETS.some(p => p.id === id) || LEGACY_PRESETS.hasOwnProperty(id);
}

module.exports = {
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
};
