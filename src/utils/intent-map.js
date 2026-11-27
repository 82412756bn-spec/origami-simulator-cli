/**
 * intent-map.js —— 意图 → (模板, copies, rotate, scale) 的映射层（2026-11-26）
 *
 * 这是「按**我的想法**生成」的缺失那一层：模板模式只能「选模板 id + 给参数」，
 * 而用户说的是「我要一个**六瓣**的星形折纸」—— 需要把意图翻译成模板与参数。
 *
 * 设计依据（全部来自官方 78 个真实折痕图的实测，非手写臆测）：
 *  ① 语义族 = **官方分类目录**（Bases / Origami / Tessellations / Curved / Kirigami /
 *     Popup / Polygami / SimpleFolds / Squaremaze / Bistable / PolygonUnfolding）
 *     —— 现成的语义标注，不是我编的族名。
 *  ② 候选模板 = **数据推导**：对每个官方形态求其在「模板 × copies × rotate」组合空间
 *     （20 × 5 × 7 = 700）中的最近邻（结构指纹距离 < 0.9），按语义族归拢。
 *  ③ 验收用**固定阈值 0.9**，不从推导集派生（避免循环验证）；
 *     hold-out（官方 78 按文件名排序交错分半的 39 件）实测 37/39 通过。
 *
 * 不可解的形态族（无候选）→ CLI **明确报「暂不支持」并列出支持的族**，不静默 fallback。
 */
const fs = require('fs');
const path = require('path');

const FAMILIES_FILE = path.join(__dirname, '..', '..', 'templates', 'families.json');

/** 读族表（数据推导产物） */
function loadFamilies(file = FAMILIES_FILE) {
  if (!fs.existsSync(file)) {
    throw new Error(`族表不存在: ${file}（templates/families.json 是随包发布的产物）`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** 语义族的可读别名（CLI 用；未列出的族直接用官方目录名） */
const FAMILY_ALIASES = {
  base: 'Bases',
  bases: 'Bases',
  origami: 'Origami',
  tessellation: 'Tessellations',
  tessellations: 'Tessellations',
  pleat: 'Curved',
  curved: 'Curved',
  kirigami: 'Kirigami',
  popup: 'Popup',
  polygami: 'Polygami',
  simplefold: 'SimpleFolds',
  simplefolds: 'SimpleFolds',
  squaremaze: 'Squaremaze',
  bistable: 'Bistable',
  unfolding: 'PolygonUnfolding',
};

/** 把用户给的族名解析成官方目录名 */
function resolveFamily(name) {
  if (!name) return null;
  const key = String(name).trim().toLowerCase();
  return FAMILY_ALIASES[key] || String(name).trim();
}

/**
 * 把意图映射成 (template, copies, rotate, scale)。
 *
 * @param {{family:string, motif?:string, symmetry?:number, rotation?:number, scale?:number}} intent
 * @param {Object} families loadFamilies() 的结果
 * @returns {{ok:true, plan:Object}|{ok:false, reason:string, supported:Object, roadmap:string[]}}
 */
function mapIntent(intent, families = loadFamilies()) {
  const fam = resolveFamily(intent.family);
  const f = (families.families || {})[fam];

  if (!f) {
    return {
      ok: false,
      reason: `未知形态族 "${intent.family}"`,
      supported: Object.keys(families.families || {}),
      roadmap: [],
    };
  }
  if (!f.candidate_templates || f.candidate_templates.length === 0) {
    return {
      ok: false,
      reason: `形态族 "${fam}" 暂无候选模板（官方 ${f.official_examples} 件，该族覆盖 0 件）`,
      supported: Object.keys(families.families || {}),
      roadmap: [`需扩充 ${fam} 族的模板（当前覆盖 0/${f.official_examples}）`],
    };
  }

  // 候选排序：优先「在该族内被覆盖的官方形态数」多的模板
  // （一个模板常同时覆盖多个族 → 全局排序会把镶嵌模板塞给剪纸意图）
  const inFamily = (tpl) => (f.examples || []).filter((n) => {
    const info = (families.nearestCombination || {})[n];
    return info && info.id === tpl && info.d < (families.threshold || 0.9);
  }).length;
  const ranked = f.candidate_templates.slice().sort((a, b) => inFamily(b) - inFamily(a));

  // motif：在候选里找与官方形态名/近邻最接近的那件
  let template = ranked[0];
  let motifPick = null;
  let motifMissed = null;
  if (intent.motif) {
    const m = String(intent.motif).trim().toLowerCase();
    const near = families.nearestCombination || {};
    let best = null; let bd = Infinity;
    for (const [official, info] of Object.entries(near)) {
      if (!info || info.d >= (families.threshold || 0.9)) continue;
      if (!official.toLowerCase().includes(m)) continue;
      if (info.d < bd) { bd = info.d; best = { official, info }; }
    }
    if (best && f.candidate_templates.includes(best.info.id)) {
      template = best.info.id;
      motifPick = best.official;
    } else {
      // motif 没命中 → 用该族里族内覆盖最多的候选，并**明确记录未命中**
      template = ranked[0];
      motifMissed = String(intent.motif);
    }
  }

  const symmetry = Number.isFinite(intent.symmetry) ? intent.symmetry : null;
  const copies = symmetry && symmetry > 1 ? Math.min(Math.round(symmetry), 6) : 1;
  const rotate = Number.isFinite(intent.rotation) ? intent.rotation : 0;
  const scale = Number.isFinite(intent.scale) ? intent.scale : 1;

  return {
    ok: true,
    plan: {
      family: fam,
      template,
      copies,
      rotate,
      scale,
      motifMatched: motifPick,
      motifMissed,
      alternatives: ranked.slice(0, 5),
      officialInFamily: f.official_examples,
      coveredByTemplates: f.covered_by_templates,
    },
  };
}

module.exports = { FAMILIES_FILE, FAMILY_ALIASES, loadFamilies, resolveFamily, mapIntent };
