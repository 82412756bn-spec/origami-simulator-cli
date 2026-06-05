const { CommercialRenderer } = require('/home/rayna/文档/origami-simulator-cli/src/utils/commercial-renderer');
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  // 创建一个简单 box FOLD
  const boxFOLD = {
    file_spec: 1.1,
    vertices_coords: [
      [0, 0, 0], [400, 0, 0], [400, 400, 0], [0, 400, 0],
      [0, 0, 400], [400, 0, 400], [400, 400, 400], [0, 400, 400],
    ],
    edges_vertices: [
      [0,1],[1,2],[2,3],[3,0],
      [4,5],[5,6],[6,7],[7,4],
      [0,4],[1,5],[2,6],[3,7],
    ],
    faces_vertices: [
      [0,1,2,3], [4,5,6,7], [0,1,5,4], [1,2,6,5],
      [2,3,7,6], [3,0,4,7],
    ],
    edges_assignment: ['B','B','B','B','B','B','B','B','B','B','B','B'],
    edges_foldAngle: [0,0,0,0,0,0,0,0,0,0,0,0],
  };

  const renderer = new CommercialRenderer({
    width: 800, height: 600,
    material: 'corrugated', hdri: 'studio', angle: '45',
  });
  const html = renderer.buildHtml(boxFOLD);
  const threeUrl = renderer.loadThreeJs();
  let finalHtml = html.replace('THREE_PLACEHOLDER', threeUrl);

  // Add console.log
  finalHtml = finalHtml.replace(
    'const mesh = new THREE.Mesh(geometry, material);',
    `
    console.log('Geometry verts:', geometry.attributes.position.count);
    console.log('Geometry uvs:', geometry.attributes.uv?.count);
    console.log('Geometry indices:', geometry.index?.count);
    const mesh = new THREE.Mesh(geometry, material);`
  );

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('LOG:', msg.text().substring(0, 200)));
  await page.setContent(finalHtml);
  await page.waitForFunction(() => window.status === 'done', { timeout: 15000 });
  const data = await page.evaluate(() => window.outputData);
  const buffer = Buffer.from(data.split(',')[1], 'base64');
  fs.writeFileSync('/tmp/cube-fold.png', buffer);
  console.log('Cube with FOLD:', buffer.length, 'bytes');

  await browser.close();
})();
