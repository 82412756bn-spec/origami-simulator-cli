/**
 * Dieline DXF Exporter
 * Exports FOLD dielines as AutoCAD R12 ASCII DXF files for laser cutters / CNC.
 *
 * DXF output conventions:
 * - Layer "CUT"      : solid boundary edges (edges_assignment === 'B') — green
 * - Layer "MOUNTAIN" : mountain fold edges (M) — red
 * - Layer "VALLEY"   : valley fold edges (V)   — blue
 * - Units: millimeters (DXF is unitless but we set $INSUNITS = 4 = millimeters
 *   in the header so CAD apps interpret coordinates as mm)
 *
 * Format reference: AutoCAD R12 ASCII DXF (well-documented text-based subset).
 * We emit LWPOLYLINE entities for closed face boundaries (more compact than
 * individual LINE entities) and individual LINE entities for open fold segments.
 */

class DielineDXFExporter {
  constructor(options = {}) {
    this.options = {
      // Layer colors (AutoCAD Color Index, ACI)
      cutColor: options.cutColor !== undefined ? options.cutColor : 3,        // green
      mountainColor: options.mountainColor !== undefined ? options.mountainColor : 1,  // red
      valleyColor: options.valleyColor !== undefined ? options.valleyColor : 5,        // blue

      // Line widths in mm (DXF lineweight units)
      cutWidth: options.cutWidth || 0.5,
      mountainWidth: options.mountainWidth || 0.3,
      valleyWidth: options.valleyWidth || 0.3,

      // Geometry options
      closedBoundary: options.closedBoundary !== false,
      emitHeader: options.emitHeader !== false,

      // Debug
      debug: options.debug || false,
    };
  }

  /**
   * Export FOLD to DXF text.
   * @param {Object} fold - FOLD format object
   * @returns {string} DXF file content
   */
  export(fold) {
    if (!fold || !fold.vertices_coords || !fold.edges_vertices) {
      throw new Error('Invalid FOLD object: missing vertices_coords or edges_vertices');
    }
    const { vertices_coords, edges_vertices, edges_assignment = [], faces_vertices = [] } = fold;

    let dxf = '';

    if (this.options.emitHeader) {
      dxf += this.renderHeader();
    }

    dxf += '0\nSECTION\n2\nENTITIES\n';

    // 1) Emit closed face polylines for any faces (these are physical panels)
    if (this.options.closedBoundary && faces_vertices.length > 0) {
      const seenBoundary = new Set();
      for (const face of faces_vertices) {
        if (face.length < 3) continue;
        // Find which boundary edge this face uses to label the polyline
        // (Default: CUT layer for face boundaries)
        dxf += this.renderPolyline(face, vertices_coords, 'CUT', this.options.cutColor, this.options.cutWidth, true);
        for (let i = 0; i < face.length; i++) {
          const a = face[i];
          const b = face[(i + 1) % face.length];
          seenBoundary.add(this.edgeKey(a, b));
        }
      }
    }

    // 2) Emit remaining edges that aren't part of any face boundary, color-coded by assignment
    for (let i = 0; i < edges_vertices.length; i++) {
      const [a, b] = edges_vertices[i];
      const key = this.edgeKey(a, b);
      const assignment = edges_assignment[i] || 'B';

      let layer, color, width;
      switch (assignment) {
        case 'M':
          layer = 'MOUNTAIN'; color = this.options.mountainColor; width = this.options.mountainWidth;
          break;
        case 'V':
          layer = 'VALLEY'; color = this.options.valleyColor; width = this.options.valleyWidth;
          break;
        case 'B':
        default:
          layer = 'CUT'; color = this.options.cutColor; width = this.options.cutWidth;
      }
      dxf += this.renderLine(vertices_coords[a], vertices_coords[b], layer, color, width);
    }

    dxf += '0\nENDSEC\n0\nEOF\n';
    return dxf;
  }

  /**
   * Edge key for set-membership (order-independent).
   */
  edgeKey(a, b) {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
  }

  /**
   * Render DXF header section (units, layer table, etc.).
   */
  renderHeader() {
    // Minimal header: $INSUNITS = 4 (millimeters), then a TABLES section with
    // our 3 layers so CAD apps can color-code them.
    return `0
SECTION
2
HEADER
9
\$INSUNITS
70
4
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
70
3
0
LAYER
2
CUT
70
0
62
${this.options.cutColor}
6
CONTINUOUS
0
LAYER
2
MOUNTAIN
70
0
62
${this.options.mountainColor}
6
DASHED
0
LAYER
2
VALLEY
70
0
62
${this.options.valleyColor}
6
DASHED
0
ENDTAB
0
ENDSEC
0
SECTION
2
BLOCKS
0
ENDSEC
0
`;
  }

  /**
   * Render a single LINE entity.
   */
  renderLine(v1, v2, layer, color, _width) {
    return `0
LINE
8
${layer}
62
${color}
10
${this.fmt(v1[0])}
20
${this.fmt(v1[1])}
30
${this.fmt(v1[2] || 0)}
11
${this.fmt(v2[0])}
21
${this.fmt(v2[1])}
31
${this.fmt(v2[2] || 0)}
`;
  }

  /**
   * Render a closed LWPOLYLINE entity (face boundary).
   */
  renderPolyline(vertexIndices, vertices, layer, color, _width, closed) {
    let s = `0
LWPOLYLINE
8
${layer}
62
${color}
90
${vertexIndices.length}
70
${closed ? 1 : 0}
`;
    for (const idx of vertexIndices) {
      const v = vertices[idx];
      s += `10
${this.fmt(v[0])}
20
${this.fmt(v[1])}
`;
    }
    return s;
  }

  /**
   * Format a number for DXF (max 6 decimal places, no scientific notation).
   */
  fmt(n) {
    if (typeof n !== 'number' || !isFinite(n)) return '0.0';
    // DXF readers expect plain decimal; use toFixed then strip trailing zeros
    return parseFloat(n.toFixed(6)).toString();
  }
}

module.exports = { DielineDXFExporter };
