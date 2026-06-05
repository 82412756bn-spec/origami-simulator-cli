const { CommercialRenderer } = require('/home/rayna/文档/origami-simulator-cli/src/utils/commercial-renderer');
const fs = require('fs');
const fold = JSON.parse(fs.readFileSync('/tmp/plane.fold', 'utf8'));

const renderer = new CommercialRenderer({
  width: 800, height: 600,
  material: 'corrugated', hdri: 'studio', angle: '45',
});

// Inject diagnostic logging
let html = renderer.buildHtml(fold);

// Add diagnostic console.log AFTER texture loading
html = html.replace(
  'const material = new THREE.MeshPhysicalMaterial',
  `
  console.log('Texture check:', {
    hasDiffuseMap: !!diffuseMap,
    hasNormalMap: !!normalMap,
    hasRoughnessMap: !!roughnessMap,
    diffuseMapImage: diffuseMap ? diffuseMap.image : null,
  });
  if (diffuseMap && diffuseMap.image) {
    console.log('Diffuse image size:', diffuseMap.image.width, 'x', diffuseMap.image.height);
  }
  const material = new THREE.MeshPhysicalMaterial`
);

// Also log after geometry
html = html.replace(
  'const mesh = new THREE.Mesh(geometry, material);',
  `
  console.log('Geometry has UV:', !!geometry.attributes.uv);
  if (geometry.attributes.uv) {
    console.log('UV count:', geometry.attributes.uv.count);
  }
  const mesh = new THREE.Mesh(geometry, material);`
);

const threeDataUrl = renderer.loadThreeJs();
const finalHtml = html.replace('THREE_PLACEHOLDER', threeDataUrl);
fs.writeFileSync('/tmp/diag3.html', finalHtml);
console.log('HTML size:', finalHtml.length);
