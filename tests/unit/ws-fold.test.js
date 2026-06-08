/**
 * Unit tests for v2.36 WebSocket fold streaming
 *
 * Uses a minimal WebSocket client (RFC 6455 text-frame protocol) to
 * avoid a new `ws` dependency. Tests verify:
 *   - HTTP upgrade handshake
 *   - First-frame JSON parsing
 *   - Frame stream (ack → N frames → done)
 *   - Error handling (invalid JSON, missing fold)
 *   - Unknown WS path returns 404
 */

const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { OrigamiAPIServer } = require('../../src/api/server');
const { sendTextFrame, tryParseFrame, handleWebSocketUpgrade } = require('../../src/api/ws-fold');

const CLI_PATH = path.join(__dirname, '../../src/index.js');
const TEST_PORT = 19200 + Math.floor(Math.random() * 100);

const TETRA_FOLD = {
  file_spec: 1.1,
  vertices_coords: [[0, 0, 0], [10, 0, 0], [5, 10, 0], [5, 5, 5]],
  edges_vertices: [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]],
  edges_assignment: ['B', 'B', 'B', 'M', 'M', 'V'],
  faces_vertices: [[0, 1, 2], [0, 1, 3], [1, 2, 3], [2, 0, 3]],
};

// ────────────────────────────────────────────────────────────────────
// Minimal WebSocket client (no new deps)
// ────────────────────────────────────────────────────────────────────

function wsRequest(path, firstText) {
  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    let buf = Buffer.alloc(0);
    let resolved = false;
    let serverMessages = [];
    let socket;

    const req = http.request({
      host: '127.0.0.1', port: TEST_PORT, path,
      headers: {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
      },
    });

    req.on('upgrade', (res, sock) => {
      socket = sock;
      // Send first frame
      if (firstText) {
        const payload = Buffer.from(firstText, 'utf8');
        const len = payload.length;
        let header;
        if (len < 126) { header = Buffer.alloc(2); header[0] = 0x81; header[1] = 0x80 | len; }
        else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
        else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(len), 2); }
        const mask = crypto.randomBytes(4);
        const masked = Buffer.alloc(len);
        for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
        socket.write(Buffer.concat([header, mask, masked]));
      }

      socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 2) {
          const op = buf[0] & 0x0f;
          let len = buf[1] & 0x7f;
          let off = 2;
          if (len === 126) { len = buf.readUInt16BE(2); off = 4; }
          if (buf.length < off + len) break;
          const payload = buf.slice(off, off + len).toString('utf8');
          buf = buf.slice(off + len);
          if (op === 0x1) {
            try { serverMessages.push(JSON.parse(payload)); } catch { /* ignore */ }
          } else if (op === 0x8) {
            if (!resolved) {
              resolved = true;
              resolve({ messages: serverMessages, socket });
            }
            return;
          }
        }
      });
    });

    req.on('response', (res) => {
      // Upgrade failed
      if (!resolved) {
        resolved = true;
        resolve({ httpResponse: res, messages: [], socket: null });
      }
    });

    req.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        if (socket) socket.destroy();
        reject(err);
      }
    });

    req.end();

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        if (socket) socket.destroy();
        resolve({ messages: serverMessages, socket, timeout: true });
      }
    }, 5000);
    // Clear timer if socket closes
    if (socket) {
      socket.on('close', () => clearTimeout(timer));
    } else {
      // Wait for response to set socket, then attach
      setImmediate(() => {
        if (socket) socket.on('close', () => clearTimeout(timer));
      });
    }
  });
}

// ────────────────────────────────────────────────────────────────────
// Frame protocol unit tests (no server needed)
// ────────────────────────────────────────────────────────────────────

describe('WebSocket frame protocol — tryParseFrame', () => {
  function buildFrame(payload, opcode = 0x1, masked = true) {
    const data = Buffer.from(payload, 'utf8');
    const len = data.length;
    let header;
    if (len < 126) { header = Buffer.alloc(2); header[0] = 0x80 | opcode; header[1] = (masked ? 0x80 : 0) | len; }
    else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = (masked ? 0x80 : 0) | 126; header.writeUInt16BE(len, 2); }
    else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = (masked ? 0x80 : 0) | 127; header.writeBigUInt64BE(BigInt(len), 2); }
    let result = header;
    if (masked) {
      const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
      const masked = Buffer.alloc(len);
      for (let i = 0; i < len; i++) masked[i] = data[i] ^ mask[i % 4];
      result = Buffer.concat([result, mask, masked]);
    } else {
      result = Buffer.concat([result, data]);
    }
    return result;
  }

  test('parses short masked text frame', () => {
    const frame = buildFrame('hello');
    const parsed = tryParseFrame(frame);
    expect(parsed.opcode).toBe(0x1);
    expect(parsed.payload).toBe('hello');
  });

  test('parses unmasked text frame (server→client)', () => {
    const frame = buildFrame('hello', 0x1, false);
    const parsed = tryParseFrame(frame);
    expect(parsed.opcode).toBe(0x1);
    expect(parsed.payload).toBe('hello');
  });

  test('parses medium-length frame (126-65535 bytes)', () => {
    const payload = 'x'.repeat(500);
    const frame = buildFrame(payload, 0x1, false);
    const parsed = tryParseFrame(frame);
    expect(parsed.payload).toBe(payload);
  });

  test('parses long frame (>65535 bytes)', () => {
    const payload = 'y'.repeat(70000);
    const frame = buildFrame(payload, 0x1, false);
    const parsed = tryParseFrame(frame);
    expect(parsed.payload).toBe(payload);
  });

  test('returns null for incomplete frame', () => {
    const frame = buildFrame('hello');
    const truncated = frame.slice(0, frame.length - 2);
    expect(tryParseFrame(truncated)).toBeNull();
  });

  test('parses close frame (opcode 0x8)', () => {
    const frame = buildFrame('', 0x8, false);
    const parsed = tryParseFrame(frame);
    expect(parsed.opcode).toBe(0x8);
    expect(parsed.payload).toBe('');
  });

  test('sendTextFrame produces valid server→client frame', () => {
    // Mock socket
    const writes = [];
    const mockSocket = {
      writable: true, destroyed: false,
      write: (chunk) => { writes.push(chunk); return true; },
    };
    sendTextFrame(mockSocket, 'test message');
    expect(writes.length).toBe(1);
    const written = writes[0];
    expect(written[0] & 0x0f).toBe(0x1);  // text opcode
    expect(written[1] & 0x80).toBe(0);       // NOT masked (server→client)
    const len = written[1] & 0x7f;
    expect(written.slice(2, 2 + len).toString('utf8')).toBe('test message');
  });
});

