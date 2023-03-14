import * as express from "express";
import axios from "axios";

const NEWS_API_URL = 'https://newsapi.org/v2/everything';

export const register = ( app: express.Application ) => {

    app.get( `/api`, async ( req: any, res ) => {
        try {
            const axiosGet = await axios.get(`${NEWS_API_URL}?q=elon%20musk&apiKey=${process.env.NEWS_API_KEY}`);
            const randomArticle = axiosGet.data.articles[Math.floor(Math.random() * 100)];
            const article = {
                source: randomArticle.source.name,
                title: randomArticle.title,
                description: randomArticle.description,
                url: randomArticle.url,
                urlImage: randomArticle.urlToImage
            };
            res.json( {...article} );
        }
        catch (e) {
            const err = e as Error;
            res.json( { error: err.message || err } );
        }
    } );
};
