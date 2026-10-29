/** @typedef {'key' | 'str' | 'num' | 'lit' | 'more'} TokenKind */
/** @typedef {{ kind: TokenKind | null, text: string }} Token */

const KEEP = 3;

class HiddenItems {
  /** @param {number} count */
  constructor(count) {
    this.count = count;
  }
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
export const trim = (value) => {
  if (Array.isArray(value)) {
    const kept = value.slice(0, KEEP).map(trim);
    return value.length > KEEP
      ? [...kept, new HiddenItems(value.length - KEEP)]
      : kept;
  }
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, trim(child)])
    );
  return value;
};

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
    if (v instanceof HiddenItems) return push(`… ${v.count} more`, 'more');
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

/**
 * @param {Document} doc
 * @param {string} text
 */
const announce = (doc, text) => {
  const live = doc.querySelector('.announce');
  if (live) live.textContent = text;
};

/**
 * @param {Element} code
 * @param {unknown} body
 */
const renderJson = (code, body) => {
  const doc = code.ownerDocument;
  code.replaceChildren(
    ...tokenize(trim(body)).map(({ kind, text }) => {
      if (!kind) return doc.createTextNode(text);
      const span = doc.createElement('span');
      span.className = `tok-${kind}`;
      span.textContent = text;
      return span;
    })
  );
};

/**
 * @param {HTMLButtonElement} send
 * @param {{ fetch: (url: string, init: RequestInit) => Promise<Response> }} deps
 */
export const startSend = (send, { fetch }) => {
  const figure = send.closest('figure');
  const pre = /** @type {HTMLElement | null | undefined} */ (
    figure?.querySelector('pre')
  );
  const code = pre?.querySelector('code');
  const label = figure?.querySelector('.code__label');
  const full = /** @type {HTMLElement | null | undefined} */ (
    figure?.querySelector('.code__full')
  );
  const api = send.dataset.api;
  if (!pre || !code || !label || !full || !api) return;
  let tallest = 0;

  /**
   * @param {string} status
   * @param {unknown} body
   */
  const show = (status, body) => {
    tallest = Math.max(tallest, pre.getBoundingClientRect().height);
    pre.style.minHeight = `${tallest}px`;
    renderJson(code, body);
    pre.dataset.fullResponse = JSON.stringify(body, null, 2);
    label.textContent = `Preview · ${status}`;
    full.hidden = false;
    const error = /** @type {{ error?: unknown }} */ (body)?.error;
    announce(
      send.ownerDocument,
      typeof error === 'string'
        ? `Error: ${error}`
        : `Loaded: ${label.textContent}`
    );
  };

  const run = async () => {
    send.disabled = true;
    send.textContent = 'Sending…';
    label.textContent = 'Waiting for the Lord…';
    try {
      const res = await fetch(api, { headers: { accept: 'application/json' } });
      const body = await res.json().catch(() => ({
        error: 'The response was not JSON. Please try again.'
      }));
      show(`${res.status} ${res.ok ? 'OK' : 'Error'} · live`, body);
    } catch {
      show('No response', {
        error: 'Could not reach elonmu.sh. Please try again later.'
      });
    } finally {
      send.disabled = false;
      send.textContent = 'Send';
    }
  };

  send.addEventListener('click', run);
  send.hidden = false;
  return run;
};

/**
 * @param {HTMLButtonElement} button
 * @param {{
 *   clipboard: Pick<Clipboard, 'writeText'>,
 *   later: (fn: () => void, ms: number) => unknown
 * }} deps
 */
export const startCopy = (button, { clipboard, later }) => {
  const pre = /** @type {HTMLElement | null | undefined} */ (
    button.closest('figure')?.querySelector('pre')
  );
  if (!pre) return;

  const run = async () => {
    try {
      await clipboard.writeText(
        pre.dataset.fullResponse ?? pre.textContent ?? ''
      );
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Failed';
    }
    announce(button.ownerDocument, button.textContent);
    later(() => {
      button.textContent = 'Copy';
    }, 1500);
  };

  button.addEventListener('click', run);
  button.hidden = false;
  return run;
};

const start = () => {
  for (const send of document.querySelectorAll('button[data-api]'))
    startSend(/** @type {HTMLButtonElement} */ (send), {
      fetch: (...args) => fetch(...args)
    });
  if (!navigator.clipboard) return;
  for (const button of document.querySelectorAll('.copy'))
    startCopy(/** @type {HTMLButtonElement} */ (button), {
      clipboard: navigator.clipboard,
      later: setTimeout
    });
};

if (typeof document !== 'undefined') start();
