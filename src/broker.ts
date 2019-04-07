// SC broker
// Init global variables
const config = { port: 6789 };
const subscriber = {};

const sendTypes = ["INIT", "INIT_REUSE", "PING", "SET", "DEL", "SUB", "UNSUB", "DUMP"];
const responseTypes = ["INIT_ACK", "PONG", "SET_RES", "DEL_RES", "SUB_RES", "UNSUB_RES", "DUMP_RES"];
const dataTypes = ["STATIC", "LIVE", "TICK", "LINK"];

// import settings
import * as net from "net";
import * as readline from "readline";
import * as uuid from "uuid/v4";
import {SCData} from "./data";

const data = new SCData();
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
  private subscriptions = [];

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

    // Initialize obj in data
    data.set("LIVE", "system.connections." + this.uuid + ".state=UP");
    data.set("LIVE", "system.connections." + this.uuid + ".time_established=" + Date.now());

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
        data.set("LIVE", "system.connections." + this.uuid + ".latency=" + this.pingResponse);
        data.set("LIVE", "system.connections." + this.uuid + ".last_ping=" + this.pingSuccess);
      }
    });
  }
  // Close everything
  public close() {
    // unsubscribe from all subscriptions
    this.subscriptions.forEach((s) => {
      data.unsub(s);
    });
    delete subscriber[this.uuid];
    clearInterval(this.pingInt);
    if (!this.socket.destroyed) {
      this.socket.destroy();
    }
    data.set("LIVE", "system.connections." + this.uuid + ".state=CLOSED");
    data.set("LIVE", "system.connections." + this.uuid + ".time_closed=" + Date.now());
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
      switch (m[1]) {
        case "SET":
          let res = false;
          if (m[4] === "1") {res = true; }
          // m[2] is data types
          if (!dataTypes.includes(m[2])) {
            if (res) {
              this.sendRes(id, "SET_RES", "1 INVALID_TYPE");
            }
            console.log("SET " + id + " 1 INVALID_TYPE");
            return;
          }
          // m[3] is necessary as it contains data
          if (!m[3]) {
            if (res) {
              this.sendRes(id, "SET_RES", "2 NO_DATA");
            }
            console.log("SET " + id + " 2 NO_DATA");
            return;
          }
          // Execute Set command and return/log response.
          const ret = data.set(m[2], m[3]);
          if (res) {
            this.sendRes(id, "SET_RES", ret);
          }
          console.log("SET " + id + " " + ret);
          break;
          case "SUB":
            // Check if key is present
            if (!m[2]) {
              this.sendRes(id, "SET_RES", "1 NO_KEY");
              console.log("SET " + id + " 1 NO_KEY");
              return;
            }
            // this needed as t
            var token=data.sub(m[2], this.subs, this);
            this.subscriptions.push(token);
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
  // Build pkg
  public sendNoResRaw(payload = "") {
    this.reqId++;
    this.socket.write(this.reqId + " " + payload + "\r\n");
  }
  // Build pkg res
  public sendRes(id = 0, type = "PONG", payload = "") {
    this.socket.write(id + " " + type + " " + payload + "\r\n");
  }
  // Subscriber for all changes
  private subs(m, d, t) {
    t.sendNoResRaw(d);
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
