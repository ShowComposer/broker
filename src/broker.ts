// SC broker
// Init global variables
const config = { port: 6789 };
const subscriber = {};

const sendTypes = ["INIT", "INIT_REUSE", "PING", "SET", "ASSIGN", "DEL", "SUB", "UNSUB", "DUMP", "SMSG"];
const responseTypes = ["INIT_ACK", "PONG", "SET_RES", "ASSIGN_RES", "DEL_RES", "SUB_RES", "UNSUB_RES", "DUMP_RES"];
const dataTypes = ["STATIC", "LIVE", "TICK", "LINK"];

import * as net from "net";
import * as readline from "readline";
import * as uuid from "uuid/v4";
import { SCData } from "./data";

// Logging
import { Logging } from "@hibas123/nodelogging";

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

    this.socket.setKeepAlive(true);
    this.socket.setNoDelay();
    // Handle closing
    socket.on("close", () => {
      Logging.log("Con. " + this.uuid + " closed");
      this.close();
    });
    socket.on("error", (err) => {
      Logging.error(err);
      this.destroy();
    });
  }
  // Periodically Ping
  public ping() {
    const start = process.hrtime.bigint();
    this.send("PING", "", (c) => {
      if (c[1] === "PONG") {
        this.pingResponse = (process.hrtime.bigint() - start) / BigInt(1000);
        this.pingSuccess = Date.now();
        Logging.debug("Ping: " + this.pingResponse + "\xB5s");
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
  public destroy() {
    // unsubscribe from all subscriptions
    this.subscriptions.forEach((s) => {
      data.unsub(s);
    });
    delete subscriber[this.uuid];
    clearInterval(this.pingInt);
    if (!this.socket.destroyed) {
      this.socket.destroy();
    }
    data.set("LIVE", "system.connections." + this.uuid + ".state=DESTROYED");
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
      let res = false;
      let ret;
      switch (m[1]) {
        case "SET":
          if (m[4] === "1") { res = true; }
          // m[2] is data types
          if (!dataTypes.includes(m[2])) {
            if (res) {
              this.sendRes(id, "SET_RES", "E INVALID_TYPE");
            }
            Logging.warning("SET_RES " + id + " E INVALID_TYPE");
            return;
          }
          // m[3] is necessary as it contains data
          if (!m[3]) {
            if (res) {
              this.sendRes(id, "SET_RES", "E NO_DATA");
            }
            Logging.warning("SET_RES " + id + " E NO_DATA");
            return;
          }
          // Execute Set command and return/log response.
          ret = data.set(m[2], m[3]);
          if (res) {
            this.sendRes(id, "SET_RES", ret);
          }
          break;
        case "ASSIGN":
          if (m[5] === "1") { res = true; }
          // m[2] is data types
          if (!dataTypes.includes(m[2])) {
            if (res) {
              this.sendRes(id, "ASSIGN_RES", "E INVALID_TYPE");
            }
            Logging.warning("ASSIGN_RES " + id + " E INVALID_TYPE");
            return;
          }
          // m[3] is necessary as it contains key
          if (!m[3]) {
            if (res) {
              this.sendRes(id, "ASSIGN_RES", "E NO_KEY");
            }
            Logging.warning("ASSIGN_RES " + id + " E NO_KEY");
            return;
          }
          // m[4] is necessary as it contains value
          if (!m[4]) {
            if (res) {
              this.sendRes(id, "ASSIGN_RES", "E NO_VALUE");
            }
            Logging.warning("ASSIGN_RES " + id + " E NO_VALUE");
            return;
          }
          // Execute Set command and return/log response.
          ret = data.assign(m[2], m[3], m[4]);
          if (res) {
            this.sendRes(id, "ASSIGN_RES", ret);
          }
          break;
        case "SUB":
          // Check if key is present
          if (!m[2]) {
            Logging.warning("SUB_RES " + id + " E NO_KEY");
            return;
          }
          // this needed as t
          const s = data.sub(m[2], this.subs, this);
          this.subscriptions.push(s.t);
          this.sendRes(id, "SUB_RES", s.id.toString());
          break;
        case "DUMP":
          // Check if key is present
          if (!m[2]) {
            Logging.warning("DUMP_RES " + id + " E NO_KEY");
            return;
          }
          const d = data.dump(m[2]);
          d.map((dumpSet) => {
            this.sendNoResRaw("SET LIVE " + dumpSet);
          });
        case "UNSUB":
          if (!m[2]) {
            Logging.warning("UNSUB " + id + " E NO_ID");
            return;
          }
          if (data.unsubId(m[2]) === true) {
            this.sendRes(id, "UNSUB_RES", "0 OK");
          } else {
            this.sendRes(id, "UNSUB_RES", "1 ERR");
          }
          break;
      }
    }
    // Else: drop
  }
  // Build pkg
  public send(type = "PING", payload = "", cb = (res: any) => undefined) {
    try {
      this.reqId++;
      this.socket.write(this.reqId + " " + type + " " + payload + "\r\n");
      this.reqArray[this.reqId] = cb;
    } catch (e) {
      Logging.error(e);
      this.destroy();
    }
  }
  // Build pkg
  public sendNoResRaw(payload = "") {
    try {
      this.reqId++;
      this.socket.write(this.reqId + " " + payload + "\r\n");
    } catch (e) {
      Logging.error(e);
      this.destroy();
    }
  }
  // Build pkg res
  public sendRes(id = 0, type = "PONG", payload = "") {
    try {
      this.socket.write(id + " " + type + " " + payload + "\r\n");
    } catch (e) {
      Logging.error(e);
      this.destroy();
    }
  }
  // Subscriber for all changes
  private subs(m, d, id, t) {
    t.sendNoResRaw("SMSG " + id + " " + d);
  }
}

// Create Server
const server = new net.Server();
server.on("connection", (s) => {
  const c = new Client(s);
});
server.listen(config.port, () => {
  Logging.log("Listening on port " + config.port);
  process.send({ status: "listening" });
});
