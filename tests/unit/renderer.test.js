/**
 * Unit tests for renderer module
 */

const { Renderer, BatchRenderSettings } = require('../../src/utils/renderer');

describe('Renderer', () => {
  describe('constructor', () => {
    test('should create renderer with default options', () => {
      const renderer = new Renderer();

      expect(renderer.options.dpi).toBe(72);
      expect(renderer.options.width).toBe(1920);
      expect(renderer.options.height).toBe(1080);
      expect(renderer.options.background).toBe('transparent');
      expect(renderer.options.shadow).toBe(false);
      expect(renderer.options.angle).toBe(45);
    });

    test('should create renderer with custom options', () => {
      const renderer = new Renderer({
        dpi: 300,
        width: 3300,
        height: 2550,
        background: '#ffffff',
        shadow: true,
        angle: 90,
      });

      expect(renderer.options.dpi).toBe(300);
      expect(renderer.options.width).toBe(3300);
      expect(renderer.options.height).toBe(2550);
      expect(renderer.options.background).toBe('#ffffff');
      expect(renderer.options.shadow).toBe(true);
      expect(renderer.options.angle).toBe(90);
    });
  });

  describe('setDPI', () => {
    test('should update DPI and scale factor', () => {
      const renderer = new Renderer();
      renderer.setDPI(150);

      expect(renderer.options.dpi).toBe(150);
      expect(renderer.options._scale).toBeCloseTo(2.08, 1);
    });
  });

  describe('setAngle', () => {
    test('should set angle within 0-360 range', () => {
      const renderer = new Renderer();
      renderer.setAngle(90);

      expect(renderer.options.angle).toBe(90);
    });

    test('should wrap angles greater than 360', () => {
      const renderer = new Renderer();
      renderer.setAngle(450);

      expect(renderer.options.angle).toBe(90);
    });
  });

  describe('setBackground', () => {
    test('should set background color', () => {
      const renderer = new Renderer();
      renderer.setBackground('#ff0000');

      expect(renderer.options.background).toBe('#ff0000');
    });

    test('should accept transparent', () => {
      const renderer = new Renderer();
      renderer.setBackground('transparent');

      expect(renderer.options.background).toBe('transparent');
    });
  });

  describe('setShadow', () => {
    test('should enable shadow', () => {
      const renderer = new Renderer();
      renderer.setShadow(true);

      expect(renderer.options.shadow).toBe(true);
    });
  });

  describe('getRenderSettings', () => {
    test('should return all render settings', () => {
      const renderer = new Renderer({ dpi: 150, angle: 45 });
      const settings = renderer.getRenderSettings();

      expect(settings.dpi).toBe(150);
      expect(settings.angle).toBe(45);
      expect(settings.width).toBe(1920);
      expect(settings.height).toBe(1080);
    });
  });

  describe('buildRenderQuery', () => {
    test('should build query string with angle', () => {
      const renderer = new Renderer({ angle: 45 });
      const query = renderer.buildRenderQuery();

      expect(query).toContain('angle=45');
    });

    test('should include shadow params when enabled', () => {
      const renderer = new Renderer({ shadow: true, shadowBlur: 15, shadowOffset: 8 });
      const query = renderer.buildRenderQuery();

      expect(query).toContain('shadow=1');
      expect(query).toContain('shadowBlur=15');
      expect(query).toContain('shadowOffset=8');
    });

    test('should include background when not transparent', () => {
      const renderer = new Renderer({ background: '#ff0000' });
      const query = renderer.buildRenderQuery();

      expect(query).toContain('bg=%23ff0000');
    });

    test('should not include background when transparent', () => {
      const renderer = new Renderer({ background: 'transparent' });
      const query = renderer.buildRenderQuery();

      expect(query).not.toContain('bg=');
    });
  });

  describe('suggestOutputName', () => {
    test('should suggest output name with DPI and angle', () => {
      const renderer = new Renderer({ dpi: 150, angle: 45 });
      const name = renderer.suggestOutputName('/path/to/model.fold');

      expect(name).toContain('150dpi');
      expect(name).toContain('45deg');
      expect(name).toContain('.png');
    });
  });

  describe('validate', () => {
    test('should return valid for correct settings', () => {
      const renderer = new Renderer({ dpi: 150, angle: 45 });
      const result = renderer.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should return errors for invalid DPI', () => {
      const renderer = new Renderer({ dpi: 5 });
      const result = renderer.validate();

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('DPI');
    });

    test('should return errors for invalid angle', () => {
      const renderer = new Renderer({ angle: -10 });
      const result = renderer.validate();

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Angle');
    });
  });

  describe('getInfo', () => {
    test('should return correct info', () => {
      const renderer = new Renderer({ dpi: 150, width: 1920, height: 1080 });
      const info = renderer.getInfo();

      expect(info.dpi).toBe(150);
      expect(info.dimensions).toBe('1920x1080');
      expect(parseFloat(info.aspectRatio)).toBeCloseTo(1.78, 1);
      expect(info.angle).toBe(45);
    });
  });
});

describe('Renderer.presets', () => {
  test('should return all preset configurations', () => {
    const presets = Renderer.presets();

    expect(presets.web).toBeDefined();
    expect(presets.social).toBeDefined();
    expect(presets.print).toBeDefined();
    expect(presets.transparent).toBeDefined();
    expect(presets.product).toBeDefined();
  });

  test('web preset should have 72 DPI', () => {
    const presets = Renderer.presets();
    expect(presets.web.dpi).toBe(72);
  });

  test('print preset should have 300 DPI', () => {
    const presets = Renderer.presets();
    expect(presets.print.dpi).toBe(300);
  });
});

describe('Renderer.fromPreset', () => {
  test('should create renderer from preset', () => {
    const renderer = Renderer.fromPreset('print');

    expect(renderer.options.dpi).toBe(300);
    expect(renderer.options.width).toBe(3300);
    expect(renderer.options.height).toBe(2550);
    expect(renderer.options.shadow).toBe(true);
  });

  test('should throw error for unknown preset', () => {
    expect(() => {
      Renderer.fromPreset('unknown');
    }).toThrow('Unknown preset');
  });
});

describe('BatchRenderSettings', () => {
  describe('setAngles', () => {
    test('should set custom angles', () => {
      const renderer = new Renderer();
      const batch = new BatchRenderSettings(renderer);
      batch.setAngles([0, 90, 180, 270]);

      expect(batch.angles).toEqual([0, 90, 180, 270]);
    });
  });

  describe('setFormat', () => {
    test('should set output format', () => {
      const renderer = new Renderer();
      const batch = new BatchRenderSettings(renderer);
      batch.setFormat('jpg');

      expect(batch.formats).toEqual(['jpg']);
    });
  });

  describe('setOutputDir', () => {
    test('should set output directory', () => {
      const renderer = new Renderer();
      const batch = new BatchRenderSettings(renderer);
      batch.setOutputDir('/output');

      expect(batch.outputDir).toBe('/output');
    });
  });

  describe('generateConfigs', () => {
    test('should generate configs for all angle/format combinations', () => {
      const renderer = new Renderer({ dpi: 150 });
      const batch = new BatchRenderSettings(renderer)
        .setAngles([0, 90])
        .setFormat('png')
        .setOutputDir('/output');

      const configs = batch.generateConfigs();

      expect(configs).toHaveLength(2); // 2 angles x 1 format
      expect(configs[0].angle).toBe(0);
      expect(configs[1].angle).toBe(90);
    });
  });
});