import _ from "lodash";
import createDebug from "debug";
import express, { Application, Router, IRouter } from "express";
import {
    ConnectionMap,
    ConnectionRequest,
    INexusActiveModule,
    IRouteDefinition,
    INexusModuleDefinition,
    NexusModule,
    ModuleConfig,
    INexusDefinition
} from "@nexus-switchboard/nexus-extend";

import path from "path";
import { protectRoute } from "./auth";
import getConnectionManager from "./connections";

const logger = createDebug("nexus:moduleLoader");
export const SECRET_VAL = "__secret__";
export const ENV_VAL = "__env__";
const PROJECT_ROOT = path.resolve(__dirname, "..");

class ModuleManager {
    protected app: Application;

    // The subrouter is what is used for all route definitions for all
    //  modules.  Each module will receive its own sub application which is
    //  branched off of subRouter.  Note that the subRouter might just
    //  be the top level application.
    protected subRouter: IRouter;

    // A list of all the modules that have been instantiated and initialized
    //  successfully.
    protected activeModules: NexusModule[];

    // This is the original configuration passed to the
    protected rawConfig: INexusDefinition;

    constructor() {
        this.app = null;
    }

    /**
     * Loads all modules defined in the given config (which is the .nexus
     * config file in POJO form.
     * @param config The .nexus config file
     * @param app The application that is hosting this Nexus instance
     * @param subRouter This is the root of all other routes, if given. Otherwise
     *          the app itself is used as the root.
     */
    public initialize(
        config: INexusDefinition,
        app: Application,
        subRouter?: IRouter
    ) {
        this.app = app;
        this.subRouter = subRouter || app;
        this.activeModules = [];
        this.rawConfig = config;

        if (config && config.modules) {
            this.loadConfiguredModules(config.modules);
        }
    }

    /**
     * This will load all the modules in the given module map.  Module maps are keyed
     * on the module name (either the package name or folder name)
     * @param moduleMap The map of module names to module configuration options.
     */
    public loadConfiguredModules(moduleMap: Record<string, INexusModuleDefinition>) {
        try {
            for (const name of Object.keys(moduleMap)) {
                const modDefinition = moduleMap[name];

                if (modDefinition.path && modDefinition.scope) {
                    logger(
                        `Skipping module ${name} because the definition specified both a path and a scope.  You can only specify one or the other (or neither)`
                    );
                    continue;
                }

                let modPath: string = name;
                if (modDefinition.path) {
                    modPath = modDefinition.path
                        ? path.join(PROJECT_ROOT, modDefinition.path, name)
                        : name;
                } else if (modDefinition.scope) {
                    modPath = `@${modDefinition.scope}/${name}`;
                }

                try {
                    const absolutePathToMod = require.resolve(modPath, {
                        paths: require.main.paths
                    });
                    if (absolutePathToMod) {
                        const moduleInstance = require(absolutePathToMod)
                            .default;

                        moduleInstance.globalConfig = this.rawConfig.global;

                        this.loadModuleFromDefinition(
                            moduleInstance,
                            modDefinition
                        );
                    } else {
                        logger(
                            `Unable to find a module using the id ${modPath}`
                        );
                    }
                } catch (e) {
                    logger(
                        `Unable to find the module called ${name} - make sure that it has been added to the package.json and is  named properly in the .nexus file and try again: ${e.toString()}`
                    );
                }
            }

            return this.activeModules;
        } catch (e) {
            logger("Unable to load the given modules: " + e.toString());
            return undefined;
        }
    }

    /**
     * This will take the given module object and initialize it then store
     * its active state with the module object itself as well as store that
     * state internally within the manager.
     * @param mod The module object that was declared and instantiated by the module code
     * @param definition The definition of the module as specified by the top-level nexus config file.
     */
    public loadModuleFromDefinition(
        mod: NexusModule,
        definition: INexusModuleDefinition
    ) {
        // ALWAYS LOAD THE CONFIG BEFORE LOADING ROUTES, JOBS, etc. (Because those
        //  calls might rely on the module's configuration values.

        const activeModule: INexusActiveModule = {
            config: undefined,
            connections: undefined,
            subApp: undefined,
            jobs: undefined
        };

        activeModule.config = this.loadSecretConfig(
            mod.name,
            mod.loadConfig(definition.config)
        );

        //  **** ROUTES
        //  Note: The module will return an express router object that is then added to the application's route list.
        //      Also worth nothing that there is ALWAYS a router object associated with a module - this is necessary
        //      in some cases because even if routes are not defined directly by the module, requested connections
        //      could use the router for their own purposes.
        activeModule.subApp = this.getSubAppFromRouteDefinitions(
            mod,
            mod.loadRoutes(activeModule.config)
        );

        //  **** JOBS
        //  Note: the module itself does the instantiation of the Job objects.  The module loader simply
        //  stores the created jobs for future reference.
        activeModule.jobs = definition.jobs ? mod.loadJobs(definition.jobs) : [];

        //  **** CONNECTIONS
        // Note: The loader returns "requests" for connection.  The module loader then uses those requests
        //  to attempt to create instances of the connections using the connection manager factory method.
        activeModule.connections = this.getConnectionMapFromRequests(
            mod.loadConnections(activeModule.config, activeModule.subApp)
        );

        // This insures that the module itself has information about the running instance of itself that
        //  has been created and managed by the nexus core.
        mod.setActiveModuleData(activeModule);

        this.activeModules.push(mod);

        logger("Loaded module " + mod.name);
    }

