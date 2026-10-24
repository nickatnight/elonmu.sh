import { AxiosError } from 'axios';
import type * as express from 'express';
import { fetchNewsArticle } from '../services/news.service';
import { upstreamFailure } from './upstream-failure';

export const register = (app: express.Application) => {
  app.get('/api/news', async (_req, res) => {
    try {
      const randomArticle = await fetchNewsArticle();
      const article = {
        source: randomArticle.source.name,
        title: randomArticle.title,
        description: randomArticle.description,
        url: randomArticle.url,
        urlImage: randomArticle.urlToImage,
        publishDate: randomArticle.publishedAt
      };
      res.json({ ...article });
    } catch (err: unknown) {
      if (err instanceof AxiosError && err.response) {
        upstreamFailure(
          res,
          'There was an error with NewsAPI. Please try again later.'
        );
      } else if (err instanceof AxiosError && err.request) {
        upstreamFailure(
          res,
          'There was an error with request. Please try again later.'
        );
      } else {
        const error =
          err instanceof AxiosError
            ? 'Something broke. Please try again later.'
            : 'An unknown error occurred. Please try again later.';
        res.status(500).json({ error });
      }
    }
  });
};
