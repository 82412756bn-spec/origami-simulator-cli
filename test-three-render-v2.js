// Three.js test renderer v2
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Serve three.module.min.js via HTTP
const threePath = path.resolve('node_modules/three/build/three.module.min.js');
const threeContent = fs.readFileSync(threePath, 'utf8');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/javascript' });
  res.end(threeContent);
});

server.listen(0, async () => {
  const port = server.address().port;
  const threeUrl = `http://localhost:${port}/three.module.min.js`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <style>body { margin: 0; background: #f0f0f0; }</style>
</head>
<body>
  <canvas id="c" width="800" height="600"></canvas>
  <script type="module">
    import * as THREE from "${threeUrl}";
    window.THREE = THREE;

    const canvas = document.getElementById('c');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(800, 600);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f5);

    const camera = new THREE.PerspectiveCamera(45, 4/3, 0.1, 100);
    camera.position.set(3.5, 2, 3.5);
    camera.lookAt(0, 0, 0);

    // Cardboard material
    const material = new THREE.MeshPhysicalMaterial({
      color: 0xc4a57b,
      roughness: 0.85,
      metalness: 0.0,
    });

    // Create cube
    const boxGeom = new THREE.BoxGeometry(2, 1.2, 0.6);
    const box = new THREE.Mesh(boxGeom, material);
    box.castShadow = true;
    box.receiveShadow = true;
    scene.add(box);

    // Lights
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(5, 8, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-5, 3, 5);
    scene.add(fillLight);

    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambient);

    // Ground plane for shadows
    const planeGeom = new THREE.PlaneGeometry(20, 20);
    const planeMat = new THREE.ShadowMaterial({ opacity: 0.3 });
    const plane = new THREE.Mesh(planeGeom, planeMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.7;
    plane.receiveShadow = true;
    scene.add(plane);

    renderer.render(scene, camera);

    window.renderedBase64 = canvas.toDataURL('image/png');
    window.status = 'done';
  </script>
</body>
</html>`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('PAGE ERROR:', msg.text());
  });
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.setContent(html);

  try {
    await page.waitForFunction(() => window.status === 'done', { timeout: 30000 });
    const base64 = await page.evaluate(() => window.renderedBase64);

    const buffer = Buffer.from(base64.split(',')[1], 'base64');
    fs.writeFileSync('/tmp/three-test-render.png', buffer);

    console.log('✅ Three.js render successful!');
    console.log('   Output:', '/tmp/three-test-render.png');
    console.log('   Size:', buffer.length, 'bytes');
  } catch (err) {
    console.error('❌ Render failed:', err.message);
  } finally {
    await browser.close();
    server.close();
  }
});