    /**
     * Returns all the modules that were successfully initialized during the
     * initialization phase.
     */
    public getRunningModules() {
        return this.activeModules;
    }

    /**
     * Gets the active module with the given name.
     * @param name
     */
    public getModuleByName(name: string) {
        return this.activeModules.find((mod) => {
            return mod.name === name;
        });
    }

    /**
     * Creates a sub application for a specific module and uses
     * the route definitions given to populate it with routes.  Note
     * that the subapp could also be assigned routes by connections
     * that are being used by that module.
     * @param mod The module object that was instantiated.
     * @param routeDefinitions
     */
    private getSubAppFromRouteDefinitions(
        mod: NexusModule,
        routeDefinitions: IRouteDefinition[]
    ): Application {
        // Express has the notion of "sub-apps" which are both routers + event emitters that
        //  can handle all the things that a top-level app can handle.  We pass this around as
        //  if it was the main app to the module.
        const moduleExpressApp: Application = express();
        if (routeDefinitions) {
            routeDefinitions.forEach((def) => {
                if (def.method in moduleExpressApp) {
                    if (def.bodyParser) {
                        moduleExpressApp[def.method](
                            def.path,
                            def.bodyParser,
                            def.handler
                        );
                    } else {
                        moduleExpressApp[def.method](def.path, def.handler);
                    }
                    if (def.protected === true || def.protected === undefined) {
                        protectRoute(moduleExpressApp, this.rawConfig, def.path);
                    }
                } else {
                    throw new Error(
                        "Attempting to create a route using an illegal method"
                    );
                }
            });
        }

        this.subRouter.use(mod.moduleRootPath, moduleExpressApp);

        return moduleExpressApp;
    }

    /**
     * This will create the connections requested by the .nexus file inside
     * the "connections" property.  It will use the name and configuration (if any)
     * during the initialization.
     * @param connectionRequests
     */
    private getConnectionMapFromRequests(
        connectionRequests: ConnectionRequest[]
    ) {
        const connectionMap: ConnectionMap = {};
        connectionRequests.forEach((req) => {
            if (req.name in connectionMap) {
                logger(
                    "Duplicate connection request found in nexus configuration: " +
                    req.name
                );
            } else {
                connectionMap[req.name] = getConnectionManager().createConnection(req.name, req.config);
            }
        });
        return connectionMap;
    }

    /**
     * Scans the given config object looking for "__secret__" values and trying to replace them with the
     * values stored in secrets returning a copy of the original config object once complete.
     * The secrets are expected to be stored in environment variables with the form: <MODULE_NAME>_<CONFIG_NAME>.
     * to the given config object.  But the config object returned will hold the value in the original
     * name (not the module-prefixed).
     * NOTE: THIS ALWAYS RETURNS A COPY OF THE ORIGINAL CONFIG EVEN IF THERE WERE NO SECRETS FOUND.
     * @param moduleName
     * @param configOb The original config object found in the module's config.
     */
    private loadSecretConfig(
        moduleName: string,
        configOb: ModuleConfig
    ): ModuleConfig {
        const configCopy = _.cloneDeep<ModuleConfig>(configOb);
        configCopy.secrets = [];
        Object.keys(configCopy).forEach((name: string) => {
            if (
                configCopy[name] === SECRET_VAL ||
                configCopy[name] === ENV_VAL
            ) {
                const fullConfigName = `${moduleName.toUpperCase()}_${name}`;
                if (process.env.hasOwnProperty(fullConfigName)) {
                    configCopy[name] = process.env[fullConfigName];
                    configCopy.secrets.push(name);
                } else {
                    throw new Error(
                        `Unable to replace a secret configuration with an environment ` +
                        `variable: ${fullConfigName} (${name}})`
                    );
                }
            }
        });
        return configCopy;
    }
}

let moduleManager: ModuleManager = null;
const getModuleManager = () => {
    if (!moduleManager) {
        moduleManager = new ModuleManager();
    }
    return moduleManager;
};
export default getModuleManager;
