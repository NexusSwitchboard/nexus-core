import {Job} from "..";
import moduleInstance from "./testModule";

export class TestJob extends Job {

    public name = "testJob";

    protected async _run(): Promise<boolean> {
        moduleInstance.getTestConnection();
        return Promise.resolve(true);
    }
}
