import type * as express from 'express';
import type { DogeQuery } from '../doge/ports';
import { upstreamFailure } from './upstream-failure';

export const register = (app: express.Application, doge: DogeQuery) => {
  app.get('/api/doge', async (_req, res) => {
    try {
      const comparison = await doge.comparison();
      res.set('Cache-Control', 'public, max-age=300').json(comparison);
    } catch {
      res.set('Cache-Control', 'no-store');
      upstreamFailure(
        res,
        'Dogecoin prices are unavailable right now. Please try again later.'
      );
    }
  });
};
