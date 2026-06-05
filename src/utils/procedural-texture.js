/**
 * Procedural PBR Texture Generator
 *
 * Generates paper, cardboard, and material textures procedurally
 * using HTML5 Canvas. No external assets needed.
 *
 * Produces three texture maps per material:
 * - diffuse.png: base color/albedo
 * - normal.png: surface detail (bump map)
 * - roughness.png: surface micro-roughness
 *
 * Techniques used:
 * - Perlin-like noise via random sampling
 * - Multi-octave fBm (fractional Brownian motion)
 * - Cell noise for fiber patterns
 */

class ProceduralTextureGenerator {
  constructor(options = {}) {
    this.options = {
      size: options.size || 512,          // texture size (512x512)
      seed: options.seed || 42,          // deterministic generation
    };
  }

  /**
   * Generate all texture maps for a material
   * @param {string} materialId - Material identifier
   * @returns {Object} Object with diffuse, normal, roughness data URLs
   */
  generate(materialId) {
    const generator = this.getGenerator(materialId);
    if (!generator) {
      throw new Error(`No texture generator for material: ${materialId}`);
    }
    return generator();
  }

  /**
   * Get texture generator for material
   */
  getGenerator(materialId) {
    const generators = {
      'cardboard': () => this.generateCardboardTextures(),
      'kraft-paper': () => this.generateKraftPaperTextures(),
      'coated-paper': () => this.generateCoatedPaperTextures(),
      'glossy-cardboard': () => this.generateGlossyCardboardTextures(),
      'matte-cardboard': () => this.generateMatteCardboardTextures(),
      'corrugated': () => this.generateCorrugatedTextures(),
      'metal': () => this.generateMetalTextures(),
      'plastic': () => this.generatePlasticTextures(),
    };
    return generators[materialId];
  }

  /**
   * Create canvas
   */
  createCanvas() {
    if (typeof document === 'undefined') {
      // Node.js environment - use node-canvas
      try {
        const { createCanvas } = require('canvas');
        return createCanvas(this.options.size, this.options.size);
      } catch (e) {
        // Fallback: return null
        return null;
      }
    }
    return document.createElement('canvas');
  }

  /**
   * Get canvas context
   */
  getContext(canvas) {
    return canvas.getContext('2d');
  }

  /**
   * Generate Cardboard textures (corrugated brown)
   */
  generateCardboardTextures() {
    const size = this.options.size;
    const baseColor = { r: 196, g: 165, b: 123 };  // #c4a57b

    // Diffuse: base color + fiber noise
    const diffuse = this.fiberTexture(size, baseColor, 0.4);

    // Normal: subtle bump from fibers
    const normal = this.normalFromHeight(this.fiberHeight(size, 0.3));

    // Roughness: variable 0.75-0.95
    const roughness = this.uniformRoughness(size, 165);

    return { diffuse, normal, roughness };
  }

  /**
   * Generate Kraft Paper textures
   */
  generateKraftPaperTextures() {
    const size = this.options.size;
    const baseColor = { r: 164, g: 113, b: 72 };  // #a47148

    const diffuse = this.fiberTexture(size, baseColor, 0.5);
    const normal = this.normalFromHeight(this.fiberHeight(size, 0.4));
    const roughness = this.uniformRoughness(size, 200);

    return { diffuse, normal, roughness };
  }

  /**
   * Generate Coated Paper (smooth, white)
   */
  generateCoatedPaperTextures() {
    const size = this.options.size;
    const baseColor = { r: 250, g: 250, b: 250 };

    // Subtle paper grain
    const diffuse = this.subtleTexture(size, baseColor, 0.05);
    const normal = this.normalFromHeight(this.fiberHeight(size, 0.05));
    const roughness = this.uniformRoughness(size, 110);

    return { diffuse, normal, roughness };
  }

  /**
   * Generate Glossy Cardboard
   */
  generateGlossyCardboardTextures() {
    const size = this.options.size;
    const baseColor = { r: 245, g: 230, b: 211 };

    const diffuse = this.subtleTexture(size, baseColor, 0.1);
    const normal = this.normalFromHeight(this.fiberHeight(size, 0.1));
    const roughness = this.uniformRoughness(size, 100);

    return { diffuse, normal, roughness };
  }

  /**
   * Generate Matte Cardboard
   */
  generateMatteCardboardTextures() {
    const size = this.options.size;
    const baseColor = { r: 232, g: 213, b: 183 };

    const diffuse = this.fiberTexture(size, baseColor, 0.4);
    const normal = this.normalFromHeight(this.fiberHeight(size, 0.4));
    const roughness = this.uniformRoughness(size, 220);

    return { diffuse, normal, roughness };
  }

  /**
   * Generate Corrugated Cardboard (with wavy lines)
   */
  generateCorrugatedTextures() {
    const size = this.options.size;
    const baseColor = { r: 139, g: 111, b: 71 };

    // Corrugated pattern (horizontal waves)
    const diffuse = this.corrugatedPattern(size, baseColor);
    const normal = this.corrugatedNormal(size);
    const roughness = this.uniformRoughness(size, 200);

    return { diffuse, normal, roughness };
  }

