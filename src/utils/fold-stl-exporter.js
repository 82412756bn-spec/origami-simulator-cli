/**
 * FOLD → STL Exporter (v2.24)
 *
 * Exports FOLD geometry to STL (StereoLithography) format for 3D printing,
 * laser cutting (with thickness extrusion), and CAD/CAM workflows.
 *
 * Supports:
 *   - 2D dieline-style FOLD (z=0) → extruded to 3D sheet with --thickness mm
 *   - 3D FOLD (z≠0) → use coordinates as-is
 *
 * Output formats:
 *   - binary: 80-byte header + uint32 tri count + 50 bytes/triangle
 *             (compact, ~1KB per 20 triangles — preferred for 3D printing)
 *   - ascii:  human-readable "solid ... facet normal ... vertex" blocks
 *             (larger, useful for debugging and piping through `admesh`)
 *
 * Triangulation: fan triangulation via the vertex-0-as-apex heuristic
 * (matches faceTriangles() in fold-analyzer.js, so STL output is
 * consistent with the self-intersection detector).
 *
 * Normals: computed via the right-hand rule from the cross product
 * (v1→v2) × (v1→v3). No dependency on Meshlab or external libraries.
 */

const path = require('path');

class FoldSTLExporter {
  constructor(options = {}) {
    this.options = {
      // Sheet thickness for 2D→3D extrusion (mm). 0 disables extrusion
      // (only works on true 3D inputs).
      thickness: options.thickness !== undefined ? options.thickness : 1.0,
      // Extrusion direction (unit vector or [0,0,1] for default)
      extrudeDirection: options.extrudeDirection || [0, 0, 1],
      // Output format
      format: options.format || 'binary',
      // Filename for the ASCII "solid <name>" header (binary uses 80-byte header)
      name: options.name || 'origami-fold',
      // Reverse face winding (flip all triangle normals)
      flipNormals: options.flipNormals || false,
      // Debug
      debug: options.debug || false,
    };
  }

  /**
   * Export FOLD geometry to STL. Returns Buffer (binary) or string (ASCII).
   * @param {Object} fold - FOLD format object
   * @returns {Buffer|string}
   */
  export(fold) {
    if (!fold || !fold.vertices_coords || !fold.edges_vertices) {
      throw new Error('Invalid FOLD object: missing vertices_coords or edges_vertices');
    }
    const triangles = this.buildTriangles(fold);
    if (this.options.format === 'ascii') {
      return this.toAsciiSTL(triangles);
    }
    return this.toBinarySTL(triangles);
  }

  /**
   * Build a flat list of { normal, v1, v2, v3 } from the FOLD.
   * For 3D inputs, each face becomes N-2 triangles.
   * For 2D inputs, each face becomes a top + bottom + N side quads (= 2N triangles).
   */
  buildTriangles(fold) {
    const { vertices_coords, faces_vertices = [] } = fold;
    const is3D = vertices_coords.some(v => Array.isArray(v) && v.length >= 3 && Math.abs(v[2] || 0) > 1e-6);
    const thickness = this.options.thickness;

    const triangles = [];

    if (faces_vertices.length === 0) {
      // No explicit faces — synthesize triangles from each edge pair? No,
      // edges alone don't define a 2D surface. The caller should ensure
      // faces_vertices is populated for 2D inputs.
      return triangles;
    }

    if (is3D) {
      // True 3D: triangulate each face as-is.
      for (const face of faces_vertices) {
        for (const tri of this.fanTriangulate(face)) {
          triangles.push(this.makeTriangleFromIndices(vertices_coords, tri));
        }
      }
    } else if (thickness > 0) {
      // 2D: extrude to 3D sheet.
      // For each face:
      //   - Top face:    vertices at z=+thickness/2 (CCW from above)
      //   - Bottom face: vertices at z=-thickness/2 (CW from above → flipped normals)
      //   - Side faces:  connect top and bottom along each edge
      const halfT = thickness / 2;
      const dir = this.options.extrudeDirection;
      // Normalize direction
      const dlen = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      const dn = [dir[0] / dlen, dir[1] / dlen, dir[2] / dlen];
      const offset = [dn[0] * halfT, dn[1] * halfT, dn[2] * halfT];

      for (const face of faces_vertices) {
        if (face.length < 3) continue;
        // Top face: (x, y, +halfT) using the same winding
        const topVerts = face.map(i => {
          const v = vertices_coords[i];
          return [v[0] + offset[0], v[1] + offset[1], (v[2] || 0) + offset[2]];
        });
        // Bottom face: (x, y, -halfT) with reversed winding (so its normal points down)
        const botVerts = face.map(i => {
          const v = vertices_coords[i];
          return [v[0] - offset[0], v[1] - offset[1], (v[2] || 0) - offset[2]];
        }).reverse();

        // Top fan triangulation
        for (const tri of this.fanTriangulateRange(face.length)) {
          const a = topVerts[tri[0]];
          const b = topVerts[tri[1]];
          const c = topVerts[tri[2]];
          triangles.push(this.makeTriangleFromPoints(a, b, c));
        }
        // Bottom fan triangulation (already reversed winding)
        for (const tri of this.fanTriangulateRange(face.length)) {
          const a = botVerts[tri[0]];
          const b = botVerts[tri[1]];
          const c = botVerts[tri[2]];
          triangles.push(this.makeTriangleFromPoints(a, b, c));
        }
        // Side faces: for each edge, a quad split into 2 triangles
        for (let i = 0; i < face.length; i++) {
          const j = (i + 1) % face.length;
          const tA = topVerts[i], tB = topVerts[j];
          const bA = botVerts[(face.length - i) % face.length];
          const bB = botVerts[(face.length - j) % face.length];
          // Two triangles per side quad
          triangles.push(this.makeTriangleFromPoints(tA, tB, bB));
          triangles.push(this.makeTriangleFromPoints(tA, bB, bA));
        }
      }
    } else {
      // 2D, no extrusion: still triangulate, but triangles are coplanar
      for (const face of faces_vertices) {
        for (const tri of this.fanTriangulate(face)) {
          triangles.push(this.makeTriangleFromIndices(vertices_coords, tri));
        }
      }
    }

    if (this.options.flipNormals) {
      for (const t of triangles) {
        t.normal = [-t.normal[0], -t.normal[1], -t.normal[2]];
        // Swap v2 and v3 to flip winding (cross product flips)
        [t.v2, t.v3] = [t.v3, t.v2];
      }
    }

    return triangles;
  }

