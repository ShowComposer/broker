import get = require("get-value");
import PubSub = require("pubsub-js");
import set = require("set-value");
import os = require("os");
import json = require('big-json');
import fs = require('fs');
// Logging
import { Logging } from "@hibas123/nodelogging";

export class SCData {
  private file = "";
  private staticLastChange: number;
  private staticChanged = false;
  private lastSave: number;
  private data = {};
  private static = {};
  private subscribers = [];
  constructor() {
    this.file = os.homedir() + "/SCProject.json";
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
    Logging.log("Saving project into " + this.file);
    const wstream = fs.createWriteStream(this.file);
    const stringifyStream = json.createStringifyStream({
      body: this.static
    });
    stringifyStream.pipe(wstream);
    stringifyStream.on('end', () => {
      wstream.end();
      this.lastSave = Date.now();
      this.staticChanged = false;
    });
    wstream.on('finish', ()=>{
      fs.appendFile(this.file, os.EOL, 'utf8', (err) => {
        if (err) {
          Logging.error(err);
        }
      });
    });
    wstream.on('error', (err) => {
      Logging.error("Error Saving project: " + err);
    });

  }
}
