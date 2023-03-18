import * as express from 'express';
import { fetchNewsArticle } from '../services/news.service';

export const register = (app: express.Application) => {
  app.get(`/api`, async (req: any, res) => {
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
    } catch (e) {
      const err = e as Error;
      res.json({ error: err.message || err });
    }
  });
};
