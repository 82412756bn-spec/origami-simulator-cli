/**
 * Commercial Renderer v2
 * Playwright + Three.js based PBR rendering for packaging mockups
 *
 * Uses headless Chromium for WebGL rendering, supports:
 * - 8 PBR material presets (paper, cardboard, metal, plastic)
 * - 6 HDRI lighting presets
 * - 7 camera angles
 * - 4 output formats (PNG, JPG, WebP)
 * - HD resolutions up to 4096x4096
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { ProceduralTextureGenerator } = require('./procedural-texture');

// Material presets with texture support
const MATERIAL_PRESETS = {
  'cardboard': { name: '瓦楞纸板', color: '0xc4a57b', roughness: 0.85, metalness: 0.0, useTexture: true },
  'kraft-paper': { name: '牛皮纸', color: '0xa47148', roughness: 0.9, metalness: 0.0, useTexture: true },
  'coated-paper': { name: '铜版纸', color: '0xffffff', roughness: 0.4, metalness: 0.0, useTexture: true },
  'glossy-cardboard': { name: '光面纸板', color: '0xf5e6d3', roughness: 0.3, metalness: 0.0, useTexture: true },
  'matte-cardboard': { name: '哑面纸板', color: '0xe8d5b7', roughness: 0.95, metalness: 0.0, useTexture: true },
  'corrugated': { name: '瓦楞纸', color: '0x8b6f47', roughness: 0.95, metalness: 0.0, useTexture: true },
  'metal': { name: '金属', color: '0xc0c0c0', roughness: 0.2, metalness: 0.9, useTexture: true },
  'plastic': { name: '塑料', color: '0xffffff', roughness: 0.3, metalness: 0.0, useTexture: true },
};

// HDRI presets
const HDRI_PRESETS = {
  'studio': { name: 'Studio 摄影棚', bg: 0xf5f5f5, ambient: 0.3, ambientIntensity: 0.3, key: 1.2, keyLightIntensity: 1.2, fill: 0.4, fillLightIntensity: 0.4, keyColor: 0xffffff },
  'sunset': { name: 'Sunset 黄昏', bg: 0xfdbb88, ambient: 0.4, ambientIntensity: 0.4, key: 1.5, keyLightIntensity: 1.5, fill: 0.3, fillLightIntensity: 0.3, keyColor: 0xffaa66 },
  'morning': { name: 'Morning 晨光', bg: 0xffeacc, ambient: 0.5, ambientIntensity: 0.5, key: 1.0, keyLightIntensity: 1.0, fill: 0.5, fillLightIntensity: 0.5, keyColor: 0xfff0dd },
  'cool': { name: 'Cool 冷光', bg: 0xe0e8f0, ambient: 0.3, ambientIntensity: 0.3, key: 1.0, keyLightIntensity: 1.0, fill: 0.4, fillLightIntensity: 0.4, keyColor: 0xeef4ff },
  'dark': { name: 'Dark 暗调', bg: 0x1a1a1a, ambient: 0.1, ambientIntensity: 0.1, key: 1.8, keyLightIntensity: 1.8, fill: 0.2, fillLightIntensity: 0.2, keyColor: 0xffffff },
  'natural': { name: 'Natural 自然光', bg: 0xffffff, ambient: 0.6, ambientIntensity: 0.6, key: 1.1, keyLightIntensity: 1.1, fill: 0.5, fillLightIntensity: 0.5, keyColor: 0xfff5e6 },
};

// Camera angles
const CAMERA_ANGLES = {
  'front': { position: [0, 0, 5], name: 'Front' },
  'top': { position: [0, 5, 0.1], name: 'Top' },
  'side': { position: [5, 0, 0], name: 'Side' },
  '30': { position: [4, 1.7, 2.6], name: '30° Product' },
  '45': { position: [3.5, 2, 3.5], name: '45° Hero' },
  '60': { position: [2.5, 2.6, 2.5], name: '60° Hero' },
  'perspective': { position: [3, 2, 4], name: 'Perspective' },
};

class CommercialRenderer {
  constructor(options = {}) {
    this.options = {
      width: options.width || 1920,
      height: options.height || 1080,
      dpi: options.dpi || 150,
      material: options.material || 'cardboard',
      hdri: options.hdri || 'studio',
      angle: options.angle || '45',
      format: options.format || 'png',
      quality: options.quality || 0.95,
      outputPath: options.outputPath || null,
      shadowMapSize: options.shadowMapSize || 2048,
      background: options.background || null,
      transparent: options.transparent || false,
      debug: options.debug || false,
    };
  }

  /**
   * Build HTML template for the renderer
   */
  buildHtml(foldData) {
    const material = MATERIAL_PRESETS[this.options.material] || MATERIAL_PRESETS['cardboard'];
    const hdri = HDRI_PRESETS[this.options.hdri] || HDRI_PRESETS['studio'];
    const camera = CAMERA_ANGLES[this.options.angle] || CAMERA_ANGLES['45'];

    // Build geometry from FOLD
    const geomJs = this.foldToGeometry(foldData);
    const bgColor = this.options.background !== null
      ? this.options.background : hdri.bg;

    // Generate procedural textures if enabled
    let textureDataJs = 'null';
    if (material.useTexture) {
      const textures = this.generateMaterialTextures(this.options.material);
      if (textures) {
        textureDataJs = JSON.stringify(textures);
      }
    }

    return `<!DOCTYPE html>
<html>
<head>
<style>body { margin: 0; background: #${bgColor.toString(16).padStart(6, '0')}; }</style>
</head>
<body>
  <canvas id="c" width="${this.options.width}" height="${this.options.height}"></canvas>
  <script type="module">
    // Inline three.module.min.js
    import * as THREE from "THREE_PLACEHOLDER";

    const canvas = document.getElementById('c');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: ${this.options.transparent} });
    renderer.setSize(${this.options.width}, ${this.options.height});
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(${bgColor});

    const camera = new THREE.PerspectiveCamera(35, ${this.options.width}/${this.options.height}, 0.1, 1000);
    camera.position.set(${camera.position[0]}, ${camera.position[1]}, ${camera.position[2]});
    camera.lookAt(0, 0, 0);

    // Material - Use canvas to create textures directly in browser
    const textureData = ${textureDataJs};
    let diffuseMap = null, normalMap = null, roughnessMap = null;
    if (textureData) {
      // CRITICAL: must wait for Image.onload before passing to Texture
      const loadImage = (dataUrl) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = dataUrl;
      });

      const [diffImg, normImg, roughImg] = await Promise.all([
        loadImage(textureData.diffuse),
        loadImage(textureData.normal),
        loadImage(textureData.roughness),
      ]);

      diffuseMap = new THREE.Texture(diffImg);
      diffuseMap.colorSpace = THREE.SRGBColorSpace;
      diffuseMap.wrapS = diffuseMap.wrapT = THREE.RepeatWrapping;
      diffuseMap.needsUpdate = true;

      normalMap = new THREE.Texture(normImg);
      normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
      normalMap.needsUpdate = true;

      roughnessMap = new THREE.Texture(roughImg);
      roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
      roughnessMap.needsUpdate = true;
    }

    const material = new THREE.MeshPhysicalMaterial({
      color: ${material.color},
      roughness: ${material.roughness},
      metalness: ${material.metalness},
      map: diffuseMap,
      normalMap: normalMap,
      roughnessMap: roughnessMap,
      normalScale: new THREE.Vector2(1.0, 1.0)
    });

    // Geometry from FOLD
    const geometry = ${geomJs};
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // 3-point lighting
    const key = new THREE.DirectionalLight(${hdri.keyColor}, ${hdri.key});
    key.position.set(5, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.width = ${this.options.shadowMapSize};
    key.shadow.mapSize.height = ${this.options.shadowMapSize};
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, ${hdri.fill});
    fill.position.set(-5, 3, 5);
    scene.add(fill);

    const ambient = new THREE.AmbientLight(0xffffff, ${hdri.ambient});
    scene.add(ambient);

    // Ground plane for shadows
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 50),
      new THREE.ShadowMaterial({ opacity: 0.25 })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.7;
    plane.receiveShadow = true;
    scene.add(plane);

    // Center & scale - ensure model is in camera view
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    mesh.position.sub(center);

    // Scale to fit comfortably in view
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const targetSize = 1.5;
      const scale = targetSize / maxDim;
      mesh.scale.setScalar(scale);
    }
    mesh.position.y = -0.3;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    window.status = 'done';
    window.outputData = canvas.toDataURL('image/${this.options.format}', ${this.options.quality});
  </script>
</body>
</html>`;
  }

  /**
   * Generate procedural textures for material
   */
  generateMaterialTextures(materialId) {
    try {
      const generator = new ProceduralTextureGenerator({
        size: 256,
        seed: 42,
      });
      const textures = generator.generate(materialId);
      return textures;
    } catch (err) {
      // If texture generation fails (e.g., no canvas), return null
      return null;
    }
  }

  /**
   * Convert FOLD data to Three.js geometry with proper UVs
   * If FOLD is a box shape, use BoxGeometry (correct UVs)
   * Otherwise use planar UV mapping
   */
  foldToGeometry(foldData) {
    if (!foldData || !foldData.vertices_coords || !foldData.faces_vertices) {
      return 'new THREE.BoxGeometry(2, 1.2, 0.6)';
    }

    const { vertices_coords, faces_vertices } = foldData;

    // If 6 faces forming a box (8 unique vertices), use BoxGeometry
    const isBox = this.isBoxGeometry(foldData);
    if (isBox) {
      // Get dimensions from bounding box
      const xs = vertices_coords.map(v => v[0]);
      const ys = vertices_coords.map(v => v[1]);
      const zs = vertices_coords.map(v => v[2]);
      const w = Math.max(...xs) - Math.min(...xs);
      const h = Math.max(...ys) - Math.min(...ys);
      const d = Math.max(...zs) - Math.min(...zs);
      return `new THREE.BoxGeometry(${w}, ${h}, ${d})`;
    }

    // General mesh with planar UVs
    const positions = [];
    const uvs = [];
    const indices = [];

    for (const faceVerts of faces_vertices) {
      const baseIdx = positions.length / 3;

      const v0 = vertices_coords[faceVerts[0]] || [0, 0, 0];
      const v1 = vertices_coords[faceVerts[1]] || [0, 0, 0];
      const v2 = vertices_coords[faceVerts[2]] || [0, 0, 0];

      const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
      const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];

      const nx = e1[1] * e2[2] - e1[2] * e2[1];
      const ny = e1[2] * e2[0] - e1[0] * e2[2];
      const nz = e1[0] * e2[1] - e1[1] * e2[0];
      const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      const normal = [nx / nLen, ny / nLen, nz / nLen];

      // UV mapping: use face-bounding-box projection
      // For each face, compute UV by projecting position to dominant plane
      let uAxis, vAxis;
      if (Math.abs(normal[1]) > 0.5) {
        // Top/bottom: project to XZ
        uAxis = 0; vAxis = 2;
      } else if (Math.abs(normal[0]) > 0.5) {
        // Left/right: project to ZY
        uAxis = 2; vAxis = 1;
      } else {
        // Front/back: project to XY
        uAxis = 0; vAxis = 1;
      }

      // Compute face UV bounds for proper 0-1 mapping
      const faceUVs = faceVerts.map(idx => vertices_coords[idx] || [0, 0, 0]);
      const us = faceUVs.map(v => v[uAxis]);
      const vs = faceUVs.map(v => v[vAxis]);
      const uMin = Math.min(...us), uMax = Math.max(...us);
      const vMin = Math.min(...vs), vMax = Math.max(...vs);
      const uRange = uMax - uMin || 1;
      const vRange = vMax - vMin || 1;

      for (const vIdx of faceVerts) {
        const v = vertices_coords[vIdx];
        if (v) {
          positions.push(v[0] || 0, v[1] || 0, v[2] || 0);
          // Normalize UV to 0-1 range
          const u = ((v[uAxis] - uMin) / uRange);
          const vv = ((v[vAxis] - vMin) / vRange);
          uvs.push(u, vv);
        }
      }

      if (faceVerts.length >= 3) {
        for (let i = 1; i < faceVerts.length - 1; i++) {
          indices.push(baseIdx, baseIdx + i, baseIdx + i + 1);
        }
      }
    }

    return `(() => {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute([${positions.join(',')}], 3));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute([${uvs.join(',')}], 2));
      geom.setIndex([${indices.join(',')}]);
      geom.computeVertexNormals();
      return geom;
    })()`;
  }

  /**
   * Check if FOLD is a simple box (6 faces, 8 unique vertices)
   */
  isBoxGeometry(foldData) {
    const { vertices_coords, faces_vertices } = foldData;
    if (!vertices_coords || !faces_vertices) return false;
    if (faces_vertices.length !== 6) return false;
    if (vertices_coords.length !== 8) return false;

    // Each face should be a quad (4 vertices)
    return faces_vertices.every(f => f.length === 4);
  }

  /**
   * Simple fan triangulation (for backward compatibility)
   */
  triangulate(faceVertices) {
    if (faceVertices.length < 3) return [];
    const triangles = [];
    for (let i = 1; i < faceVertices.length - 1; i++) {
      triangles.push(faceVertices[0], faceVertices[i], faceVertices[i + 1]);
    }
    return triangles;
  }

  /**
   * Get HDRI config (with ambientIntensity alias for compatibility)
   */
  getHDRIConfig() {
    const config = HDRI_PRESETS[this.options.hdri] || HDRI_PRESETS['studio'];
    return {
      ...config,
      ambientIntensity: config.ambient,  // alias
      keyLightIntensity: config.key,     // alias
      fillLightIntensity: config.fill,   // alias
    };
  }

  /**
   * Load Three.js with proper handling of relative imports
   */
  loadThreeJs() {
    const threePath = path.resolve('node_modules/three/build/three.module.min.js');
    const corePath = path.resolve('node_modules/three/build/three.core.min.js');

    const coreContent = fs.readFileSync(corePath, 'utf8');
    let moduleContent = fs.readFileSync(threePath, 'utf8');

    // Replace relative import with data URL
    const coreDataUrl = 'data:text/javascript;base64,' + Buffer.from(coreContent).toString('base64');
    moduleContent = moduleContent.replace(
      /from\s*["']\.\/three\.core\.min\.js["']/g,
      `from "${coreDataUrl}"`
    );

    return 'data:text/javascript;base64,' + Buffer.from(moduleContent).toString('base64');
  }

  /**
   * Render the FOLD model using Playwright + Three.js
   */
  async render(foldData) {
    let browser = null;
    try {
      const threeDataUrl = this.loadThreeJs();
      const html = this.buildHtml(foldData).replace('THREE_PLACEHOLDER', threeDataUrl);

      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      page.on('pageerror', err => {
        if (this.options.debug) console.log('Page error:', err.message);
      });

      await page.setContent(html);
      await page.waitForFunction(() => window.status === 'done', { timeout: 30000 });

      const base64 = await page.evaluate(() => window.outputData);

      if (!base64) {
        throw new Error('No output data received');
      }

      const buffer = Buffer.from(base64.split(',')[1], 'base64');

      if (this.options.outputPath) {
        fs.writeFileSync(this.options.outputPath, buffer);
        if (this.options.debug) {
          console.log(`✅ Rendered: ${this.options.outputPath}`);
          console.log(`   Size: ${buffer.length} bytes`);
        }
      }

      return {
        success: true,
        buffer,
        size: buffer.length,
        outputPath: this.options.outputPath,
      };
    } catch (err) {
      if (this.options.debug) {
        console.error('Render error:', err.message);
      }
      return { success: false, error: err.message };
    } finally {
      if (browser) await browser.close();
    }
  }

  /**
   * List all available materials
   */
  static listMaterials() {
    return Object.entries(MATERIAL_PRESETS).map(([id, m]) => ({
      id, name: m.name, roughness: m.roughness, metalness: m.metalness,
    }));
  }

  /**
   * List all HDRI presets
   */
  static listHDRI() {
    return Object.entries(HDRI_PRESETS).map(([id, h]) => ({ id, name: h.name }));
  }

  /**
   * List all camera angles
   */
  static listAngles() {
    return Object.entries(CAMERA_ANGLES).map(([id, c]) => ({ id, name: c.name }));
  }
}

module.exports = {
  CommercialRenderer,
  MATERIAL_PRESETS,
  HDRI_PRESETS,
  CAMERA_ANGLES,
};
