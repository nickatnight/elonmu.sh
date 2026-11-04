import type * as express from 'express';
import type { StarlinkSnapshot } from '../starlink/domain';
import { type StarlinkPage, starlinkPage } from '../starlink/format';
import type { StarlinkQuery } from '../starlink/ports';
import { upstreamFailure } from './upstream-failure';

const isComplete = (snapshot: StarlinkSnapshot): boolean =>
  snapshot.satellites !== null && snapshot.reentries !== null;

export const register = (app: express.Application, starlink: StarlinkQuery) => {
  const bodies = new WeakMap<StarlinkSnapshot, string>();
  const bodyOf = (snapshot: StarlinkSnapshot): string => {
    let body = bodies.get(snapshot);

    if (body === undefined) {
      body = JSON.stringify(snapshot);
      bodies.set(snapshot, body);
    }

    return body;
  };

  app.get('/api/starlink', async (_req, res) => {
    try {
      const snapshot = await starlink.snapshot();

      res
        .set(
          'Cache-Control',
          isComplete(snapshot) ? 'public, max-age=3600' : 'no-store'
        )
        .type('json')
        .send(bodyOf(snapshot));
    } catch {
      res.set('Cache-Control', 'no-store');
      upstreamFailure(
        res,
        'Starlink data is unavailable right now. Please try again later.'
      );
    }
  });

  app.get('/starlink', async (_req, res) => {
    let page: StarlinkPage = { state: 'unavailable' };

    try {
      const snapshot = await starlink.snapshot();

      page = starlinkPage(snapshot);

      if (!isComplete(snapshot)) res.set('Cache-Control', 'no-store');
    } catch {
      res.set('Cache-Control', 'no-store');
    }

    res.render('starlink', { page });
  });
};
