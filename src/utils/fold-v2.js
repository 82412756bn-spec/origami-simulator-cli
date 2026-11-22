/**
 * FOLD v2.0 Format Support (v2.44)
 *
 * Provides tools for handling FOLD v2.0 extended format:
 *   - Material properties (color, texture, material type)
 *   - Physics properties (stiffness, density, mass)
 *   - Animation keyframes
 *   - Extension namespace
 *
 * Note: Official FOLD spec is currently v1.2. This implements a
 * custom v2.0 extension for origami-simulator-cli.
 */

class FoldV2 {
  // ────────────────────────────────────────────────────────────────────
  // Static detection
  // ───────────────────────────────────────────────────────────────────

  /**
   * Detect the FOLD format version
   * Returns: { version: '1.1' | '1.2' | '2.0', isV2: boolean }
   */
  static detect(fold) {
    const spec = fold.file_spec || 1.1;

    if (spec >= 2.0) {
      return { version: '2.0', isV2: true };
    } else if (spec >= 1.2) {
      return { version: '1.2', isV2: false };
    } else {
      return { version: '1.1', isV2: false };
    }
  }

  /**
   * Check if fold is v2.0 format
   */
  static isV2(fold) {
    return FoldV2.detect(fold).isV2;
  }

  /**
   * Check if fold has v2.0 extension fields (regardless of file_spec)
   */
  static hasV2Extensions(fold) {
    const v2Fields = [
      'faces_color', 'faces_material', 'faces_texture',
      'edges_stiffness', 'faces_density', 'vertices_mass',
      'animation_keyframes', 'animation_interpolation',
      'extensions',
    ];
    return v2Fields.some(field => fold[field] !== undefined);
  }

  // ────────────────────────────────────────────────────────────────────
  // Validation
  // ───────────────────────────────────────────────────────────────────

