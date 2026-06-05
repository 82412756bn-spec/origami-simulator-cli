const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { ProceduralTextureGenerator } = require('/home/rayna/文档/origami-simulator-cli/src/utils/procedural-texture');

(async () => {
  // Generate corrugated texture
  const gen = new ProceduralTextureGenerator({ size: 256, seed: 42 });
  const tex = gen.generate('corrugated');
  fs.writeFileSync('/tmp/corrugated-diffuse.png', Buffer.from(tex.diffuse.split(',')[1], 'base64'));

  const threePath = path.resolve('node_modules/three/build/three.module.min.js');
  const corePath = path.resolve('node_modules/three/build/three.core.min.js');
  const coreContent = fs.readFileSync(corePath, 'utf8');
  let moduleContent = fs.readFileSync(threePath, 'utf8');
  const coreDataUrl = 'data:text/javascript;base64,' + Buffer.from(coreContent).toString('base64');
  moduleContent = moduleContent.replace(/from\s*["']\.\/three\.core\.min\.js["']/g, `from "${coreDataUrl}"`);
  const threeUrl = 'data:text/javascript;base64,' + Buffer.from(moduleContent).toString('base64');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('LOG:', msg.text().substring(0, 200)));
  page.on('pageerror', err => console.log('ERROR:', err.message));

  const html = `<!DOCTYPE html>
<html><body style="margin:0">
<canvas id="c" width="800" height="600"></canvas>
<script type="module">
  import * as THREE from "${threeUrl}";

  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(800, 600);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);

  const camera = new THREE.PerspectiveCamera(45, 4/3, 0.1, 100);
  camera.position.set(0, 0, 3);
  camera.lookAt(0, 0, 0);

  // Load corrugated texture
  const loader = new THREE.TextureLoader();
  const diffuseMap = loader.load('${tex.diffuse}');
  const normalMap = loader.load('${tex.normal}');
  const roughnessMap = loader.load('${tex.roughness}');
  diffuseMap.colorSpace = THREE.SRGBColorSpace;
  diffuseMap.wrapS = diffuseMap.wrapT = THREE.RepeatWrapping;

  // Use my Plane FOLD
  const geometry = (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 2,0,0, 2,1,0, 0,1,0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0,0, 2,0, 2,1, 0,1], 2));
    g.setIndex([0,1,2, 0,2,3]);
    g.computeVertexNormals();
    return g;
  })();

  const material = new THREE.MeshPhysicalMaterial({
    color: 0x8b6f47,
    roughness: 0.95,
    metalness: 0.0,
    map: diffuseMap,
    normalMap: normalMap,
    roughnessMap: roughnessMap,
    normalScale: new THREE.Vector2(1, 1),
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // Lighting
  scene.add(new THREE.DirectionalLight(0xffffff, 1.2).translateZ(3).translateY(2));
  scene.add(new THREE.DirectionalLight(0xffffff, 0.4).translateX(-2).translateY(1).translateZ(2));
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  // Wait for textures to load
  setTimeout(() => {
    renderer.render(scene, camera);
    window.output = canvas.toDataURL('image/png');
    window.status = 'done';
  }, 1500);
</script>
</body></html>`;

  await page.setContent(html);
  await page.waitForFunction(() => window.status === 'done', { timeout: 10000 });
  const data = await page.evaluate(() => window.output);
  const buffer = Buffer.from(data.split(',')[1], 'base64');
  fs.writeFileSync('/tmp/plane-direct.png', buffer);
  console.log('Direct plane render:', buffer.length, 'bytes');

  await browser.close();
})();