// ────────────────────────────────────────────────────────────────────
// WebSocket end-to-end tests (server boot + WS client)
// ────────────────────────────────────────────────────────────────────
describe('OrigamiAPIServer — WebSocket fold streaming', () => {
  let server;

  beforeAll(async () => {
    server = new OrigamiAPIServer({ port: TEST_PORT, host: '127.0.0.1', cliPath: CLI_PATH });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  test('GET /api/v1/ws/fold (no upgrade) → 404', async () => {
    const r = await new Promise((resolve) => {
      const req = http.request({
        host: '127.0.0.1', port: TEST_PORT, path: '/api/v1/ws/fold', method: 'GET',
      }, (res) => resolve({ status: res.statusCode }));
      req.on('error', () => resolve({ status: 0 }));
      req.end();
    });
    // Without Upgrade header, server should send 404
    expect([404, 426, 400]).toContain(r.status);  // 426 = Upgrade Required
  });

  test('Unknown WS path → 404', async () => {
    const key = crypto.randomBytes(16).toString('base64');
    const r = await new Promise((resolve) => {
      const req = http.request({
        host: '127.0.0.1', port: TEST_PORT, path: '/api/v1/ws/unknown',
        headers: { 'Upgrade': 'websocket', 'Connection': 'Upgrade', 'Sec-WebSocket-Key': key, 'Sec-WebSocket-Version': '13' },
      }, (res) => resolve({ status: res.statusCode }));
      req.on('error', () => resolve({ status: 0 }));
      req.end();
    });
    expect(r.status).toBe(404);
  });

  test('Successful fold streaming: ack + 5 frames + done', async () => {
    const r = await wsRequest('/api/v1/ws/fold', JSON.stringify({
      fold: TETRA_FOLD,
      options: { solver: 'kinematic', angle: 90, frames: 5, interval: 20 },
    }));

    const types = r.messages.map(m => m.type);
    expect(types[0]).toBe('ack');
    expect(types.filter(t => t === 'frame').length).toBe(5);
    expect(types[types.length - 1]).toBe('done');

    // The done message has totalFrames and computeTimeMs
    const done = r.messages.find(m => m.type === 'done');
    expect(done.totalFrames).toBe(5);
    expect(typeof done.computeTimeMs).toBe('number');

    // The frames have percent and vertices
    const frame0 = r.messages.find(m => m.type === 'frame' && m.index === 0);
    expect(frame0.percent).toBe(0);
    expect(Array.isArray(frame0.vertices)).toBe(true);
    expect(frame0.vertices.length).toBe(4);
  }, 10000);

  test('Error path: invalid JSON in first frame', async () => {
    const r = await wsRequest('/api/v1/ws/fold', 'not valid json {');
    const errMsg = r.messages.find(m => m.type === 'error');
    expect(errMsg).toBeDefined();
    expect(errMsg.message).toMatch(/Invalid JSON/);
  }, 10000);

  test('Error path: missing fold', async () => {
    const r = await wsRequest('/api/v1/ws/fold', JSON.stringify({ options: {} }));
    const errMsg = r.messages.find(m => m.type === 'error');
    expect(errMsg).toBeDefined();
    expect(errMsg.message).toMatch(/Missing "fold"/);
  }, 10000);

  test('Error path: missing fold (empty body)', async () => {
    const r = await wsRequest('/api/v1/ws/fold', JSON.stringify({}));
    const errMsg = r.messages.find(m => m.type === 'error');
    expect(errMsg).toBeDefined();
  }, 10000);
});

// ────────────────────────────────────────────────────────────────────
// Demo HTML page
// ────────────────────────────────────────────────────────────────────
describe('OrigamiAPIServer — WebSocket demo HTML', () => {
  let server;

  beforeAll(async () => {
    server = new OrigamiAPIServer({ port: TEST_PORT, host: '127.0.0.1', cliPath: CLI_PATH });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  test('GET /demo serves the WS client HTML', async () => {
    const r = await new Promise((resolve) => {
      const req = http.request({
        host: '127.0.0.1', port: TEST_PORT, path: '/demo', method: 'GET',
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
      });
      req.on('error', () => resolve({ status: 0 }));
      req.end();
    });
    expect(r.status).toBe(200);
    expect(r.body).toContain('WebSocket');
    expect(r.body).toContain('new WebSocket');
  });
});
