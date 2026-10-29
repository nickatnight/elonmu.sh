import type * as express from 'express';
import { EXAMPLES, UPSTREAM_ERROR_EXAMPLE } from '../docs/examples';
import { tokenize } from '../public/static/js/console.js';

const examples = {
  ...Object.fromEntries(
    Object.entries(EXAMPLES).map(([id, example]) => [id, tokenize(example)])
  ),
  errors: tokenize(UPSTREAM_ERROR_EXAMPLE)
};

export const register = (app: express.Application) => {
  app.get('/docs', (_req, res) => {
    res.render('docs', { examples });
  });
};
