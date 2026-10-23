import express from 'express';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as routes from './routes';

const publicDir = path.join(__dirname, 'public');

// Static files are cached for a year, so each URL carries a hash of the file's
// contents: a changed file gets a new URL on the next deploy.
const assetUrl = (file: string): string => {
  const hash = Bun.hash(readFileSync(path.join(publicDir, file)))
    .toString(16)
    .slice(0, 8);
  return `/${file}?v=${hash}`;
};

export const createApp = (): express.Express => {
  const app = express();

  // Configure Express to use EJS
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');
  app.locals.assets = {
    css: assetUrl('static/css/main.css')
  };

  // Configure Express to parse incoming JSON data
  app.use(express.json());

  // Configure static serving
  app.use(express.static(publicDir, { maxAge: 31557600000 }));

  // Configure routes
  routes.register(app);

  // Configure Errors
  app.use((_req, res) => {
    res.status(404).send('does not compute...');
  });

  return app;
};
