import type * as express from 'express';

export const register = (app: express.Application) => {
  // Render's health check. Never calls NewsAPI, so an upstream outage or
  // exhausted quota can't mark the service unhealthy.
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });
};
