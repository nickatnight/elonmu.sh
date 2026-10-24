import { readFileSync } from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express from 'express';
import { SERVICES, type Service } from './catalog';
import { createJetModule } from './jet';
import type { JetQuery } from './jet/ports';
import { securityHeaders } from './middleware/security-headers';
import * as routes from './routes';

const publicDir = path.join(__dirname, 'public');
// Full paths, so only the root files match (not e.g. static/robots.txt)
const CRAWLER_FILES = new Set(
  ['robots.txt', 'sitemap.xml'].map((file) => path.join(publicDir, file))
);

// Static files are cached for a year, so each URL carries a hash of the file's
// contents: a changed file gets a new URL on the next deploy. Hashed once per
// file per process.
const assetUrls = new Map<string, string>();
const assetUrl = (file: string): string => {
  let url = assetUrls.get(file);
  if (!url) {
    const hash = Bun.hash(readFileSync(path.join(publicDir, file)))
      .toString(16)
      .slice(0, 8);
    url = `/${file}?v=${hash}`;
    assetUrls.set(file, url);
  }
  return url;
};

export type AppDeps = { jet?: JetQuery; services?: readonly Service[] };

// Dependencies are injectable so tests never touch a live flight source; the
// default wiring lives in the jet composition root. `services` is injectable
// so tests can prove a new catalog entry needs no template change.
export const createApp = ({
  jet = createJetModule(),
  services = SERVICES
}: AppDeps = {}): express.Express => {
  const app = express();
  app.disable('x-powered-by');

  // First, so every response gets them: pages, JSON, static files and 404s
  app.use(securityHeaders);

  // Configure Express to use EJS
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');
  app.locals.asset = assetUrl;
  app.locals.services = services;

  // Configure Express to parse incoming JSON data
  app.use(express.json());

  // Gzip compressible responses (HTML, JSON, CSS, JS). Mounted before static
  // so assets are compressed too; video and images are skipped by type.
  app.use(compression());

  // Configure static serving. Crawlers fetch robots.txt and sitemap.xml by
  // bare URL (no ?v= hash), so those two get a one-day cache instead.
  app.use(
    express.static(publicDir, {
      maxAge: 31557600000,
      setHeaders: (res, filePath) => {
        if (CRAWLER_FILES.has(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }
      }
    })
  );

  // Configure routes
  routes.register(app, jet);

  // Configure Errors
  app.use((_req, res) => {
    res.status(404).send('does not compute...');
  });

  return app;
};
