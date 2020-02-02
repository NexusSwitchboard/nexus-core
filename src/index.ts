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

// loads .env files into process env
config();

export const addNexusToExpressApp = (app: Application) => {
    // Load the nexus config file
    const pathToNexusConfig = "./.nexus";
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
            protectRoute(mainRouter, "/api", "admin");
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

export const startNexusServer = () => {

    const app = express();

    /**
     * Get port from environment and store in Express.
     */
    const port = normalizePort(process.env.PORT || "3001");
    app.set("port", port);

    /**
     * Create HTTP server.
     */

    const server = http.createServer(app);

    /**
     * Listen on provided port, on all network interfaces.
     */

    server.listen(port);
    server.on("error", onError);
    server.on("listening", onListening);

    /**
     * Normalize a port into a number, string, or false.
     */

    function normalizePort(val: any) {
        const p = parseInt(val, 10);

        if (isNaN(p)) {
            // named pipe
            return val;
        }

        if (p >= 0) {
            // port number
            return p;
        }

        return false;
    }

    /**
     * Event listener for HTTP server "error" event.
     */

    function onError(error: any) {
        if (error.syscall !== "listen") {
            throw error;
        }

        const bind = typeof port === "string"
            ? "Pipe " + port
            : "Port " + port;

        // handle specific listen errors with friendly messages
        switch (error.code) {
            case "EACCES":
                mainLogger(bind + " requires elevated privileges");
                process.exit(1);
                break;
            case "EADDRINUSE":
                mainLogger(bind + " is already in use");
                process.exit(1);
                break;
            default:
                throw error;
        }
    }

    /**
     * Event listener for HTTP server "listening" event.
     */

    function onListening() {
        const addr = server.address();
        const bind = typeof addr === "string"
            ? "pipe " + addr
            : "port " + addr.port;
        mainLogger("Listening on " + bind);
    }

    app.use(logger("dev"));

    ///////////// GLOBAL MIDDLEWARE
    //// BODY PARSERS
    app.use(express.json());
    app.use(express.urlencoded({extended: false}));

    //// OTHER PARSERS
    app.use(cookieParser());
    app.use(express.static(path.join(__dirname, "public")));

    //////////////  SETUP FOUNDATION API
    protectRoute(app, "/api", "admin");
    app.use("/api", apiRouter);

    return app;
};
