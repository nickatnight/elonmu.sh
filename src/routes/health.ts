import type * as express from 'express';

export const register = (app: express.Application) => {
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });
};
