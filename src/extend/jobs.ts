import assert from "assert";

import {CronJob} from "cron";
import {isValidCron} from "cron-validator/lib";
import createDebug from "debug";
import uuidv1 from "uuid/v1";

/**
 * Jobs
 * ----
 * Jobs are an alternate method of packaging and triggering units of work (the other being routes).  Jobs
 * are defined by these things:
 *
 *  1. Configuration
 *  2. Schedule
 *  3. Behavior.
 *
 *  Modules can define their own Job-derived classes and implement the `_run` method to perform
 *  behavior of some kind.  The Nexus core will handle triggering execution as necessary.
 */

/**
 * Used to describe the configuration for a specific job.  This will
 * be passed in as part of the job definition.
 */
export type NexusJobOptions = Record<string, any>;

/**
 * A descriptor for a given job.  The definition file includes the options for that specific
 * instance of the job and the schedule it runs on (if any) along with the type of job.  The type should match
 * the name given in the class that is derived from the abstract Job class.
 */
export type NexusJobDefinition = {
    type: string,
    schedule: string,
    options: NexusJobOptions
};

/**
 * This is used to indicate the state that a job is in.  Idle means that is not executing and there is no schedule
 * pending.  Scheduled means that it is not running but is scheduled to run at a later date.  Running means that is
 * actively executing code.  And error means that the last time it ran there was an error of some sort.
 */
export enum NexusJobStatus {
    idle = "idle",
    scheduled = "scheduled",
    running = "running",
    error = "error"
}

export const logger = createDebug("nexus:jobs");

/**
 * Derive from the job class to create your own job.  When creating your own job there are two things that you
 * have to define (at least).  The first is the "name".  The name will be matched against the "type"
 * given in a job definition.  The name has to be unique.  The second is the _run method.  This is where the
 * job behavior is defined.
 */
export abstract class Job {
    public definition: NexusJobDefinition;
    protected status: NexusJobStatus;
    protected runningId: string;
    protected name: string;
    protected cronOb: CronJob;
    protected requiredOptions: string[];

    public constructor(job: NexusJobDefinition) {
        this.status = NexusJobStatus.idle;
        this.definition = job;

        this._validateOptions(job.options);

        if (this.definition.schedule) {
            if (isValidCron(this.definition.schedule, {seconds: true, alias: true, allowBlankDay: true})) {
                this.schedule();
            } else {
                throw new Error(`You have specified a cron schedule for a ${this.name} job but the cron format is not valid`);
            }
        }
    }

    public getName(): string {
        return this.name;
    }

    /**
     * Returns information about this job in the form of a POJO
     */
    public asJson() {
        return {
            runningId: this.runningId,
            type: this.name,
            definition: this.definition
        };
    }

    public schedule(): Job {
        assert(this.definition.schedule, "Schedule property not set on job definition.");

        try {
            this.runningId = uuidv1();
            this.cronOb = new CronJob(
                this.definition.schedule,
                async () => {
                    return await this.run();
                },
                null,
                true,
                null,
                this.runningId);

            this.status = NexusJobStatus.scheduled;

        } catch (e) {
            logger(`Failed to start job ${this.name} because: ${e.message}`);
        }

        return this;
    }

    /**
     * Called to execute the job.  Note that this will handle errors allow the internal _run to throw
     * exceptions without having to implement more advanced error handling like emailing the owner of the
     * job about the failure.
     */
    public async run(): Promise<boolean> {
        try {
            const previousStatus = this.status;
            this.status = NexusJobStatus.running;
            const result = this._run();
            this.status = previousStatus;
            return result;
        } catch (e) {
            this.status = NexusJobStatus.error;
            this._handleError(e);
            return false;
        }
    }

    public setOptions(options: NexusJobOptions): void {
        this._validateOptions(options);
        this.definition.options = options;
    }

    /**
     * Override the _run method to do the work that the job entails.
     * @private
     */
    protected abstract _run(): Promise<boolean>;

    /**
     * Error handler by default will log the error but you can override this in your own job to
     * handle errors your own way.
     * @param err An error object that has information about the problem.
     * @private
     */
    protected _handleError(err: Error): void {
        logger(`Job ${this.name} failed with error: ${err.message}`);
    }

    /**
     * Override this to ensure that the given options during object construction is valid.
     * This should throw an exception if there's an issue.
     * @param options
     * @private
     */
    protected _validateOptions(options?: NexusJobOptions): void {
        options = options ? options : this.definition.options;
        if (!options) {
            throw new Error("Unable to validate options because none were given");
        }

        if (this.requiredOptions) {
            for (const key of this.requiredOptions) {
                if (!(key in options)) {
                    throw new Error(`The "${key}" option is required for the ${this.name} job`);
                }
            }
        }
    }

}
