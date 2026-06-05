const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

const threePath = path.resolve('node_modules/three/build/three.module.min.js');

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'application/javascript',
    'Access-Control-Allow-Origin': '*'
  });
  fs.createReadStream(threePath).pipe(res);
});

server.listen(0, async () => {
  const port = server.address().port;
  const threeUrl = `http://localhost:${port}/three.module.min.js`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('LOG:', msg.text()));
  page.on('pageerror', err => console.log('ERROR:', err.message));

  await page.setContent(`<canvas id="c" width="800" height="600"></canvas>`);
  await page.addScriptTag({ url: threeUrl, type: 'module' });

  // Wait for THREE to be available globally
  await page.waitForFunction(() => typeof window.THREE !== 'undefined', { timeout: 10000 });

  // Render a test
  const result = await page.evaluate(() => {
    const canvas = document.getElementById('c');
    const renderer = new window.THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(800, 600);
    
    const scene = new window.THREE.Scene();
    scene.background = new window.THREE.Color(0xf5f5f5);
    
    const camera = new window.THREE.PerspectiveCamera(45, 4/3, 0.1, 100);
    camera.position.set(3, 2, 3);
    
    const mat = new window.THREE.MeshPhysicalMaterial({ color: 0xc4a57b, roughness: 0.85 });
    const mesh = new window.THREE.Mesh(new window.THREE.BoxGeometry(2, 1.2, 0.6), mat);
    scene.add(mesh);
    
    const light = new window.THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(5, 8, 5);
    scene.add(light);
    scene.add(new window.THREE.AmbientLight(0xffffff, 0.4));
    
    renderer.render(scene, camera);
    const data = canvas.toDataURL('image/png');
    return data;
  });

  if (result) {
    const buffer = Buffer.from(result.split(',')[1], 'base64');
    fs.writeFileSync('/tmp/three-render.png', buffer);
    console.log('✅ Three.js render via Playwright: SUCCESS');
    console.log('   Output size:', buffer.length, 'bytes');
    console.log('   Saved to: /tmp/three-render.png');
  } else {
    console.log('❌ Render returned null');
  }

  await browser.close();
  server.close();
});
