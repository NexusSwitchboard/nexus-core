import fs, { existsSync } from "fs";
import { join } from "path";
import { INexusDefinition } from "@nexus-switchboard/nexus-extend";
import { mainLogger } from "../index";

/**
 * This allows you to do an assign with nested objects and ensure that you can use partial object
 * definitions even in nested objects.  For example, if given these two objects...
 *
 * > p1 = { test1: { test2: { a: 1, b: 2}} }
 * > p2 = { test1: {test2: {b:3}}}
 *
 * and calling:
 * > p3 = nestedAssign ({}, p1, p2)
 *
 * you will get:
 * > p3 == { test1: {test2: {a: 1, b: 3}}}
 *
 * instead of:
 * > p3 == { test1: {test2: {b: 3}}}
 *
 * @param target Same as target in `assign` method
 * @param sources Same as sources in `assign` method.
 */
const nestedAssign = (target: any, ...sources: any) => {
    sources.forEach((source: any) => {
        Object.keys(source).forEach((key: string) => {
            const sVal = source[key];
            const tVal = target[key];
            target[key] = tVal && sVal && typeof tVal === "object" && typeof sVal === "object"
                ? nestedAssign(tVal, sVal)
                : sVal;
        });
    });
    return target;
};

export default (specifiedPath?: string) => {
    const cwd = process.cwd();
    const configSearchPaths = [
        join(cwd, ".nexus"),
        process.env.NODE_ENV === "production" ? join(cwd, ".nexus.prod") : join(cwd, ".nexus.dev")
    ];

    if (specifiedPath) {
        configSearchPaths.push(specifiedPath);
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
};
