/** @typedef {'key' | 'str' | 'num' | 'lit'} TokenKind */
/** @typedef {{ kind: TokenKind | null, text: string }} Token */

/**
 * @param {unknown} value
 * @returns {Token[]}
 */
export const tokenize = (value) => {
  /** @type {Token[]} */
  const tokens = [];

  /**
   * @param {string} text
   * @param {TokenKind | null} [kind]
   */
  const push = (text, kind = null) => {
    const last = tokens.at(-1);
    if (kind === null && last?.kind === null) last.text += text;
    else tokens.push({ kind, text });
  };

  /**
   * @param {[string | null, unknown][]} entries
   * @param {string} indent
   * @param {string} open
   * @param {string} close
   */
  const writeAll = (entries, indent, open, close) => {
    if (entries.length === 0) return push(open + close);
    const inner = `${indent}  `;
    push(`${open}\n`);
    entries.forEach(([key, child], i) => {
      push(inner);
      if (key !== null) {
        push(JSON.stringify(key), 'key');
        push(': ');
      }
      write(child, inner);
      push(i < entries.length - 1 ? ',\n' : '\n');
    });
    push(indent + close);
  };

  /**
   * @param {unknown} v
   * @param {string} indent
   */
  const write = (v, indent) => {
    if (typeof v === 'string') return push(JSON.stringify(v), 'str');
    if (typeof v === 'number')
      return push(JSON.stringify(v), Number.isFinite(v) ? 'num' : 'lit');
    if (typeof v === 'boolean' || v === null || v === undefined)
      return push(String(v ?? null), 'lit');
    if (Array.isArray(v))
      return writeAll(
        v.map((item) => [null, item]),
        indent,
        '[',
        ']'
      );
    writeAll(Object.entries(/** @type {object} */ (v)), indent, '{', '}');
  };

  write(value, '');
  return tokens;
};
