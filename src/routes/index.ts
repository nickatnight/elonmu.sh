import type * as express from 'express';
import type { JetQuery } from '../jet/ports';
import * as api from './api';
import * as health from './health';
import * as jetRoutes from './jet';

export const register = (app: express.Application, jet: JetQuery) => {
  // route handler for the default home page
  app.get('/', (_req, res) => {
    res.render('index');
  });

  // register our api routes
  api.register(app);
  health.register(app);
  jetRoutes.register(app, jet);
};
