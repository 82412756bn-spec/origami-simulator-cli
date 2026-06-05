const { CommercialRenderer } = require('/home/rayna/文档/origami-simulator-cli/src/utils/commercial-renderer');
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  // 创建一个简单 box FOLD (用 BoxGeometry 替代, 因为 FOLD 转换复杂)
  const simpleHtml = `<!DOCTYPE html>
<html><body style="margin:0;background:#f5f5f5">
<canvas id="c" width="800" height="600"></canvas>
<script type="module">
import * as THREE from "THREE_PLACEHOLDER";

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(800, 600);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5f5f5);

const camera = new THREE.PerspectiveCamera(35, 4/3, 0.1, 1000);
camera.position.set(3.5, 2, 3.5);
camera.lookAt(0, 0, 0);

const box = new THREE.Mesh(
  new THREE.BoxGeometry(2, 2, 2),
  new THREE.MeshPhysicalMaterial({ color: 0x8b6f47, roughness: 0.95 })
);
box.castShadow = true;
box.receiveShadow = true;
scene.add(box);

const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(5, 8, 5);
key.castShadow = true;
key.shadow.mapSize.width = 2048;
key.shadow.mapSize.height = 2048;
scene.add(key);
scene.add(new THREE.DirectionalLight(0xffffff, 0.4));
scene.add(new THREE.AmbientLight(0xffffff, 0.4));

const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(50, 50),
  new THREE.ShadowMaterial({ opacity: 0.25 })
);
plane.rotation.x = -Math.PI / 2;
plane.position.y = -1.5;
plane.receiveShadow = true;
scene.add(plane);

renderer.render(scene, camera);
window.output = canvas.toDataURL('image/png');
window.status = 'done';
</script>
</body></html>`;

  const threeUrl = require('/home/rayna/文档/origami-simulator-cli/src/utils/commercial-renderer').CommercialRenderer.prototype.loadThreeJs;
  const renderer = new (require('/home/rayna/文档/origami-simulator-cli/src/utils/commercial-renderer').CommercialRenderer)({ width: 800, height: 600 });
  const threeDataUrl = renderer.loadThreeJs();
  const finalHtml = simpleHtml.replace('THREE_PLACEHOLDER', threeDataUrl);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(finalHtml);
  await page.waitForFunction(() => window.status === 'done', { timeout: 10000 });
  const data = await page.evaluate(() => window.output);
  const buffer = Buffer.from(data.split(',')[1], 'base64');
  fs.writeFileSync('/tmp/simple-cube.png', buffer);
  console.log('Simple cube:', buffer.length, 'bytes');

  await browser.close();
})();
