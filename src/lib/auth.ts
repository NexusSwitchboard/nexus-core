import jwt from "express-jwt";
import {IRouter, Request, Response, NextFunction} from "express";
import jwks from "jwks-rsa";

/**
 * This  adds the "user" field to the Request object so the linter will not complain about an unknown prop.
 */
declare module "express" {
    // tslint:disable-next-line:interface-name
    interface Request {
        user: Record<string, any>;
    }
}

const jwtCheck = jwt({
    secret: jwks.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: "https://ua-ecomm.auth0.com/.well-known/jwks.json"
    }),
    audience: "https://nexus.ua.dev",
    issuer: "https://ua-ecomm.auth0.com/",
    algorithms: ["RS256"]
});

const requireScope = (expectedScope: string) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user || !req.user.scope || req.user.scope.split(" ").indexOf(expectedScope) < 0) {
            return next(new Error("Cannot perform action. Missing scope " + expectedScope));
        }
        next();
    };
};

/**
 * Call this to ensure to add middleware that validates there is a nexus token  attached to the
 * request.  Optionally, you can request that there is a given scope associated with that token.  Note
 * that you can pass in an Express Application or a Router instance since both are derived from IRouter.
 * @param router
 * @param path
 * @param scope
 */
export const protectRoute = (router: IRouter, path: string, scope?: string) => {
    router.use(path, jwtCheck);
    if (scope) {
        router.use(path, requireScope(scope));
    }
};
