import { Application, NextFunction, Request, Response } from "express";
import { Connection, ConnectionMap, ConnectionRequest } from "./connections";
import { Job, NexusJobDefinition } from "./jobs";
import { NextHandleFunction } from "connect";
import { GlobalConfig} from "./index";

/**
 * Modules
 *
 * Modules are where most Nexus functionality lives.  Modules can have their own endpoints, can run their own  jobs
 * on a schedule and can have their own connections.  Configuration of modules is done through the .nexus
 * file used by this instance of Nexus.  Using that file, Nexus will load each module by calling a set of "loader"
 * functions that are defined in their `INexusModuleDefinition`-based object that is exported by default from the
 * modules index.ts (in the root of the module)
 *
 * Configuration - Configuration is the module-specific dictionary of options available to the
 *      user.  The configuration as given in the nexus configuration is passed in and the loader
 *      can do validation and/or transformation of incoming configurations as needed with this loader.
 *
 *  Routes - Routes allows for the creation of an Express router that can be initialized by the module and
 *      passed back to the core.  Note that the routes that are created will live behind the module-specific route
 *      in all cases.  For example if you create a route `cars/:id` and your module is called `auto` then the
 *      final route will be `/m/auto/cars/:id`.  Routes can also be "protected" meaning that they will not be
 *      accessible without a nexus client ID.  And of course, you can setup your own protection within the  module
 *      by calling "use" to insert middleware into the router.
 *
 *   Jobs - Jobs are the bespoke way of defining a focused action on a regular schedule.  The module should
 *      build job classes that are derived from the Job class available in the nexus extension package.  When the job
 *      loader is called, the module should check the type of the job being requested, the schedule and the job options
 *      and use those to instantiate the job.  The core will manage the jobs and execute as needed.
 *
 *  Connections - Connections are the third-party integrations that allow for the connection of different tools using
 *      your module as the glue.  In this loader, you will return instances of the types of connections that your
 *      module supports.  It is important for the module to do this as a connection is specific to your use case.  That
 *      is, for example, you cannot use the same SlackConnection that another module is using.  This is because Nexus
 *      allows for a single instance to serve multiple integrations with Slack (e.g. You can have multiple Slack Apps
 *      that point to a single Nexus instance to manage responses).
 */

/**
 * This is the configuration for a module as specified by the application
 * client that is integrating with Nexus.
 */
export type ModuleConfig = { [index: string]: any };

/**
 * This is the shape of the module definition in the top level .nexus file
 * (for a single module).
 */
export interface INexusModuleDefinition {
    path?: string;
    scope?: string;
    jobs?: NexusJobDefinition[];
    config?: ModuleConfig;
}

/**
 * The active module holds state information for an instantiated and initialized
 * nexus module.  Note that it contains the job _instances_ and the connection
 * _instances_, not just the definitions of each.
 */
export interface INexusActiveModule {
    config: ModuleConfig;
    subApp?: Application;
    jobs?: Job[];
    connections?: ConnectionMap;
}

/**
 * The route definitions are used by modules to tell Nexus what routes
 * should be setup automatically during initialization.
 */
export interface IRouteDefinition {
    method: "get" | "post" | "put";
    path: string;
    handler: (req: Request, resp: Response, next?: NextFunction) => any;
    protected: boolean;
    bodyParser?: NextHandleFunction;
}

export type ConfigType = ("string" | "number" | "object" | "function" | "list");

export interface IConfigGroupRule {
    name: string;
    required: boolean;
    level: "error" | "warning";
    reason: string;
    default?: any;
    type?: ConfigType[];
    regex?: RegExp;
    keys?: Record<string, string>;
}

export type IConfigGroups = Record<string, IConfigGroupRule[]>;

/**
 * Modules should derived from this class and instantiate an object of the type they create returning that
 * instance from their main index file.
 */
export abstract class NexusModule {

    // this is the name of the module - if this conflicts with other module names then
    //  there could be issues with integrations such as routes.
    public abstract name: string;

    // This is the uri path afte the nexus root that holds all downstream module
    //  routes.
    protected _moduleRootPath: string;

    // This is the configuration data that is specified in the nexus definition file
    //  and made available to all modules during initialization.
    protected _globalConfig: GlobalConfig;

    // this stores the configuration and state of the module
    //  after the nexus core  has instantiated and launched it.
    protected activeModule: INexusActiveModule;

    public constructor() {
        this.activeModule = null;
    }

    get globalConfig(): GlobalConfig {
        return this._globalConfig;
    }

    set globalConfig(val: GlobalConfig) {
        this._globalConfig = val;
    }

    get moduleRootPath(): string {
        return `/m/${this.name}`;
    }

    public getActiveModuleData() {
        return this.activeModule;
    }

    public getActiveConnection(name: string): Connection {

        if (name in this.activeModule.connections) {
            return this.activeModule.connections[name];
        }

        return undefined;
    }

    public getActiveModuleConfig(): ModuleConfig {
        return this.activeModule.config;
    }

    /**
     * Retrieves a list of Jobs that have been instantiated during initiatlization based on the jobs
     * listed in the configuration.
     */
    public getActiveJobs(): Job[] {
        return this.activeModule.jobs;
    }

    /**
     * Retrieves the Express sub app associated with this module.
     */
    public getActiveSubApp(): Application {
        return this.activeModule.subApp;
    }

    /**
     * Allows the module to receive .nexus module config and return the results.  Note that
     * your configuration values can use the special "__env__" string to in which case the
     * value will be loaded from the environment using the prefix `<MODULE_NAME>_` before
     * the configuration key.  It is the responsibility of the user of Nexus to ensure that these
     * appear in the environment properly.
     * @param config 
     */
    public loadConfig(config?: ModuleConfig): ModuleConfig {
        return config || {};
    }
    /**
     * Allows the module to instantiate an express.Router object with preconfigured endpoints.  It can
     * also protect those endpoints using the Nexus auth middleware.
     * @param _config
     */
    public loadRoutes(_config: ModuleConfig): IRouteDefinition[] {
        return [];
    }

    /**
     * The user will define job instance in the .nexus file.  Nexus will pass that configuration into
     *  this loader.  Use the type to identify the right job class and instantiate it with the configuration
     *  object given.  Return instances to the nexus core which will manage them from there.
     *
     *  @param _jobsDefinition
     */
    public loadJobs(_jobsDefinition: NexusJobDefinition[]): Job[] {
        return [];
    }

    /**
     * Most modules will use at least one connection.  This will allow the user to instantiate the connections
     *  and configure them using configuration that is specific to this module.
     */
    public loadConnections(_config: ModuleConfig, _subApp: Application): ConnectionRequest[] {
        return [];
    }

    /**
     * Called after the module has been fully loaded.  Gives the module a chance to initialize values, etc.  At this
     * point, routes, jobs, connections and config have been successfully loaded and are given in the parameters.
     * By default, this simply stores that information within the activeModule property.  Override to perform
     * any other initializations you would like.
     */
    public async initialize(active: INexusActiveModule): Promise<boolean> {
        this.activeModule = active;
        return true;
    }

    /**
     * This is called after all other setup has been done AND the config validation
     * has been completed successfully.  Use this to do checks for things like valid
     * credentials, database connections, etc.
     * @param _active
     */
    public async validate(_active: INexusActiveModule): Promise<boolean> {
        return true;
    }
}
