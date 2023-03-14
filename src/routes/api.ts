import * as express from "express";

export const register = ( app: express.Application ) => {

    app.get( `/`, async ( req: any, res ) => {
        try {
            const data = {"hello": "stark"};
            return res.json( data );
        } catch ( e ) {
            const err = e as Error;
            // tslint:disable-next-line:no-console
            console.error(err);
            res.json( { error: err.message || err } );
        }
    } );
};
