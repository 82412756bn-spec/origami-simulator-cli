/**
 * Material Presets
 * Real-world material properties for accurate fold angle calculation
 *
 * Each material has:
 * - Standard thickness (mm)
 * - Elasticity factor (affects fold angle)
 * - Min/max bending radius
 * - Recommended for box types
 */

const MATERIALS = {
  // Standard paper / cardboard
  'copy-paper': {
    name: '复印纸',
    nameCN: '复印纸',
    thickness: 0.1,        // mm
    density: 80,           // g/m²
    elasticityFactor: 1.0, // multiplier for angle reduction
    maxAngleReduction: 8,  // max degrees off from 180°
    recommended: ['tube', 'small-carton'],
  },

  'cardboard-1mm': {
    name: 'Standard Cardboard 1mm',
    nameCN: '标准纸板 1mm',
    thickness: 1.0,
    density: 250,
    elasticityFactor: 1.2,
    maxAngleReduction: 15,
    recommended: ['folding-carton', 'mailer', 'aircraft', 'pizza'],
  },

  'cardboard-2mm': {
    name: 'Thick Cardboard 2mm',
    nameCN: '厚纸板 2mm',
    thickness: 2.0,
    density: 400,
    elasticityFactor: 1.4,
    maxAngleReduction: 22,
    recommended: ['mailer', 'rigid-box'],
  },

  'cardboard-3mm': {
    name: 'Heavy Cardboard 3mm',
    nameCN: '重型纸板 3mm',
    thickness: 3.0,
    density: 600,
    elasticityFactor: 1.6,
    maxAngleReduction: 30,
    recommended: ['rigid-box', 'heavy-mailer'],
  },

  'kraft-paper': {
    name: 'Kraft Paper',
    nameCN: '牛皮纸',
    thickness: 0.3,
    density: 120,
    elasticityFactor: 0.9,  // Kraft is more flexible
    maxAngleReduction: 10,
    recommended: ['pouch', 'envelope', 'eco-mailer'],
  },

  'corrugated': {
    name: 'Corrugated Cardboard',
    nameCN: '瓦楞纸板',
    thickness: 4.0,        // 4mm standard single-wall
    density: 350,
    elasticityFactor: 1.8, // Corrugated has structure
    maxAngleReduction: 25, // But folds along grain only
    grainDirection: 'one-way', // Folds are restricted
    recommended: ['shipping-box', 'heavy-mailer'],
  },

  'folding-cart': {
    name: 'Folding Carton Board',
    nameCN: '折叠纸盒板',
    thickness: 0.5,
    density: 200,
    elasticityFactor: 1.1,
    maxAngleReduction: 12,
    recommended: ['folding-carton', 'cosmetics', 'pharma'],
  },

  'tissue-paper': {
    name: 'Tissue Paper',
    nameCN: '薄页纸',
    thickness: 0.04,
    density: 25,
    elasticityFactor: 0.7, // Very flexible
    maxAngleReduction: 4,
    recommended: ['tube', 'decorative'],
  },
};

/**
 * Get material by name
 * @param {string} name - Material name
 * @returns {Object} Material preset
 */
function getMaterial(name) {
  const material = MATERIALS[name];
  if (!material) {
    const available = Object.keys(MATERIALS).join(', ');
    throw new Error(`Unknown material: ${name}. Available: ${available}`);
  }
  return material;
}

/**
 * List all available materials
 * @returns {Array} Array of material names
 */
function listMaterials() {
  return Object.keys(MATERIALS).map(key => ({
    id: key,
    name: MATERIALS[key].name,
    nameCN: MATERIALS[key].nameCN,
    thickness: MATERIALS[key].thickness,
    recommended: MATERIALS[key].recommended,
  }));
}

/**
 * Calculate fold angle using material properties
 * More accurate than simple thickness-based calculation
 *
 * @param {Object} material - Material preset
 * @param {string} type - 'M' (mountain) or 'V' (valley)
 * @param {number} angle - Optional override angle
 * @returns {number} Fold angle in degrees
 */
function calculateMaterialFoldAngle(material, type = 'M', angle = null) {
  // If explicit angle given, use it
  if (angle !== null && angle !== undefined) {
    return angle;
  }

  // Pure thin sheet: 180° / -180°
  if (!material || material.thickness <= 0) {
    return type === 'M' ? 180 : -180;
  }

  const baseAngle = type === 'M' ? 180 : -180;
  // Material-specific reduction
  const reduction = Math.min(
    material.thickness * material.elasticityFactor * 3,
    material.maxAngleReduction
  );

  return type === 'M' ? (baseAngle - reduction) : (baseAngle + reduction);
}

/**
 * Validate that material is suitable for a given box type
 * @param {Object} material - Material preset
 * @param {string} boxType - Box type identifier
 * @returns {Object} Validation { suitable, warning, suggestion }
 */
function validateMaterialForBox(material, boxType) {
  if (!material.recommended) {
    return { suitable: true, warning: null, suggestion: null };
  }

  if (material.recommended.includes(boxType)) {
    return { suitable: true, warning: null, suggestion: null };
  }

  // Find best alternative
  const alternatives = Object.keys(MATERIALS).filter(key => {
    const m = MATERIALS[key];
    return m.recommended && m.recommended.includes(boxType);
  });

  return {
    suitable: false,
    warning: `${material.name} may not be ideal for ${boxType} boxes`,
    suggestion: alternatives.length > 0 ? alternatives[0] : null,
  };
}

module.exports = {
  MATERIALS,
  getMaterial,
  listMaterials,
  calculateMaterialFoldAngle,
  validateMaterialForBox,
};
