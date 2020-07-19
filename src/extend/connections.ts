/**
 * Connections represent access to functionality available in third party products.  Examples of connections
 * are Jira, OpsLevel, Slack, etc.  Connections are defined in a very open ended way only limited to having a connect
 * and disconnect.
 *
 * The connection object is used as the base class for a connection extension.  Connections must have a connect
 * and disconnect.  You can use these however you wish but just know that connect is called on construction and
 * disconnect may not be called depending on how the connection is being used.
 */
import { GlobalConfig } from "./index";

export abstract class Connection {
    public name: string;
    public config: ConnectionConfig;
    public globalConfig: GlobalConfig;

    constructor(config: ConnectionConfig, globalCfg?: GlobalConfig) {
        this.config = config;
        this.globalConfig = globalCfg;
        this.connect();
    }

    public abstract connect(): Connection;

    public abstract disconnect(): boolean;
}

/**
 * This is the Connection factor function that is exported by default from the main connection file.  This will
 * be called each time a module requests the creation of a new connection.
 */
export type ConnectionFactory = (cfg: ConnectionConfig, globalCfg: GlobalConfig) => Connection;

/**
 * This is the configuration data associated with a connection and specified
 * by the app client that is using Nexus.  It is uncommon for a connection
 * to have a config specified here instead of a nexus module's config.
 */
export type ConnectionConfig = Record<string, any>;

/**
 * This is the definition of a connection as specified in the top level
 * .nexus file.  Only connections specified here will be loadable by
 * any modules.
 */
export interface INexusConnectionDefinition {
    name: string;
    scope?: string;
    path?: string;
    config?: ConnectionConfig;
}

/**
 * A connection request is returned by a module indicating the connection
 * that we want Nexus to instantiate along with the configuration options
 * to use during that initialization.
 */
export type ConnectionRequest = {
    name: string,
    config: ConnectionConfig
};

/**
 * Hash to quickly find connection objects based on a name.
 */
export type ConnectionMap = Record<string, Connection>;
