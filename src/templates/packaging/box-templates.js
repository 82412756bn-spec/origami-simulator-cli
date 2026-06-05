/**
 * Box Template Generator v2
 * Generates packaging box dielines with PHYSICAL fold angles
 *
 * Key insight: When thickness t > 0, fold angles are constrained:
 * - Mountain: 90° < θ < 180°
 * - Valley: -180° < θ < -90°
 * - Thickness → 0: θ → ±180°
 */

const { validateDieline } = require('./validator');

// Default thickness in mm (standard cardboard ~1mm)
const DEFAULT_THICKNESS = 1.0;

/**
 * Calculate fold angle based on thickness
 * @param {number} thickness - Material thickness in mm
 * @param {string} type - 'M' (mountain) or 'V' (valley)
 * @returns {number} Fold angle in degrees
 */
function calculateFoldAngle(thickness, type = 'M') {
  // For physical material with thickness:
  // - Mountain fold angle approaches 180° as thickness → 0
  // - With actual thickness, angle is reduced
  // Typical box cardboard: fold angle ~150-170°
  const baseAngle = type === 'M' ? 180 : -180;

  if (thickness <= 0) {
    return baseAngle; // Perfect thin sheet
  }

  // With thickness, the fold angle is reduced
  // Empirical formula: angle reduction based on thickness
  const reduction = Math.min(thickness * 3, 30); // Max 30° reduction
  return type === 'M' ? (baseAngle - reduction) : (baseAngle + reduction);
}

/**
 * Generate a simple folding carton dieline (FLAT layout)
 * All vertices on z=0, with correct fold angles
 *
 * @param {Object} options - { width, height, depth, thickness } in mm
 * @returns {Object} FOLD format dieline
 */
function generateFoldingCarton({ width = 100, height = 60, depth = 30, thickness = DEFAULT_THICKNESS }) {
  // Flat dieline: vertices arranged in 2D (z=0)
  // The dieline shows where to cut and where to fold
  const scale = 1;

  const w = width * scale;
  const h = height * scale;
  const d = depth * scale;

  // Flap dimensions
  const flapWidth = d * 0.4;
  const glueFlap = w * 0.3;

  // Layout vertices in a flat dieline pattern
  // 布局：底部 + 侧面折叠 + 顶部
  // For a simple 4-face box dieline:
  const vertices = [
    // Bottom face (0-3)
    [0, 0, 0],
    [w, 0, 0],
    [w, h, 0],
    [0, h, 0],

    // Left flap (4-7)
    [-flapWidth, 0, 0],  // 4: left flap bottom-left
    [0, 0, 0],            // 5: already defined as 0
    [0, h, 0],            // 6: already defined as 3
    [-flapWidth, h, 0],    // 7: left flap top-left

    // Right flap with glue (8-11)
    [w, 0, 0],            // 8: already defined as 1
    [w + glueFlap, 0, 0],  // 9: glue flap bottom-right
    [w + glueFlap, h, 0],  // 10: glue flap top-right
    [w, h, 0],            // 11: already defined as 2
  ];

  // Use unique vertices only
  const uniqueVertices = [];
  const vertexMap = new Map();

  function getVertexIndex(x, y, z) {
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    if (!vertexMap.has(key)) {
      vertexMap.set(key, uniqueVertices.length);
      uniqueVertices.push([x, y, z]);
    }
    return vertexMap.get(key);
  }

  // Rebuild vertices with deduplication
  const v = [
    [0, 0, 0],           // 0
    [w, 0, 0],           // 1
    [w, h, 0],           // 2
    [0, h, 0],           // 3
    [-flapWidth, 0, 0],   // 4
    [-flapWidth, h, 0],   // 5
    [w + glueFlap, 0, 0], // 6
    [w + glueFlap, h, 0], // 7
  ];

  // Define edges with fold assignments
  // B = Boundary (cut), M = Mountain (fold up), V = Valley (fold down)
  const edgeData = [
    // Bottom perimeter - all boundary cuts
    [[0, 1], 'B'], [[1, 2], 'B'], [[2, 3], 'B'], [[3, 0], 'B'],

    // Left flap fold (mountain - folds up)
    [[0, 4], 'M'], [[3, 5], 'M'], [[4, 5], 'B'],

    // Right glue flap fold (valley - folds down)
    [[1, 6], 'V'], [[2, 7], 'V'], [[6, 7], 'B'],
  ];

  // Calculate fold angles
  const edges_vertices = edgeData.map(([e]) => e);
  const edges_assignment = edgeData.map(([, a]) => a);
  const edges_foldAngle = edgeData.map(([, a]) => {
    if (a === 'B') return 0;
    return calculateFoldAngle(thickness, a);
  });

  // Build faces
  // For flat dieline, we have one main face (the bottom)
  const faces_vertices = [[0, 1, 2, 3]];

  return {
    file_spec: 1.1,
    file_creator: 'OrigamiSimulator CLI Box Template Generator v2',
    file_classes: ['singleModel'],
    frame_title: `Folding Carton ${width}×${height}×${depth}mm (t=${thickness}mm)`,
    vertices_coords: v,
    edges_vertices,
    faces_vertices,
    edges_assignment,
    edges_foldAngle,
    box_dimensions: { width, height, depth },
    thickness,
    box_type: 'folding-carton',
  };
}

