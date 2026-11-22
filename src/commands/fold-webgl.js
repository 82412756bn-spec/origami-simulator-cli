/**
 * WebGL 3D Preview Command (v2.43)
 *
 * Creates an interactive 3D preview using Three.js in browser.
 * Supports:
 *   - Orbit controls (rotate, zoom, pan)
 *   - Multiple frames for animation
 *   - Material colors from v2.0 format
 *   - Mountain/Valley color coding
 *   - Lighting and shadows
 *
 * Usage:
 *   origami webgl <file>                    → open in browser
 *   origami webgl <file> -o preview.html     → save to file
 *   origami webgl <file> --frames            → include animation frames
 *   origami webgl <file> --auto-fold         → animate folding
 */

const path = require('path');
const fs = require('fs');
const { runWithFold } = require('./fold-helpers');

function registerWebGLCommand(program) {
  program
    .command('webgl <file>')
    .description('Interactive 3D preview with Three.js (v2.43)')
    .option('-o, --output <file>', 'Output HTML file (default: preview.html)')
    .option('--frames', 'Include all simulation frames for animation')
    .option('--auto-fold', 'Auto-play fold animation on load')
    .option('--width <px>', 'Canvas width (default: 800)', (v) => parseInt(v), 800)
    .option('--height <px>', 'Canvas height (default: 600)', (v) => parseInt(v), 600)
    .option('--bg <color>', 'Background color (default: #1a1a2e)', '#1a1a2e')
    .option('--wireframe', 'Show wireframe overlay')
    .action((file, options) => {
      runWithFold(file, options, (analyzer, fullPath, foldData) => {
        const html = generateWebGLHTML(foldData, options);

        const outPath = options.output
          ? path.resolve(options.output)
          : fullPath.replace(/\.fold$/, '') + '-3d.html';

        fs.writeFileSync(outPath, html, 'utf8');
        console.log(`🎨 3D WebGL preview written to: ${outPath}`);
        console.log(`   Open in browser to view interactive 3D model`);
        console.log(`   Controls: Left-drag rotate, Right-drag pan, Scroll zoom`);
      });
    });
}

// ────────────────────────────────────────────────────────────────────
// HTML Generator
// ───────────────────────────────────────────────────────────────────-

function generateWebGLHTML(fold, options) {
  const vertices = fold.vertices_coords || [];
  const edges = fold.edges_vertices || [];
  const faces = fold.faces_vertices || [];
  const assignments = fold.edges_assignment || [];
  const facesColor = fold.faces_color || [];
  const frames = fold.frames || [];

  // Prepare geometry data
  const geometryData = prepareGeometry(vertices, faces, edges, assignments, facesColor);

  // Prepare animation frames if requested
  let framesData = null;
  if (options.frames && frames.length > 0) {
    framesData = frames.map(f => prepareGeometry(
      f.vertices_coords || vertices,
      f.faces_vertices || faces,
      f.edges_vertices || edges,
      f.edges_assignment || assignments,
      f.faces_color || facesColor
    ));
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>3D Origami Preview - ${fold.frame_title || 'Model'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: ${options.bg};
      color: #eee;
      overflow: hidden;
    }
    #container {
      width: ${options.width}px;
      height: ${options.height}px;
      position: relative;
    }
    canvas { display: block; }
    #controls {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 10px;
      align-items: center;
      background: rgba(0,0,0,0.6);
      padding: 10px 20px;
      border-radius: 30px;
      backdrop-filter: blur(10px);
    }
    #controls button {
      background: #4a4a6a;
      border: none;
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.2s;
    }
    #controls button:hover { background: #6a6a8a; }
    #controls button.active { background: #6366f1; }
    #slider {
      width: 200px;
      accent-color: #6366f1;
    }
    #info {
      position: absolute;
      top: 20px;
      left: 20px;
      background: rgba(0,0,0,0.6);
      padding: 15px;
      border-radius: 10px;
      backdrop-filter: blur(10px);
      font-size: 13px;
      line-height: 1.6;
    }
    #info h3 { margin-bottom: 8px; color: #6366f1; }
    #info .key { color: #888; }
    .legend {
      display: flex;
      gap: 15px;
      margin-top: 10px;
    }
    .legend-item { display: flex; align-items: center; gap: 5px; }
    .legend-color { width: 12px; height: 12px; border-radius: 2px; }
  </style>
