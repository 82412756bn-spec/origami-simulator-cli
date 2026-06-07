/**
 * HTML Animation Renderer for v2.27 fold simulator
 *
 * Generates a self-contained HTML file with embedded SVG and JavaScript
 * that animates the fold sequence with a slider + play/pause controls.
 *
 * Uses SVG with simple isometric projection (z → offset) for 2.5D feel.
 * No Three.js / WebGL — keeps the file self-contained (~5KB).
 */

function projectIsometric(verts) {
  // Simple isometric: x → screen x, y → screen y, z → small vertical offset
  // No actual 3D rotation — just 2D + z-elevation hints
  return verts.map(v => ({
    x: v[0],
    y: v[1] - v[2] * 0.5,  // z affects y position (up = -y in SVG)
    z: v[2],
  }));
}

function renderFrameSVG(fold, options = {}) {
  const verts = projectIsometric(fold.vertices_coords);
  const { edges_assignment = [], edges_vertices = [], faces_vertices = [] } = fold;

  // Compute bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const v of verts) {
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
  }
  const padding = 20;
  const width = options.width || 600;
  const height = options.height || 600;
  const scale = Math.min(
    (width - 2 * padding) / Math.max(maxX - minX, 1),
    (height - 2 * padding) / Math.max(maxY - minY, 1)
  );
  const offX = padding + (width - 2 * padding - (maxX - minX) * scale) / 2;
  const offY = padding + (height - 2 * padding - (maxY - minY) * scale) / 2;
  const tx = (x) => offX + (x - minX) * scale;
  const ty = (y) => offY + (y - minY) * scale;

  let svg = '';

  // Faces (filled polygons, light gray)
  if (faces_vertices && faces_vertices.length > 0) {
    for (const face of faces_vertices) {
      if (face.length < 3) continue;
      const points = face.map(i => {
        const v = verts[i];
        return `${tx(v.x).toFixed(2)},${ty(v.y).toFixed(2)}`;
      }).join(' ');
      svg += `<polygon points="${points}" fill="#f0f0f0" stroke="#ccc" stroke-width="0.5" opacity="0.7"/>`;
    }
  }

  // Edges
  for (let i = 0; i < edges_vertices.length; i++) {
    const [a, b] = edges_vertices[i];
    const v1 = verts[a], v2 = verts[b];
    const x1 = tx(v1.x), y1 = ty(v1.y);
    const x2 = tx(v2.x), y2 = ty(v2.y);
    const assignment = edges_assignment[i] || 'B';
    let color, dash;
    if (assignment === 'M') { color = '#cc0000'; dash = '4,2'; }
    else if (assignment === 'V') { color = '#0033cc'; dash = '2,2'; }
    else { color = '#000'; dash = 'none'; }
    svg += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${color}" stroke-width="1.5" stroke-dasharray="${dash}"/>`;
  }

  // Vertices
  for (const v of verts) {
    svg += `<circle cx="${tx(v.x).toFixed(2)}" cy="${ty(v.y).toFixed(2)}" r="2" fill="#000"/>`;
  }

  return svg;
}

