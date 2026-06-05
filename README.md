# OrigamiSimulator CLI

**版本**: v0.2.0
**状态**: ✅ 功能完成

CLI tool for [origamisimulator.org](https://origamisimulator.org/) - Simulate origami folding patterns via command line.

## Status

✅ **Production Ready** - All core features implemented and tested.

## Features

- 27 preset models (origami, bases, tessellations, curved, pleating)
- Load models from file (FOLD/SVG) or presets
- Run folding simulations with configurable parameters
- Capture screenshots (PNG)
- Export models (PNG, STL, OBJ, FOLD, SVG)
- Record animations (GIF, WebM, MP4) via Playwright + FFmpeg
- Analyze model geometry
- Batch processing
- Claude Code Skill integration

## Installation

```bash
npm install
npx playwright install chromium  # Install Chromium
```

## Usage

### List all presets

```bash
node src/index.js list
```

### Load a preset model

```bash
node src/index.js load --preset miura-ori
```

### Take a screenshot

```bash
node src/index.js screenshot --preset miura-ori -o output.png
```

### Record animation

```bash
node src/index.js record --preset miura-ori -o animation.gif
```

### Run simulation

```bash
node src/index.js simulate --percent 0.5 --preset miura-ori
```

### Analyze model

```bash
node src/index.js analyze --preset miura-ori --all
```

### Export model

```bash
node src/index.js export -f stl --preset miura-ori -o model.stl
```

### Global options

- `-V, --version` - Show version number
- `-h, --help` - Show help

## Available Presets (27)

| Category | Presets |
|----------|---------|
| origami | cranes, flapping-bird, flat-crane, hypar, square-twist, airplane, lang-cardinal, lang-orchid |
| bases | bird-base, boat-base, frog-base, square-base, waterbomb-base |
| tessellations | miura-ori, waterbomb, flower-tower, lang-honeycomb, huffman-extruded |
| curved | leafy-opus, shell14, rotating-star |
| pleating | box-pleat-tess, box-pleat-pyramid |
| other | kirigami-triangle, popup-simple, bistable-curved, polygami-cross |

## Project Structure

```
origami-simulator-cli/
├── src/
│   └── index.js          # Main CLI entry (877 lines)
├── docs/                  # Documentation
├── tests/                # Tests
├── examples/             # Example files
├── .opencli/            # OpenCLI adapter config
├── .claude/skills/      # Claude Code Skill
├── package.json
└── README.md
```

## Technology Stack

- **Node.js** (≥18) - Runtime
- **Playwright** - Browser automation
- **Commander.js** - CLI framework
- **FFmpeg** - Video encoding

## Links

- [OrigamiSimulator.org](https://origamisimulator.org/)
- [OrigamiSimulator GitHub](https://github.com/amandaghassaei/OrigamiSimulator)
- [AI Partner Project](../) - Parent project

## License

MIT
