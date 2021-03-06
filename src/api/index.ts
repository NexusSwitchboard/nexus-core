import _ from "lodash";
import express from "express";
import {Job, NexusModule, ModuleConfig, listRoutes} from "..";
import {mainLogger} from "..";
import getModuleManager from "../lib/modules";
import cookieParser = require("cookie-parser");

const apiRouter = express.Router();
apiRouter.use(express.json());
apiRouter.use(express.urlencoded({extended: false}));
apiRouter.use(cookieParser());

/***
 * Returns the package information for the nexus-based app.
 */
apiRouter.get("/version", async (req, res) => {
    const pkg = req.app.get("package");
    if (pkg) {
        return res.json(pkg).status(200);
    }
    return res.json({message: "Package not found"}).status(404);
});

/**
 * Returns module definitions for all registered modules for this nexus-based app
 */
apiRouter.get("/modules", async (req, res) => {

    const mods = getModuleManager().getRunningModules();
    if (mods) {
        const modulesRes = mods.map((m: NexusModule) => {
            return {
                name: m.name,
                jobs: m.getActiveJobs().map((j: Job) => {
                    return j.asJson();
                }),
                routes: listRoutes(m.getActiveSubApp()),
                config: scrubConfig(m.getActiveModuleConfig()),
            };
        });
        return res.json(modulesRes).status(200);
    }
    return res.json({message: "No running modules found"}).status(404);
});

/**
 * Executes a job for a given module based on type.  This assumes that job config
 * object is in the payload as a NexusJobOptions type.
 */
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
const scrubConfig = (config: ModuleConfig) => {
    if (!config) {
        return {};
    }

    const scrubbedConfig = _.cloneDeep<ModuleConfig>(config);
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
