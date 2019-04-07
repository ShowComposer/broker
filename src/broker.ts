// SC broker
// Init global variables
const config = { port: 6789 };
const subscriber = {};

const sendTypes = ["INIT", "INIT_REUSE", "PING", "SET", "DEL", "SUB", "UNSUB", "DUMP"];
const responseTypes = ["INIT_ACK", "PONG", "SET_RES", "DEL_RES", "SUB_RES", "UNSUB_RES", "DUMP_RES"];

// import settings
import * as net from "net";
import * as readline from "readline";
import * as uuid from "uuid/v4";

// Client class, handling incoming connections
class Client {
  private socket: net.Socket;
  private uuid: any;
  private pingInt: any;
  private reqId = 0;
  private reqWait = 0;
  private reqArray = {};
  private inputReader: any;
  private pingResponse: bigint;
  private pingSuccess: number;
  // Constructor run by every new connection
  constructor(socket: net.Socket) {
    this.uuid = uuid();
    this.socket = socket;
    // Setup regular ping
    this.pingInt = setInterval(() => { this.ping(); }, 2000);

    // Prepare Input processing
    this.inputReader = readline.createInterface({
      input: this.socket,
    });

    this.inputReader.on("line", (l) => {
      this.handleLine(l);
    });

    // Add this receiver to subscibers
    subscriber[this.uuid] = this;

    this.socket.setNoDelay();
    // Handle closing
    socket.on("close", () => {
      console.log("client disconnected");
      this.close();
    });
  }
  // Periodically Ping
  public ping() {
    const start = process.hrtime.bigint();
    this.send("PING", "", (c) => {
      if (c[1] === "PONG") {
        this.pingResponse = (process.hrtime.bigint() - start) / BigInt(1000);
        this.pingSuccess = Date.now();
        console.log("Ping: " + this.pingResponse + "\xB5s");
      }
    });
  }
  // Close everything
  public close() {
    delete subscriber[this.uuid];
    clearInterval(this.pingInt);
    if (!this.socket.destroyed) {
      this.socket.destroy();
    }
  }
  // Handle input
  public handleLine(c) {
    const m = c.toString("utf8").split(" ");
    if (m.length < 2) {
      return;
    }
    const id = parseInt(m[0], 10);
    if (isNaN(id)) {
      return;
    }
    if (!m[2]) {
      m[2] = "";
    }
    // Determine if it's new req or response
    if (responseTypes.includes(m[1])) {
      // It's a response
      // Check if id exists and handle cb
      if (this.reqArray[m[0]]) {
        this.reqArray[m[0]](m);
        delete this.reqArray[m[0]];
      }
    }
    if (sendTypes.includes(m[1])) {
      // it's a req
      switch(m[1]) {
        case 'SET':
          // ToDo: Set data
          // ToDo: Fire Pub
          // ToDO: Send Response
        break;
      }
    }
    // Else: drop
  }
  // Build pkg
  public send(type = "PING", payload = "", cb = (res: any) => undefined) {
    this.reqId++;
    this.socket.write(this.reqId + " " + type + " " + payload + "\r\n");
    this.reqArray[this.reqId] = cb;
  }
  // Build pkg res
  public sendRes(id = 0, type = "PONG", payload = "") {
    this.socket.write(id + " " + type + " " + payload + "\r\n");
  }
}

// Create Server
const server = new net.Server();
server.on("connection", (s) => {
  const c = new Client(s);
});
server.listen(config.port, () => {
  console.log("Listening on port " + config.port);
});
