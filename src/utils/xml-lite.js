/**
 * xml-lite — a dependency-free XML well-formedness checker (v2.47.4)
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * Criterion F ("SVG well-formedness") and criterion I ("golden corpus
 * regression") both need to decide whether an SVG document is *well-formed
 * XML*.  The repository has **no XML parser** in `node_modules` and the task
 * brief forbids introducing new dependencies ("npm audit --omit=dev is 0
 * vulnerabilities, don't break it").
 *
 * So this module implements the small, well-defined subset of XML 1.0
 * well-formedness that an SVG document actually uses:
 *
 *   - element start/end tags with correctly *nested* matching names
 *   - self-closing tags
 *   - attribute names, `=` and **quoted** attribute values
 *   - no duplicate attribute on the same element
 *   - comments, processing instructions, CDATA sections, DOCTYPE
 *   - entity references: the five predefined ones + numeric character
 *     references.  Anything else is reported as an error.
 *
 * It is deliberately NOT a full XML processor (no namespaces resolution, no
 * external entities, no DTD validation).  It answers exactly one question:
 * "is this document well-formed?".
 */

const NAME_START = /[A-Za-z_:]/;
const NAME_CHAR = /[-A-Za-z0-9._:]/;

/** The five predefined XML entities. */
const PREDEFINED_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/**
 * Validate the entity references inside a text run.
 * @param {string} text
 * @param {Array} errors - collected errors (mutated)
 * @param {number} offset - absolute offset of `text` in the source
 */
function checkEntities(text, errors, offset) {
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '<') {
      errors.push({ message: "unescaped '<' in text content", position: offset + i });
      i++;
      continue;
    }
    if (c === '&') {
      const m = /^&(#\d+|#x[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/.exec(text.slice(i));
      if (!m) {
        errors.push({ message: 'malformed entity reference', position: offset + i });
        i++;
        continue;
      }
      const body = m[1];
      if (body[0] !== '#' && !Object.prototype.hasOwnProperty.call(PREDEFINED_ENTITIES, body)) {
        errors.push({ message: `unknown entity '&${body};'`, position: offset + i });
      }
      i += m[0].length;
      continue;
    }
    i++;
  }
}

/**
 * Parse a start tag beginning at `source[start]` ('<').
 * @returns {Object|null} { name, attrs, selfClosing, end } or null on error
 */
function parseStartTag(source, start, errors) {
  const n = source.length;
  let i = start + 1;

  if (i >= n || !NAME_START.test(source[i])) {
    errors.push({ message: 'invalid element name', position: start });
    return null;
  }
  let name = '';
  while (i < n && NAME_CHAR.test(source[i])) { name += source[i]; i++; }

  const attrs = {};
  let selfClosing = false;

  while (i < n) {
    while (i < n && /\s/.test(source[i])) i++;
    if (i >= n) break;

    if (source[i] === '>') { i++; break; }
    if (source[i] === '/') {
      if (source[i + 1] === '>') { selfClosing = true; i += 2; break; }
      errors.push({ message: `invalid '/' inside tag <${name}>`, position: i });
      i++;
      continue;
    }
    if (!NAME_START.test(source[i])) {
      errors.push({ message: `invalid attribute name in <${name}>`, position: i });
      i++;
      continue;
    }

    let attrName = '';
    while (i < n && NAME_CHAR.test(source[i])) { attrName += source[i]; i++; }
    while (i < n && /\s/.test(source[i])) i++;

    if (source[i] !== '=') {
      errors.push({ message: `attribute '${attrName}' has no value in <${name}>`, position: i });
      attrs[attrName] = '';
      continue;
    }
    i++; // consume '='
    while (i < n && /\s/.test(source[i])) i++;

    const quote = source[i];
    if (quote !== '"' && quote !== "'") {
      errors.push({ message: `unquoted attribute value for '${attrName}' in <${name}>`, position: i });
      let value = '';
      while (i < n && !/[\s>]/.test(source[i])) { value += source[i]; i++; }
      attrs[attrName] = value;
      continue;
    }
    i++; // consume opening quote
    let value = '';
    while (i < n && source[i] !== quote) { value += source[i]; i++; }
    if (i >= n) {
      errors.push({ message: `unterminated attribute value for '${attrName}' in <${name}>`, position: i });
      break;
    }
    i++; // consume closing quote

    if (Object.prototype.hasOwnProperty.call(attrs, attrName)) {
      errors.push({ message: `duplicate attribute '${attrName}' in <${name}>`, position: i });
    }
    attrs[attrName] = value;
  }

  return { name, attrs, selfClosing, end: i };
}

