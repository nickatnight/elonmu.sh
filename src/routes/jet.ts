import type * as express from 'express';
import type { JetQuery } from '../jet/ports';

export const register = (app: express.Application, jet: JetQuery) => {
  // This year's flights. A failed upstream answers 200 with an error body,
  // like /api: the server is fine, only the flight data isn't.
  app.get('/api/jet/flights', async (_req, res) => {
    try {
      const snapshot = await jet.snapshot();
      res.set('Cache-Control', 'public, max-age=60').json(snapshot);
    } catch {
      res.set('Cache-Control', 'no-store').json({
        error: 'Flight data is unavailable right now. Please try again later.'
      });
    }
  });
};
