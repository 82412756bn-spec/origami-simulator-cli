/**
 * Batch Box Generator
 * Generate multiple box variants for comparison and material testing
 */

const fs = require('fs');
const path = require('path');
const { generateTemplate, getAvailableTemplates } = require('../templates/packaging/box-templates');
const { getMaterial, listMaterials } = require('../templates/packaging/materials');

class BoxBatchGenerator {
  constructor(options = {}) {
    this.options = {
      outputDir: options.outputDir || './box-variants',
      debug: options.debug || false,
    };
  }

  /**
   * Generate thickness variants for a single box type
   * @param {string} templateName - Template name
   * @param {Object} dimensions - Box dimensions
   * @param {Array} thicknesses - Array of thickness values
   * @returns {Array} Array of generated file paths
   */
  generateThicknessVariants(templateName, dimensions, thicknesses = [0, 0.5, 1, 2, 3]) {
    const results = [];

    if (!fs.existsSync(this.options.outputDir)) {
      fs.mkdirSync(this.options.outputDir, { recursive: true });
    }

    for (const thickness of thicknesses) {
      try {
        const dieline = generateTemplate(templateName, {
          ...dimensions,
          thickness,
        });

        const filename = `${templateName}_t${thickness}mm.fold`;
        const outputPath = path.join(this.options.outputDir, filename);
        fs.writeFileSync(outputPath, JSON.stringify(dieline, null, 2));

        results.push({
          thickness,
          path: outputPath,
          vertices: dieline.vertices_coords.length,
          edges: dieline.edges_vertices.length,
        });

        if (this.options.debug) {
          console.log(`✅ Generated: ${outputPath}`);
        }
      } catch (err) {
        console.error(`❌ Failed to generate ${templateName} t=${thickness}mm: ${err.message}`);
      }
    }

    return results;
  }

  /**
   * Generate material variants for a single box type
   * @param {string} templateName - Template name
   * @param {Object} dimensions - Box dimensions
   * @returns {Array} Array of generated file paths
   */
  generateMaterialVariants(templateName, dimensions) {
    const results = [];
    const materials = listMaterials();

    if (!fs.existsSync(this.options.outputDir)) {
      fs.mkdirSync(this.options.outputDir, { recursive: true });
    }

    for (const mat of materials) {
      try {
        const material = getMaterial(mat.id);

        // Use material's standard thickness
        const dieline = generateTemplate(templateName, {
          ...dimensions,
          thickness: material.thickness,
        });

        const filename = `${templateName}_${mat.id}.fold`;
        const outputPath = path.join(this.options.outputDir, filename);
        fs.writeFileSync(outputPath, JSON.stringify(dieline, null, 2));

        results.push({
          material: mat.id,
          path: outputPath,
          thickness: material.thickness,
        });
      } catch (err) {
        console.error(`❌ Failed: ${err.message}`);
      }
    }

    return results;
  }

  /**
   * Generate complete catalog - all templates × all standard thicknesses
   * @param {Object} baseDimensions - Base dimensions (will be used as default)
   * @returns {Object} Generation report
   */
  generateCatalog(baseDimensions = {}) {
    const templates = getAvailableTemplates();
    const standardThicknesses = [0.5, 1, 2, 3];
    const report = {
      totalGenerated: 0,
      byTemplate: {},
      outputDir: this.options.outputDir,
    };

    for (const template of templates) {
      const results = this.generateThicknessVariants(
        template.id,
        baseDimensions,
        standardThicknesses
      );
      report.byTemplate[template.id] = results;
      report.totalGenerated += results.length;
    }

    return report;
  }

  /**
   * Generate a comparison report
   * @param {Array} variants - Array of {path, thickness, ...}
   * @returns {string} Markdown comparison report
   */
  generateReport(variants) {
    let report = '# Box Template Comparison\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;
    report += '| Thickness | Vertices | Edges | Path |\n';
    report += '|-----------|----------|-------|------|\n';

    for (const v of variants) {
      report += `| ${v.thickness}mm | ${v.vertices} | ${v.edges} | ${v.path} |\n`;
    }

    return report;
  }
}

module.exports = { BoxBatchGenerator };
module.exports.BoxBatchGenerator = BoxBatchGenerator;
