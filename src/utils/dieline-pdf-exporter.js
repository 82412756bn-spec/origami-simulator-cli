/**
 * Dieline PDF Exporter
 * Exports FOLD dielines as PDF cut-pattern sheets for laser cutters / print.
 *
 * PDF output conventions (matches DielineSVGExporter for parity):
 * - Black solid lines:     boundary cuts (B)
 * - Red dashed lines:      mountain folds (M)
 * - Blue dashed lines:     valley folds (V)
 * - Page size:             configurable (A4 default, landscape if wider than tall)
 * - Units:                 millimeters (PDF default; we use 1 unit = 1mm)
 *
 * Uses pdf-lib (already a dep for dieline-parser) — no new dependencies.
 */

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

class DielinePDFExporter {
  constructor(options = {}) {
    this.options = {
      // Page dimensions in mm. Defaults: A4 (210 × 297)
      pageWidth: options.pageWidth || 210,
      pageHeight: options.pageHeight || 297,
      margin: options.margin || 10,        // mm

      // Colors
      cutColor: options.cutColor || rgb(0, 0, 0),
      mountainColor: options.mountainColor || rgb(0.8, 0, 0),
      valleyColor: options.valleyColor || rgb(0, 0.4, 0.8),

      // Line widths in mm (converted to PDF points: 1mm ≈ 2.835pt)
      cutWidth: options.cutWidth || 0.4,
      mountainWidth: options.mountainWidth || 0.25,
      valleyWidth: options.valleyWidth || 0.25,

      // Dash pattern (in PDF points)
      dashOn: options.dashOn || 4,
      dashOff: options.dashOff || 2,

      // Annotations
      showTitle: options.showTitle !== false,
      showLegend: options.showLegend !== false,
      title: options.title || '',

      // Auto-detect landscape if model is wider than tall
      autoOrient: options.autoOrient !== false,

      // Debug
      debug: options.debug || false,
    };
  }

  // mm → PDF points (1pt = 1/72 in, 1in = 25.4mm)
  static mmToPt(mm) { return mm * 72 / 25.4; }

  /**
   * Export FOLD to a PDF byte array.
   * @param {Object} fold - FOLD format object
   * @returns {Promise<Uint8Array>} PDF bytes
   */
  async export(fold) {
    if (!fold || !fold.vertices_coords || !fold.edges_vertices) {
      throw new Error('Invalid FOLD object: missing vertices_coords or edges_vertices');
    }
    const { vertices_coords, edges_vertices, edges_assignment = [], faces_vertices = [], frame_title } = fold;

    // Compute bounds
    const bounds = this.calculateBounds(vertices_coords);
    let { pageWidth, pageHeight } = this.options;
    if (this.options.autoOrient && bounds.width > bounds.height) {
      [pageWidth, pageHeight] = [pageHeight, pageWidth];
    }

    const margin = this.options.margin;
    const drawW = pageWidth - 2 * margin;
    const drawH = pageHeight - 2 * margin;

    // Compute scale to fit the model in the drawable area
    const scaleX = drawW / bounds.width;
    const scaleY = drawH / bounds.height;
    const scale = Math.min(scaleX, scaleY);

    // Offset to center the model in the drawable area
    const offsetX = margin + (drawW - bounds.width * scale) / 2;
    const offsetY = margin + (drawH - bounds.height * scale) / 2;

    // Build PDF
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([this.constructor.mmToPt(pageWidth), this.constructor.mmToPt(pageHeight)]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);

    // Title
    if (this.options.showTitle) {
      const title = this.options.title || frame_title || 'FOLD Dieline';
      page.drawText(title, {
        x: this.constructor.mmToPt(margin),
        y: this.constructor.mmToPt(pageHeight - margin / 2),
        size: 12,
        font,
        color: rgb(0, 0, 0),
      });
    }

    // Helper: transform model coords → PDF coords
    //   - PDF y-axis is bottom-up; model y-axis is typically top-down
    //   - We flip y here so the model appears right-side up
    const tx = (mx, my) => ({
      x: this.constructor.mmToPt(offsetX + (mx - bounds.minX) * scale),
      y: this.constructor.mmToPt(offsetY + (bounds.maxY - my) * scale),  // flip
    });

    // Draw face fills (light gray, optional)
    if (faces_vertices && faces_vertices.length > 0) {
      for (const face of faces_vertices) {
        if (face.length < 3) continue;
        // Build an SVG-style path string for pdf-lib's drawSvgPath
        let pathStr = '';
        for (let i = 0; i < face.length; i++) {
          const v = vertices_coords[face[i]];
          const p = tx(v[0], v[1]);
          pathStr += `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(3)} ${p.y.toFixed(3)} `;
        }
        pathStr += 'Z';
        page.drawSvgPath(pathStr, {
          color: rgb(0.85, 0.85, 0.85),
          opacity: 0.5,
        });
      }
    }

    // Draw edges, color-coded by assignment
    for (let i = 0; i < edges_vertices.length; i++) {
      const [a, b] = edges_vertices[i];
      const v1 = vertices_coords[a];
      const v2 = vertices_coords[b];
      const p1 = tx(v1[0], v1[1]);
      const p2 = tx(v2[0], v2[1]);
      const assignment = edges_assignment[i] || 'B';

      let color, width, dash;
      switch (assignment) {
        case 'M':
          color = this.options.mountainColor;
          width = this.constructor.mmToPt(this.options.mountainWidth);
          dash = { dashArray: [this.options.dashOn, this.options.dashOff] };
          break;
        case 'V':
          color = this.options.valleyColor;
          width = this.constructor.mmToPt(this.options.valleyWidth);
          dash = { dashArray: [this.options.dashOn, this.options.dashOff] };
          break;
        case 'B':
        default:
          color = this.options.cutColor;
          width = this.constructor.mmToPt(this.options.cutWidth);
          dash = {};  // solid
      }

      page.drawLine({
        start: p1,
        end: p2,
        thickness: width,
        color,
        ...dash,
      });
    }

    // Legend (bottom-left)
    if (this.options.showLegend) {
      const legendY = this.constructor.mmToPt(margin / 2);
      const items = [
        { label: 'Cut (B)', color: this.options.cutColor, dash: false },
        { label: 'Mountain (M)', color: this.options.mountainColor, dash: true },
        { label: 'Valley (V)', color: this.options.valleyColor, dash: true },
      ];
      let lx = this.constructor.mmToPt(margin);
      for (const item of items) {
        page.drawLine({
          start: { x: lx, y: legendY },
          end: { x: lx + 12, y: legendY },
          thickness: 0.5,
          color: item.color,
          ...(item.dash ? { dashArray: [this.options.dashOn, this.options.dashOff] } : {}),
        });
        page.drawText(item.label, {
          x: lx + 15,
          y: legendY - 2,
          size: 7,
          font,
          color: rgb(0, 0, 0),
        });
        lx += 60;
      }
    }

    return pdf.save();
  }

  /**
   * Calculate bounding box of vertices (assumes 2D coordinates in mm).
   */
  calculateBounds(vertices) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const v of vertices) {
      minX = Math.min(minX, v[0]);
      minY = Math.min(minY, v[1]);
      maxX = Math.max(maxX, v[0]);
      maxY = Math.max(maxY, v[1]);
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }
}

module.exports = { DielinePDFExporter };
