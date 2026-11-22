/**
 * FOLD to OBJ/MTL Exporter (v2.45)
 *
 * Exports FOLD files to Wavefront OBJ format with MTL material support.
 * Supports:
 *   - Vertex coordinates
 *   - Face export (triangulated)
 *   - Material colors from faces_color
 *   - Per-face material assignment
 *
 * Usage:
 *   origami obj <file> -o model.obj
 *   origami obj <file> --mtl model.mtl
 *   origami obj <file> --separate-faces
 */

const path = require('path');
const fs = require('fs');

class FoldOBJExporter {
  constructor(fold, options = {}) {
    this.fold = fold;
    this.vertices = fold.vertices_coords || [];
    this.edges = fold.edges_vertices || [];
    this.faces = fold.faces_vertices || [];
    this.facesColor = fold.faces_color || [];
    this.facesMaterial = fold.faces_material || [];

    this.options = {
      // Output options
      outputMtl: options.outputMtl !== false,  // Generate .mtl file by default
      separateFaces: options.separateFaces || false,  // One obj per face

      // Geometry options
      triangulate: options.triangulate !== false,  // Always triangulate
      originVertex: options.originVertex || 1,  // OBJ uses 1-based index

      // Material options
      defaultColor: options.defaultColor || [0.8, 0.8, 0.8],  // White
      defaultKa: options.defaultKa || [0.1, 0.1, 0.1],  // Ambient
      defaultKd: options.defaultKd || [0.8, 0.8, 0.8],  // Diffuse
      defaultKs: options.defaultKs || [0.5, 0.5, 0.5],  // Specular
      defaultNs: options.defaultNs || 50,  // Shininess

      // File metadata
      mtlFilename: options.mtlFilename || 'materials.mtl',
      objectName: options.objectName || 'origami',
    };
  }

  /**
   * Export to OBJ format
   * Returns: { obj: string, mtl?: string, materialNames: string[] }
   */
  export() {
    const objLines = [];
    const mtlLines = [];

    // Header
    objLines.push(`# Exported from origami-simulator-cli v2.45`);
    objLines.push(`# Source: ${this.fold.file_creator || 'unknown'}`);

    // MTL library reference
    if (this.options.outputMtl && this.hasMaterials()) {
      objLines.push(`mtllib ${this.options.mtlFilename}`);
    }

    // Object name
    objLines.push(`o ${this.options.objectName}`);

    // Vertices
    for (const v of this.vertices) {
      // FOLD uses [x, y, z], OBJ uses right-handed coordinate system
      // No conversion needed - both use same coordinate order
      objLines.push(`v ${this.formatFloat(v[0])} ${this.formatFloat(v[1])} ${this.formatFloat(v[2])}`);
    }

    // Process faces
    const materialNames = this.hasMaterials() ? this.collectMaterialNames() : [];

    if (this.options.separateFaces) {
      // Export each face as separate object
      for (let i = 0; i < this.faces.length; i++) {
        const face = this.faces[i];
        const faceVerts = this.triangulateFace(face);

        objLines.push(`\ng face_${i}`);

        if (this.hasMaterials()) {
          const matName = materialNames[i];
          if (matName) {
            objLines.push(`usemtl ${matName}`);
          }
        }

        for (const tri of faceVerts) {
          // OBJ uses 1-based indexing
          const indices = tri.map(idx => idx + this.options.originVertex).join(' ');
          objLines.push(`f ${indices}`);
        }
      }
    } else {
      // Single object with all faces
      if (this.hasMaterials()) {
        // Group by material
        const materialGroups = this.groupFacesByMaterial();
        for (const [matName, faceIndices] of Object.entries(materialGroups)) {
          objLines.push(`\ng ${matName}`);
          objLines.push(`usemtl ${matName}`);

          for (const faceIdx of faceIndices) {
            const face = this.faces[faceIdx];
            const faceVerts = this.triangulateFace(face);
            for (const tri of faceVerts) {
              const indices = tri.map(idx => idx + this.options.originVertex).join(' ');
              objLines.push(`f ${indices}`);
            }
          }
        }
      } else {
        // No materials - simple face export
        for (const face of this.faces) {
          const faceVerts = this.triangulateFace(face);
          for (const tri of faceVerts) {
            const indices = tri.map(idx => idx + this.options.originVertex).join(' ');
            objLines.push(`f ${indices}`);
          }
        }
      }
    }

    // Generate MTL if needed
    let mtl = null;
    if (this.options.outputMtl && this.hasMaterials()) {
      mtlLines.push(`# Exported from origami-simulator-cli v2.45`);
      mtlLines.push('');

      for (const matName of [...new Set(materialNames)]) {
        if (!matName) continue;

        const color = this.getColorForMaterial(matName);
        const mat = this.getMaterialProperties(matName);

        mtlLines.push(`newmtl ${matName}`);
        mtlLines.push(`Ka ${this.formatFloat(mat.Ka[0])} ${this.formatFloat(mat.Ka[1])} ${this.formatFloat(mat.Ka[2])}`);
        mtlLines.push(`Kd ${this.formatFloat(color[0])} ${this.formatFloat(color[1])} ${this.formatFloat(color[2])}`);
        mtlLines.push(`Ks ${this.formatFloat(mat.Ks[0])} ${this.formatFloat(mat.Ks[1])} ${this.formatFloat(mat.Ks[2])}`);
        mtlLines.push(`Ns ${mat.Ns}`);
        mtlLines.push(`d 1.0`);
        mtlLines.push('');
      }

      mtl = mtlLines.join('\n');
    }

    return {
      obj: objLines.join('\n'),
      mtl,
      materialNames: [...new Set(materialNames.filter(Boolean))],
    };
  }