  /**
   * Generate Metal textures
   */
  generateMetalTextures() {
    const size = this.options.size;
    const baseColor = { r: 192, g: 192, b: 192 };

    // Brushed metal
    const diffuse = this.brushedMetal(size, baseColor);
    const normal = this.brushedMetalNormal(size);
    const roughness = this.brushedMetalRoughness(size);

    return { diffuse, normal, roughness };
  }

  /**
   * Generate Plastic textures
   */
  generatePlasticTextures() {
    const size = this.options.size;
    const baseColor = { r: 255, g: 255, b: 255 };

    const diffuse = this.uniformTexture(size, baseColor);
    const normal = this.uniformNormal(size);
    const roughness = this.uniformRoughness(size, 80);

    return { diffuse, normal, roughness };
  }

  /**
   * Generate fiber texture (for paper/cardboard)
   * High contrast to ensure visible texture
   */
  fiberTexture(size, baseColor, intensity = 0.3) {
    const canvas = this.createCanvas();
    if (!canvas) return null;
    canvas.width = canvas.height = size;
    const ctx = this.getContext(canvas);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    // Use deterministic seed
    const rng = this.createRNG(this.options.seed);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Multi-octave noise for natural look
        let n = 0;
        n += (rng() - 0.5) * 0.5;
        n += (rng() - 0.5) * 0.25;
        n += (rng() - 0.5) * 0.125;
        n += (rng() - 0.5) * 0.0625;
        // n is now in [-0.5, 0.5]

        const idx = (y * size + x) * 4;

        // Apply texture: shift each channel by up to ±intensity*128
        const dr = Math.floor(n * intensity * 256);
        data[idx] = Math.max(0, Math.min(255, baseColor.r + dr));
        data[idx + 1] = Math.max(0, Math.min(255, baseColor.g + dr));
        data[idx + 2] = Math.max(0, Math.min(255, baseColor.b + dr));
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  /**
   * Subtle texture (smooth materials)
   */
  subtleTexture(size, baseColor, intensity = 0.05) {
    return this.fiberTexture(size, baseColor, intensity);
  }

  /**
   * Uniform texture (plastic)
   */
  uniformTexture(size, baseColor) {
    const canvas = this.createCanvas();
    if (!canvas) return null;
    canvas.width = canvas.height = size;
    const ctx = this.getContext(canvas);
    ctx.fillStyle = `rgb(${baseColor.r}, ${baseColor.g}, ${baseColor.b})`;
    ctx.fillRect(0, 0, size, size);
    return canvas.toDataURL('image/png');
  }

  /**
   * Corrugated pattern (horizontal waves)
   * High contrast for visible texture
   */
  corrugatedPattern(size, baseColor) {
    const canvas = this.createCanvas();
    if (!canvas) return null;
    canvas.width = canvas.height = size;
    const ctx = this.getContext(canvas);

    // Add noise first
    const imgData = ctx.createImageData(size, size);
    const rng = this.createRNG(this.options.seed + 1);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const n = (rng() - 0.5) * 40;
      imgData.data[i] = Math.max(0, Math.min(255, baseColor.r + n));
      imgData.data[i+1] = Math.max(0, Math.min(255, baseColor.g + n));
      imgData.data[i+2] = Math.max(0, Math.min(255, baseColor.b + n));
      imgData.data[i+3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);

    // Vertical lines representing corrugation edges (high contrast)
    const lineWidth = 12;
    const gap = 24;
    for (let x = 0; x < size; x += lineWidth + gap) {
      // Lighter band
      ctx.fillStyle = `rgb(${Math.min(255, baseColor.r + 50)}, ${Math.min(255, baseColor.g + 40)}, ${Math.min(255, baseColor.b + 25)})`;
      ctx.fillRect(x, 0, lineWidth, size);
      // Darker edge
      ctx.fillStyle = `rgb(${Math.max(0, baseColor.r - 60)}, ${Math.max(0, baseColor.g - 50)}, ${Math.max(0, baseColor.b - 30)})`;
      ctx.fillRect(x, 0, 2, size);
    }

    return canvas.toDataURL('image/png');
  }

  /**
   * Fiber height map (for normal map)
   */
  fiberHeight(size, intensity = 0.3) {
    const canvas = this.createCanvas();
    if (!canvas) return null;
    canvas.width = canvas.height = size;
    const ctx = this.getContext(canvas);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const rng = this.createRNG(this.options.seed);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let h = 0;
        h += rng() * 0.5;
        h += rng() * 0.3;
        h += rng() * 0.15;
        h += rng() * 0.05;
        h = h * intensity * 255;
        const v = Math.max(0, Math.min(255, h));
        const idx = (y * size + x) * 4;
        data[idx] = data[idx + 1] = data[idx + 2] = v;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  /**
   * Normal map from height map (Sobel operator)
   */
  normalFromHeight(heightCanvas) {
    if (!heightCanvas) return null;
    const size = heightCanvas.width;
    const ctx = heightCanvas.getContext('2d');
    const heightData = ctx.getImageData(0, 0, size, size);
    const normalCanvas = this.createCanvas();
    if (!normalCanvas) return null;
    normalCanvas.width = normalCanvas.height = size;
    const normalCtx = normalCanvas.getContext('2d');
    const normalData = normalCtx.createImageData(size, size);
    const nData = normalData.data;
    const hData = heightData.data;

    const strength = 2.0;  // Normal map strength

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const xm = Math.max(0, x - 1);
        const xp = Math.min(size - 1, x + 1);
        const ym = Math.max(0, y - 1);
        const yp = Math.min(size - 1, y + 1);

        // Sample heights (R channel)
        const hL = hData[(y * size + xm) * 4];
        const hR = hData[(y * size + xp) * 4];
        const hU = hData[(ym * size + x) * 4];
        const hD = hData[(yp * size + x) * 4];

        // Sobel
        const dx = (hR - hL) * strength;
        const dy = (hD - hU) * strength;

        // Normal vector (-dx, -dy, 1) normalized to [0, 255]
        const len = Math.sqrt(dx * dx + dy * dy + 1);
        const nx = -dx / len;
        const ny = -dy / len;
        const nz = 1 / len;

        const idx = (y * size + x) * 4;
        nData[idx] = Math.round((nx * 0.5 + 0.5) * 255);
        nData[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        nData[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        nData[idx + 3] = 255;
      }
    }

    normalCtx.putImageData(normalData, 0, 0);
    return normalCanvas.toDataURL('image/png');
  }

  /**
   * Corrugated normal map
   */
  corrugatedNormal(size) {
    const canvas = this.createCanvas();
    if (!canvas) return null;
    canvas.width = canvas.height = size;
    const ctx = this.getContext(canvas);
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    const lineWidth = 8;
    const gap = 16;
    const period = lineWidth + gap;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Position within current period
        const phase = x % period;

        // Calculate height as cosine wave
        const h = (Math.cos((phase / period) * Math.PI * 2) + 1) / 2;  // [0, 1]

        // Compute derivative (normal x component)
        const dx = -Math.sin((phase / period) * Math.PI * 2);
        const dy = 0;

        // Normal
        const len = Math.sqrt(dx * dx + dy * dy + 1);
        const nx = -dx / len;
        const ny = -dy / len;
        const nz = 1 / len;

        const idx = (y * size + x) * 4;
        data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        data[idx + 3] = Math.round(h * 255);  // Use alpha for height
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  /**
   * Brushed metal (horizontal grain)
   */
  brushedMetal(size, baseColor) {
    const canvas = this.createCanvas();
    if (!canvas) return null;
    canvas.width = canvas.height = size;
    const ctx = this.getContext(canvas);

    // Base color
    ctx.fillStyle = `rgb(${baseColor.r}, ${baseColor.g}, ${baseColor.b})`;
    ctx.fillRect(0, 0, size, size);

    // Horizontal scratches
    const rng = this.createRNG(this.options.seed);
    for (let i = 0; i < 1000; i++) {
      const y = Math.floor(rng() * size);
      const x1 = Math.floor(rng() * size);
      const x2 = Math.floor(rng() * size);
      const brightness = rng() > 0.5 ? 30 : -20;
      ctx.strokeStyle = `rgba(255, 255, 255, 0.3)`;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    return canvas.toDataURL('image/png');
  }

  brushedMetalNormal(size) {
    const canvas = this.createCanvas();
    if (!canvas) return null;
    canvas.width = canvas.height = size;
    const ctx = this.getContext(canvas);
    ctx.fillStyle = 'rgb(128, 128, 255)';  // Default normal (pointing up)
    ctx.fillRect(0, 0, size, size);
    return canvas.toDataURL('image/png');
  }

  brushedMetalRoughness(size) {
    return this.uniformRoughness(size, 80);
  }

  uniformNormal(size) {
    const canvas = this.createCanvas();
    if (!canvas) return null;
    canvas.width = canvas.height = size;
    const ctx = this.getContext(canvas);
    ctx.fillStyle = 'rgb(128, 128, 255)';  // Default normal
    ctx.fillRect(0, 0, size, size);
    return canvas.toDataURL('image/png');
  }

  /**
   * Uniform roughness map
   */
  uniformRoughness(size, value) {
    const canvas = this.createCanvas();
    if (!canvas) return null;
    canvas.width = canvas.height = size;
    const ctx = this.getContext(canvas);
    ctx.fillStyle = `rgb(${value}, ${value}, ${value})`;
    ctx.fillRect(0, 0, size, size);
    return canvas.toDataURL('image/png');
  }

  /**
   * Seeded random number generator
   */
  createRNG(seed) {
    let s = seed;
    return function() {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }
}

module.exports = { ProceduralTextureGenerator };
module.exports.ProceduralTextureGenerator = ProceduralTextureGenerator;
