# Contributing to OrigamiSimulator CLI

Thank you for your interest in contributing!

## Development Setup

### Prerequisites

- Node.js ≥ 18.0.0
- npm ≥ 9.0.0
- Git

### Setup Steps

```bash
# 1. Fork the repository

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/origami-simulator-cli.git
cd origami-simulator-cli

# 3. Install dependencies
npm install

# 4. Install Playwright browsers
npx playwright install chromium

# 5. Create a feature branch
git checkout -b feature/your-feature-name
```

## Development Workflow

### Running the CLI

```bash
# Run from source
node src/index.js --help

# Run specific command
node src/index.js list
node src/index.js screenshot -o test.png
```

### Running Tests

```bash
# Run all tests
npm test

# Run E2E tests
npm run test:e2e

# Run with coverage
npm run test:coverage
```

## Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Add JSDoc comments for functions
- Maximum line length: 100 characters

### Example

```javascript
/**
 * Load a preset model or file
 * @param {Object} options - Command options
 * @param {string} [options.preset] - Preset name
 * @param {string} [options.file] - File path
 * @returns {Promise<void>}
 */
async function loadModel(options) {
  // implementation
}
```

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new command
fix: resolve browser launch issue
docs: update command reference
test: add screenshot tests
refactor: simplify file parser
```

## Testing

### Writing Tests

```javascript
// tests/e2e/screenshot.test.js
const { test, expect } = require('@playwright/test');

test('screenshot command saves file', async () => {
  // setup
  const outputPath = '/tmp/test-screenshot.png';

  // execute
  await cli('screenshot', ['-o', outputPath]);

  // verify
  expect(fs.existsSync(outputPath)).toBe(true);
});
```

### Test Naming

- Unit tests: `*.test.js`
- E2E tests: `*.e2e.js`
- Test files: `tests/unit/`, `tests/e2e/`

## Pull Request Process

1. Update documentation if needed
2. Add tests for new features
3. Ensure all tests pass
4. Update CHANGELOG.md
5. Request review

## Reporting Issues

Include:
- Node.js version
- Operating system
- Command used
- Expected vs actual behavior
- Error messages

## Questions?

Open an issue for discussion.
