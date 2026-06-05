const { CommercialRenderer } = require('/home/rayna/文档/origami-simulator-cli/src/utils/commercial-renderer');
const fs = require('fs');
const path = require('path');

(async () => {
  // Create a simple plane FOLD
  const planeFold = {
    file_spec: 1.1,
    vertices_coords: [[0, 0, 0], [2, 0, 0], [2, 1, 0], [0, 1, 0]],
    edges_vertices: [[0,1], [1,2], [2,3], [3,0]],
    faces_vertices: [[0, 1, 2, 3]],
    edges_assignment: ['B', 'B', 'B', 'B'],
    edges_foldAngle: [0, 0, 0, 0],
  };
  fs.writeFileSync('/tmp/plane.fold', JSON.stringify(planeFold));

  // Render plane
  const renderer = new CommercialRenderer({
    width: 800, height: 600,
    material: 'corrugated', hdri: 'studio', angle: '45',
    outputPath: '/tmp/plane-render.png',
  });
  const result = await renderer.render(planeFold);
  console.log('Plane render:', result.size, 'bytes');
})();
