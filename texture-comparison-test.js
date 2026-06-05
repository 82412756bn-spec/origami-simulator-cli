const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { ProceduralTextureGenerator } = require('./src/utils/procedural-texture');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Generate textures for 4 materials
  const generator = new ProceduralTextureGenerator({ size: 256, seed: 42 });
  const textures = {
    cardboard: generator.generate('cardboard'),
    metal: generator.generate('metal'),
    kraft: generator.generate('kraft-paper'),
    corrugated: generator.generate('corrugated'),
  };

  // Load three.js
  const threePath = path.resolve('node_modules/three/build/three.module.min.js');
  const corePath = path.resolve('node_modules/three/build/three.core.min.js');
  const coreContent = fs.readFileSync(corePath, 'utf8');
  let moduleContent = fs.readFileSync(threePath, 'utf8');
  const coreDataUrl = 'data:text/javascript;base64,' + Buffer.from(coreContent).toString('base64');
  moduleContent = moduleContent.replace(/from\s*["']\.\/three\.core\.min\.js["']/g, `from "${coreDataUrl}"`);
  const threeUrl = 'data:text/javascript;base64,' + Buffer.from(moduleContent).toString('base64');

  // 4 planes side by side
  const html = `<!DOCTYPE html>
<html><body style="margin:0;background:#f0f0f0">
<canvas id="c" width="1200" height="600"></canvas>
<script type="module">
  import * as THREE from "${threeUrl}";

  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(1200, 600);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);

  const camera = new THREE.PerspectiveCamera(45, 2, 0.1, 100);
  camera.position.set(0, 0, 4);
  camera.lookAt(0, 0, 0);

  // 3-point lighting
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(2, 3, 4);
  scene.add(key);
  scene.add(new THREE.DirectionalLight(0xffffff, 0.4));
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  // Materials with procedural textures
  const materials = [
    { name: 'Cardboard', config: { color: '0xc4a57b', roughness: 0.85, metalness: 0.0 }, tex: ${JSON.stringify(textures.cardboard)} },
    { name: 'Kraft', config: { color: '0xa47148', roughness: 0.9, metalness: 0.0 }, tex: ${JSON.stringify(textures.kraft)} },
    { name: 'Corrugated', config: { color: '0x8b6f47', roughness: 0.95, metalness: 0.0 }, tex: ${JSON.stringify(textures.corrugated)} },
    { name: 'Metal', config: { color: '0xc0c0c0', roughness: 0.2, metalness: 0.9 }, tex: ${JSON.stringify(textures.metal)} },
  ];

  // Create 4 planes side by side
  materials.forEach((m, i) => {
    // Load textures
    const diffuseMap = new THREE.TextureLoader().load(m.tex.diffuse);
    const normalMap = new THREE.TextureLoader().load(m.tex.normal);
    const roughnessMap = new THREE.TextureLoader().load(m.tex.roughness);
    diffuseMap.wrapS = diffuseMap.wrapT = THREE.RepeatWrapping;
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
    diffuseMap.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshPhysicalMaterial({
      ...m.config,
      map: diffuseMap,
      normalMap: normalMap,
      roughnessMap: roughnessMap,
      normalScale: new THREE.Vector2(1, 1)
    });

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    plane.position.x = (i - 1.5) * 2.2;
    scene.add(plane);
  });

  // Wait for textures to load
  setTimeout(() => {
    renderer.render(scene, camera);
    window.output = canvas.toDataURL('image/png');
    window.status = 'done';
  }, 2000);
</script>
</body></html>`;

  await page.setContent(html);
  await page.waitForFunction(() => window.status === 'done', { timeout: 10000 });

  const data = await page.evaluate(() => window.output);
  const buffer = Buffer.from(data.split(',')[1], 'base64');
  fs.writeFileSync('/tmp/texture-comparison.png', buffer);
  console.log('Saved comparison:', buffer.length, 'bytes');

  await browser.close();
})();
