/**
 * WebSocket Fold Streaming (v2.36)
 *
 * Minimal WebSocket server for streaming fold simulation frames in real-time.
 * NO new dependencies — uses Node's built-in http upgrade + manual WebSocket
 * protocol implementation. Supports:
 *   - RFC 6455 handshake (Sec-WebSocket-Accept)
 *   - Text frames (opcode 0x1), client→server frames are mask-decoded
 *   - Close frames (opcode 0x8) for clean shutdown
 *   - No fragmentation, no ping/pong, no binary frames (we only need JSON text)
 *
 * Protocol:
 *   1. Client opens WebSocket to GET /api/v1/ws/fold
 *   2. Server sends 101 Switching Protocols
 *   3. Client sends first text frame: {"fold": {...FOLD...}, "options": {...}}
 *   4. Server runs fold simulation, streams text frames:
 *      {"type": "frame", "index": N, "percent": P, "vertices": [...]}
 *      {"type": "done", "totalFrames": N, "computeTimeMs": T}
 *   5. Either side can close to terminate
 *
 * Frame format (text):
 *   All text frames are JSON. Server ignores masking (it's only for client→server).
 */

const crypto = require('crypto');
const { FoldSimulator } = require('../utils/fold-simulator');
const { SpringMassSolver } = require('../utils/spring-mass-solver');

/**
 * Handle a WebSocket upgrade request. Returns true if handled, false if not.
 */
function handleWebSocketUpgrade(req, socket, head, server) {
  if (req.url !== '/api/v1/ws/fold') return false;
  if (req.headers.upgrade !== 'websocket') return false;

  // 1. Compute Sec-WebSocket-Accept
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return true;
  }
  const accept = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  // 2. Handshake response
  socket.write('HTTP/1.1 101 Switching Protocols\r\n');
  socket.write('Upgrade: websocket\r\n');
  socket.write('Connection: Upgrade\r\n');
  socket.write(`Sec-WebSocket-Accept: ${accept}\r\n`);
  socket.write('\r\n');

  // 3. Start fold-stream session
  startFoldSession(socket, server).catch((err) => {
    sendTextFrame(socket, JSON.stringify({ type: 'error', message: err.message }));
    closeFrame(socket);
  });

  return true;
}

/**
 * Run a fold simulation and stream frames over the WebSocket.
 */
async function startFoldSession(socket, _server) {
  let buffer = Buffer.alloc(0);

  // Wait for the client's first text frame (the FOLD + options)
  const firstFrame = await readTextFrame(socket, (chunk) => { buffer = chunk; });
  let payload;
  try {
    payload = JSON.parse(firstFrame);
  } catch (e) {
    sendTextFrame(socket, JSON.stringify({ type: 'error', message: 'Invalid JSON in first frame' }));
    closeFrame(socket);
    return;
  }

  if (!payload.fold) {
    sendTextFrame(socket, JSON.stringify({ type: 'error', message: 'Missing "fold" in first frame' }));
    closeFrame(socket);
    return;
  }

  const fold = payload.fold;
  const options = payload.options || {};
  const solver = options.solver || 'kinematic';
  const frameCount = options.frames || 20;
  const frameInterval = options.interval || 50;  // ms

  // Acknowledge
  sendTextFrame(socket, JSON.stringify({
    type: 'ack',
    solver,
    frames: frameCount,
  }));

  // Build solver
  let sim;
  if (solver === 'kinematic') {
    sim = new FoldSimulator(fold, {
      angle: options.angle || 90,
      rootFace: options.rootFace || 0,
    });
  } else {
    sim = new SpringMassSolver(fold, {
      foldAngle: options.angle || 90,
      rootFace: options.rootFace || 0,
      cyclic: solver === 'spring-mass-cyclic',
      maxIterations: options.iterations || 100,
    });
  }

  const t0 = Date.now();
  let aborted = false;

  // Handle socket close
  socket.on('close', () => { aborted = true; });
  socket.on('error', () => { aborted = true; });

  for (let i = 0; i < frameCount; i++) {
    if (aborted) break;
    const pct = frameCount === 1 ? 1.0 : i / (frameCount - 1);
    const result = sim.simulate(pct);

    // Send frame
    const frame = {
      type: 'frame',
      index: i,
      percent: pct,
      vertices: result.vertices_coords,
      edges: fold.edges_vertices || [],
      edges_assignment: fold.edges_assignment || [],
      faces: fold.faces_vertices || [],
    };
    sendTextFrame(socket, JSON.stringify(frame));

    // Wait for next frame interval
    await sleep(frameInterval);
  }

  if (!aborted) {
    sendTextFrame(socket, JSON.stringify({
      type: 'done',
      totalFrames: frameCount,
      computeTimeMs: Date.now() - t0,
    }));
    closeFrame(socket);
  }
}

