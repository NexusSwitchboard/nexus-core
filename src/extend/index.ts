import { INexusModuleDefinition } from "./modules";

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

    modules: {
        [index: string]: INexusModuleDefinition;
    };

}