  /**
   * Validate v2.0 format and return errors/warnings
   */
  static validate(fold) {
    const errors = [];
    const warnings = [];

    // Basic structure check
    if (!fold || typeof fold !== 'object') {
      errors.push('Invalid FOLD: not an object');
      return { valid: false, errors, warnings };
    }

    // file_spec check
    if (fold.file_spec === undefined) {
      warnings.push('Missing file_spec, assuming v1.1');
    }

    // If not v2.0, no further validation needed
    if (!FoldV2.isV2(fold) && !FoldV2.hasV2Extensions(fold)) {
      return { valid: true, errors, warnings };
    }

    // Validate material fields
    if (fold.faces_color) {
      const colorErrors = FoldV2.validateColors(fold.faces_color, 'faces_color', fold.faces_vertices?.length);
      errors.push(...colorErrors);
    }

    if (fold.vertices_color) {
      const colorErrors = FoldV2.validateColors(fold.vertices_color, 'vertices_color', fold.vertices_coords?.length);
      errors.push(...colorErrors);
    }

    // Validate physics fields
    if (fold.edges_stiffness) {
      const rangeErrors = FoldV2.validateRange(fold.edges_stiffness, 'edges_stiffness', 0, 1, fold.edges_vertices?.length);
      errors.push(...rangeErrors);
    }

    if (fold.faces_density) {
      const rangeErrors = FoldV2.validatePositive(fold.faces_density, 'faces_density', fold.faces_vertices?.length);
      errors.push(...rangeErrors);
    }

    if (fold.vertices_mass) {
      const rangeErrors = FoldV2.validatePositive(fold.vertices_mass, 'vertices_mass', fold.vertices_coords?.length);
      errors.push(...rangeErrors);
    }

    // Validate animation fields
    if (fold.animation_keyframes) {
      if (!Array.isArray(fold.animation_keyframes)) {
        errors.push('animation_keyframes must be an array');
      } else {
        const invalid = fold.animation_keyframes.filter(k => typeof k !== 'number' || k < 0 || k > 1);
        if (invalid.length > 0) {
          errors.push(`animation_keyframes values must be between 0 and 1, got: ${invalid.join(', ')}`);
        }
      }
    }

    if (fold.animation_interpolation) {
      const valid = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'];
      if (!valid.includes(fold.animation_interpolation)) {
        errors.push(`animation_interpolation must be one of: ${valid.join(', ')}`);
      }
    }

    // Validate frames array
    if (fold.frames) {
      if (!Array.isArray(fold.frames)) {
        errors.push('frames must be an array');
      } else {
        for (let i = 0; i < fold.frames.length; i++) {
          if (!fold.frames[i].vertices_coords) {
            errors.push(`frames[${i}] missing vertices_coords`);
          }
        }
      }
    }

    // Validate extensions
    if (fold.extensions) {
      if (typeof fold.extensions !== 'object') {
        errors.push('extensions must be an object');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  static validateColors(arr, field, expectedLength) {
    const errors = [];
    if (!Array.isArray(arr)) {
      errors.push(`${field} must be an array`);
      return errors;
    }

    for (let i = 0; i < arr.length; i++) {
      const color = arr[i];
      if (typeof color !== 'string') {
        errors.push(`${field}[${i}] must be a string`);
        continue;
      }
      // Hex color (6 or 8 chars)
      if (!/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(color)) {
        // Allow named colors as fallback (lenient)
        if (!/^[a-zA-Z]+$/.test(color)) {
          errors.push(`${field}[${i}] must be hex color (e.g., #ff0000), got: ${color}`);
        }
      }
    }
    return errors;
  }

  static validateRange(arr, field, min, max, expectedLength) {
    const errors = [];
    if (!Array.isArray(arr)) {
      errors.push(`${field} must be an array`);
      return errors;
    }

    for (let i = 0; i < arr.length; i++) {
      if (typeof arr[i] !== 'number' || arr[i] < min || arr[i] > max) {
        errors.push(`${field}[${i}] must be between ${min} and ${max}, got: ${arr[i]}`);
      }
    }
    return errors;
  }

  static validatePositive(arr, field, expectedLength) {
    const errors = [];
    if (!Array.isArray(arr)) {
      errors.push(`${field} must be an array`);
      return errors;
    }

    for (let i = 0; i < arr.length; i++) {
      if (typeof arr[i] !== 'number' || arr[i] <= 0) {
        errors.push(`${field}[${i}] must be positive, got: ${arr[i]}`);
      }
    }
    return errors;
  }

  // ────────────────────────────────────────────────────────────────────
  // Upgrade / Downgrade
  // ───────────────────────────────────────────────────────────────────

  /**
   * Upgrade v1.x to v2.0 format
   */
  static upgrade(fold) {
    if (FoldV2.isV2(fold)) {
      return { ...fold }; // Already v2.0
    }

    const result = {
      ...fold,
      file_spec: 2.0,
      file_creator: `${fold.file_creator || 'origami-fold'} + v2.0 upgrade (v2.44)`,
    };

    // Add default v2.0 extension metadata
    result.extensions = fold.extensions || {};
    result.extensions['origami-simulator-cli'] = {
      version: '2.44',
      upgraded_from: fold.file_spec || 1.1,
      upgraded_at: new Date().toISOString(),
    };

    // Initialize animation if frames exist
    if (fold.frames && fold.frames.length > 1) {
      result.animation_keyframes = fold.frames.map((_, i) => i / (fold.frames.length - 1));
      result.animation_interpolation = 'ease-in-out';
    }

    return result;
  }

  /**
   * Downgrade v2.0 to v1.x format
   */
  static downgrade(fold, targetVersion = 1.1) {
    if (!FoldV2.isV2(fold) && !FoldV2.hasV2Extensions(fold)) {
      return { ...fold }; // Already compatible
    }

    const result = { ...fold };

    // Remove v2.0-specific fields
    const v2Fields = [
      'faces_color', 'faces_material', 'faces_texture',
      'vertices_color',
      'edges_stiffness', 'faces_density', 'vertices_mass',
      'animation_keyframes', 'animation_interpolation',
      'extensions',
    ];

    for (const field of v2Fields) {
      if (field === 'extensions') {
        // Keep extension info in a different field
        if (result.extensions) {
          result.file_description = result.file_description || '';
          result.file_description += ` [Downgraded from v2.0]`;
        }
      }
      delete result[field];
    }

    // Set target version
    result.file_spec = targetVersion;
    result.file_creator = `${fold.file_creator || 'origami-fold'} + v2.0 downgrade (v2.44)`;

    // Collapse frames to single frame if needed
    if (result.frames && result.frames.length > 0) {
      // Keep only the first frame as the main content
      const firstFrame = result.frames[0];
      if (firstFrame.vertices_coords) {
        result.vertices_coords = firstFrame.vertices_coords;
      }
      delete result.frames;
    }

    return result;
  }

  // ────────────────────────────────────────────────────────────────────
  // Defaults
  // ───────────────────────────────────────────────────────────────────

  /**
   * Fill in default v2.0 fields
   */
  static defaults(fold) {
    const result = { ...fold };

    // Ensure file_spec
    if (result.file_spec === undefined) {
      result.file_spec = 1.1;
    }

    // Add default extensions namespace
    if (!result.extensions) {
      result.extensions = {};
    }

    if (!result.extensions['origami-simulator-cli']) {
      result.extensions['origami-simulator-cli'] = {
        version: '2.44',
      };
    }

    // Default animation
    if (result.frames && result.frames.length > 1 && !result.animation_keyframes) {
      result.animation_keyframes = result.frames.map((_, i) => i / (result.frames.length - 1));
    }

    if (!result.animation_interpolation) {
      result.animation_interpolation = 'ease-in-out';
    }

    return result;
  }

  // ────────────────────────────────────────────────────────────────────
  // Utility
  // ───────────────────────────────────────────────────────────────────

  /**
   * Get summary of v2.0 features present
   */
  static summary(fold) {
    const features = [];

    if (fold.faces_color) features.push('faces_color');
    if (fold.faces_material) features.push('faces_material');
    if (fold.faces_texture) features.push('faces_texture');
    if (fold.vertices_color) features.push('vertices_color');
    if (fold.edges_stiffness) features.push('edges_stiffness');
    if (fold.faces_density) features.push('faces_density');
    if (fold.vertices_mass) features.push('vertices_mass');
    if (fold.animation_keyframes) features.push('animation_keyframes');
    if (fold.extensions) features.push('extensions');

    return {
      version: FoldV2.detect(fold).version,
      featureCount: features.length,
      features,
    };
  }

  /**
   * Add material properties to a fold
   */
  static addMaterial(fold, options = {}) {
    const result = { ...fold };

    // Add face colors
    if (options.colors) {
      const faceCount = result.faces_vertices?.length || 0;
      result.faces_color = options.colors.length === faceCount
        ? options.colors
        : Array(faceCount).fill(options.defaultColor || '#ffffff');
    }

    // Add face materials
    if (options.materials) {
      const faceCount = result.faces_vertices?.length || 0;
      result.faces_material = options.materials.length === faceCount
        ? options.materials
        : Array(faceCount).fill(options.defaultMaterial || 'paper');
    }

    // Upgrade to v2.0 if needed
    if (!FoldV2.isV2(result)) {
      return FoldV2.upgrade(result);
    }

    return result;
  }
}

// ────────────────────────────────────────────────────────────────────
// CLI Helpers
// ───────────────────────────────────────────────────────────────────-

function formatValidationResult(result) {
  const lines = [];

  if (result.valid) {
    lines.push('✅ Valid FOLD format');
  } else {
    lines.push('❌ Invalid FOLD format');
  }

  if (result.errors.length > 0) {
    lines.push('\nErrors:');
    for (const err of result.errors) {
      lines.push(`  • ${err}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('\nWarnings:');
    for (const warn of result.warnings) {
      lines.push(`  ⚠️  ${warn}`);
    }
  }

  return lines.join('\n');
}

function formatSummary(fold) {
  const summary = FoldV2.summary(fold);
  const lines = [];

  lines.push(`FOLD Format: v${summary.version}`);
  lines.push(`\nV2.0 Features (${summary.featureCount}):`);

  if (summary.features.length === 0) {
    lines.push('  (none)');
  } else {
    for (const f of summary.features) {
      lines.push(`  ✓ ${f}`);
    }
  }

  return lines.join('\n');
}

module.exports = { FoldV2, formatValidationResult, formatSummary };
