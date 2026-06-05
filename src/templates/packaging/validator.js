/**
 * Packaging Template Validator
 * Validates box template structures and dimensions
 */

/**
 * Validate box dimensions
 * @param {Object} dimensions - { width, height, depth } in mm
 * @returns {Object} Validation result { valid, errors }
 */
function validateDimensions(dimensions) {
  const errors = [];
  const { width, height, depth } = dimensions;

  if (width <= 0 || height <= 0 || depth <= 0) {
    errors.push('All dimensions must be positive numbers');
  }

  if (width > 2000 || height > 2000 || depth > 2000) {
    errors.push('Dimensions exceed maximum size (2000mm)');
  }

  if (width < 20 || height < 20 || depth < 20) {
    errors.push('Dimensions below minimum size (20mm)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate dieline structure
 * @param {Object} dieline - FOLD format dieline data
 * @returns {Object} Validation result { valid, errors, warnings }
 */
function validateDieline(dieline) {
  const errors = [];
  const warnings = [];

  // Check required fields
  if (!dieline.vertices_coords || !Array.isArray(dieline.vertices_coords)) {
    errors.push('Missing or invalid vertices_coords');
  }

  if (!dieline.edges_vertices || !Array.isArray(dieline.edges_vertices)) {
    errors.push('Missing or invalid edges_vertices');
  }

  if (!dieline.faces_vertices || !Array.isArray(dieline.faces_vertices)) {
    errors.push('Missing or invalid faces_vertices');
  }

  // Check for edges_assignment
  if (!dieline.edges_assignment) {
    warnings.push('No edges_assignment found - all edges will be treated as boundary');
  }

  // Validate vertex structure
  if (dieline.vertices_coords) {
    for (let i = 0; i < dieline.vertices_coords.length; i++) {
      const v = dieline.vertices_coords[i];
      if (!Array.isArray(v) || v.length < 2) {
        errors.push(`Invalid vertex at index ${i}`);
      }
    }
  }

  // Validate edge structure
  if (dieline.edges_vertices) {
    const vertexCount = dieline.vertices_coords?.length || 0;
    for (let i = 0; i < dieline.edges_vertices.length; i++) {
      const e = dieline.edges_vertices[i];
      if (!Array.isArray(e) || e.length < 2) {
        errors.push(`Invalid edge at index ${i}`);
      }
      if (e[0] >= vertexCount || e[1] >= vertexCount) {
        errors.push(`Edge ${i} references non-existent vertex`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate box template
 * @param {Object} template - Box template object
 * @returns {Object} Validation result
 */
function validateTemplate(template) {
  const errors = [];
  const warnings = [];

  // Check required fields
  if (!template.name) {
    errors.push('Template missing name');
  }

  if (!template.type) {
    errors.push('Template missing type');
  }

  if (!template.dimensions) {
    errors.push('Template missing dimensions');
  } else {
    const dimValidation = validateDimensions(template.dimensions);
    errors.push(...dimValidation.errors);
  }

  if (!template.dieline) {
    errors.push('Template missing dieline');
  } else {
    const dielineValidation = validateDieline(template.dieline);
    errors.push(...dielineValidation.errors);
    warnings.push(...dielineValidation.warnings);
  }

  // Validate faces array
  if (template.faces && !Array.isArray(template.faces)) {
    errors.push('Template faces must be an array');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get all valid template types
 * @returns {string[]} Array of valid type names
 */
function getValidTypes() {
  return [
    'folding-carton',
    'rigid-box',
    'tube',
    'pouch',
    'envelope',
    'mailer',
    'set-top',
    'slotted-box',
    'telescope',
  ];
}

/**
 * Get all valid box categories
 * @returns {string[]} Array of valid category names
 */
function getValidCategories() {
  return [
    'carrier',
    'aircraft',
    'tube',
    'mailer',
    'pizza',
    'shoe',
    'jewelry',
    'apparel',
    'electronics',
    'food',
    'cosmetics',
  ];
}

module.exports = {
  validateDimensions,
  validateDieline,
  validateTemplate,
  getValidTypes,
  getValidCategories,
};