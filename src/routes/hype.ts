import type * as express from 'express';
import { type HypePage, hypePage } from '../hype/format';
import type { HypeQuery } from '../hype/ports';
import { upstreamFailure } from './upstream-failure';

export const register = (app: express.Application, hype: HypeQuery) => {
  app.get('/api/hype', async (_req, res) => {
    try {
      const series = await hype.series();
      res.set('Cache-Control', 'public, max-age=3600').json(series);
    } catch {
      res.set('Cache-Control', 'no-store');
      upstreamFailure(
        res,
        'Pageview data is unavailable right now. Please try again later.'
      );
    }
  });

  app.get('/hype', async (_req, res) => {
    let page: HypePage = { state: 'unavailable' };
    try {
      page = hypePage(await hype.series());
    } catch {
      res.set('Cache-Control', 'no-store');
    }
    res.render('hype', { page });
  });
};
