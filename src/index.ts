import createDebug from "debug";
import {config} from "dotenv";
import {Application, Router} from "express";

import fs from "fs";
import path from "path";
import apiRouter from "./api";
import {protectRoute} from "./lib/auth";

import getModuleManager from "./lib/modules";
export {loadNexusConfigFromFile} from "./lib/config";
import _ from "lodash";

import {INexusDefinition} from "./extend";

//// EXTENSION HELPERS

export {
    Connection,
    ConnectionConfig,
    ConnectionFactory
} from "./extend/connections";

export {
    Job,
    NexusJobDefinition,
    NexusJobOptions,
    NexusJobStatus
} from "./extend/jobs";

export {
    NexusModule,
    ModuleConfig,
    IRouteDefinition,
    INexusActiveModule,
    INexusModuleDefinition,
    IConfigGroupRule,
    IConfigGroups,
    ConfigType
} from "./extend/modules";

export {
    findNestedProperty,
    findProperty,
    getNestedVal,
    hasOwnProperties,
    loadTemplate,
    replaceAll,
    listRoutes,
    checkConfig,
    nestedAssign
} from "./extend/helpers";

export {
    GlobalConfig,
    INexusDefinition
} from "./extend";

////

export const mainLogger = createDebug("nexus:server");
export type NexusDefinitionFunc = () => INexusDefinition;

config();

/**
 * If you already have an Express app created and want to simply
 * add Nexus functionality, use this function and pass in the created
 * Express app.  Note that you should NOT create any body parsers at
 * the app level as it might cause problems with some modules which expect
 * to have access to the raw body.
 *
 * @param app The application to add Nexus to
 * @param cfg (optional) This can be either a path to a nexus file, a nexus definition object or a function that
 *          returns a nexus definition object.
 */
export const addNexusToExpressApp = (app: Application,
                                     cfg: INexusDefinition | NexusDefinitionFunc = undefined) => {
    // Load the nexus config file
    let nexusDefinition: INexusDefinition;
    if (_.isFunction(cfg)) {
        nexusDefinition = cfg();
    } else if (_.isPlainObject(cfg)) {
        nexusDefinition = cfg;
    }

    if (nexusDefinition) {

        try {
            const mainRouter = Router();

            getModuleManager().initialize(nexusDefinition, app, mainRouter);

            /**
             * Store the package.json object in the app for future reference
             */
            const pathToPackageJson = path.resolve("package.json");
            const pkgContentsStr = fs.readFileSync(pathToPackageJson, "utf8");
            app.set("package", JSON.parse(pkgContentsStr));
           
            //////////////  SETUP FOUNDATION API
            protectRoute(mainRouter, nexusDefinition, "/api", "admin");
            mainRouter.use("/api", apiRouter);

            app.use(nexusDefinition.global.nexusPath || "/nexus", mainRouter);
        } catch (e) {
            mainLogger("Failed to load Nexus into Express server: " + e.toString());
        }

    } else {
        throw new Error("Nexus definition does not appear to be valid");
    }
};
