import _ from "lodash";
import express from "express";
import {Job, NexusModule, NexusModuleConfig} from "@nexus-switchboard/nexus-extend";
import {mainLogger} from "..";
import {listRoutes} from "../lib/routes";
import getModuleManager from "../lib/modules";
import cookieParser = require("cookie-parser");

const apiRouter = express.Router();
apiRouter.use(express.json());
apiRouter.use(express.urlencoded({extended: false}));
apiRouter.use(cookieParser());

apiRouter.get("/version", async (req, res) => {
    const pkg = req.app.get("package");
    if (pkg) {
        return res.json(pkg).status(200);
    }
    return res.json({message: "Package not found"}).status(404);
});

apiRouter.get("/modules", async (req, res) => {

    const mods = getModuleManager().getRunningModules();
    if (mods) {
        const modulesRes = mods.map((m: NexusModule) => {
            return {
                name: m.name,
                jobs: m.getActiveJobs().map((j: Job) => {
                    return j.asJson();
                }),
                router: listRoutes(m.getActiveRoutes()),
                config: scrubConfig(m.getActiveConfig()),
            };
        });
        return res.json(modulesRes).status(200);
    }
    return res.json({message: "No running modules found"}).status(404);
});

apiRouter.post("/modules/:moduleName/jobs/:jobName", async (req, res) => {

    const foundMod = getModuleManager().getModuleByName(req.params.moduleName);
    if (foundMod) {
        if (foundMod.getActiveJobs()) {
            const [job] = foundMod.loadJobs([{
                type: req.params.jobName,
                schedule: undefined,
                options: req.body
            }]);

            if (job) {
                try {
                    if (await job.run()) {
                        res.json({
                            success: true,
                            message: "Job completed successfully",
                            jobInfo: job.asJson()
                        });
                    } else {
                        res.json({
                            success: false,
                            message: "Job failed to run. Check logs for information about why",
                            jobInfo: job.asJson()
                        }).status(200);
                    }
                } catch (e) {
                    mainLogger("Failed to run job because: " + e.toString());
                    res.json("Failed to run job because: " + e.message || e.toString()).status(500);
                }

            } else {
                res.json({message: "Unable to find the given job"}).status(404);
            }
        } else {
            res.json({message: "That module does not appear to have any job types defined"}).status(404);
        }
    } else {
        res.json({message: "That module was not found"}).status(404);
    }
});

/**
 * This will return a copy of the config object in the given NexusRunningModule but with the values of properties
 * that were loaded from environment variables replaced with "******"
 * @param config
 */
const scrubConfig = (config: NexusModuleConfig) => {
    if (!config) {
        return {};
    }

    const scrubbedConfig = _.cloneDeep<NexusModuleConfig>(config);
    if (scrubbedConfig.secrets) {
        for (const name of config.secrets) {
            if (name in scrubbedConfig) {
                scrubbedConfig[name] = "*****";
            }
        }
        delete scrubbedConfig.secrets;
    }
    return scrubbedConfig;
};

export default apiRouter;
