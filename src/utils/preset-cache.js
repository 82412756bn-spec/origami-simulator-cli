/**
 * Preset 本地缓存（2026-11-26）
 *
 * 背景：27 个 preset 原来全部在运行时从 origamisimulator.org 的 `?demo=` 参数加载。
 *
 * 资源真实路径（实测）：`https://origamisimulator.org/assets/<file>` → 200
 * 根路径 `/<file>` 是 404（返回 HTML 错误页），所以必须带 `assets/`。
 *
 * **两类 preset，不是一类**（实测发现的坑）：
 *   - 25 个是 `.svg`（XML 折痕图）
 *   - 2 个是 `.fold`（JSON：box-pleat-tess / box-pleat-pyramid）
 *   → 校验与缓存文件名都必须按扩展名区分，否则 JSON 会被当成"错误页"拒掉，
 *     或者把 .fold 存成 .svg 后喂给文件输入框（按扩展名判断，会失败）。
 *
 * 缓存位置：`~/.origami/presets/<id><ext>`
 *   - 不进发布包（files 白名单只含 src/docs/examples）
 *   - 不进版本库（在家目录）
 *
 * **能力边界（必须诚实）**：这个缓存只消除"preset 资源"这一层依赖，
 * 不消除"模拟器本体"的依赖 —— `launchBrowser()` 仍然要访问 origamisimulator.org
 * 加载网页应用。所以它防的是「站点可达但资源路径变了/个别资源拿不到」，
 * **不是「整站下线也能用」**。要后者得把模拟器前端整个 vendor 进来（未做）。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE_URL = 'https://origamisimulator.org/';
const CACHE_DIR = path.join(os.homedir(), '.origami', 'presets');
const UA = 'origami-simulator-cli (+https://github.com/82412756bn-spec/origami-simulator-cli)';

/** preset 资源的扩展名（.svg / .fold） */
function cacheExt(file) {
  const ext = path.extname(String(file || '')).toLowerCase();
  return ext === '.fold' ? '.fold' : '.svg';
}

/** 缓存文件路径 */
function cachePath(id, file) {
  return path.join(CACHE_DIR, `${id}${cacheExt(file)}`);
}

/** 缓存是否可用：存在且 > 200 字节（挡住空文件和错误页） */
function hasCache(id, file) {
  try {
    return fs.statSync(cachePath(id, file)).size > 200;
  } catch {
    return false;
  }
}

/** preset 的资源 URL */
function assetUrl(file) {
  return `${BASE_URL}assets/${file}`;
}

/**
 * 校验响应内容是否真的像那个格式 —— 站点在路径错时返回的 HTML 错误页照样是 200。
 * @param {string} text 响应正文
 * @param {string} file preset 相对路径（决定按 SVG 还是 FOLD 校验）
 */
function looksValid(text, file) {
  if (cacheExt(file) === '.fold') {
    try {
      const data = JSON.parse(text);
      // FOLD 至少要有一个几何字段
      return Boolean(data && (data.vertices_coords || data.edges_vertices || data.faces_vertices));
    } catch {
      return false;
    }
  }
  return /<svg[\s>]/i.test(text);
}

/**
 * 下载单个 preset 到本地缓存。
 * @param {string} id   规范 preset id
 * @param {string} file preset 的相对路径，如 'Origami/traditionalCrane.svg'
 * @param {{timeoutMs?:number, force?:boolean}} opts
 * @returns {Promise<{ok:boolean, cached?:boolean, bytes?:number, reason?:string}>}
 */
async function download(id, file, { timeoutMs = 30000, force = false } = {}) {
  const dest = cachePath(id, file);
  if (!force && hasCache(id, file)) {
    return { ok: true, cached: true, bytes: fs.statSync(dest).size };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(assetUrl(file), {
      signal: controller.signal,
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };

    const text = await res.text();
    if (!looksValid(text, file)) {
      return { ok: false, reason: `返回内容不像 ${cacheExt(file).slice(1).toUpperCase()}（很可能是错误页）` };
    }

    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const tmp = `${dest}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, dest);
    return { ok: true, cached: false, bytes: Buffer.byteLength(text) };
  } catch (err) {
    return { ok: false, reason: err.name === 'AbortError' ? '超时' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { BASE_URL, CACHE_DIR, cacheExt, cachePath, hasCache, assetUrl, looksValid, download };
