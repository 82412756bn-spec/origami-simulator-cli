/**
 * Custom WebGL Viewer for traditionalCrane - Edge-focused
 */

const path = require('path');
const fs = require('fs');
const { runWithFold } = require('./fold-helpers');

function registerCraneWebGLCommand(program) {
  program
    .command('crane <file>')
    .description('Special 3D preview for traditionalCrane with edge coloring')
    .option('-o, --output <file>', 'Output HTML file')
    .action((file, options) => {
      runWithFold(file, options, (analyzer, fullPath, foldData) => {
        const html = generateCraneWebGL(foldData);
        const outPath = options.output || fullPath.replace('.fold', '-crane.html');
        fs.writeFileSync(outPath, html, 'utf8');
        console.log(`🎨 Crane 3D preview written to: ${outPath}`);
        console.log(`   Open in browser to view`);
      });
    });
}

function generateCraneWebGL(fold) {
  const vertices = fold.vertices_coords || [];
  const edges = fold.edges_vertices || [];
  const assignments = fold.edges_assignment || [];

  // Build edge data with colors based on assignment
  const edgeData = [];
  for (let i = 0; i < edges.length; i++) {
    const [a, b] = edges[i];
    const assign = assignments[i] || 'B';
    let color = '#22c55e'; // green (boundary)
    if (assign === 'M') color = '#ef4444'; // red (mountain)
    if (assign === 'V') color = '#3b82f6'; // blue (valley)
    if (assign === 'F') color = '#94a3b8'; // gray (flat)

    edgeData.push({ v1: a, v2: b, color, assign });
  }

  // Build vertex positions
  const vertexData = vertices.map((v, i) => ({
    x: v[0], y: v[1], z: v[2] || 0
  }));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🦢 Traditional Crane - Crease Pattern</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f0f23;
      color: #eee;
      overflow: hidden;
    }
    #container { width: 100vw; height: 100vh; position: relative; }
    canvas { display: block; }

    #info {
      position: absolute;
      top: 20px;
      left: 20px;
      background: rgba(0,0,0,0.8);
      padding: 20px;
      border-radius: 12px;
      font-size: 14px;
    }
    #info h2 { margin-bottom: 12px; color: #fbbf24; }
    .stat { display: flex; justify-content: space-between; margin: 6px 0; }
    .legend { margin-top: 16px; padding-top: 12px; border-top: 1px solid #333; }
    .legend-item { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
    .dot { width: 14px; height: 14px; border-radius: 3px; }

    #controls {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 12px;
    }
    button {
      background: #3b3b5c;
      border: none;
      color: white;
      padding: 10px 20px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
    }
    button:hover { background: #5b5b8c; }
  </style>
</head>
<body>
  <div id="container">
    <div id="info">
      <h2>🦢 Traditional Crane</h2>
      <div class="stat"><span>Vertices:</span><span>${vertices.length}</span></div>
      <div class="stat"><span>Edges:</span><span>${edges.length}</span></div>

      <div class="legend">
        <div class="legend-item"><div class="dot" style="background:#ef4444"></div>Mountain (M): ${assignments.filter(a=>a==='M').length}</div>
        <div class="legend-item"><div class="dot" style="background:#3b82f6"></div>Valley (V): ${assignments.filter(a=>a==='V').length}</div>
        <div class="legend-item"><div class="dot" style="background:#94a3b8"></div>Flat (F): ${assignments.filter(a=>a==='F').length}</div>
        <div class="legend-item"><div class="dot" style="background:#22c55e"></div>Boundary (B): ${assignments.filter(a=>a==='B').length}</div>
      </div>
    </div>

    <div id="controls">
      <button id="btn-front">Front View</button>
      <button id="btn-top">Top View</button>
      <button id="btn-3d">3D View</button>
      <button id="btn-reset">Reset</button>
    </div>
  </div>

  <script type="importmap">
  {
    "imports": {
      "three": "https://unpkg.com/three@0.184.0/build/three.module.js",
      "three/addons/": "https://unpkg.com/three@0.184.0/examples/jsm/"
    }
  }
  </script>
  <script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const vertices = ${JSON.stringify(vertexData)};
const edges = ${JSON.stringify(edgeData)};

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f0f23);

// Camera
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 10000);
camera.position.set(500, 500, 800);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('container').appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Calculate center
let cx = 0, cy = 0, cz = 0;
vertices.forEach(v => { cx += v.x; cy += v.y; cz += v.z; });
cx /= vertices.length; cy /= vertices.length; cz /= vertices.length;

// Create edges as 3D lines
const edgeGroup = new THREE.Group();
edges.forEach(e => {
  const v1 = vertices[e.v1];
  const v2 = vertices[e.v2];

  const points = [
    new THREE.Vector3(v1.x - cx, v1.y - cy, v1.z - cz),
    new THREE.Vector3(v2.x - cx, v2.y - cy, v2.z - cz)
  ];

  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: e.color,
    linewidth: 2
  });

  const line = new THREE.Line(geometry, material);
  edgeGroup.add(line);
});

scene.add(edgeGroup);

// Add vertices as small spheres
vertices.forEach((v, i) => {
  const geometry = new THREE.SphereGeometry(3, 8, 8);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const sphere = new THREE.Mesh(geometry, material);
  sphere.position.set(v.x - cx, v.y - cy, v.z - cz);
  scene.add(sphere);
});

// Add grid helper
const gridHelper = new THREE.GridHelper(2000, 20, 0x333333, 0x222222);
gridHelper.position.z = -10;
scene.add(gridHelper);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// Animation
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// View buttons
document.getElementById('btn-front').onclick = () => {
  camera.position.set(0, 0, 1500);
  camera.lookAt(0, 0, 0);
};
document.getElementById('btn-top').onclick = () => {
  camera.position.set(0, 1500, 0);
  camera.lookAt(0, 0, 0);
};
document.getElementById('btn-3d').onclick = () => {
  camera.position.set(800, 600, 800);
  camera.lookAt(0, 0, 0);
};
document.getElementById('btn-reset').onclick = () => {
  camera.position.set(500, 500, 800);
  camera.lookAt(0, 0, 0);
};

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
  </script>
</body>
</html>`;
}

module.exports = { registerCraneWebGLCommand };
