import { readFileSync } from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import express from 'express';
import { SERVICES, type Service } from './catalog';
import { createDogeModule } from './doge';
import type { DogeQuery } from './doge/ports';
import { createHypeModule } from './hype';
import type { HypeQuery } from './hype/ports';
import { createJetModule } from './jet';
import type { JetQuery } from './jet/ports';
import { TEASER_SIZE } from './jet/projection';
import { securityHeaders } from './middleware/security-headers';
import * as routes from './routes';

const publicDir = path.join(__dirname, 'public');
const CRAWLER_FILES = new Set(
  ['robots.txt', 'sitemap.xml'].map((file) => path.join(publicDir, file))
);

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

export type AppDeps = {
  jet?: JetQuery;
  hype?: HypeQuery;
  doge?: DogeQuery;
  services?: readonly Service[];
};

export const createApp = ({
  jet = createJetModule(),
  hype = createHypeModule(),
  doge = createDogeModule(),
  services = SERVICES
}: AppDeps = {}): express.Express => {
  const app = express();
  app.disable('x-powered-by');

  app.use(securityHeaders);

  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');
  app.locals.asset = assetUrl;
  app.locals.services = services;
  app.locals.teaserSize = TEASER_SIZE;

  app.use(express.json());

  app.use(compression());

  app.use(
    express.static(publicDir, {
      maxAge: 31536000000,
      setHeaders: (res, filePath) => {
        if (CRAWLER_FILES.has(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }
      }
    })
  );

  routes.register(app, { jet, hype, doge });

  app.use((_req, res) => {
    res.status(404).send('does not compute...');
  });

  return app;
};
