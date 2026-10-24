import type * as express from 'express';
import { type JetPage, jetPage } from '../jet/format';
import type { JetQuery } from '../jet/ports';
import { upstreamFailure } from './upstream-failure';

export const register = (app: express.Application, jet: JetQuery) => {
  app.get('/api/jet/flights', async (_req, res) => {
    try {
      const snapshot = await jet.snapshot();
      res.set('Cache-Control', 'public, max-age=60').json(snapshot);
    } catch {
      res.set('Cache-Control', 'no-store');
      upstreamFailure(
        res,
        'Flight data is unavailable right now. Please try again later.'
      );
    }
  });

  app.get('/jet', async (_req, res) => {
    let page: JetPage | null = null;
    try {
      page = jetPage(await jet.snapshot());
    } catch {
      res.set('Cache-Control', 'no-store');
    }
    res.render('jet', { page });
  });
};
