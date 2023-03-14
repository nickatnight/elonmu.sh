import * as express from "express";
import axios from "axios";

const NEWS_API_URL = 'https://newsapi.org/v2/everything';

export const register = ( app: express.Application ) => {

    app.get( `/api`, async ( req: any, res ) => {
        try {
            const axiosGet = await axios.get(`${NEWS_API_URL}?q=elon%20musk&apiKey=${process.env.NEWS_API_KEY}`);
            res.json(axiosGet.data.articles[Math.floor(Math.random() * 100)]);
        }
        catch (e) {
            const err = e as Error;
            res.json( { error: err.message || err } );
        }
    } );
};
