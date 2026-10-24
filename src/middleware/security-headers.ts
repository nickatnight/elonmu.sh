import type { RequestHandler } from 'express';

// /jet's vendored globe.gl 2.46.2 injects three small <style> elements at
// runtime (scene cursor, tooltip, nav hint). They are allowed by exact
// sha256 hash, not 'unsafe-inline': nothing else inline can run. It inserts
// each element empty and fills it after, so the empty string's hash is
// allowed too (an empty sheet styles nothing). Bumping globe.gl means
// recomputing these, or its tooltips lose their styling.
const GLOBE_GL_STYLES = [
  "'sha256-GRFgt45UbKYCV14/Fqy6H9EB3zlAwSnH4xbsYt03Q6M='",
  "'sha256-9xjtvxMT1ApHlgn9ohbh2FNfvK5Tqtzy94BjfXBeMSY='",
  "'sha256-yfc2FhpkFR0EAy3T+zDsaAFGXSP9B3ELNvaJKDzNhkk='",
  "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='"
];

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  `style-src 'self' ${GLOBE_GL_STYLES.join(' ')}`,
  "img-src 'self' https:",
  "media-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

const headers: Record<string, string> = {
  'Content-Security-Policy': csp,
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin'
};

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.set(headers);
  next();
};
