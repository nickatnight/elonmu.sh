import * as express from "express";
import * as api from "./api";

export const register = ( app: express.Application ) => {
    api.register( app );
};
