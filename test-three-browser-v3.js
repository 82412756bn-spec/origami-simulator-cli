// Three.js test renderer v3 - inline ES module
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function test() {
  const threePath = path.resolve('node_modules/three/build/three.module.min.js');
  const threeContent = fs.readFileSync(threePath, 'utf8');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('LOG:', msg.type(), msg.text().substring(0, 200)));
  page.on('pageerror', err => console.log('ERROR:', err.message));

  // Use data URL for ES module
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(threeContent).toString('base64');

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;background:#f0f0f0">
  <canvas id="c" width="800" height="600"></canvas>
  <script type="module">
    import * as THREE from "${dataUrl}";
    window.THREE = THREE;
    window.status = 'ready';
  </script>
</body>
</html>`;

  await page.setContent(html);

  try {
    await page.waitForFunction(() => window.status === 'ready', { timeout: 30000 });
    console.log('✅ Three.js loaded via ES module');

    // Render
    const result = await page.evaluate(() => {
      const canvas = document.getElementById('c');
      const renderer = new window.THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setSize(800, 600);
      renderer.outputColorSpace = window.THREE.SRGBColorSpace;
      renderer.toneMapping = window.THREE.ACESFilmicToneMapping;

      const scene = new window.THREE.Scene();
      scene.background = new window.THREE.Color(0xf5f5f5);

      const camera = new window.THREE.PerspectiveCamera(45, 4/3, 0.1, 100);
      camera.position.set(3, 2, 3);

      // Cardboard material
      const mat = new window.THREE.MeshPhysicalMaterial({
        color: 0xc4a57b,
        roughness: 0.85,
        metalness: 0.0,
      });
      const mesh = new window.THREE.Mesh(
        new window.THREE.BoxGeometry(2, 1.2, 0.6),
        mat
      );
      mesh.castShadow = true;
      scene.add(mesh);

      // 3-point lighting
      const key = new window.THREE.DirectionalLight(0xffffff, 1.2);
      key.position.set(5, 8, 5);
      scene.add(key);

      const fill = new window.THREE.DirectionalLight(0xffffff, 0.4);
      fill.position.set(-5, 3, 5);
      scene.add(fill);

      const ambient = new window.THREE.AmbientLight(0xffffff, 0.3);
      scene.add(ambient);

      renderer.render(scene, camera);
      return canvas.toDataURL('image/png');
    });

    if (result) {
      const buffer = Buffer.from(result.split(',')[1], 'base64');
      fs.writeFileSync('/tmp/three-render.png', buffer);
      console.log('✅ Render successful!');
      console.log('   Output: /tmp/three-render.png');
      console.log('   Size:', buffer.length, 'bytes');
    }
  } catch (err) {
    console.error('❌ Failed:', err.message);
  } finally {
    await browser.close();
  }
}

test();
