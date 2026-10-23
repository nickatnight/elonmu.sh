import type * as express from 'express';
import type { JetQuery } from '../jet/ports';
import { type Teaser, toTeaser } from '../jet/teaser';
import * as api from './api';
import * as health from './health';
import * as jetRoutes from './jet';

// How long the home page waits for flight data before rendering the teaser
// without it. The cache is warmed on boot, so this only bites on a cold or
// failing upstream.
const TEASER_WAIT_MS = 300;

// The teaser for home, or null if the data fails or isn't ready in time.
// Never throws: the home page must not fail because of the jet module.
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

export const register = (app: express.Application, jet: JetQuery) => {
  // route handler for the default home page
  app.get('/', async (_req, res) => {
    res.render('index', { teaser: await teaserWithin(jet, TEASER_WAIT_MS) });
  });

  // register our api routes
  api.register(app);
  health.register(app);
  jetRoutes.register(app, jet);
};
