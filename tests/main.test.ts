// @ts-ignore
import express, {Application} from "express";
import {addNexusToExpressApp} from "../src";
import * as path from "path";
import getModuleManager from "../src/lib/modules";

const root: string = __dirname;
let app: Application;

beforeAll(() => {
    app = express();
});

test("Nexus initialized without throwing any exceptions", () => {
    addNexusToExpressApp(app, path.join(root, "data/.nexus"));
});

test("Test module created and initialized correctly.", () => {
    const runningModules = getModuleManager().getRunningModules();
    expect(runningModules).toHaveLength(1);
    const mod = runningModules[0];
    expect(mod).toHaveProperty("name");
    expect(mod.name).toBe("test");

    const config = mod.getActiveModuleConfig();
    expect(config).toBeDefined();
    expect(config).toHaveProperty("modConfig1");
    expect(config.modConfig1).toBe("modConfig1-Override");
});

test("Test connection created and initialized successfully", () => {
    const mod = getModuleManager().getRunningModules()[0];
    const conn = mod.getActiveConnection("testConnection");

    expect(conn).toBeDefined();
    expect(conn).toHaveProperty("name");
    expect(conn.name).toBe("testConnection");
    expect(conn.config).toBeDefined();
});

test("Test job created and initialized successfully", () => {
    const mod = getModuleManager().getRunningModules()[0];
    const jobs = mod.getActiveJobs();

    expect(jobs).toBeDefined();
    expect(jobs).toHaveLength(1);

    const j = jobs[0];
    expect(j.getName()).toBe("testJob");
    expect(j.definition.options).toHaveProperty("jobConfig1");
    expect(j.definition.options.jobConfig1).toBe("jobConfig1");
});