// ────────────────────────────────────────────────────────────────────
// WebSocket frame protocol (text frames only, no fragmentation)
// ────────────────────────────────────────────────────────────────────

/**
 * Send a text frame to the client.
 */
function sendTextFrame(socket, text) {
  if (socket.destroyed || !socket.writable) return;
  const data = Buffer.from(text, 'utf8');
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;  // FIN + text opcode
    header[1] = len;     // server→client frames are NOT masked
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  try {
    socket.write(Buffer.concat([header, data]));
  } catch (e) {
    // Socket may be closed; ignore
  }
}

/**
 * Send a close frame.
 */
function closeFrame(socket) {
  if (socket.destroyed || !socket.writable) return;
  try {
    const close = Buffer.from([0x88, 0x00]);  // FIN + close, no payload
    socket.write(close);
    socket.end();
  } catch (e) {
    // ignore
  }
}

/**
 * Read a single text frame from the client. Returns the decoded UTF-8 text.
 * Accumulates data via the onData callback.
 */
function readTextFrame(socket, onData) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    let resolved = false;

    const onDataHandler = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (onData) onData(buffer);
      // Try to parse a frame
      const parsed = tryParseFrame(buffer);
      if (parsed && !resolved) {
        resolved = true;
        socket.removeListener('data', onDataHandler);
        socket.removeListener('error', onErrorHandler);
        socket.removeListener('close', onCloseHandler);
        if (parsed.opcode === 0x8) {
          // Close frame
          closeFrame(socket);
          resolve(null);
        } else if (parsed.opcode === 0x1) {
          resolve(parsed.payload);
        } else {
          reject(new Error(`Unsupported opcode: ${parsed.opcode}`));
        }
      }
    };

    const onErrorHandler = (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    };

    const onCloseHandler = () => {
      if (!resolved) {
        resolved = true;
        reject(new Error('Socket closed before frame received'));
      }
    };

    socket.on('data', onDataHandler);
    socket.on('error', onErrorHandler);
    socket.on('close', onCloseHandler);
  });
}

/**
 * Try to parse a WebSocket frame from a buffer. Returns null if incomplete.
 */
function tryParseFrame(buffer) {
  if (buffer.length < 2) return null;
  const opcode = buffer[0] & 0x0f;
  const masked = (buffer[1] & 0x80) !== 0;
  let len = buffer[1] & 0x7f;
  let offset = 2;
  if (len === 126) {
    if (buffer.length < 4) return null;
    len = buffer.readUInt16BE(2);
    offset = 4;
  } else if (len === 127) {
    if (buffer.length < 10) return null;
    len = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }
  let mask;
  if (masked) {
    if (buffer.length < offset + 4) return null;
    mask = buffer.slice(offset, offset + 4);
    offset += 4;
  }
  if (buffer.length < offset + len) return null;
  const payload = Buffer.from(buffer.slice(offset, offset + len));
  if (masked && mask) {
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= mask[i % 4];
    }
  }
  return { opcode, payload: payload.toString('utf8') };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { handleWebSocketUpgrade, sendTextFrame, closeFrame, tryParseFrame };
