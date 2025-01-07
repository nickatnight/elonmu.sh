import * as express from 'express';
import * as api from './api';
import * as path from 'path';
import axios from 'axios';

export const register = (app: express.Application) => {
  // route handler for the default home page
  app.get('/', (req: any, res) => {
    // res.render('index');
    res.sendFile('public/index.html', { root: path.join(__dirname, '..') });
  });

  // register our api routes
  api.register(app);
};
