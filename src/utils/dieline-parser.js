/**
 * Dieline Parser - Parse packaging dieline files (PDF/EPS/AI) and convert to FOLD format
 *
 * Extracts cutting lines from dieline files and converts them to origami FOLD format
 * for use with OrigamiSimulator or our rendering pipeline.
 */

const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');

class DielineParser {
  constructor(options = {}) {
    this.options = {
      scale: options.scale || 1, // pixels to origami units
      debug: options.debug || false,
    };
    this.paths = [];
    this.boundary = null;
  }

  /**
   * Parse a dieline file (auto-detect format)
   * @param {string} filePath - Path to dieline file
   * @returns {Promise<Object>} Parsed dieline data
   */
  async parse(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.pdf':
        return await this.parsePDF(filePath);
      case '.eps':
      case '.ai':
        return await this.parseEPS(filePath);
      case '.svg':
        return await this.parseSVG(filePath);
      case '.fold':
        return await this.parseFOLD(filePath);
      default:
        throw new Error(`Unsupported file format: ${ext}`);
    }
  }

  /**
   * Parse PDF dieline file
   * @param {string} filePath - Path to PDF file
   * @returns {Promise<Object>} Parsed dieline in FOLD format
   */
  async parsePDF(filePath) {
    const buffer = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(buffer);

    const pages = pdfDoc.getPages();
    const results = [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const { width, height } = page.getSize();

      // Create dieline from page bounding box
      // Note: Real PDF path extraction requires pdf-parse or custom parser
      // For now, we create a box from the page dimensions
      const scale = this.options.scale || 100;
      const w = width / scale;
      const h = height / scale;

      const dieline = {
        file_spec: 1.1,
        file_creator: 'OrigamiSimulator CLI Dieline Parser',
        file_classes: ['singleModel'],
        frame_title: `Dieline Page ${i + 1}`,
        pageWidth: width,
        pageHeight: height,
        vertices_coords: [
          [0, 0, 0],
          [w, 0, 0],
          [w, h, 0],
          [0, h, 0],
        ],
        edges_vertices: [[0, 1], [1, 2], [2, 3], [3, 0]],
        faces_vertices: [[0, 1, 2, 3]],
        edges_assignment: ['B', 'B', 'B', 'B'],
        edges_foldAngle: [0, 0, 0, 0],
      };

      results.push(dieline);

      if (this.options.debug) {
        console.log(`Parsed PDF page ${i + 1}: ${width}x${height}`);
      }
    }

    return results.length === 1 ? results[0] : results;
  }

  /**
   * Parse EPS/AI file (PostScript based)
   * @param {string} filePath - Path to EPS/AI file
   * @returns {Promise<Object>} Parsed dieline in FOLD format
   */
  async parseEPS(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Extract bounding box
    const bboxMatch = content.match(/%%BoundingBox:\s*(-?\d+)\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/);

    let width, height, minX, minY;

    if (bboxMatch) {
      minX = parseInt(bboxMatch[1]);
      minY = parseInt(bboxMatch[2]);
      const maxX = parseInt(bboxMatch[3]);
      const maxY = parseInt(bboxMatch[4]);
      width = maxX - minX;
      height = maxY - minY;
    } else {
      // Default to A4 size
      width = 595;
      height = 842;
      minX = 0;
      minY = 0;
    }

    // Extract path commands (M, L, C, Z)
    const pathCommands = this.extractPathCommands(content);

    if (this.options.debug) {
      console.log(`Parsed EPS: ${width}x${height}, ${pathCommands.length} path commands`);
    }

    // Generate FOLD structure from paths
    return this.commandsToFold(pathCommands, width, height);
  }

  /**
   * Parse SVG file
   * @param {string} filePath - Path to SVG file
   * @returns {Promise<Object>} Parsed dieline in FOLD format
   */
  async parseSVG(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Extract viewBox
    const viewBoxMatch = content.match(/viewBox=["']([^"']+)["']/);
    let width = 100;
    let height = 100;

    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].split(/\s+/);
      width = parseFloat(parts[2]);
      height = parseFloat(parts[3]);
    } else {
      // Try to get width/height attributes
      const widthMatch = content.match(/width=["']([^"']+)["']/);
      const heightMatch = content.match(/height=["']([^"']+)["']/);
      if (widthMatch) width = parseFloat(widthMatch[1]);
      if (heightMatch) height = parseFloat(heightMatch[1]);
    }

    // Extract paths from SVG
    const paths = this.extractSVGPaths(content);

    if (this.options.debug) {
      console.log(`Parsed SVG: ${width}x${height}, ${paths.length} paths`);
    }

    // Convert SVG paths to FOLD
    return this.svgPathsToFold(paths, width, height);
  }

  /**
   * Parse existing FOLD file
   * @param {string} filePath - Path to FOLD file
   * @returns {Promise<Object>} FOLD data
   */
  async parseFOLD(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  }

  /**
   * Generate box vertices from dimensions
   * @param {number} width - Box width
   * @param {number} height - Box height
   * @returns {Array} Array of [x, y, z] coordinates
   */
  generateBoxVertices(width, height) {
    // Scale down for origami coordinates
    const scale = this.options.scale;
    const w = width / scale;
    const h = height / scale;

    return [
      [0, 0, 0],
      [w, 0, 0],
      [w, h, 0],
      [0, h, 0],
    ];
  }

  /**
   * Extract path commands from PostScript content
   * @param {string} content - EPS/PS content
   * @returns {Array} Array of path command objects
   */
  extractPathCommands(content) {
    const commands = [];

    // Match moveto, lineto, curveto, closepath
    const movetoRegex = /([\d.\-]+)\s+([\d.\-]+)\s+m/g;
    const linetoRegex = /([\d.\-]+)\s+([\d.\-]+)\s+l/g;
    const curvetoRegex = /([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+c/g;
    const closepathRegex = /h/g;

    let match;

    while ((match = movetoRegex.exec(content)) !== null) {
      commands.push({ type: 'M', x: parseFloat(match[1]), y: parseFloat(match[2]) });
    }

    while ((match = linetoRegex.exec(content)) !== null) {
      commands.push({ type: 'L', x: parseFloat(match[1]), y: parseFloat(match[2]) });
    }

    while ((match = curvetoRegex.exec(content)) !== null) {
      commands.push({
        type: 'C',
        x1: parseFloat(match[1]),
        y1: parseFloat(match[2]),
        x2: parseFloat(match[3]),
        y2: parseFloat(match[4]),
        x: parseFloat(match[5]),
        y: parseFloat(match[6])
      });
    }

    while ((match = closepathRegex.exec(content)) !== null) {
      commands.push({ type: 'Z' });
    }

    return commands;
  }

  /**
   * Extract path elements from SVG content
   * @param {string} content - SVG content
   * @returns {Array} Array of path d attribute strings
   */
  extractSVGPaths(content) {
    const paths = [];
    const pathRegex = /<path[^>]+d=["']([^"']+)["']/g;
    let match;

    while ((match = pathRegex.exec(content)) !== null) {
      paths.push(match[1]);
    }

    return paths;
  }

  /**
   * Convert SVG path data to FOLD format
   * @param {Array} paths - Array of SVG path d attributes
   * @param {number} width - SVG width
   * @param {number} height - SVG height
   * @returns {Object} FOLD format object
   */
  svgPathsToFold(paths, width, height) {
    const vertices = [];
    const edges = [];
    const scale = this.options.scale || 100;

    // Simple approach: create vertices from path coordinates
    let vertexIndex = 0;
    const vertexMap = new Map();

    for (const pathData of paths) {
      const commands = this.parseSVGPath(pathData);

      for (const cmd of commands) {
        const key = `${cmd.x},${cmd.y}`;

        if (!vertexMap.has(key)) {
          vertexMap.set(key, vertexIndex++);
          vertices.push([cmd.x / scale, cmd.y / scale, 0]);
        }
      }
    }

    // Build edges from sequential vertices
    let prevIndex = null;
    for (const pathData of paths) {
      const commands = this.parseSVGPath(pathData);

      prevIndex = null;
      for (const cmd of commands) {
        const key = `${cmd.x},${cmd.y}`;
        const currentIndex = vertexMap.get(key);

        if (prevIndex !== null && currentIndex !== prevIndex) {
          edges.push([prevIndex, currentIndex]);
        }
        prevIndex = currentIndex;
      }
    }

    // Create faces from edges (simple triangulation)
    const faces = this.edgesToFaces(edges);

    return {
      file_spec: 1.1,
      file_creator: 'OrigamiSimulator CLI Dieline Parser',
      file_classes: ['singleModel'],
      frame_title: 'SVG Dieline',
      vertices_coords: vertices,
      edges_vertices: edges,
      faces_vertices: faces,
      edges_assignment: edges.map(() => 'B'),
      edges_foldAngle: edges.map(() => 0),
    };
  }

  /**
   * Parse SVG path data into commands
   * @param {string} pathData - SVG path d attribute
   * @returns {Array} Array of command objects
   */
  parseSVGPath(pathData) {
    const commands = [];
    const tokens = pathData.trim().split(/(?=[MmLlHhVvCcSsQqTtAaZz])/);

    let currentX = 0;
    let currentY = 0;

    for (const token of tokens) {
      const type = token[0];
      const args = token.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));

      switch (type) {
        case 'M':
          currentX = args[0];
          currentY = args[1];
          commands.push({ type: 'M', x: currentX, y: currentY });
          break;
        case 'm':
          currentX += args[0];
          currentY += args[1];
          commands.push({ type: 'M', x: currentX, y: currentY });
          break;
        case 'L':
          currentX = args[0];
          currentY = args[1];
          commands.push({ type: 'L', x: currentX, y: currentY });
          break;
        case 'l':
          currentX += args[0];
          currentY += args[1];
          commands.push({ type: 'L', x: currentX, y: currentY });
          break;
        case 'H':
          currentX = args[0];
          commands.push({ type: 'L', x: currentX, y: currentY });
          break;
        case 'h':
          currentX += args[0];
          commands.push({ type: 'L', x: currentX, y: currentY });
          break;
        case 'V':
          currentY = args[0];
          commands.push({ type: 'L', x: currentX, y: currentY });
          break;
        case 'v':
          currentY += args[0];
          commands.push({ type: 'L', x: currentX, y: currentY });
          break;
        case 'C':
          commands.push({ type: 'C', x1: args[0], y1: args[1], x2: args[2], y2: args[3], x: args[4], y: args[5] });
          currentX = args[4];
          currentY = args[5];
          break;
        case 'c':
          commands.push({ type: 'C', x1: currentX + args[0], y1: currentY + args[1], x2: currentX + args[2], y2: currentY + args[3], x: currentX + args[4], y: currentY + args[5] });
          currentX += args[4];
          currentY += args[5];
          break;
        case 'Z':
        case 'z':
          commands.push({ type: 'Z' });
          break;
      }
    }

    return commands;
  }

  /**
   * Convert path commands to FOLD format
   * @param {Array} commands - Path commands
   * @param {number} width - Bounding box width
   * @param {number} height - Bounding box height
   * @returns {Object} FOLD format object
   */
  commandsToFold(commands, width, height) {
    const scale = this.options.scale || 100;

    // Extract unique vertices
    const vertexSet = new Map();
    let vertexIndex = 0;

    for (const cmd of commands) {
      if (cmd.x !== undefined && cmd.y !== undefined) {
        const key = `${Math.round(cmd.x)},${Math.round(cmd.y)}`;
        if (!vertexSet.has(key)) {
          vertexSet.set(key, vertexIndex++);
        }
      }
    }

    const vertices = [];
    for (const [key, idx] of vertexSet) {
      const [x, y] = key.split(',').map(parseFloat);
      vertices[idx] = [x / scale, y / scale, 0];
    }

    // Build edges from sequential commands
    const edges = [];
    let prevVertex = null;

    for (const cmd of commands) {
      if (cmd.x !== undefined && cmd.y !== undefined) {
        const key = `${Math.round(cmd.x)},${Math.round(cmd.y)}`;
        const currentVertex = vertexSet.get(key);

        if (prevVertex !== null && currentVertex !== prevVertex) {
          edges.push([prevVertex, currentVertex]);
        }
        prevVertex = currentVertex;
      } else if (cmd.type === 'Z') {
        prevVertex = null; // Reset for closed paths
      }
    }

    // Create faces
    const faces = this.edgesToFaces(edges);

    return {
      file_spec: 1.1,
      file_creator: 'OrigamiSimulator CLI Dieline Parser',
      file_classes: ['singleModel'],
      frame_title: 'EPS Dieline',
      vertices_coords: vertices,
      edges_vertices: edges,
      faces_vertices: faces,
      edges_assignment: edges.map(() => 'B'),
      edges_foldAngle: edges.map(() => 0),
    };
  }

  /**
   * Convert edges to faces using simple ear triangulation
   * @param {Array} edges - Array of edge vertex pairs
   * @returns {Array} Array of face vertex arrays
   */
  edgesToFaces(edges) {
    // Simple approach: create one face from all vertices if they're a loop
    if (edges.length < 3) {
      return [];
    }

    // Build adjacency list
    const adjacency = new Map();
    for (const [a, b] of edges) {
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      if (!adjacency.has(b)) adjacency.set(b, new Set());
      adjacency.get(a).add(b);
      adjacency.get(b).add(a);
    }

    // Find the outer cycle using BFS
    const visited = new Set();
    const cycle = [];

    if (edges.length > 0) {
      let start = edges[0][0];
      let current = start;

      do {
        cycle.push(current);
        visited.add(current);

        const neighbors = adjacency.get(current) || new Set();
        let next = null;
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            next = neighbor;
            break;
          }
        }
        current = next;
      } while (current !== null && current !== start && cycle.length < edges.length);
    }

    return cycle.length >= 3 ? [cycle] : [];
  }

  /**
   * Export dieline to FOLD format
   * @param {string} outputPath - Output file path
   * @param {Object} foldData - FOLD format data
   */
  exportToFold(outputPath, foldData) {
    const json = JSON.stringify(foldData, null, 2);
    fs.writeFileSync(outputPath, json);

    if (this.options.debug) {
      console.log(`Exported FOLD: ${outputPath}`);
    }
  }

  /**
   * Export dieline to SVG format
   * @param {string} outputPath - Output file path
   * @param {Object} foldData - FOLD format data
   */
  exportToSVG(outputPath, foldData) {
    const { vertices_coords, edges_vertices } = foldData;

    let paths = '';
    for (const [start, end] of edges_vertices) {
      const [x1, y1] = vertices_coords[start];
      const [x2, y2] = vertices_coords[end];
      paths += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="black" stroke-width="0.5"/>`;
    }

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  ${paths}
</svg>`;

    fs.writeFileSync(outputPath, svg);

    if (this.options.debug) {
      console.log(`Exported SVG: ${outputPath}`);
    }
  }

  /**
   * Validate that a file is a supported dieline format
   * @param {string} filePath - Path to file
   * @returns {boolean} True if valid dieline file
   */
  static isValidDielineFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return ['.pdf', '.eps', '.ai', '.svg', '.fold'].includes(ext);
  }
}

module.exports = DielineParser;
module.exports.DielineParser = DielineParser;