  /**
   * Export and write to files
   */
  exportToFile(objPath, mtlPath) {
    const result = this.export();

    // Write OBJ
    fs.writeFileSync(objPath, result.obj, 'utf8');
    console.log(`📦 OBJ written to: ${objPath}`);

    // Write MTL if present
    if (result.mtl && mtlPath) {
      fs.writeFileSync(mtlPath, result.mtl, 'utf8');
      console.log(`🎨 MTL written to: ${mtlPath}`);
      console.log(`   Materials: ${result.materialNames.length}`);
    }

    // Summary
    console.log(`   Vertices: ${this.vertices.length}`);
    console.log(`   Faces: ${this.faces.length}`);

    return result;
  }

  // ────────────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────────

  hasMaterials() {
    return this.facesColor.length > 0 || this.facesMaterial.length > 0;
  }

  collectMaterialNames() {
    const names = [];
    for (let i = 0; i < this.faces.length; i++) {
      let name = null;

      // First check faces_material
      if (this.facesMaterial[i]) {
        name = this.facesMaterial[i];
      }
      // Then check faces_color (generate name from color)
      else if (this.facesColor[i]) {
        name = `color_${this.facesColor[i].replace('#', '')}`;
      }
      // Default
      else {
        name = 'default';
      }

      names.push(name);
    }
    return names;
  }

  groupFacesByMaterial() {
    const groups = {};
    const names = this.collectMaterialNames();

    for (let i = 0; i < this.faces.length; i++) {
      const name = names[i] || 'default';
      if (!groups[name]) {
        groups[name] = [];
      }
      groups[name].push(i);
    }

    return groups;
  }

  getColorForMaterial(matName) {
    // Try to find matching color
    for (let i = 0; i < this.faces.length; i++) {
      let name = null;
      if (this.facesMaterial[i]) {
        name = this.facesMaterial[i];
      } else if (this.facesColor[i]) {
        name = `color_${this.facesColor[i].replace('#', '')}`;
      }

      if (name === matName && this.facesColor[i]) {
        return this.hexToRgb(this.facesColor[i]);
      }
    }

    return this.options.defaultColor;
  }

  getMaterialProperties(matName) {
    // Check for material-specific properties in fold
    const matProps = (this.fold.materials || {})[matName] || {};

    return {
      Ka: matProps.Ka || this.options.defaultKa,
      Kd: matProps.Kd || this.options.defaultKd,
      Ks: matProps.Ks || this.options.defaultKs,
      Ns: matProps.Ns || this.options.defaultNs,
    };
  }

  triangulateFace(face) {
    if (!this.options.triangulate) {
      return [face];
    }

    // Fan triangulation from first vertex
    const tris = [];
    for (let i = 1; i < face.length - 1; i++) {
      tris.push([face[0], face[i], face[i + 1]]);
    }
    return tris;
  }

  hexToRgb(hex) {
    // Remove # if present
    hex = hex.replace('#', '');

    // Parse hex
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    return [r, g, b];
  }

  formatFloat(n) {
    if (n === undefined || n === null) return '0';
    // Round to 6 decimal places
    return Number(n.toFixed(6)).toString();
  }
}

// ────────────────────────────────────────────────────────────────────
// CLI Command
// ───────────────────────────────────────────────────────────────────-

function registerOBJCommand(program) {
  program
    .command('obj <file>')
    .description('Export FOLD to OBJ/MTL format (v2.45)')
    .option('-o, --output <file>', 'Output OBJ file (default: <input>.obj)')
    .option('--mtl <file>', 'Output MTL file (default: <input>.mtl)')
    .option('--no-mtl', 'Skip MTL file generation')
    .option('--separate-faces', 'Export each face as separate object')
    .option('--triangulate', 'Triangulate faces (default: true)', true)
    .action((file, options) => {
      try {
        if (!fs.existsSync(file)) {
          console.error(`❌ File not found: ${file}`);
          process.exit(2);
        }

        const fold = JSON.parse(fs.readFileSync(file, 'utf8'));

        // Determine output paths
        const basePath = file.replace(/\.(fold|json)$/, '');
        const objPath = options.output || `${basePath}.obj`;
        const mtlPath = options.mtl || (options.noMtl ? null : `${basePath}.mtl`);

        // Export
        const exporter = new FoldOBJExporter(fold, {
          outputMtl: !options.noMtl,
          separateFaces: options.separateFaces,
          triangulate: options.triangulate,
          mtlFilename: mtlPath ? path.basename(mtlPath) : 'materials.mtl',
        });

        exporter.exportToFile(
          path.resolve(objPath),
          mtlPath ? path.resolve(mtlPath) : null
        );

      } catch (error) {
        console.error(`❌ Export error: ${error.message}`);
        if (options.debug) console.error(error.stack);
        process.exit(2);
      }
    });
}

module.exports = { FoldOBJExporter, registerOBJCommand };