</head>
<body>
  <div id="container">
    <div id="info">
      <h3>📦 ${fold.frame_title || 'Origami Model'}</h3>
      <div><span class="key">Vertices:</span> ${vertices.length}</div>
      <div><span class="key">Edges:</span> ${edges.length}</div>
      <div><span class="key">Faces:</span> ${faces.length}</div>
      ${framesData ? `<div><span class="key">Frames:</span> ${framesData.length}</div>` : ''}
      <div class="legend">
        <div class="legend-item">
          <div class="legend-color" style="background:#ef4444"></div>
          <span>Mountain</span>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background:#3b82f6"></div>
          <span>Valley</span>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background:#22c55e"></div>
          <span>Boundary</span>
        </div>
      </div>
    </div>
    <div id="controls">
      <button id="btn-play">▶ Play</button>
      <input type="range" id="slider" min="0" max="100" value="100">
      <button id="btn-wireframe">Wire</button>
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

const geometryData = ${JSON.stringify(geometryData)};
const framesData = ${framesData ? JSON.stringify(framesData) : 'null'};
const options = {
  autoFold: ${options.autoFold},
  wireframe: ${options.wireframe},
  bg: '${options.bg}'
};

// Scene setup
const container = document.getElementById('container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(options.bg);

// Camera
const camera = new THREE.PerspectiveCamera(60, ${options.width} / ${options.height}, 0.1, 1000);
camera.position.set(3, 3, 5);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(${options.width}, ${options.height});
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
directionalLight2.position.set(-5, -5, -5);
scene.add(directionalLight2);

// Materials
const mountainMat = new THREE.MeshStandardMaterial({
  color: 0xef4444,
  side: THREE.DoubleSide,
  flatShading: true,
  metalness: 0.1,
  roughness: 0.7
});

const valleyMat = new THREE.MeshStandardMaterial({
  color: 0x3b82f6,
  side: THREE.DoubleSide,
  flatShading: true,
  metalness: 0.1,
  roughness: 0.7
});

const boundaryMat = new THREE.MeshStandardMaterial({
  color: 0x22c55e,
  side: THREE.DoubleSide,
  flatShading: true,
  metalness: 0.1,
  roughness: 0.7
});

const customMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  side: THREE.DoubleSide,
  flatShading: true,
  metalness: 0.2,
  roughness: 0.5
});

// Create mesh group
let meshGroup = new THREE.Group();
scene.add(meshGroup);

function createMesh(data, isWireframe = false) {
  const group = new THREE.Group();

  // Create faces
  for (const face of data.faces) {
    const positions = [];
    for (const vi of face.vertexIndices) {
      const v = data.vertices[vi];
      positions.push(v.x, v.y, v.z);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();

    let material = boundaryMat;
    if (face.color) {
      material = customMat.clone();
      material.color.set(face.color);
    } else if (face.assignment === 'M') {
      material = isWireframe ? mountainMat.clone() : mountainMat;
    } else if (face.assignment === 'V') {
      material = isWireframe ? valleyMat.clone() : valleyMat;
    }

    if (isWireframe) {
      material = material.clone();
      material.wireframe = true;
    }

    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
  }

  // Create edges
  const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.5, transparent: true });
  for (const edge of data.edges) {
    const v1 = data.vertices[edge.v1];
    const v2 = data.vertices[edge.v2];
    const points = [
      new THREE.Vector3(v1.x, v1.y, v1.z),
      new THREE.Vector3(v2.x, v2.y, v2.z)
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, edgeMaterial);
    group.add(line);
  }

  return group;
}

// Initial render
let currentMesh = createMesh(geometryData, options.wireframe);
meshGroup.add(currentMesh);

// Center model
const box = new THREE.Box3().setFromObject(currentMesh);
const center = box.getCenter(new THREE.Vector3());
meshGroup.position.sub(center);

const size = box.getSize(new THREE.Vector3());
const maxDim = Math.max(size.x, size.y, size.z);
camera.position.set(maxDim * 1.5, maxDim * 1.5, maxDim * 2);
controls.target.set(0, 0, 0);

