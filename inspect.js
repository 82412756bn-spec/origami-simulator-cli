const { CommercialRenderer } = require('/home/rayna/文档/origami-simulator-cli/src/utils/commercial-renderer');
const { ProceduralTextureGenerator } = require('/home/rayna/文档/origami-simulator-cli/src/utils/procedural-texture');
const fs = require('fs');

(async () => {
  const fold = JSON.parse(fs.readFileSync('/tmp/plane.fold', 'utf8'));
  
  // Generate textures
  const gen = new ProceduralTextureGenerator({ size: 256, seed: 42 });
  const tex = gen.generate('corrugated');
  console.log('Texture diffuse length:', tex.diffuse.length);
  
  const renderer = new CommercialRenderer({
    width: 800, height: 600,
    material: 'corrugated',
  });
  
  // Check what textures get passed
  const textures = renderer.generateMaterialTextures('corrugated');
  console.log('Generated textures:', textures ? 'YES' : 'NULL');
  console.log('Diffuse starts with:', textures.diffuse.substring(0, 60));
  
  // Check html
  const html = renderer.buildHtml(fold);
  const hasDiffuse = html.includes('diffuseMap = dataUrlToTexture(textureData.diffuse)');
  console.log('Has diffuseMap loading code:', hasDiffuse);
  console.log('Has material code:', html.includes('MeshPhysicalMaterial'));
  console.log('Has map: diffuseMap:', html.includes('map: diffuseMap'));
  
  // Save HTML for inspection
  fs.writeFileSync('/tmp/inspect.html', html);
  console.log('HTML saved to /tmp/inspect.html');
})();
