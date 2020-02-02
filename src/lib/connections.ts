import {Application, IRouter} from "express";
import {Connection, ConnectionConfig, ConnectionFactory} from "@nexus-switchboard/nexus-extend";
import path from "path";
import {mainLogger} from "..";
import assert from "assert";

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

const PROJECT_ROOT = path.resolve(__dirname, "..");

export class ConnectionManager {
    protected app: Application;
    protected subRouter: IRouter;
    protected connections: Record<ConnectionName, RegisteredConnection>;

    constructor() {
        this.connections = {};
    }

    public initialize(config: Record<string, any>, app: Application, subRouter?: IRouter) {
        this.subRouter = subRouter || app;
        this.app = app;

        if (!config.connections) {
            mainLogger("There are appear to be no configured connections which is probably wrong.");
        } else {
            for (const name of Object.keys(config.connections)) {
                const conn = config.connections[name];
                this.addDefinition(conn);
            }
        }

    }

    public addDefinition(def: IConnectionDefinition): RegisteredConnection {

        assert(!(def.scope && def.path));

        let connPath: string = def.name;
        if (def.path) {
            connPath = def.path ? path.join(PROJECT_ROOT, def.path, def.name) : def.name;
        } else if (def.scope) {
            connPath = `@${def.scope}/${def.name}`;
        }

        try {
            const absolutePathToConn = require.resolve(connPath, {paths: require.main.paths});
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
            return this.connections[name].factory(config);
        } else {
            mainLogger("Unable to find a registered connection with the name " + name);
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
