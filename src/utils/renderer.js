/**
 * Renderer - Commercial quality 3D mockup rendering
 *
 * Uses Playwright + OrigamiSimulator for rendering, with enhancements
 * for commercial packaging visualization (high DPI, shadows, backgrounds).
 */

const fs = require('fs');
const path = require('path');

class Renderer {
  constructor(options = {}) {
    this.options = {
      dpi: options.dpi || 72,           // Resolution: 72 (web), 150 (mid), 300 (print)
      width: options.width || 1920,      // Render width in pixels
      height: options.height || 1080,    // Render height in pixels
      background: options.background || 'transparent', // Background color
      shadow: options.shadow || false,   // Enable shadow
      shadowBlur: options.shadowBlur || 10,
      shadowOffset: options.shadowOffset || 5,
      angle: options.angle || 45,         // Camera angle (degrees)
      lightIntensity: options.lightIntensity || 1.0,
      debug: options.debug || false,
    };

    // Calculate dimensions from DPI
    this.updateDimensions();
  }

  /**
   * Update width/height based on DPI setting
   */
  updateDimensions() {
    // Scale factor relative to 72 DPI baseline
    const scale = this.options.dpi / 72;
    this.options._scale = scale;
  }

  /**
   * Set DPI and recalculate dimensions
   * @param {number} dpi - Dots per inch
   */
  setDPI(dpi) {
    this.options.dpi = dpi;
    this.updateDimensions();
    return this;
  }

  /**
   * Set camera angle
   * @param {number} angle - Angle in degrees (0-360)
   */
  setAngle(angle) {
    this.options.angle = angle % 360;
    return this;
  }

  /**
   * Set background color
   * @param {string} color - CSS color or 'transparent'
   */
  setBackground(color) {
    this.options.background = color;
    return this;
  }

  /**
   * Enable/disable shadow
   * @param {boolean} enabled - Shadow enabled
   */
  setShadow(enabled) {
    this.options.shadow = enabled;
    return this;
  }

  /**
   * Get render settings for browser automation
   * @returns {Object} Render settings
   */
  getRenderSettings() {
    return {
      width: this.options.width,
      height: this.options.height,
      dpi: this.options.dpi,
      background: this.options.background,
      shadow: this.options.shadow,
      shadowBlur: this.options.shadowBlur,
      shadowOffset: this.options.shadowOffset,
      angle: this.options.angle,
      lightIntensity: this.options.lightIntensity,
    };
  }

  /**
   * Build a query string for rendering parameters
   * @param {Object} overrides - Override settings
   * @returns {string} Query string
   */
  buildRenderQuery(overrides = {}) {
    const settings = { ...this.options, ...overrides };
    const params = new URLSearchParams();

    if (settings.angle !== undefined) {
      params.set('angle', settings.angle);
    }
    if (settings.background !== undefined && settings.background !== 'transparent') {
      params.set('bg', settings.background);
    }
    if (settings.shadow) {
      params.set('shadow', '1');
      params.set('shadowBlur', settings.shadowBlur);
      params.set('shadowOffset', settings.shadowOffset);
    }
    if (settings.dpi) {
      params.set('dpi', settings.dpi);
    }

    return params.toString();
  }

  /**
   * Calculate output filename based on settings
   * @param {string} inputPath - Input model path
   * @param {string} format - Output format (png, jpg, webp)
   * @returns {string} Suggested output filename
   */
  suggestOutputName(inputPath, format = 'png') {
    const dir = path.dirname(inputPath);
    const base = path.basename(inputPath, path.extname(inputPath));
    const scale = this.options.dpi;
    const angle = this.options.angle;

    return path.join(dir, `${base}_${scale}dpi_${angle}deg.${format}`);
  }

