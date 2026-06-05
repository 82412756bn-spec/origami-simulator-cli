// Three.js test renderer - WORKING approach
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Use file:// URLs for both three.js and its core
  const threePath = path.resolve('node_modules/three/build/three.module.min.js');
  const corePath = path.resolve('node_modules/three/build/three.core.min.js');
  const threeUrl = 'file://' + threePath;
  const coreUrl = 'file://' + corePath;

  // Strategy: Read three.core content, then inject it inline before three.module
  // This solves the relative import issue
  const coreContent = fs.readFileSync(corePath, 'utf8');
  const moduleContent = fs.readFileSync(threePath, 'utf8');

  // Replace the relative import with our injected core
  const patchedModule = moduleContent.replace(
    /from\s*["']\.\/three\.core\.min\.js["']/g,
    `from "data:text/javascript;base64,${Buffer.from(coreContent).toString('base64')}"`
  );

  const browserScript = patchedModule;
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(browserScript).toString('base64');

  page.on('pageerror', err => console.log('ERROR:', err.message));

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
    console.log('✅ Three.js loaded successfully');

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

      const mat = new window.THREE.MeshPhysicalMaterial({
        color: 0xc4a57b, roughness: 0.85, metalness: 0.0
      });
      const mesh = new window.THREE.Mesh(
        new window.THREE.BoxGeometry(2, 1.2, 0.6), mat
      );
      scene.add(mesh);

      const key = new window.THREE.DirectionalLight(0xffffff, 1.2);
      key.position.set(5, 8, 5);
      scene.add(key);
      scene.add(new window.THREE.DirectionalLight(0xffffff, 0.4));
      scene.add(new window.THREE.AmbientLight(0xffffff, 0.3));

      renderer.render(scene, camera);
      return canvas.toDataURL('image/png');
    });

    if (result) {
      const buffer = Buffer.from(result.split(',')[1], 'base64');
      fs.writeFileSync('/tmp/three-render.png', buffer);
      console.log('✅ Render successful!');
      console.log('   File: /tmp/three-render.png');
      console.log('   Size:', buffer.length, 'bytes');
    }
  } catch (err) {
    console.error('❌ Failed:', err.message);
  } finally {
    await browser.close();
  }
}

test();
