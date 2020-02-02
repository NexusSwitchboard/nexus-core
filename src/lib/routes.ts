import {Router} from "express";

/**
 * For a given router, returns a list of route data
 * @param router
 */
export function listRoutes(router: Router) {
    return router.stack
        .filter((r) => (r.route && r.route.path))
        .map((r, i) => {
            return r.route.stack.map((type: any) => {
                return {
                    no: i,
                    method: type.method.toUpperCase(),
                    path: r.route.path
                };
            });
        });
}