  /**
   * Render presets for common use cases
   */
  static presets() {
    return {
      web: {
        dpi: 72,
        width: 1200,
        height: 800,
        background: '#ffffff',
        shadow: false,
        name: 'Web (72 DPI)',
      },
      social: {
        dpi: 150,
        width: 1920,
        height: 1080,
        background: '#ffffff',
        shadow: true,
        name: 'Social Media (150 DPI)',
      },
      print: {
        dpi: 300,
        width: 3300,
        height: 2550,
        background: '#ffffff',
        shadow: true,
        name: 'Print (300 DPI)',
      },
      transparent: {
        dpi: 150,
        width: 1920,
        height: 1080,
        background: 'transparent',
        shadow: false,
        name: 'Transparent (150 DPI)',
      },
      product: {
        dpi: 200,
        width: 2400,
        height: 2400,
        background: '#f5f5f5',
        shadow: true,
        name: 'Product Shot (200 DPI)',
      },
    };
  }

  /**
   * Create renderer from preset
   * @param {string} presetName - Preset name ('web', 'social', 'print', 'transparent', 'product')
   * @returns {Renderer} Configured renderer
   */
  static fromPreset(presetName) {
    const presets = Renderer.presets();
    const preset = presets[presetName];

    if (!preset) {
      throw new Error(`Unknown preset: ${presetName}. Available: ${Object.keys(presets).join(', ')}`);
    }

    return new Renderer(preset);
  }

  /**
   * Validate render options
   * @returns {Object} Validation result { valid: boolean, errors: string[] }
   */
  validate() {
    const errors = [];

    if (this.options.dpi < 10 || this.options.dpi > 600) {
      errors.push(`DPI must be between 10 and 600, got ${this.options.dpi}`);
    }

    if (this.options.width < 100 || this.options.width > 8000) {
      errors.push(`Width must be between 100 and 8000, got ${this.options.width}`);
    }

    if (this.options.height < 100 || this.options.height > 8000) {
      errors.push(`Height must be between 100 and 8000, got ${this.options.height}`);
    }

    if (this.options.angle < 0 || this.options.angle > 360) {
      errors.push(`Angle must be between 0 and 360, got ${this.options.angle}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get info about current settings
   * @returns {Object} Settings info
   */
  getInfo() {
    return {
      dpi: this.options.dpi,
      dimensions: `${this.options.width}x${this.options.height}`,
      aspectRatio: (this.options.width / this.options.height).toFixed(2),
      background: this.options.background,
      shadow: this.options.shadow,
      angle: this.options.angle,
      estimatedSizeKB: Math.round((this.options.width * this.options.height * 4) / 1024),
    };
  }
}

/**
 * Batch render settings for multiple angles
 */
class BatchRenderSettings {
  constructor(baseRenderer) {
    this.renderer = baseRenderer;
    this.angles = [0, 45, 90, 135, 180, 225, 270, 315];
    this.formats = ['png'];
    this.outputDir = null;
  }

  /**
   * Set angles to render
   * @param {number[]} angles - Array of angles in degrees
   */
  setAngles(angles) {
    this.angles = angles;
    return this;
  }

  /**
   * Set output format
   * @param {string} format - 'png', 'jpg', or 'webp'
   */
  setFormat(format) {
    this.formats = [format];
    return this;
  }

  /**
   * Set output directory
   * @param {string} dir - Output directory path
   */
  setOutputDir(dir) {
    this.outputDir = dir;
    return this;
  }

  /**
   * Generate all render configurations
   * @returns {Array} Array of render configs
   */
  generateConfigs() {
    const configs = [];

    for (const angle of this.angles) {
      for (const format of this.formats) {
        const renderer = new Renderer(this.renderer.options);
        renderer.setAngle(angle);

        configs.push({
          renderer,
          angle,
          format,
          outputPath: this.outputDir
            ? path.join(this.outputDir, `render_${angle}.${format}`)
            : null,
        });
      }
    }

    return configs;
  }
}

module.exports = { Renderer, BatchRenderSettings };
module.exports.Renderer = Renderer;
module.exports.BatchRenderSettings = BatchRenderSettings;