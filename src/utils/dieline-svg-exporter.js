/**
 * Dieline SVG Exporter
 * Exports FOLD dielines as printable SVG files with proper cut/fold annotations
 *
 * SVG output conventions:
 * - Red dashed lines: Mountain folds (M)
 * - Blue dashed lines: Valley folds (V)
 * - Solid black lines: Cut boundaries (B)
 * - Dimensions in mm with proper margins
 */

class DielineSVGExporter {
  constructor(options = {}) {
    this.options = {
      // SVG dimensions
      width: options.width || 800,
      height: options.height || 600,
      margin: options.margin || 20,        // mm
      dpi: options.dpi || 96,             // Display DPI

      // Style options
      cutColor: options.cutColor || '#000000',
      cutWidth: options.cutWidth || 0.5,
      mountainColor: options.mountainColor || '#ff0000',
      mountainWidth: options.mountainWidth || 0.3,
      valleyColor: options.valleyColor || '#0066cc',
      valleyWidth: options.valleyWidth || 0.3,

      // Annotations
      showDimensions: options.showDimensions !== false,
      showLabels: options.showLabels !== false,
      showTitle: options.showTitle !== false,

      // Debug
      debug: options.debug || false,
    };
  }

  /**
   * Export dieline to SVG
   * @param {Object} dieline - FOLD format dieline
   * @returns {string} SVG content
   */
  export(dieline) {
    const { vertices_coords, edges_vertices, edges_assignment, box_dimensions, frame_title } = dieline;

    // Calculate bounding box
    const bounds = this.calculateBounds(vertices_coords);
    const padding = 20; // SVG padding
    const scale = this.calculateScale(bounds, padding);

    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.options.width} ${this.options.height}" width="${this.options.width}" height="${this.options.height}">
  <style>
    .cut-line { stroke: ${this.options.cutColor}; stroke-width: ${this.options.cutWidth}; fill: none; stroke-linecap: round; }
    .mountain-line { stroke: ${this.options.mountainColor}; stroke-width: ${this.options.mountainWidth}; fill: none; stroke-dasharray: 4,2; stroke-linecap: round; }
    .valley-line { stroke: ${this.options.valleyColor}; stroke-width: ${this.options.valleyWidth}; fill: none; stroke-dasharray: 2,2; stroke-linecap: round; }
    .label { font-family: Arial, sans-serif; font-size: 10px; fill: #333; }
    .title { font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; fill: #000; }
    .dimension { font-family: Arial, sans-serif; font-size: 9px; fill: #666; font-style: italic; }
  </style>
  <rect width="100%" height="100%" fill="white"/>
`;

    // Add title
    if (this.options.showTitle && frame_title) {
      svg += `  <text class="title" x="${padding}" y="${padding}">${frame_title}</text>\n`;
      svg += `  <text class="label" x="${padding}" y="${padding + 15}">Dieline: Cut solid black, Fold dashed (M=red M, V=blue V)</text>\n`;
    }

    // Group vertices
    svg += `  <g transform="translate(${padding + 50},${padding + 50}) scale(${scale}, ${scale})">\n`;

    // Draw faces (light gray fill)
    if (dieline.faces_vertices && dieline.faces_vertices.length > 0) {
      for (const face of dieline.faces_vertices) {
        const points = face.map(idx => {
          const v = vertices_coords[idx];
          return `${v[0]},${v[1]}`;
        }).join(' ');
        svg += `    <polygon points="${points}" fill="#f0f0f0" stroke="none" opacity="0.5"/>\n`;
      }
    }

    // Draw edges
    for (let i = 0; i < edges_vertices.length; i++) {
      const [a, b] = edges_vertices[i];
      const assignment = edges_assignment ? edges_assignment[i] : 'B';
      const v1 = vertices_coords[a];
      const v2 = vertices_coords[b];

      const className = this.getEdgeClass(assignment);
      svg += `    <line class="${className}" x1="${v1[0]}" y1="${v1[1]}" x2="${v2[0]}" y2="${v2[1]}" />\n`;
    }

    svg += `  </g>\n`;

    // Add legend
    if (this.options.showLabels) {
      svg += this.renderLegend(padding);
    }

    // Add dimensions
    if (this.options.showDimensions && box_dimensions) {
      svg += this.renderDimensions(box_dimensions, padding);
    }

    svg += `</svg>`;

    return svg;
  }

  /**
   * Get CSS class name for edge based on assignment
   */
  getEdgeClass(assignment) {
    switch (assignment) {
      case 'M': return 'mountain-line';
      case 'V': return 'valley-line';
      case 'B': return 'cut-line';
      case 'F': return 'cut-line'; // Flat fold = treat as cut
      default: return 'cut-line';
    }
  }

  /**
   * Calculate bounding box of vertices
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

  /**
   * Calculate scale to fit SVG
   */
  calculateScale(bounds, padding) {
    const availableWidth = this.options.width - 2 * padding - 100; // 100 for legend
    const availableHeight = this.options.height - 2 * padding;

    const scaleX = availableWidth / bounds.width;
    const scaleY = availableHeight / bounds.height;

    return Math.min(scaleX, scaleY);
  }

  /**
   * Render legend
   */
  renderLegend(padding) {
    const x = this.options.width - 130;
    const y = padding + 30;

    return `  <g>
    <rect x="${x}" y="${y - 15}" width="120" height="80" fill="white" stroke="#ccc"/>
    <text class="label" x="${x + 5}" y="${y}">Legend:</text>
    <line class="cut-line" x1="${x + 5}" y1="${y + 12}" x2="${x + 30}" y2="${y + 12}"/>
    <text class="label" x="${x + 35}" y="${y + 15}">Cut line (B)</text>
    <line class="mountain-line" x1="${x + 5}" y1="${y + 27}" x2="${x + 30}" y2="${y + 27}"/>
    <text class="label" x="${x + 35}" y="${y + 30}">Mountain (M)</text>
    <line class="valley-line" x1="${x + 5}" y1="${y + 42}" x2="${x + 30}" y2="${y + 42}"/>
    <text class="label" x="${x + 35}" y="${y + 45}">Valley (V)</text>
  </g>
`;
  }

  /**
   * Render dimensions
   */
  renderDimensions(dimensions, padding) {
    let result = '';
    const y = this.options.height - padding;

    if (dimensions.width) {
      result += `  <text class="dimension" x="${padding}" y="${y}">Width: ${dimensions.width}mm</text>\n`;
    }
    if (dimensions.height) {
      result += `  <text class="dimension" x="${padding + 100}" y="${y}">Height: ${dimensions.height}mm</text>\n`;
    }
    if (dimensions.depth || dimensions.diameter) {
      const dim = dimensions.depth || dimensions.diameter;
      result += `  <text class="dimension" x="${padding + 220}" y="${y}">Depth/⌀: ${dim}mm</text>\n`;
    }
    if (dimensions.thickness) {
      result += `  <text class="dimension" x="${padding + 360}" y="${y}">Thickness: ${dimensions.thickness}mm</text>\n`;
    }

    return result;
  }
}

module.exports = { DielineSVGExporter };
module.exports.DielineSVGExporter = DielineSVGExporter;
