import { Application, IRouter } from "express";
import { Connection, ConnectionConfig, ConnectionFactory, GlobalConfig, INexusDefinition } from "@nexus-switchboard/nexus-extend";
import path from "path";
import { mainLogger } from "..";
import assert from "assert";
import shelljs from "shelljs";

export interface IConnectionDefinition {

    // this has to be the name of the connection package
    name: string;

    // any global configuration values - these are different than the instance-level
    //  configuration that is specified when a connection is instantiated
    globalConfig?: ConnectionConfig;

    // If the connection is installed on disk (and not as an npm package, you can specify the relative path to the
    //  connection root.  The path is relative to the Nexus installation.
    path?: string;

    // If the connection package is part of a scope in the package manager, enter the scope name here.  Note that
    //  you can't have both a path and a scope for a single definition.
    scope?: string;
}

type RegisteredConnection = {
    definition: IConnectionDefinition,
    factory: ConnectionFactory
};

type ConnectionName = string;

export class ConnectionManager {
    protected app: Application;
    protected subRouter: IRouter;
    protected _globalConfig: GlobalConfig;
    protected connections: Record<ConnectionName, RegisteredConnection>;

    constructor() {
        this.connections = {};
    }

    get globalConfig() {
        return this._globalConfig;
    }

    public initialize(config: INexusDefinition, app: Application, subRouter?: IRouter) {
        this.subRouter = subRouter || app;
        this.app = app;

        this._globalConfig = config.global;

        if (!config.connections) {
            mainLogger("There are appear to be no configured connections which is probably wrong.");
        } else {
            config.connections.forEach((conn) => this.addDefinition(conn) );
        }
    }

    public addDefinition(def: IConnectionDefinition): RegisteredConnection {

        assert(!(def.scope && def.path));

        let connPath: string = def.name;
        if (def.path) {
            const cwd = shelljs.pwd().stdout;
            connPath = def.path
                ? path.join(cwd, def.path, def.name)
                : def.name;
        } else if (def.scope) {
            connPath = `@${def.scope}/${def.name}`;
        }

        try {
            const absolutePathToConn = require.resolve(connPath, { paths: require.main.paths });
            if (absolutePathToConn) {
                const factory = require(absolutePathToConn).default;
                this.connections[def.name] = {
                    definition: def,
                    factory
                };
                mainLogger(`Loaded connection ${def.name}`);

                return this.connections[def.name];
            } else {
                mainLogger(`Unable to find a connection using the id ${connPath}`);
            }
        } catch (e) {
            mainLogger(`Unable to load the specified connection: ${def.name}: ${e.toString()}`);
            return undefined;
        }
    }

    public createConnection(name: string, config: ConnectionConfig): Connection {
        if (name in this.connections) {
            return this.connections[name].factory(config, this.globalConfig);
        } else {
            mainLogger(`Unable to find a registered connection with the name ${name}.`);
            return undefined;
        }
    }
}

let connectionManager: ConnectionManager = null;
const getConnectionManager = () => {
    if (!connectionManager) {
        connectionManager = new ConnectionManager();
    }
    return connectionManager;
};
export default getConnectionManager;
