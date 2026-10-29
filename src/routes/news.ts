import type * as express from 'express';
import {
  type NewsFailure,
  type NewsQuery,
  NewsUpstreamError
} from '../news/ports';
import { upstreamFailure } from './upstream-failure';

const FAILURES: Record<NewsFailure, { upstream: boolean; error: string }> = {
  'error-response': {
    upstream: true,
    error: 'There was an error with NewsAPI. Please try again later.'
  },
  'no-response': {
    upstream: true,
    error: 'There was an error with request. Please try again later.'
  },
  'not-sent': {
    upstream: false,
    error: 'Something broke. Please try again later.'
  }
};

const UNKNOWN_ERROR = 'An unknown error occurred. Please try again later.';

export const register = (app: express.Application, news: NewsQuery) => {
  app.get('/api/news', async (_req, res) => {
    try {
      res.json(await news.random());
    } catch (err: unknown) {
      if (!(err instanceof NewsUpstreamError)) {
        res.status(500).json({ error: UNKNOWN_ERROR });
        return;
      }
      const { upstream, error } = FAILURES[err.failure];
      if (upstream) upstreamFailure(res, error);
      else res.status(500).json({ error });
    }
  });
};
