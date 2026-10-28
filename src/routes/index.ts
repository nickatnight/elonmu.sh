import type * as express from 'express';
import type { HypeQuery } from '../hype/ports';
import type { JetQuery } from '../jet/ports';
import { type Teaser, toTeaser } from '../jet/teaser';
import * as api from './api';
import * as health from './health';
import * as hypeRoutes from './hype';
import * as jetRoutes from './jet';

const TEASER_WAIT_MS = 300;

const teaserWithin = async (
  jet: JetQuery,
  ms: number
): Promise<Teaser | null> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    const snapshot = await Promise.race([jet.snapshot(), timeout]);
    return snapshot ? toTeaser(snapshot) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

export type RouteDeps = { jet: JetQuery; hype: HypeQuery };

export const register = (
  app: express.Application,
  { jet, hype }: RouteDeps
) => {
  app.get('/', async (_req, res) => {
    res.render('index', { teaser: await teaserWithin(jet, TEASER_WAIT_MS) });
  });

  api.register(app);
  health.register(app);
  jetRoutes.register(app, jet);
  hypeRoutes.register(app, hype);
};