/**
 * Generate a mailer box dieline (自锁底)
 */
function generateMailerBox({ width = 120, height = 80, depth = 40, thickness = DEFAULT_THICKNESS }) {
  const scale = 1;
  const w = width * scale;
  const h = height * scale;
  const d = depth * scale;

  // Flap dimensions
  const bottomFlap = d * 0.5;
  const sideFlap = h * 0.4;

  // Vertices for mailer box flat dieline
  const vertices = [
    // Main body (0-3)
    [0, 0, 0],          // 0: bottom-left
    [w, 0, 0],          // 1: bottom-right
    [w, h, 0],          // 2: top-right
    [0, h, 0],          // 3: top-left

    // Bottom flaps (4-11)
    [d * 0.3, -bottomFlap, 0],   // 4: bottom-center-left
    [w - d * 0.3, -bottomFlap, 0], // 5: bottom-center-right
    [w + d * 0.3, -bottomFlap, 0], // 6: right-flap-bottom
    [w + d * 0.3, bottomFlap, 0],  // 7: right-flap-top
    [w, d * 0.3, 0],                 // 8: right-center-bottom
    [w, h - d * 0.3, 0],             // 9: right-center-top
    [w + d * 0.3, h - d * 0.3, 0],  // 10: right-top-corner
    [w + d * 0.3, h + d * 0.3, 0],  // 11: right-flap-top-right
  ];

  // Edge assignments: B=boundary, M=mountain, V=valley
  const edgeData = [
    // Main box boundary
    [[0, 1], 'B'], [[1, 2], 'B'], [[2, 3], 'B'], [[3, 0], 'B'],

    // Bottom center flap fold (mountain - folds UP)
    [[0, 4], 'M'], [[4, 5], 'M'], [[5, 1], 'M'],

    // Side flap folds (valley - folds DOWN)
    [[1, 6], 'V'], [[6, 7], 'V'], [[7, 8], 'V'], [[8, 9], 'V'], [[9, 10], 'V'], [[10, 11], 'V'], [[11, 2], 'V'],
  ];

  const edges_vertices = edgeData.map(([e]) => e);
  const edges_assignment = edgeData.map(([, a]) => a);
  const edges_foldAngle = edgeData.map(([, a]) => {
    if (a === 'B') return 0;
    return calculateFoldAngle(thickness, a);
  });

  const faces_vertices = [[0, 1, 2, 3]];

  return {
    file_spec: 1.1,
    file_creator: 'OrigamiSimulator CLI Box Template Generator v2',
    file_classes: ['singleModel'],
    frame_title: `Mailer Box ${width}×${height}×${depth}mm (t=${thickness}mm)`,
    vertices_coords: vertices,
    edges_vertices,
    faces_vertices,
    edges_assignment,
    edges_foldAngle,
    box_dimensions: { width, height, depth },
    thickness,
    box_type: 'mailer',
  };
}

/**
 * Generate a pizza box dieline
 */