// Animation loop
let isPlaying = options.autoFold;
let currentFrame = framesData ? framesData.length - 1 : 0;

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// UI Controls
const slider = document.getElementById('slider');
const btnPlay = document.getElementById('btn-play');
const btnWireframe = document.getElementById('btn-wireframe');
const btnReset = document.getElementById('btn-reset');

if (framesData) {
  slider.addEventListener('input', (e) => {
    isPlaying = false;
    btnPlay.textContent = '▶ Play';
    const frameIndex = Math.floor((e.target.value / 100) * (framesData.length - 1));
    showFrame(frameIndex);
  });
} else {
  slider.style.display = 'none';
}

btnPlay.addEventListener('click', () => {
  isPlaying = !isPlaying;
  btnPlay.textContent = isPlaying ? '⏸ Pause' : '▶ Play';
  if (isPlaying) playAnimation();
});

btnWireframe.addEventListener('click', () => {
  options.wireframe = !options.wireframe;
  btnWireframe.classList.toggle('active', options.wireframe);
  updateMesh();
});

btnReset.addEventListener('click', () => {
  camera.position.set(maxDim * 1.5, maxDim * 1.5, maxDim * 2);
  controls.target.set(0, 0, 0);
  controls.update();
});

function showFrame(index) {
  if (!framesData || index < 0 || index >= framesData.length) return;
  currentFrame = index;
  meshGroup.remove(currentMesh);
  currentMesh = createMesh(framesData[index], options.wireframe);
  meshGroup.add(currentMesh);
}

function updateMesh() {
  meshGroup.remove(currentMesh);
  currentMesh = createMesh(framesData ? framesData[currentFrame] : geometryData, options.wireframe);
  meshGroup.add(currentMesh);
}

function playAnimation() {
  if (!isPlaying || !framesData) return;
  currentFrame = (currentFrame + 1) % framesData.length;
  showFrame(currentFrame);
  slider.value = (currentFrame / (framesData.length - 1)) * 100;
  setTimeout(playAnimation, 50);
}

// Start auto-fold if requested
if (options.autoFold && framesData) {
  playAnimation();
}
  </script>
</body>
</html>`;
}

// ────────────────────────────────────────────────────────────────────
// Geometry Preparation
// ───────────────────────────────────────────────────────────────────-

function prepareGeometry(vertices, faces, edges, assignments, facesColor) {
  // Build vertex map
  const vertexMap = {};
  for (let i = 0; i < vertices.length; i++) {
    vertexMap[i] = {
      x: vertices[i][0] || 0,
      y: vertices[i][1] || 0,
      z: vertices[i][2] || 0
    };
  }

  // Build edge assignment lookup
  const edgeAssignment = {};
  for (let i = 0; i < edges.length; i++) {
    const key = edges[i].sort((a, b) => a - b).join('-');
    edgeAssignment[key] = assignments[i] || 'B';
  }

  // Build face colors
  const faceColors = {};
  for (let i = 0; i < faces.length; i++) {
    if (facesColor[i]) {
      faceColors[i] = facesColor[i];
    }
  }

  // Prepare faces
  const faceData = [];
  for (let i = 0; i < faces.length; i++) {
    const faceVerts = faces[i];

    // Determine assignment from edges
    let assignment = 'B';
    for (let j = 0; j < faceVerts.length; j++) {
      const v1 = faceVerts[j];
      const v2 = faceVerts[(j + 1) % faceVerts.length];
      const key = [v1, v2].sort((a, b) => a - b).join('-');
      if (edgeAssignment[key] === 'M' || edgeAssignment[key] === 'V') {
        assignment = edgeAssignment[key];
        break;
      }
    }

    faceData.push({
      vertexIndices: faceVerts,
      assignment,
      color: faceColors[i] || null
    });
  }

  // Prepare edges
  const edgeData = [];
  for (const [a, b] of edges) {
    edgeData.push({ v1: a, v2: b });
  }

  return {
    vertices: vertexMap,
    faces: faceData,
    edges: edgeData
  };
}

module.exports = { registerWebGLCommand };
