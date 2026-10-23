import type { RequestHandler } from 'express';

// Fitted to what the page loads; add a source here when the page needs one.
// Everything is self-hosted except article images from /api, which come from
// any news site over HTTPS. The hero's `style="--still: url(…)"` keeps its
// content-hashed poster URL, hence the inline style attribute allowance.
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
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
  // No `preload`: getting onto the preload list is hard to undo.
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
