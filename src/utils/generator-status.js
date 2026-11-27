/**
 * 内置生成器的几何状态（2026-11-26 以官方 78 例为基准实测）
 *
 * 为什么需要它：这些生成器从未被验证过几何正确性，而 CLI 此前不告诉用户
 * 「这个 pattern 的折痕图可能不满足折平必要条件」—— 用户只能自己撞。
 * 现在状态随包发布并在 CLI 里明示。
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'templates', 'generator-status.json');

let cached = null;

function loadStatus(file = FILE) {
  if (cached) return cached;
  try {
    cached = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    cached = { patterns: {}, measured_at: null };
  }
  return cached;
}

/** 取某个内置 pattern 的几何状态 */
function statusOf(pattern, file = FILE) {
  const s = loadStatus(file);
  return (s.patterns || {})[pattern] || null;
}

/** 给一行输出加几何状态后缀（CLI 用） */
function suffix(pattern, file = FILE) {
  const st = statusOf(pattern, file);
  if (!st) return '';
  return st.geometry === 'verified'
    ? '  [几何 ✅ verified]'
    : `  [几何 ⚠️ partial：${st.note}]`;
}

module.exports = { FILE, loadStatus, statusOf, suffix };