function generatePizzaBox({ width = 300, height = 300, depth = 40, thickness = DEFAULT_THICKNESS }) {
  const scale = 0.5; // Smaller scale for large boxes
  const w = width * scale;
  const h = height * scale;
  const d = depth * scale;
  const lip = d * 0.3;

  // Square pizza box flat dieline
  const vertices = [
    // Outer perimeter (0-3)
    [0, 0, 0],
    [w, 0, 0],
    [w, h, 0],
    [0, h, 0],

    // Inner lid line (4-7)
    [lip, lip, 0],
    [w - lip, lip, 0],
    [w - lip, h - lip, 0],
    [lip, h - lip, 0],
  ];

  // Edge assignments
  const edgeData = [
    // Outer boundary - all cuts
    [[0, 1], 'B'], [[1, 2], 'B'], [[2, 3], 'B'], [[3, 0], 'B'],

    // Inner lid fold (mountain - lid folds up)
    [[4, 5], 'M'], [[5, 6], 'M'], [[6, 7], 'M'], [[7, 4], 'M'],

    // Corner cuts to allow folding
    [[0, 4], 'B'], [[1, 5], 'B'], [[2, 6], 'B'], [[3, 7], 'B'],
  ];

  const edges_vertices = edgeData.map(([e]) => e);
  const edges_assignment = edgeData.map(([, a]) => a);
  const edges_foldAngle = edgeData.map(([, a]) => {
    if (a === 'B') return 0;
    return calculateFoldAngle(thickness, a);
  });

  // Two faces: outer and inner lid
  const faces_vertices = [[0, 1, 2, 3], [4, 5, 6, 7]];

  return {
    file_spec: 1.1,
    file_creator: 'OrigamiSimulator CLI Box Template Generator v2',
    file_classes: ['singleModel'],
    frame_title: `Pizza Box ${width}×${height}×${depth}mm (t=${thickness}mm)`,
    vertices_coords: vertices,
    edges_vertices,
    faces_vertices,
    edges_assignment,
    edges_foldAngle,
    box_dimensions: { width, height, depth },
    thickness,
    box_type: 'pizza',
  };
}

/**
 * Generate a tube/cylinder dieline
 */
function generateTube({ width = 50, height = 120, diameter = 30, thickness = DEFAULT_THICKNESS }) {
  const scale = 1;
  const r = (diameter / 2) * scale;
  const h = height * scale;
  const segments = 12;

  const vertices = [];
  const edgeData = [];

  // Generate tube as a polygon with seam
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = r + Math.cos(angle) * r;
    const y = r + Math.sin(angle) * r;
    vertices.push([x, y, 0]);
  }

  // Bottom circle edges (valley folds to form bottom)
  for (let i = 0; i < segments; i++) {
    const next = (i + 1) % segments;
    // Seam is a cut, others are folds
    if (i === 0) {
      edgeData.push([[i, next], 'B']); // Seam cut
    } else {
      edgeData.push([[i, next], 'V']); // Fold
    }
  }

  // Top edges (mountain folds to form top)
  // Tube is a single face for dieline purposes
  const edges_vertices = edgeData.map(([e]) => e);
  const edges_assignment = edgeData.map(([, a]) => a);
  const edges_foldAngle = edgeData.map(([, a]) => {
    if (a === 'B') return 0;
    return calculateFoldAngle(thickness, a);
  });

  // Single face for the tube wall
  const faces_vertices = [Array.from({ length: segments }, (_, i) => i)];

  return {
    file_spec: 1.1,
    file_creator: 'OrigamiSimulator CLI Box Template Generator v2',
    file_classes: ['singleModel'],
    frame_title: `Tube ${diameter}×${height}mm (t=${thickness}mm)`,
    vertices_coords: vertices,
    edges_vertices,
    faces_vertices,
    edges_assignment,
    edges_foldAngle,
    box_dimensions: { width, height, diameter },
    thickness,
    box_type: 'tube',
  };
}

/**
 * Generate an aircraft box dieline
 */
