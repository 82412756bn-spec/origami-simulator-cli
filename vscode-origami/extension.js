/**
 * Origami FOLD Analyzer — VS Code Extension (v2.22)
 *
 * Wraps the origami-simulator-cli (https://github.com/...) as a VS Code
 * extension. Provides inline analyze/visualize/validate commands in the
 * editor's right-click menu for .fold files, plus a Webview panel for
 * the visual HTML report.
 *
 * Commands:
 *   origami.analyze       — full analyze report
 *   origami.visualize     — HTML report in Webview
 *   origami.validate      — ajv schema validation
 *   origami.summary       — compact JSON
 *   origami.kawasaki      — v2.12 Strict Kawasaki
 *   origami.maekawa       — v2.14 Strict Maekawa
 *
 * Architecture:
 *   - Each command spawns the `origami` CLI as a child process
 *   - Output goes to the "Origami" output channel (toggle in View > Output)
 *   - Visualize writes a temp .html and loads it into a WebviewPanel
 *
 * Tested in VS Code >= 1.85 (uses Webview csp, Uri API).
 */

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

/** @type {vscode.OutputChannel} */
let outputChannel;
/** @type {vscode.WebviewPanel} */
let visualPanel;

/**
 * Extension activation. Called when:
 *   - A JSON file is opened (.fold files are JSON; we use onLanguage:json as
 *     a heuristic — context-menu items only show for .fold extension)
 *   - Any origami.* command runs
 */
function activate(context) {
  outputChannel = vscode.window.createOutputChannel('Origami');

  context.subscriptions.push(
    vscode.commands.registerCommand('origami.analyze', (uri) => runCliCommand('analyze', uri, { flags: ['--all'] })),
    vscode.commands.registerCommand('origami.visualize', (uri) => runVisualize(uri)),
    vscode.commands.registerCommand('origami.validate', (uri) => runCliCommand('validate', uri, { exitCodes: [0, 3] })),
    vscode.commands.registerCommand('origami.summary', (uri) => runCliCommand('summary', uri, { json: true })),
    vscode.commands.registerCommand('origami.kawasaki', (uri) => runCliCommand('kawasaki', uri, {})),
    vscode.commands.registerCommand('origami.maekawa', (uri) => runCliCommand('maekawa', uri, {})),
  );
}

function deactivate() {
  if (outputChannel) outputChannel.dispose();
  if (visualPanel) visualPanel.dispose();
}

// ────────────────────────────────────────────────────────────────────
// Core: spawn the origami CLI
// ────────────────────────────────────────────────────────────────────

/**
 * Run an origami CLI subcommand on the given FOLD file.
 * @param {string} subcommand - e.g. 'analyze', 'validate', 'kawasaki'
 * @param {vscode.Uri} uri    - Optional resource URI; falls back to active editor
 * @param {object} opts       - { flags: [], json: bool, exitCodes: [0,2,3] }
 * @returns {Promise<{exitCode, stdout, stderr}>}
 */
async function runCliCommand(subcommand, uri, opts = {}) {
  const filePath = resolveFoldPath(uri);
  if (!filePath) {
    vscode.window.showErrorMessage('Origami: no .fold file selected or open.');
    return null;
  }

  const config = vscode.workspace.getConfiguration('origami');
  const cliPath = config.get('cliPath', 'origami');
  const showOutput = config.get('showOutputOnRun', true);

  const args = [subcommand, filePath, ...(opts.flags || [])];
  if (opts.json) args.push('--json');

  if (showOutput) {
    outputChannel.clear();
    outputChannel.show(true);
  }
  outputChannel.appendLine(`$ ${cliPath} ${args.join(' ')}`);

  const result = await spawnCli(cliPath, args);

  outputChannel.appendLine(result.stdout);
  if (result.stderr) outputChannel.appendLine('--- stderr ---');
  outputChannel.appendLine(result.stderr);

  const acceptCodes = opts.exitCodes || [0];
  if (!acceptCodes.includes(result.exitCode)) {
    vscode.window.showErrorMessage(
      `Origami: ${subcommand} exited with code ${result.exitCode}` +
      (result.stderr ? `\n${result.stderr.split('\n')[0]}` : '')
    );
  } else {
    vscode.window.setStatusBarMessage(`$(check) Origami: ${subcommand} ok (${result.exitCode})`, 4000);
  }

  return result;
}

/**
 * Run `origami visualize` and load the generated HTML into a Webview.
 */
async function runVisualize(uri) {
  const filePath = resolveFoldPath(uri);
  if (!filePath) {
    vscode.window.showErrorMessage('Origami: no .fold file selected or open.');
    return;
  }

  // Write the HTML to a temp file (Webviews need a file:// or vscode-resource:// URI)
  const tmpHtml = path.join(os.tmpdir(), `origami-viz-${Date.now()}.html`);

  const config = vscode.workspace.getConfiguration('origami');
  const cliPath = config.get('cliPath', 'origami');

  outputChannel.clear();
  outputChannel.show(true);
  outputChannel.appendLine(`$ ${cliPath} visualize ${filePath} -o ${tmpHtml}`);

  const result = await spawnCli(cliPath, ['visualize', filePath, '-o', tmpHtml]);
  if (result.exitCode !== 0) {
    vscode.window.showErrorMessage(`Origami: visualize failed (exit ${result.exitCode})`);
    outputChannel.appendLine(result.stderr);
    return;
  }

  if (!fs.existsSync(tmpHtml)) {
    vscode.window.showErrorMessage('Origami: visualize did not write the output file.');
    return;
  }

  const html = fs.readFileSync(tmpHtml, 'utf8');
  const title = `Origami Visual Report — ${path.basename(filePath)}`;

  if (visualPanel) {
    visualPanel.reveal(vscode.ViewColumn.Beside);
    visualPanel.title = title;
    visualPanel.webview.html = html;
  } else {
    visualPanel = vscode.window.createWebviewPanel(
      'origamiVisualReport',
      title,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        // The HTML is fully self-contained; no external resources.
        localResourceRoots: [],
      }
    );
    visualPanel.webview.html = html;
    visualPanel.onDidDispose(() => { visualPanel = undefined; });
  }
}

/**
 * Spawn the CLI and capture stdout/stderr.
 */
function spawnCli(cliPath, args) {
  return new Promise((resolve) => {
    const proc = spawn(cliPath, args, { cwd: vscode.workspace.rootPath || process.cwd() });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => resolve({ exitCode: code, stdout, stderr }));
    proc.on('error', (err) => resolve({ exitCode: -1, stdout, stderr: stderr + err.message }));
  });
}

/**
 * Resolve a FOLD file path from a Uri, the active editor, or null.
 */
function resolveFoldPath(uri) {
  if (uri && uri.fsPath) {
    if (path.extname(uri.fsPath).toLowerCase() === '.fold') return uri.fsPath;
    vscode.window.showWarningMessage(`Origami: ${path.basename(uri.fsPath)} is not a .fold file.`);
    return null;
  }
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const fp = editor.document.uri.fsPath;
    if (path.extname(fp).toLowerCase() === '.fold') return fp;
  }
  return null;
}

module.exports = { activate, deactivate };
