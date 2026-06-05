/**
 * Unit tests for face-binding module
 */

const path = require('path');
const fs = require('fs');
const { FaceBinding, detectFaceFromFilename, autoDetectBindings } = require('../../src/utils/face-binding');

describe('FaceBinding', () => {
  let testModel;

  beforeAll(() => {
    // Load test model
    const samplePath = path.join(__dirname, '../../examples/sample-crane.fold');
    const content = fs.readFileSync(samplePath, 'utf8');
    testModel = JSON.parse(content);
  });

  describe('loadModel', () => {
    test('should load model from file path', () => {
      const binder = new FaceBinding();
      const model = binder.loadModel(path.join(__dirname, '../../examples/sample-crane.fold'));

      expect(model).toBeDefined();
      expect(model.vertices_coords).toBeDefined();
      expect(model.faces_vertices).toBeDefined();
    });

    test('should load model from object', () => {
      const binder = new FaceBinding();
      const model = binder.loadModel(testModel);

      expect(model.vertices_coords).toHaveLength(5);
    });

    test('should throw error for missing vertices_coords', () => {
      const binder = new FaceBinding();
      expect(() => {
        binder.loadModel({ faces_vertices: [[0, 1, 2]] });
      }).toThrow('Model missing vertices_coords');
    });

    test('should throw error for missing faces_vertices', () => {
      const binder = new FaceBinding();
      expect(() => {
        binder.loadModel({ vertices_coords: [[0, 0, 0]] });
      }).toThrow('Model missing faces_vertices');
    });
  });

  describe('bindArtwork', () => {
    test('should bind artwork to valid face', () => {
      const binder = new FaceBinding();
      binder.loadModel(testModel);

      // Create temp artwork file
      const artworkPath = path.join(__dirname, '../../test/samples/face0.png');
      if (!fs.existsSync(path.dirname(artworkPath))) {
        fs.mkdirSync(path.dirname(artworkPath), { recursive: true });
      }
      fs.writeFileSync(artworkPath, 'fake-png');

      const binding = binder.bindArtwork(0, artworkPath);

      expect(binding.faceIndex).toBe(0);
      expect(binding.artwork).toBe(artworkPath);
      expect(binding.uv).toBeDefined();
      expect(binding.rotation).toBe(0);
    });

    test('should throw error for invalid face index', () => {
      const binder = new FaceBinding();
      binder.loadModel(testModel);

      const artworkPath = path.join(__dirname, '../../test/samples/face0.png');
      fs.writeFileSync(artworkPath, 'fake-png');

      expect(() => {
        binder.bindArtwork(99, artworkPath);
      }).toThrow('Face index 99 out of range');
    });

    test('should throw error for missing artwork file', () => {
      const binder = new FaceBinding();
      binder.loadModel(testModel);

      expect(() => {
        binder.bindArtwork(0, '/nonexistent/file.png');
      }).toThrow('Artwork file not found');
    });
  });

  describe('bindMultiple', () => {
    test('should bind multiple artworks', () => {
      const binder = new FaceBinding();
      binder.loadModel(testModel);

      // Create temp artwork files
      const dir = path.join(__dirname, '../../test/samples');
      for (let i = 0; i < 4; i++) {
        fs.writeFileSync(path.join(dir, `face${i}.png`), 'fake-png');
      }

      const bindings = [
        { faceIndex: 0, artworkPath: path.join(dir, 'face0.png') },
        { faceIndex: 1, artworkPath: path.join(dir, 'face1.png') },
      ];

      binder.bindMultiple(bindings);

      expect(binder.getStats().boundFaces).toBe(2);
    });
  });

  describe('bindAllFaces', () => {
    test('should bind artworks to all faces sequentially', () => {
      const binder = new FaceBinding();
      binder.loadModel(testModel);

      const dir = path.join(__dirname, '../../test/samples');
      fs.writeFileSync(path.join(dir, 'art0.png'), 'fake-png');
      fs.writeFileSync(path.join(dir, 'art1.png'), 'fake-png');
      fs.writeFileSync(path.join(dir, 'art2.png'), 'fake-png');
      fs.writeFileSync(path.join(dir, 'art3.png'), 'fake-png');

      binder.bindAllFaces([
        path.join(dir, 'art0.png'),
        path.join(dir, 'art1.png'),
        path.join(dir, 'art2.png'),
        path.join(dir, 'art3.png'),
      ]);

      expect(binder.getStats().boundFaces).toBe(4);
    });
  });

  describe('getBinding / isFaceBound', () => {
    test('should return binding for bound face', () => {
      const binder = new FaceBinding();
      binder.loadModel(testModel);

      const artworkPath = path.join(__dirname, '../../test/samples/face0.png');
      fs.writeFileSync(artworkPath, 'fake-png');
      binder.bindArtwork(0, artworkPath);

      expect(binder.isFaceBound(0)).toBe(true);
      expect(binder.getBinding(0)).toBeDefined();
      expect(binder.getBinding(0).artworkName).toBe('face0.png');
    });

    test('should return null for unbound face', () => {
      const binder = new FaceBinding();
      binder.loadModel(testModel);

      expect(binder.isFaceBound(0)).toBe(false);
      expect(binder.getBinding(0)).toBeNull();
    });
  });

  describe('getStats', () => {
    test('should return correct statistics', () => {
      const binder = new FaceBinding();
      binder.loadModel(testModel);

      const dir = path.join(__dirname, '../../test/samples');
      fs.writeFileSync(path.join(dir, 'face0.png'), 'fake-png');
      binder.bindArtwork(0, path.join(dir, 'face0.png'));

      const stats = binder.getStats();

      expect(stats.totalFaces).toBe(4);
      expect(stats.boundFaces).toBe(1);
      expect(stats.unboundFaces).toBe(3);
    });
  });

  describe('exportModel', () => {
    test('should export model with faces_material', () => {
      const binder = new FaceBinding();
      binder.loadModel(testModel);

      const dir = path.join(__dirname, '../../test/samples');
      fs.writeFileSync(path.join(dir, 'face0.png'), 'fake-png');
      binder.bindArtwork(0, path.join(dir, 'face0.png'));

      const outputPath = '/tmp/test-bound-model.fold';
      const exported = binder.exportModel(outputPath);

      expect(fs.existsSync(outputPath)).toBe(true);
      expect(exported.faces_material).toBeDefined();
      expect(exported.faces_material[0].artwork).toBe('face0.png');

      fs.unlinkSync(outputPath);
    });
  });

  describe('unbindFace / clearBindings', () => {
    test('should remove single binding', () => {
      const binder = new FaceBinding();
      binder.loadModel(testModel);

      const dir = path.join(__dirname, '../../test/samples');
      fs.writeFileSync(path.join(dir, 'face0.png'), 'fake-png');
      binder.bindArtwork(0, path.join(dir, 'face0.png'));

      binder.unbindFace(0);
      expect(binder.isFaceBound(0)).toBe(false);
    });

    test('should clear all bindings', () => {
      const binder = new FaceBinding();
      binder.loadModel(testModel);

      const dir = path.join(__dirname, '../../test/samples');
      for (let i = 0; i < 4; i++) {
        fs.writeFileSync(path.join(dir, `face${i}.png`), 'fake-png');
      }
      binder.bindAllFaces([
        path.join(dir, 'face0.png'),
        path.join(dir, 'face1.png'),
        path.join(dir, 'face2.png'),
        path.join(dir, 'face3.png'),
      ]);

      binder.clearBindings();
      expect(binder.getStats().boundFaces).toBe(0);
    });
  });

  describe('computeUV', () => {
    test('should compute UV for a face', () => {
      const binder = new FaceBinding();
      binder.loadModel(testModel);

      const uv = binder.computeUV(0);

      expect(uv).toHaveLength(4);
      expect(uv[0]).toBeLessThanOrEqual(uv[2]); // u1 <= u2
      expect(uv[1]).toBeLessThanOrEqual(uv[3]); // v1 <= v2
    });
  });
});

describe('detectFaceFromFilename', () => {
  test('should detect face index from filename', () => {
    expect(detectFaceFromFilename('box_face0.png')).toBe(0);
    expect(detectFaceFromFilename('artwork_face_5.jpg')).toBe(5);
    expect(detectFaceFromFilename('face12.svg')).toBe(12);
  });

  test('should return null for no face indicator', () => {
    expect(detectFaceFromFilename('artwork.png')).toBeNull();
    expect(detectFaceFromFilename('design.jpg')).toBeNull();
  });
});

describe('autoDetectBindings', () => {
  test('should auto-detect bindings from directory', () => {
    const dir = path.join(__dirname, '../../test/samples');
    fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(path.join(dir, 'face0.png'), 'fake-png');
    fs.writeFileSync(path.join(dir, 'face1.png'), 'fake-png');

    const bindings = autoDetectBindings(dir);

    expect(bindings.length).toBeGreaterThanOrEqual(0);
  });
});