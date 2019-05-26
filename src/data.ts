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
    const p = cmd.split("=");
    const key = p[0];
    const value = p[1] || true;
    // Switch between different set-types
    switch (type) {
      case "LIVE":
        set(this.data, key, value);
        PubSub.publish(key, "SET LIVE " + key + "=" + value);
        break;
      case "STATIC":
        set(this.data, key, value);
        PubSub.publish(key, "SET STATIC " + key + "=" + value);
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

        break;
    }
    Logging.debug("SET " + key + " to " + value);
    return "0";
  }
  public assign(type, cmd) {
    const p = cmd.split("=");
    const key = p[0];
    const value = p[1] || {};
    const assObject = {};
    // ToDo: Encode and unstringify
    // Prepare object with nested key to merge at root level
    const deepAssObject = {};
    set(deepAssObject, key, assObject);
    // Switch between different assign-types
    switch (type) {
      case "LIVE":
        merge(this.data, deepAssObject);
        PubSub.publish(key, "ASSIGN LIVE " + key + "=" + value);
        break;
      case "STATIC":
        merge(this.data, deepAssObject);
        PubSub.publish(key, "ASSIGN STATIC " + key + "=" + value);
        merge(this.static, deepAssObject);
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

        break;
    }
    Logging.debug("ASSIGN " + assObject + " to " + key);
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
    const dump = [];
    Logging.debug("DUMP " + key);
    if (d) {
      const iterate = (obj, last = key) => {
        Object.keys(obj).forEach((k) => {
          if (typeof obj[k] === "object") {
            const nlast = last + "." + k;
            iterate(obj[k], nlast);
          } else {
            dump.push(last + "." + k + "=" + obj[k]);
          }
        });
      };
      iterate(d);
    }
    return dump;
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
    Logging.log("Loading project from " + this.file);

    const readStream = fs.createReadStream(this.file);
    const parseStream = json.createParseStream();
    parseStream.on("data", (pojo) => {
      deepForEach(pojo, (v, k, s, p) => {
        if (typeof v !== "object") {
            this.set("STATIC", p + "=" + v);
        }

      });
      this.fileLoaded = true;
    });

    readStream.pipe(parseStream);
  }
}
