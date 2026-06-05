/**
 * Face Binding - Bind artwork images to specific faces of a folded model
 *
 * Handles mapping artwork images to faces via UV coordinates, enabling
 * rendering of branded/customized packaging mockups.
 */

const fs = require('fs');
const path = require('path');

class FaceBinding {
  constructor(options = {}) {
    this.options = {
      debug: options.debug || false,
    };
    this.bindings = new Map(); // faceIndex -> { artwork, uv, layer }
    this.model = null;
  }

  /**
   * Load a FOLD model for binding
   * @param {string|Object} model - FOLD file path or FOLD object
   * @returns {Object} Loaded model data
   */
  loadModel(model) {
    if (typeof model === 'string') {
      const content = fs.readFileSync(model, 'utf8');
      this.model = JSON.parse(content);
      this.model._sourceFile = model;
    } else {
      this.model = { ...model };
    }

    this.validateModel();

    // Repopulate bindings map if model has faces_material
    this.bindings.clear();
    if (this.model.faces_material) {
      for (const material of this.model.faces_material) {
        if (material.artwork) {
          this.bindings.set(material.face, {
            faceIndex: material.face,
            artwork: material.artworkPath,
            artworkName: material.artwork,
            uv: material.uv,
            rotation: material.rotation || 0,
            layer: material.layer || 'default',
            scale: material.scale || 1,
            offset: material.offset || [0, 0],
          });
        }
      }
    }

    return this.model;
  }

  /**
   * Validate that model has required structure for binding
   */
  validateModel() {
    if (!this.model) {
      throw new Error('No model loaded');
    }

    if (!Array.isArray(this.model.vertices_coords)) {
      throw new Error('Model missing vertices_coords');
    }

    if (!Array.isArray(this.model.faces_vertices)) {
      throw new Error('Model missing faces_vertices');
    }

    const faceCount = this.model.faces_vertices.length;

    if (this.options.debug) {
      console.log(`Model validated: ${faceCount} faces`);
    }
  }

  /**
   * Bind an artwork image to a specific face
   * @param {number} faceIndex - Index of the face (0-based)
   * @param {string} artworkPath - Path to artwork image
   * @param {Object} options - Binding options
   * @param {Array} options.uv - UV coordinates [u1, v1, u2, v2] (default: auto-detect)
   * @param {number} options.rotation - Rotation in degrees (0, 90, 180, 270)
   * @param {string} options.layer - Layer name for multi-layer packaging
   */
  bindArtwork(faceIndex, artworkPath, options = {}) {
    if (!this.model) {
      throw new Error('No model loaded');
    }

    const faceCount = this.model.faces_vertices.length;
    if (faceIndex < 0 || faceIndex >= faceCount) {
      throw new Error(`Face index ${faceIndex} out of range (0-${faceCount - 1})`);
    }

    // Validate artwork file exists
    if (!fs.existsSync(artworkPath)) {
      throw new Error(`Artwork file not found: ${artworkPath}`);
    }

    const binding = {
      faceIndex,
      artwork: path.resolve(artworkPath),
      artworkName: path.basename(artworkPath),
      uv: options.uv || this.computeUV(faceIndex),
      rotation: options.rotation || 0,
      layer: options.layer || 'default',
      scale: options.scale || 1,
      offset: options.offset || [0, 0],
    };

    this.bindings.set(faceIndex, binding);

    if (this.options.debug) {
      console.log(`Bound face ${faceIndex} to ${path.basename(artworkPath)}`);
    }

    return binding;
  }

  /**
   * Compute UV coordinates for a face based on its vertices
   * @param {number} faceIndex - Index of the face
   * @returns {Array} UV coordinates [u1, v1, u2, v2]
   */
  computeUV(faceIndex) {
    const faceVertices = this.model.faces_vertices[faceIndex];
    const vertices = this.model.vertices_coords;

    // Get bounding box of face vertices
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const vi of faceVertices) {
      const [x, y] = vertices[vi];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }

    return [minX, minY, maxX, maxY];
  }

  /**
   * Bind artwork to multiple faces automatically
   * @param {Array} bindings - Array of {faceIndex, artworkPath, options}
   */
  bindMultiple(bindings) {
    for (const binding of bindings) {
      this.bindArtwork(binding.faceIndex, binding.artworkPath, binding.options);
    }
  }

  /**
   * Bind artwork to all faces using pattern
   * @param {Array} artworkPaths - Ordered list of artwork paths (one per face)
   */
  bindAllFaces(artworkPaths) {
    const faceCount = this.model.faces_vertices.length;

    for (let i = 0; i < Math.min(faceCount, artworkPaths.length); i++) {
      this.bindArtwork(i, artworkPaths[i]);
    }
  }

  /**
   * Get binding for a specific face
   * @param {number} faceIndex - Index of the face
   * @returns {Object|null} Binding data or null if not bound
   */
  getBinding(faceIndex) {
    return this.bindings.get(faceIndex) || null;
  }

  /**
   * Get all bindings
   * @returns {Array} Array of binding objects
   */
  getAllBindings() {
    return Array.from(this.bindings.values());
  }

  /**
   * Check if a face is bound
   * @param {number} faceIndex - Index of the face
   * @returns {boolean}
   */
  isFaceBound(faceIndex) {
    return this.bindings.has(faceIndex);
  }

  /**
   * Get binding statistics
   * @returns {Object} Statistics about bindings
   */
  getStats() {
    const faceCount = this.model ? this.model.faces_vertices.length : 0;
    const boundCount = this.bindings.size;

    const layerCounts = {};
    for (const binding of this.bindings.values()) {
      layerCounts[binding.layer] = (layerCounts[binding.layer] || 0) + 1;
    }

    return {
      totalFaces: faceCount,
      boundFaces: boundCount,
      unboundFaces: faceCount - boundCount,
      layers: Object.keys(layerCounts),
      layerCounts,
    };
  }

  /**
   * Remove binding from a face
   * @param {number} faceIndex - Index of the face
   */
  unbindFace(faceIndex) {
    this.bindings.delete(faceIndex);
  }

  /**
   * Clear all bindings
   */
  clearBindings() {
    this.bindings.clear();
  }

  /**
   * Export model with bindings as extended FOLD format
   * @param {string} outputPath - Output file path
   */
  exportModel(outputPath) {
    if (!this.model) {
      throw new Error('No model loaded');
    }

    // Add binding data to model
    const exportModel = {
      ...this.model,
      faces_material: this.serializeBindings(),
    };

    this.model = exportModel;

    const json = JSON.stringify(exportModel, null, 2);
    fs.writeFileSync(outputPath, json);

    if (this.options.debug) {
      console.log(`Exported bound model: ${outputPath}`);
    }

    return exportModel;
  }

  /**
   * Serialize bindings for FOLD format
   * @returns {Array} Serialized binding data
   */
  serializeBindings() {
    const bindings = [];

    for (let i = 0; i < this.model.faces_vertices.length; i++) {
      const binding = this.bindings.get(i);
      if (binding) {
        bindings.push({
          face: i,
          artwork: binding.artworkName,
          artworkPath: binding.artwork,
          uv: binding.uv,
          rotation: binding.rotation,
          layer: binding.layer,
          scale: binding.scale,
          offset: binding.offset,
        });
      } else {
        bindings.push({ face: i, artwork: null });
      }
    }

    return bindings;
  }

  /**
   * Generate a report of bindings
   * @returns {string} Human-readable report
   */
  generateReport() {
    const stats = this.getStats();
    let report = `Face Binding Report\n`;
    report += `${'='.repeat(40)}\n\n`;
    report += `Faces: ${stats.boundFaces}/${stats.totalFaces} bound\n`;
    report += `Layers: ${stats.layers.join(', ')}\n\n`;

    if (stats.layerCounts) {
      report += `Bindings by layer:\n`;
      for (const [layer, count] of Object.entries(stats.layerCounts)) {
        report += `  ${layer}: ${count}\n`;
      }
    }

    report += `\nDetailed bindings:\n`;
    for (const binding of this.bindings.values()) {
      report += `  Face ${binding.faceIndex}: ${binding.artworkName} (layer: ${binding.layer})\n`;
    }

    return report;
  }
}

/**
 * Parse artwork filename to detect intended face
 * Convention: filename like "box_face0.png" -> face 0
 * @param {string} filename - Artwork filename
 * @returns {number|null} Detected face index or null
 */
function detectFaceFromFilename(filename) {
  const match = filename.match(/face[_\s-]*(\d+)/i);
  return match ? parseInt(match[1]) : null;
}

/**
 * Auto-detect bindings from a directory of artwork files
 * @param {string} dirPath - Directory containing artwork files
 * @param {Object} options - Options for binding
 * @returns {Array} Detected bindings
 */
function autoDetectBindings(dirPath, options = {}) {
  const files = fs.readdirSync(dirPath)
    .filter(f => /\.(png|jpg|jpeg|svg)$/i.test(f))
    .sort();

  const bindings = [];

  for (const file of files) {
    const faceIndex = detectFaceFromFilename(file);
    if (faceIndex !== null) {
      bindings.push({
        faceIndex,
        artworkPath: path.join(dirPath, file),
        options: {},
      });
    } else {
      // Sequential assignment if no face indicator
      bindings.push({
        faceIndex: bindings.length,
        artworkPath: path.join(dirPath, file),
        options: {},
      });
    }
  }

  return bindings;
}

module.exports = { FaceBinding, detectFaceFromFilename, autoDetectBindings };
module.exports.FaceBinding = FaceBinding;
module.exports.detectFaceFromFilename = detectFaceFromFilename;
module.exports.autoDetectBindings = autoDetectBindings;