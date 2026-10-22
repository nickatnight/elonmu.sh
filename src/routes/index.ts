import type * as express from 'express';
import * as api from './api';

export const register = (app: express.Application) => {
  // route handler for the default home page
  app.get('/', (_req, res) => {
    res.render('index');
  });

  // register our api routes
  api.register(app);
};
