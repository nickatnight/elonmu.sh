import type * as express from 'express';
import { type DogePage, dogePage } from '../doge/format';
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

  app.get('/doge', async (_req, res) => {
    let page: DogePage = { state: 'unavailable' };
    try {
      page = dogePage(await doge.comparison());
    } catch {
      res.set('Cache-Control', 'no-store');
    }
    res.render('doge', { page });
  });
};
