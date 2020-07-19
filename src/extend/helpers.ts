import fs from "fs";
import _ from "lodash";
import path from "path";
import * as handlebars from "handlebars";
import { Application, Express } from "express";
import {getEndpoints} from "./endpoints";
import {IConfigGroupRule, ConfigType, IConfigGroups, ModuleConfig} from "./modules";
import { Debugger } from "debug";

/**
 * Takes a key in the form of a dot-delimited string and iterates over the parts
 * of that key traversing the given object's hierarchy until it gets to the end
 * Returns false if one of the keys is not found. Otherwise it returns the value
 * of the key at the end of the chain.
 * @param ob Can be a set of key value pairs
 * @param key Ex. "my.part.of.the.ob"
 * @return
 */
export function getNestedVal(ob: Record<string, any>, key: string): any {
    if (!ob || !key) {
        return false;
    }

    const parts = key.split(".");
    let obSoFar = ob;
    let currentKey = parts.shift();
    while (currentKey !== undefined) {
        if (obSoFar && _.isPlainObject(obSoFar) && _.has(obSoFar, currentKey)) {
            obSoFar = obSoFar[currentKey];
            currentKey = parts.shift();
        } else {
            return undefined;
        }
    }
    return obSoFar;
}

/**
 * Does a check that the given object has all the given properties
 * @param ob The object to check
 * @param props The array of properties to check for.
 */
export function hasOwnProperties(ob: Record<string, any>, props: string[]): boolean {
    if (!ob) {
        return false;
    }
    return props.every((v) => ob.hasOwnProperty(v));
}

/**
 * Does a nested search of all properties in the given object and returns the value of the first
 * one found.
 * @param ob The object to search
 * @param propName The name of the property to find
 */
export function findProperty(ob: Record<string, any>, propName: string): any {
    for (const key of Object.keys(ob)) {
        if (key === propName) {
            return ob[key];
        } else {
            if (_.isObject(ob[key])) {
                const found = findProperty(ob[key], propName);
                if (found) {
                    return found;
                }
            }
        }
    }

    return undefined;
}

/**
 * Does a nested search of all properties in the given object and returns the value of the first
 * one found.  But this takes the additional step of checking to see
 * @param ob The object to search
 * @param propName The name of the property to find
 * @param nestedProperty
 */
export function findNestedProperty(ob: Record<string, any>, propName: string, nestedProperty: string): any {
    let prop = findProperty(ob, propName);
    if (_.isObject(prop)) {
        const nested = getNestedVal(prop, nestedProperty);
        prop = nested || prop;
    }
    return prop;
}

/**
 * Allows for the replacement of multiple unique search tokens in one pass.
 * @param str The string to do the replacement in
 * @param mapObj A map of strings to replacement strings.  Note that the source strings must be valid regex's and
 *          the search are case insensitive.
 */
export function replaceAll(str: string, mapObj: Record<string, string>) {
    const re = new RegExp(Object.keys(mapObj).join("|"), "gi");

    return str.replace(re, (matched) => {
        return mapObj[matched.toLowerCase()];
    });
}

const ROOT_PATH = path.resolve(path.join(__dirname, "../"));

/**
 * This will not cache compiled templates.  If this becomes an issue we can do some simple
 * in memory caching (i don't expect this to be a heavily trafficked app.
 * @param filePath The path to the template file (relative to the root of the project).
 * @param data
 */
export const loadTemplate = (filePath: string, data: Record<string, any>): string => {
    const resolvedPath = path.resolve(ROOT_PATH, filePath);
    const fileContent = fs.readFileSync(resolvedPath, "utf-8");
    return handlebars.compile(fileContent)(data);
};

/**
 * For a given router, returns a list of route data
 * @param app
 */
export function listRoutes(app: Application) {
    return getEndpoints(app as Express);
}

/**
 * Runs through all the config rules and logs the validity of each outputting the reason for any errors that are
 * found.  It then returns the number of errors found.  So if the return value is greater than zero then
 * fatal errors were encountered
 * @param config
 * @param configRules
 * @param confLog
 */
export function checkConfig(config: ModuleConfig, configRules: IConfigGroups, confLog: Debugger): number {

    let errorCount = 0;

    confLog("Starting Configuration Check...");
    Object.keys(configRules).forEach((g: string) => {
        const group: IConfigGroupRule[] = configRules[g];
        confLog(`> Group: ${g}`);
        group.forEach((r) => {

            let pass = true;
            const failed: Array<[string, IConfigGroupRule]> = [];

            // First check existence.
            const val = getNestedVal(config, r.name);
            if (r.required && val === undefined) {
                failed.push(["Not Found", r]);
                pass = false;
            } else if (val !== undefined) {

                let tp = typeof (val) as ConfigType;
                if (tp === "object") {
                    if (val.hasOwnProperty("length")) {
                        tp = "list";
                    }
                }

                // Now check type
                if (r.type && r.type.length > 0) {
                    if (r.type.indexOf(tp) < 0) {
                        failed.push(["Invalid Type", r]);
                        pass = false;
                    }
                }

                // Now check regex
                if (r.regex && tp === "string") {
                    if (!r.regex.test(val)) {
                        failed.push(["Invalid Format", r]);
                        pass = false;
                    }
                }
            }

            if (pass) {
                confLog(`   >> ✅ ${r.name}`);
            } else {
                const errors = failed
                    .filter((l: [string, IConfigGroupRule]) => {
                        return l[1].level === "error";
                    })
                    .map((l: [string, IConfigGroupRule]) => {
                        return l[0] + " - " + l[1].reason;
                    });
                const warnings = failed
                    .filter((l: [string, IConfigGroupRule]) => {
                        return l[1].level === "warning";
                    })
                    .map((l: [string, IConfigGroupRule]) => {
                        return l[0] + " - " + l[1].reason;
                    });

                errors.forEach((e) => {
                    confLog(`   >> ❌ ${r.name} - ${e}`);
                });

                warnings.forEach((e) => {
                    confLog(`   >> ⚠️ ${r.name} - ${e}`);
                });

                errorCount += errors.length;

            }
        });
    });

    return errorCount;
}

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
export const nestedAssign = (target: any, ...sources: any) => {
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