function renderAnimation(frames, options = {}) {
  const title = options.title || 'Origami Fold Animation';
  const frameSVGs = frames.map((fold) => renderFrameSVG(fold, { width: 500, height: 500 }));
  const frameData = frames.map((fold, i) => ({
    index: i,
    percent: i / Math.max(1, frames.length - 1),
    vertices: fold.vertices_coords,
    edges: fold.edges_vertices,
    edges_assignment: fold.edges_assignment || [],
    faces: fold.faces_vertices || [],
  }));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escHtml(title)}</title>
  <style>
    body { font-family: -apple-system, sans-serif; margin: 20px; background: #fafafa; }
    h1 { font-size: 18px; margin: 0 0 12px 0; }
    .controls { margin: 12px 0; display: flex; gap: 12px; align-items: center; }
    button { padding: 6px 14px; border: 1px solid #ccc; background: #fff; cursor: pointer; border-radius: 4px; }
    button:hover { background: #f0f0f0; }
    input[type=range] { flex: 1; max-width: 400px; }
    .frame-label { color: #666; font-variant-numeric: tabular-nums; }
    .legend { display: flex; gap: 12px; font-size: 12px; color: #666; margin: 8px 0; }
    .legend span { display: flex; align-items: center; gap: 4px; }
    .swatch { display: inline-block; width: 16px; height: 2px; }
    svg { display: block; background: #fff; border: 1px solid #eee; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>📐 ${escHtml(title)}</h1>
  <div class="legend">
    <span><span class="swatch" style="background:#cc0000"></span>Mountain (M)</span>
    <span><span class="swatch" style="background:#0033cc"></span>Valley (V)</span>
    <span><span class="swatch" style="background:#000"></span>Boundary (B)</span>
  </div>
  <div class="controls">
    <button id="play">▶ Play</button>
    <input type="range" id="slider" min="0" max="${frames.length - 1}" value="${frames.length - 1}">
    <span class="frame-label"><span id="frame-num">${frames.length - 1}</span> / ${frames.length - 1}</span>
  </div>
  <svg id="canvas" width="500" height="500" viewBox="0 0 500 500">
    ${frameSVGs[frameSVGs.length - 1]}
  </svg>
  <script>
    const frames = ${JSON.stringify(frameData)};
    const slider = document.getElementById('slider');
    const playBtn = document.getElementById('play');
    const frameNum = document.getElementById('frame-num');
    const canvas = document.getElementById('canvas');
    let playing = false;
    let playInterval = null;

    function render(frame) {
      const f = frames[frame];
      const verts = f.vertices.map(([x, y, z]) => ({
        x: x, y: y - z * 0.5, z: z,
      }));
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const v of verts) {
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      }
      const padding = 20, w = 500, h = 500;
      const scale = Math.min((w - 2 * padding) / Math.max(maxX - minX, 1), (h - 2 * padding) / Math.max(maxY - minY, 1));
      const offX = padding + (w - 2 * padding - (maxX - minX) * scale) / 2;
      const offY = padding + (h - 2 * padding - (maxY - minY) * scale) / 2;
      const tx = (x) => offX + (x - minX) * scale;
      const ty = (y) => offY + (y - minY) * scale;

      let svg = '';
      for (const face of f.faces) {
        if (face.length < 3) continue;
        const points = face.map(i => {
          const v = verts[i];
          return tx(v.x).toFixed(2) + ',' + ty(v.y).toFixed(2);
        }).join(' ');
        svg += '<polygon points="' + points + '" fill="#f0f0f0" stroke="#ccc" stroke-width="0.5" opacity="0.7"/>';
      }
      for (let i = 0; i < f.edges.length; i++) {
        const a = f.edges[i][0], b = f.edges[i][1];
        const v1 = verts[a], v2 = verts[b];
        const assign = f.edges_assignment[i] || 'B';
        let color = '#000', dash = 'none';
        if (assign === 'M') { color = '#cc0000'; dash = '4,2'; }
        else if (assign === 'V') { color = '#0033cc'; dash = '2,2'; }
        svg += '<line x1="' + tx(v1.x).toFixed(2) + '" y1="' + ty(v1.y).toFixed(2) +
               '" x2="' + tx(v2.x).toFixed(2) + '" y2="' + ty(v2.y).toFixed(2) +
               '" stroke="' + color + '" stroke-width="1.5" stroke-dasharray="' + dash + '"/>';
      }
      for (const v of verts) {
        svg += '<circle cx="' + tx(v.x).toFixed(2) + '" cy="' + ty(v.y).toFixed(2) + '" r="2" fill="#000"/>';
      }
      canvas.innerHTML = svg;
    }

    slider.addEventListener('input', () => {
      const f = parseInt(slider.value);
      render(f);
      frameNum.textContent = f;
    });

    playBtn.addEventListener('click', () => {
      if (playing) {
        clearInterval(playInterval);
        playBtn.textContent = '▶ Play';
        playing = false;
      } else {
        let f = 0;
        slider.value = 0;
        render(0);
        frameNum.textContent = 0;
        playInterval = setInterval(() => {
          f = (f + 1) % frames.length;
          slider.value = f;
          render(f);
          frameNum.textContent = f;
        }, 150);
        playBtn.textContent = '⏸ Pause';
        playing = true;
      }
    });
  </script>
</body>
</html>
`;
  return html;
}

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

module.exports = { renderAnimation, renderFrameSVG };