function generateAircraftBox({ width = 200, height = 100, depth = 60, thickness = DEFAULT_THICKNESS }) {
  const scale = 0.5;
  const w = width * scale;
  const h = height * scale;
  const d = depth * scale;

  // Aircraft box has a specific folding pattern
  const vertices = [
    // Main bottom (0-3)
    [0, 0, 0],
    [w, 0, 0],
    [w, h, 0],
    [0, h, 0],

    // Left side flaps (4-7)
    [-d * 0.5, 0, 0],   // 4
    [0, d * 0.3, 0],     // 5
    [-d * 0.5, h, 0],    // 6
    [0, h - d * 0.3, 0], // 7

    // Right side flaps (8-11)
    [w + d * 0.5, 0, 0],    // 8
    [w, d * 0.3, 0],          // 9
    [w + d * 0.5, h, 0],      // 10
    [w, h - d * 0.3, 0],     // 11
  ];

  // Edge assignments
  const edgeData = [
    // Main box boundary
    [[0, 1], 'B'], [[1, 2], 'B'], [[2, 3], 'B'], [[3, 0], 'B'],

    // Left flaps (mountain - fold up)
    [[0, 4], 'M'], [[4, 5], 'M'], [[5, 3], 'M'], [[0, 5], 'B'], [[4, 7], 'B'], [[7, 5], 'B'], [[7, 6], 'M'], [[6, 4], 'B'],

    // Right flaps (valley - fold down)
    [[1, 8], 'V'], [[8, 9], 'V'], [[9, 2], 'V'], [[1, 9], 'B'], [[8, 11], 'B'], [[11, 9], 'B'], [[11, 10], 'V'], [[10, 8], 'B'],
  ];

  const edges_vertices = edgeData.map(([e]) => e);
  const edges_assignment = edgeData.map(([, a]) => a);
  const edges_foldAngle = edgeData.map(([, a]) => {
    if (a === 'B') return 0;
    return calculateFoldAngle(thickness, a);
  });

  const faces_vertices = [[0, 1, 2, 3]];

  return {
    file_spec: 1.1,
    file_creator: 'OrigamiSimulator CLI Box Template Generator v2',
    file_classes: ['singleModel'],
    frame_title: `Aircraft Box ${width}×${height}×${depth}mm (t=${thickness}mm)`,
    vertices_coords: vertices,
    edges_vertices,
    faces_vertices,
    edges_assignment,
    edges_foldAngle,
    box_dimensions: { width, height, depth },
    thickness,
    box_type: 'aircraft',
  };
}

/**
 * Get all available template generators
 */
function getTemplateGenerators() {
  return {
    'folding-carton': generateFoldingCarton,
    'carton': generateFoldingCarton,
    'mailer': generateMailerBox,
    'mailer-box': generateMailerBox,
    'pizza': generatePizzaBox,
    'pizza-box': generatePizzaBox,
    'tube': generateTube,
    'cylinder': generateTube,
    'aircraft': generateAircraftBox,
    'aircraft-box': generateAircraftBox,
  };
}

/**
 * Get all available template names
 */
function getAvailableTemplates() {
  return [
    { id: 'folding-carton', name: 'Folding Carton', nameCN: '折叠纸盒', category: 'carton' },
    { id: 'mailer', name: 'Mailer Box', nameCN: '邮寄盒', category: 'mailer' },
    { id: 'pizza', name: 'Pizza Box', nameCN: '披萨盒', category: 'food' },
    { id: 'tube', name: 'Tube', nameCN: '圆管盒', category: 'tube' },
    { id: 'aircraft', name: 'Aircraft Box', nameCN: '飞机盒', category: 'carton' },
  ];
}

/**
 * Generate a template by name
 */
function generateTemplate(templateName, dimensions) {
  const generators = getTemplateGenerators();
  const generator = generators[templateName.toLowerCase()];

  if (!generator) {
    const available = Object.keys(generators).join(', ');
    throw new Error(`Unknown template: ${templateName}. Available: ${available}`);
  }

  const dieline = generator(dimensions);

  // Validate
  const validation = validateDieline(dieline);
  if (!validation.valid) {
    throw new Error(`Invalid dieline generated: ${validation.errors.join(', ')}`);
  }

  return dieline;
}

module.exports = {
  generateFoldingCarton,
  generateMailerBox,
  generatePizzaBox,
  generateTube,
  generateAircraftBox,
  generateTemplate,
  getTemplateGenerators,
  getAvailableTemplates,
  calculateFoldAngle,
  DEFAULT_THICKNESS,
};