import {Connection, ConnectionConfig} from "@nexus-switchboard/nexus-extend";

export class TestConnection extends Connection {
    public name = "testConnection";

    public connect(): Connection {
        return undefined;
    }

    public disconnect(): boolean {
        return false;
    }

}

export default function createConnection(cfg: ConnectionConfig): Connection {
    return new TestConnection(cfg);
}
