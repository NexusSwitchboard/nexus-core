import {
    ConnectionRequest,
    Job,
    NexusJobDefinition,
    NexusModule,
    ModuleConfig
} from "@nexus-switchboard/nexus-extend";
import {Router} from "express";
import {TestConnection} from "./testConnection";
import {TestJob} from "./testJob";

export class TestModule extends NexusModule {

    public name = "test";

    public loadConfig(overrides?: ModuleConfig): ModuleConfig {
        return Object.assign({}, {
            modConfig1: "modConfig1",
            modConfig2: "modConfig2"
        }, overrides);
    }

    public loadConnections(_config: ModuleConfig, _router: Router): ConnectionRequest[] {
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
