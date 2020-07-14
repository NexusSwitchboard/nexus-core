import fs, { existsSync } from "fs";
import { join } from "path";
import { INexusDefinition, nestedAssign } from "@nexus-switchboard/nexus-extend";
import { mainLogger } from "../index";

/**
 * This will attempt to load the nexus configuration file from either the given
 * path (as a JSON file) or any of the expected locations which can include:
 *  * {projectroot}/.nexus
 *  * {projectroot}/.nexus.dev
 *  * {projectroot}/.nexus.int
 *  * {projectroot}/.nexus.prod
 *  * {given config path}
 * 
 * These are loaded in reverse priority so that conflicting properties choose the lowest on the 
 * list first.  For example, if the property "<root>.foo" exists in both `.nexus.prod` and 
 * `.nexus`, the `.nexus.prod` version will be used.  
 */
export const loadNexusConfigFromFile = (configPath?: string): INexusDefinition => { 
    const cwd = process.cwd();
    const configSearchPaths = [
        join(cwd, ".nexus"),
        join(cwd, ".nexus.dev"),
        join(cwd, ".nexus.int"),
        join(cwd, ".nexus.prod")
    ];

    if (configPath) {
        configSearchPaths.push(configPath);
    }

    const configObjects: any[] = [];
    configSearchPaths.forEach((p) => {
        if (existsSync(p)) {

            try {
                const nexusConfigStr = fs.readFileSync(p).toString();
                const nexusDefinition = JSON.parse(nexusConfigStr) as INexusDefinition;
                configObjects.push(nexusDefinition);
            } catch (e) {
                mainLogger(`Skipping reading config file ${p} due to error: ${e.toString}`);
            }
        }
    });

    return nestedAssign({}, ...configObjects);
}