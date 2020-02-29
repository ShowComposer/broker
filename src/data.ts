// Logging
import { Logging } from "@hibas123/nodelogging";
import json = require("big-json");
import deepForEach = require("deep-for-each");
import fs = require("fs");
import get = require("get-value");
import merge = require("merge-deep");
import os = require("os");
import PubSub = require("pubsub-js");
import set = require("set-value");

export class SCData {
  private file = "";
  private fileLoaded = false;
  private staticLastChange: number;
  private staticChanged = false;
  private lastSave: number;
  private data = {};
  private static = {};
  private subscribers = [];
  constructor() {
    this.file = os.homedir() + "/SCProject.json";
    this.load();
    this.staticLastChange = Date.now();
    this.lastSave = Date.now();
    setInterval(() => {
      if (this.staticChanged) {
        if (Date.now() - this.lastSave > 10000) {
          this.save();
        }
      }
    }, 5000);
  }
	public set(type, cmd) {
		const p = cmd.split(":");
		this.setPlain(type, cmd, this.base64toString(p[1]));
	}

  public setPlain(type, cmd, value : any = true) {
    const p = cmd.split(":");
    const key = p[0];
    // Switch between different set-types
    switch (type) {
      case "LIVE":
        set(this.data, key, value);
        PubSub.publish(key, "SET LIVE " + key + ":" + this.stringToBase64(value));
        break;
      case "STATIC":
        set(this.data, key, value);
        PubSub.publish(key, "SET STATIC " + key + ":" + this.stringToBase64(value));
        set(this.static, key, value);
        // Save file if necessary and set flags
        this.staticChanged = true;
        if ((Date.now() - this.staticLastChange) > 250) {
          this.save();
        }
        this.staticLastChange = Date.now();
        break;
      case "LINK":
        // ToDo
        break;
      case "TICK":
        set(this.data, key, value);
        PubSub.publish(key, "SET TICK " + key + ":" + this.stringToBase64(value));
        break;
    }
    Logging.debug("SET " + key + " to " + value + " (" + type + ")");
    return "0";
  }
  public assign(type, key, value = "e30=") {
    // Build POJO from encoded string
    const assObject = this.base64toPOJO(value);
    // Prepare object with nested key to merge at root level
    const deepAssObject = {};
    set(deepAssObject, key, assObject);
    // Switch between different assign-types
    switch (type) {
      case "LIVE":
        this.data = merge(this.data, deepAssObject);
        PubSub.publish(key, "ASSIGN LIVE " + key + " " + value);
        break;
      case "STATIC":
        this.data = merge(this.data, deepAssObject);
        PubSub.publish(key, "ASSIGN STATIC " + key + " " + value);
        this.static = merge(this.static, deepAssObject);
        // Save file if necessary and set flags
        this.staticChanged = true;
        if ((Date.now() - this.staticLastChange) > 250) {
          this.save();
        }
        this.staticLastChange = Date.now();
        break;
      case "LINK":
        // ToDo
        break;
      case "TICK":
        this.data = merge(this.data, deepAssObject);
        PubSub.publish(key, "ASSIGN TICK " + key + " " + value);
        break;
    }
    Logging.debug("ASSIGN " + JSON.stringify(assObject) + " to " + key + " (" + type + ")");
    return "0";
  }
  public sub(key, cb, t) {
    const id = this.subscribers.length;
    const token = PubSub.subscribe(key, (m, d) => {
      cb(m, d, id, t);
    });
    Logging.log("New subscription to " + key);
    this.subscribers[id] = token;
    return { t: token, id };
  }
  public unsub(token) {
    PubSub.unsubscribe(token);
  }
  public unsubId(id) {
    if (this.subscribers[id]) {
      PubSub.unsubscribe(this.subscribers[id]);
      this.subscribers[id] = false;
      return true;
    }
    return false;
  }
  public dump(key) {
    const d = get(this.data, key);
    Logging.debug("DUMP " + key);
    return this.POJOtoBase64(d);
  }
  public save() {
    if (this.fileLoaded) {
      Logging.log("Saving project into " + this.file);
      const wstream = fs.createWriteStream(this.file);
      const stringifyStream = json.createStringifyStream({
        body: this.static,
      });
      stringifyStream.pipe(wstream);
      stringifyStream.on("end", () => {
        wstream.end();
        this.lastSave = Date.now();
        this.staticChanged = false;
      });
      wstream.on("finish", () => {
        fs.appendFile(this.file, os.EOL, "utf8", (err) => {
          if (err) {
            Logging.error(err);
          }
        });
      });
      wstream.on("error", (err) => {
        Logging.error("Error Saving project: " + err);
      });
    } else {
      Logging.error("Cannot save to unloaded file!");
    }
  }
  public load() {
    if (fs.existsSync(this.file)) {
      Logging.log("Loading project from " + this.file);

      const readStream = fs.createReadStream(this.file);
      const parseStream = json.createParseStream();
      parseStream.on("data", (pojo) => {
        deepForEach(pojo, (v, k, s, p) => {
          if (typeof v !== "object") {
            this.setPlain("STATIC", p, v);
          }

        });
        this.fileLoaded = true;
      });

      readStream.pipe(parseStream);

    } else {
      this.fileLoaded = true;
      Logging.log("No File, start project with file " + this.file);
    }

  }
	// Base 64 helper methods
  private base64toPOJO(encoded) {
    const buff = Buffer.from(encoded, "base64");
    const text = buff.toString("utf8");
    return JSON.parse(text);
  }
  private POJOtoBase64(obj) {
    const str = JSON.stringify(obj);
    if (typeof str !== "string") {
      Logging.error("Invalid object on POJOtoBase64");
      return;
    }
    const buff = Buffer.from(str, "utf8");
    const b64 = buff.toString("base64");
    return b64;
  }
	private base64toString(encoded) {
		const buff = Buffer.from(encoded, "base64");
		return buff.toString("utf8");
	}
	private stringToBase64(str) {
		if (typeof str !== "string") {
			if(!(str = str.toString())) {
				Logging.error("Invalid value on stringToBase64");
				return;
			}
		}
		const buff = Buffer.from(str, "utf8");
		const b64 = buff.toString("base64");
		return b64;
	}
}