/**
 * Parse an XML document and check its well-formedness.
 *
 * @param {string} source
 * @returns {Object} { ok, errors, root, elementCount }
 */
function parseXml(source) {
  const errors = [];
  const root = { name: '#document', attrs: {}, children: [], text: '' };
  const stack = [root];

  if (typeof source !== 'string') {
    return { ok: false, errors: [{ message: 'source is not a string', position: -1 }], root, elementCount: 0 };
  }

  // strip UTF-8 BOM
  let src = source;
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);

  const n = src.length;
  let i = 0;
  let elementCount = 0;

  while (i < n) {
    const lt = src.indexOf('<', i);

    if (lt === -1) {
      const text = src.slice(i);
      if (text.trim() !== '') {
        stack[stack.length - 1].text += text;
        checkEntities(text, errors, i);
      }
      break;
    }

    if (lt > i) {
      const text = src.slice(i, lt);
      stack[stack.length - 1].text += text;
      checkEntities(text, errors, i);
    }

    // comment
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end === -1) { errors.push({ message: 'unterminated comment', position: lt }); break; }
      i = end + 3;
      continue;
    }
    // CDATA
    if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      if (end === -1) { errors.push({ message: 'unterminated CDATA section', position: lt }); break; }
      stack[stack.length - 1].text += src.slice(lt + 9, end);
      i = end + 3;
      continue;
    }
    // processing instruction
    if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt + 2);
      if (end === -1) { errors.push({ message: 'unterminated processing instruction', position: lt }); break; }
      i = end + 2;
      continue;
    }
    // declaration (DOCTYPE etc.)
    if (src.startsWith('<!', lt)) {
      let j = lt + 2;
      let depth = 0;
      while (j < n) {
        const ch = src[j];
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
        else if (ch === '>' && depth <= 0) break;
        j++;
      }
      if (j >= n) { errors.push({ message: 'unterminated declaration', position: lt }); break; }
      i = j + 1;
      continue;
    }
    // end tag
    if (src.startsWith('</', lt)) {
      const end = src.indexOf('>', lt);
      if (end === -1) { errors.push({ message: 'unterminated end tag', position: lt }); break; }
      const name = src.slice(lt + 2, end).trim();
      if (stack.length === 1) {
        errors.push({ message: `unexpected end tag </${name}>`, position: lt });
      } else {
        const open = stack[stack.length - 1];
        if (open.name !== name) {
          errors.push({ message: `mismatched end tag </${name}>, expected </${open.name}>`, position: lt });
        }
        stack.pop();
      }
      i = end + 1;
      continue;
    }

    // start tag
    const parsed = parseStartTag(src, lt, errors);
    if (!parsed) break;

    const el = { name: parsed.name, attrs: parsed.attrs, children: [], text: '' };
    elementCount++;
    stack[stack.length - 1].children.push(el);
    if (!parsed.selfClosing) stack.push(el);
    i = parsed.end;
  }

  for (let k = 1; k < stack.length; k++) {
    errors.push({ message: `unclosed element <${stack[k].name}>`, position: -1 });
  }

  return { ok: errors.length === 0, errors, root, elementCount };
}

/**
 * Depth-first search for an element carrying `id="<id>"`.
 * @param {Object} element
 * @param {string} id
 * @returns {Object|null}
 */
function findById(element, id) {
  if (!element) return null;
  if (element.attrs && element.attrs.id === id) return element;
  for (const child of element.children || []) {
    const hit = findById(child, id);
    if (hit) return hit;
  }
  return null;
}

/**
 * Collect every descendant element with the given tag name.
 * @param {Object} element
 * @param {string} tagName
 * @returns {Array<Object>}
 */
function collectByTag(element, tagName) {
  const out = [];
  if (!element) return out;
  for (const child of element.children || []) {
    if (child.name === tagName) out.push(child);
    out.push(...collectByTag(child, tagName));
  }
  return out;
}

module.exports = {
  PREDEFINED_ENTITIES,
  parseXml,
  findById,
  collectByTag,
};
