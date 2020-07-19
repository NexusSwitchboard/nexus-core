import { INexusModuleDefinition } from "./modules";
import { INexusConnectionDefinition } from "./connections";

export type GlobalConfig = {
    nexusPath: string,
    baseUrl: string,
    authentication: {
        auth0: {
            jwksUri: string,
            audience: string,
            issuer: string,
            algorithms: string[]
        }
    }
};

export interface INexusDefinition {

    global: GlobalConfig;

    connections: INexusConnectionDefinition[];

    modules: {
        [index: string]: INexusModuleDefinition;
    };

}
