import _ from "lodash";
import createDebug from "debug";
import express, {Application, Router, IRouter} from "express";
import {
    ConnectionMap,
    ConnectionRequestDefinition,
    INexusActiveModule,
    IRouteDefinition,
    NexusModuleDefinition,
    NexusModule,
    NexusModuleConfig
} from "@nexus-switchboard/nexus-extend";
import path from "path";
import {protectRoute} from "./auth";
import getConnectionManager from "./connections";
import cookieParser = require("cookie-parser");

const logger = createDebug("nexus:moduleLoader");
export const SECRET_VAL = "__secret__";
export const ENV_VAL = "__env__";
const PROJECT_ROOT = path.resolve(__dirname, "..");

class ModuleManager {

    protected app: Application;
    protected subRouter: IRouter;
    protected activeModules: NexusModule[];
    protected rawConfig: NexusModuleConfig;

    constructor() {
        this.app = null;
    }

    public initialize(config: Record<string, any>, app: Application, subRouter?: IRouter) {
        this.app = app;
        this.subRouter = subRouter || app;
        this.activeModules = [];
        this.loadConfiguredModules(config);
    }

    public loadConfiguredModules(config: Record<string, any>) {
        try {
            this.rawConfig = config;
            const mods = config.modules;
            if (!mods) {
                logger("It looks like there were no modules configured.  That seems....wrong.");
                return undefined;
            }

            for (const name of Object.keys(mods)) {
                const modDefinition = mods[name];

                if (modDefinition.path && modDefinition.scope) {
                     logger(`Skipping module ${name} because the definition specified both a path and a scope.  You can only specify one or the other (or neither)`);
                     continue;
                }

                let modPath: string = name;
                if (modDefinition.path) {
                    modPath = modDefinition.path ? path.join(PROJECT_ROOT, modDefinition.path, name) : name;
                } else if (modDefinition.scope) {
                    modPath = `@${modDefinition.scope}/${name}`;
                }

                try {
                    const absolutePathToMod = require.resolve(modPath, {paths: require.main.paths});
                    if (absolutePathToMod) {
                        const moduleInstance = require(absolutePathToMod).default;
                        this.loadModuleFromDefinition(moduleInstance, modDefinition);
                    } else {
                        logger(`Unable to find a module using the id ${modPath}`);
                    }

                } catch (e) {
                    logger(`Unable to find the module called ${name} - make sure that it has been added to the package.json and is  named properly in the .nexus file and try again: ${e.toString()}`);
                }
            }

            return this.activeModules;
        } catch (e) {
            logger("Unable to load the given modules: " + e.toString());
            return undefined;
        }
    }

    public loadModuleFromDefinition(mod: NexusModule,
                                    definition: NexusModuleDefinition) {

        // ALWAYS LOAD THE CONFIG BEFORE LOADING ROUTES, JOBS, etc. (Because those
        //  calls might rely on the module's configuration values.

        const activeModule: INexusActiveModule = {
            config: undefined,
            connections: undefined,
            router: undefined,
            jobs: undefined
        };

        activeModule.config = this.loadSecretConfig(mod.name, mod.loadConfig(definition.config));

        //  **** ROUTES
        //  Note: The module will return an express router object that is then added to the application's route list.
        //      Also worth nothing that there is ALWAYS a router object associated with a module - this is necessary
        //      in some cases because even if routes are not defined directly by the module, requested connections
        //      could use the router for their own purposes.
        activeModule.router = this.getRouterFromRouteDefinitions(mod.name, mod.loadRoutes(activeModule.config));

        //  **** JOBS
        //  Note: the module itself does the instantiation of the Job objects.  The module loader simply
        //  stores the created jobs for future reference.
        activeModule.jobs = definition.jobs ? mod.loadJobs(definition.jobs) : [];

        //  **** CONNECTIONS
        // Note: The loader returns "requests" for connection.  The module loader then uses those requests
        //  to attempt to create instances of the connections using the connection manager factory method.
        activeModule.connections = this.getConnectionMapFromRequests(
            mod.loadConnections(activeModule.config, activeModule.router));

        // This insures that the module itself has information about the running instance of itself that
        //  has been created and managed by the nexus core.
        mod.setActiveModuleData(activeModule);

        this.activeModules.push(mod);

        logger("Loaded module " + mod.name);
    }

    public getRunningModules() {
        return this.activeModules;
    }

    public getModuleByName(name: string) {
        return this.activeModules.find((mod) => {
            return mod.name === name;
        });
    }

    private getRouterFromRouteDefinitions(moduleName: string, routeDefinitions: IRouteDefinition[]) {

        const moduleRouter: IRouter = Router();
        if (routeDefinitions) {
            routeDefinitions.forEach((def) => {
                if (def.method in moduleRouter) {

                    if (def.bodyParser) {
                        moduleRouter[def.method](def.path, def.bodyParser, def.handler);
                    } else {
                        moduleRouter[def.method](def.path, def.handler);
                    }
                    if (def.protected === true || def.protected === undefined) {
                        protectRoute(moduleRouter, this.rawConfig, def.path);
                    }
                } else {
                    throw new Error("Attempting to create a route using an illegal method");
                }
            });

            this.subRouter.use(`/m/${moduleName}`, moduleRouter);
        }
        return moduleRouter;
    }

    private getConnectionMapFromRequests(connectionRequests: ConnectionRequestDefinition[]) {
        const connectionMap: ConnectionMap = {};
        connectionRequests.forEach((req) => {
            if (req.name in connectionMap) {
                logger("Duplicate connection request found in nexus configuration: " + req.name);
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
    private loadSecretConfig(moduleName: string, configOb: NexusModuleConfig): NexusModuleConfig {

        const configCopy = _.cloneDeep<NexusModuleConfig>(configOb);
        configCopy.secrets = [];
        Object.keys(configCopy).forEach((name: string) => {
            if (configCopy[name] === SECRET_VAL || configCopy[name] === ENV_VAL) {
                const fullConfigName = `${moduleName.toUpperCase()}_${name}`;
                if (process.env.hasOwnProperty(fullConfigName)) {
                    configCopy[name] = process.env[fullConfigName];
                    configCopy.secrets.push(name);
                } else {
                    throw new Error(`Unable to replace a secret configuration with an environment ` +
                        `variable: ${fullConfigName} (${name}})`);
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
