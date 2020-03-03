import { Application, Express } from "express";
import listEndpoints from "express-list-endpoints";

/**
 * For a given router, returns a list of route data
 * @param app
 */
export function listRoutes(app: Application) {
    return listEndpoints(app as Express);
}