  /**
   * Fan triangulation by vertex indices (for 3D inputs).
   */
  fanTriangulate(face) {
    if (!Array.isArray(face) || face.length < 3) return [];
    if (face.length === 3) return [[face[0], face[1], face[2]]];
    const tris = [];
    for (let i = 1; i < face.length - 1; i++) {
      tris.push([face[0], face[i], face[i + 1]]);
    }
    return tris;
  }

  /**
   * Fan triangulation by 0..N-1 index range (for 2D extrusion where we
   * already have the vertex array in order).
   */
  fanTriangulateRange(n) {
    if (n < 3) return [];
    const tris = [];
    for (let i = 1; i < n - 1; i++) {
      tris.push([0, i, i + 1]);
    }
    return tris;
  }

  /**
   * Build a triangle from vertex indices in a 3D vertex array.
   */
  makeTriangleFromIndices(vertices, tri) {
    const v1 = vertices[tri[0]];
    const v2 = vertices[tri[1]];
    const v3 = vertices[tri[2]];
    return this.makeTriangleFromPoints(
      [v1[0] || 0, v1[1] || 0, v1[2] || 0],
      [v2[0] || 0, v2[1] || 0, v2[2] || 0],
      [v3[0] || 0, v3[1] || 0, v3[2] || 0],
    );
  }

  /**
   * Build a { normal, v1, v2, v3 } record from 3 explicit points.
   * Normal = (v2-v1) × (v3-v1), right-hand rule.
   */
  makeTriangleFromPoints(v1, v2, v3) {
    const e1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
    const e2 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
    // Cross product e1 × e2
    let nx = e1[1] * e2[2] - e1[2] * e2[1];
    let ny = e1[2] * e2[0] - e1[0] * e2[2];
    let nz = e1[0] * e2[1] - e1[1] * e2[0];
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) {
      nx /= len; ny /= len; nz /= len;
    } else {
      // Degenerate triangle: assign a default normal (won't crash slicers)
      nx = 0; ny = 0; nz = 1;
    }
    return { normal: [nx, ny, nz], v1, v2, v3 };
  }

  // ────────────────────────────────────────────────────────────────────
  // Binary STL
  // ────────────────────────────────────────────────────────────────────
  toBinarySTL(triangles) {
    // 80-byte header + 4-byte uint32 triangle count + 50 bytes per triangle
    const header = Buffer.alloc(80);
    const name = (this.options.name || 'origami-fold').slice(0, 79);
    header.write(name, 0, 'utf8');
    // Triangle count
    const countBuf = Buffer.alloc(4);
    countBuf.writeUInt32LE(triangles.length, 0);
    // Body
    const body = Buffer.alloc(triangles.length * 50);
    let offset = 0;
    for (const t of triangles) {
      body.writeFloatLE(t.normal[0], offset);      offset += 4;
      body.writeFloatLE(t.normal[1], offset);      offset += 4;
      body.writeFloatLE(t.normal[2], offset);      offset += 4;
      body.writeFloatLE(t.v1[0], offset);          offset += 4;
      body.writeFloatLE(t.v1[1], offset);          offset += 4;
      body.writeFloatLE(t.v1[2], offset);          offset += 4;
      body.writeFloatLE(t.v2[0], offset);          offset += 4;
      body.writeFloatLE(t.v2[1], offset);          offset += 4;
      body.writeFloatLE(t.v2[2], offset);          offset += 4;
      body.writeFloatLE(t.v3[0], offset);          offset += 4;
      body.writeFloatLE(t.v3[1], offset);          offset += 4;
      body.writeFloatLE(t.v3[2], offset);          offset += 4;
      body.writeUInt16LE(0, offset);               offset += 2;  // attribute byte count
    }
    return Buffer.concat([header, countBuf, body]);
  }

  // ────────────────────────────────────────────────────────────────────
  // ASCII STL
  // ────────────────────────────────────────────────────────────────────
  toAsciiSTL(triangles) {
    const name = this.options.name || 'origami-fold';
    const lines = [`solid ${name}`];
    const f = (n) => n.toExponential ? n.toExponential(6) : Number(n).toExponential(6);
    for (const t of triangles) {
      lines.push(`  facet normal ${f(t.normal[0])} ${f(t.normal[1])} ${f(t.normal[2])}`);
      lines.push('    outer loop');
      lines.push(`      vertex ${f(t.v1[0])} ${f(t.v1[1])} ${f(t.v1[2])}`);
      lines.push(`      vertex ${f(t.v2[0])} ${f(t.v2[1])} ${f(t.v2[2])}`);
      lines.push(`      vertex ${f(t.v3[0])} ${f(t.v3[1])} ${f(t.v3[2])}`);
      lines.push('    endloop');
      lines.push('  endfacet');
    }
    lines.push(`endsolid ${name}`);
    return lines.join('\n') + '\n';
  }
}

module.exports = { FoldSTLExporter };
