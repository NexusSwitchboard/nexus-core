import cookieParser from "cookie-parser";
import createDebug from "debug";
import {config} from "dotenv";
import express, {Application, Router} from "express";

import fs from "fs";
import http from "http";
import logger from "morgan";
import path from "path";
import apiRouter from "./api";
import {protectRoute} from "./lib/auth";
import getConnectionManager from "./lib/connections";
import getModuleManager from "./lib/modules";

export const mainLogger = createDebug("nexus:server");

config();

/**
 * If you already have an Express app created and want to simply
 * add Nexus functionality, use this function and pass in the created
 * Express app.  Note that you should NOT create any body parsers at
 * the app level as it might cause problems with some modules which expect
 * to have access to the raw body.
 *
 * @param app The application to add Nexus to
 * @param configPath (optional) The path to the nexus config file.  If not given, it will look in the current working
 *          directory for a file called .nexus.
 */
export const addNexusToExpressApp = (app: Application, configPath: string = undefined) => {
    // Load the nexus config file
    const pathToNexusConfig = configPath || "./.nexus";
    if (fs.existsSync(pathToNexusConfig)) {

        try {
            const nexusConfigStr = fs.readFileSync(pathToNexusConfig).toString();
            const nexusConfigOb = JSON.parse(nexusConfigStr);

            const mainRouter = Router();

            // IMPORTANT: Connections MUST be initialized first otherwise there will be no connections
            //      available to the modules that request them.
            getConnectionManager().initialize(nexusConfigOb, app, mainRouter);
            getModuleManager().initialize(nexusConfigOb, app, mainRouter);

            /**
             * Store the package.json object in the app for future reference
             */
            const pathToPackageJson = path.resolve("package.json");
            const pkgContentsStr = fs.readFileSync(pathToPackageJson, "utf8");
            app.set("package", JSON.parse(pkgContentsStr));

            //////////////  SETUP FOUNDATION API
            protectRoute(mainRouter, nexusConfigOb, "/api", "admin");
            mainRouter.use("/api", apiRouter);

            app.use(nexusConfigOb.rootUri || "/nexus", mainRouter);
        } catch (e) {
            mainLogger("Failed to load Nexus into Express server: " + e.toString());
        }

    } else {
        mainLogger("Unable to find the .nexus config file");
        throw new Error("Unable to find the .nexus config file");
    }
};

/**
 * Instatiates and starts a server to listen for Nexus traffic
 * based on configuration options made available in the .nexus file
 * 
 * @param port The port to listen for traffic on
 * @param configPath (optional) The path to the nexus config file.  If not given, it will look in the current working
 *          directory for a file called .nexus.
 */
export const startNexusServer = (port: string, configPath: string = undefined) => {

    const app = express();

    app.set("port", port);
    const server = http.createServer(app);
    server.listen(port);
    app.use(logger("nexus:express"));

    addNexusToExpressApp(app, configPath);

    return app;
};
