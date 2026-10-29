/** @type {Record<string, string>} */
const HOME_ANCHORS_MOVED_TO_DOCS = {
  '#get-api': '/docs#news-api',
  '#errors': '/docs#errors'
};

/**
 * @param {string} hash
 * @returns {string | null}
 */
export const docsTarget = (hash) =>
  Object.hasOwn(HOME_ANCHORS_MOVED_TO_DOCS, hash)
    ? HOME_ANCHORS_MOVED_TO_DOCS[hash]
    : null;

if (typeof location !== 'undefined') {
  const target = docsTarget(location.hash);
  if (target) location.replace(target);
}
