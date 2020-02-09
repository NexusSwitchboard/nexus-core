import {
    ConnectionRequestDefinition,
    Job,
    NexusJobDefinition,
    NexusModule,
    NexusModuleConfig
} from "@nexus-switchboard/nexus-extend";
import {Router} from "express";
import {TestConnection} from "./testConnection";
import {TestJob} from "./testJob";

export class TestModule extends NexusModule {

    public name = "test";

    public loadConfig(overrides?: NexusModuleConfig): NexusModuleConfig {
        return Object.assign({}, {
            modConfig1: "modConfig1",
            modConfig2: "modConfig2"
        }, overrides);
    }

    public loadConnections(_config: NexusModuleConfig, _router: Router): ConnectionRequestDefinition[] {
        return [{
            name: "testConnection",
            config: {
                testConfig1: "testConfig1",
                testConfig2: "testConfig2"
            }
        }];
    }

    public loadJobs(jobsDefinition: NexusJobDefinition[]): Job[] {
        return jobsDefinition.map((j) => {
            if (j.type === "testJob") {
                return new TestJob(j);
            }
        });
    }

    public getTestConnection(): TestConnection {
        return this.getActiveConnection("testConnection");
    }
}

export default new TestModule();
