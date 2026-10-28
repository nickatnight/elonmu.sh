/**
 * @typedef {{ doge: string, atShowtime: string, today: string }} Holding
 * @typedef {{ hidden: boolean, dataset: DOMStringMap }} Held
 * @typedef {EventTarget & {
 *   value: string, valueAsNumber: number,
 *   setAttribute(name: string, value: string): void
 * }} Control
 * @typedef {{ dataset: DOMStringMap, textContent: string | null }} Output
 */

export const MIN_DOGE = 10;
export const MAX_DOGE = 10_000_000;
export const SLIDER_STEPS = 1000;

const DECADES = Math.log10(MAX_DOGE / MIN_DOGE);

const cents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const coins = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/**
 * @param {number} position
 * @returns {number}
 */
export const amountAt = (position) => {
  const amount = MIN_DOGE * 10 ** ((position / SLIDER_STEPS) * DECADES);
  return amount >= 1000 ? Math.round(amount / 10) * 10 : Math.round(amount);
};

/**
 * @param {number} amount
 * @returns {number}
 */
export const positionOf = (amount) => {
  const clamped = Math.min(Math.max(amount, MIN_DOGE), MAX_DOGE);
  return Math.round((Math.log10(clamped / MIN_DOGE) / DECADES) * SLIDER_STEPS);
};

/**
 * @param {string} text
 * @returns {number | null}
 */
export const parseAmount = (text) => {
  if (text.trim() === '') return null;
  const amount = Number(text);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
};

/**
 * @param {number} amount
 * @param {number} snlUsd
 * @param {number} nowUsd
 * @returns {Holding}
 */
export const holding = (amount, snlUsd, nowUsd) => ({
  doge: coins.format(amount),
  atShowtime: cents.format(amount * snlUsd),
  today: cents.format(amount * nowUsd)
});

/**
 * @param {{
 *   held: Held, field: Control, range: Control, outputs: Iterable<Output>
 * }} parts
 */
export const startHeldControl = ({ held, field, range, outputs }) => {
  const snlUsd = Number(held.dataset.snlUsd);
  const nowUsd = Number(held.dataset.nowUsd);
  if (!(snlUsd > 0 && nowUsd > 0)) return;

  /** @param {number} amount */
  const render = (amount) => {
    const values = holding(amount, snlUsd, nowUsd);
    for (const el of outputs) {
      const key = /** @type {keyof Holding} */ (el.dataset.out);
      el.textContent = values[key];
    }
    range.setAttribute('aria-valuetext', `${values.doge} DOGE`);
  };

  range.addEventListener('input', () => {
    const amount = amountAt(range.valueAsNumber);
    field.value = String(amount);
    render(amount);
  });

  field.addEventListener('input', () => {
    const amount = parseAmount(field.value);
    if (amount === null) return;
    range.value = String(positionOf(amount));
    render(amount);
  });

  held.hidden = false;
};

const start = () => {
  /** @type {HTMLElement | null} */
  const held = document.querySelector('[data-snl-usd]');
  const field = held?.querySelector('input[type="number"]');
  const range = held?.querySelector('input[type="range"]');
  if (
    !held ||
    !(field instanceof HTMLInputElement) ||
    !(range instanceof HTMLInputElement)
  )
    return;
  /** @type {NodeListOf<HTMLElement>} */
  const outputs = document.querySelectorAll('[data-out]');
  startHeldControl({ held, field, range, outputs });
};

if (typeof document !== 'undefined') start();
