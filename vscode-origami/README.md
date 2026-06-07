# Origami FOLD Analyzer — VS Code Extension (v2.22)

Inline origami FOLD file validation and visualization for VS Code.

This extension wraps the [`origami-simulator-cli`](../) fold-analyzer engine
as a first-class VS Code integration. It provides context-menu commands
for `.fold` files plus a Webview panel for the visual HTML report.

## Requirements

- VS Code ≥ 1.85
- Node.js ≥ 18
- The `origami` CLI must be installed and on `PATH` (or set `origami.cliPath`
  in VS Code settings to point at it):
  ```bash
  npm install -g origami-simulator-cli
  ```

## Commands

All commands appear in the right-click menu when you right-click a `.fold`
file in the Explorer or editor, and in the Command Palette (`Ctrl+Shift+P`):

| Command | What it does |
|---------|-------------|
| `Origami: Analyze File` | Full analyze report (basic, structure, validation, symmetry, quality, ...) |
| `Origami: Visualize` | Generate self-contained HTML report and open in a Webview panel |
| `Origami: Validate Output (Schema)` | ajv schema validation of analyze() output |
| `Origami: Summary (Compact JSON)` | Compact summary JSON for scripts / CI |
| `Origami: Strict Kawasaki` | v2.12 Strict Kawasaki flat-foldability check |
| `Origami: Strict Maekawa` | v2.14 Strict Maekawa check (\|M−V\| = 2) |

Output goes to the "Origami" output channel (View → Output → Origami).

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `origami.cliPath` | `"origami"` | Path to the CLI executable |
| `origami.showOutputOnRun` | `true` | Auto-show the output channel on run |

## Architecture

The extension is intentionally thin — it spawns the `origami` CLI as a
child process and captures its output. This means:

- The CLI does all the math (v2.0–v2.21 fold-analyzer)
- The extension just provides the editor integration
- No build step, no TypeScript compile, no separate runtime dependencies
- All work happens locally; no network calls

The `visualize` command writes a temp HTML file and loads it into a
Webview panel. The HTML is fully self-contained (embedded SVG) so the
Webview doesn't need to fetch any external resources.

## Testing the extension

In a development VS Code window:
1. Open this folder (`vscode-origami/`) in VS Code
2. Press `F5` to launch the extension in debug mode
3. Right-click any `.fold` file (e.g., `../hypar.fold`) and pick an
   Origami command from the context menu

To package as a `.vsix`:
```bash
npm install -g @vscode/vsce
vsce package
```
