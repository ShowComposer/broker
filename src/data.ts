import PubSub = require("pubsub-js");
import set = require("set-value");

export class SCData {
  private data = {};
  private static = {};
  public set(type, cmd) {
    const p = cmd.split("=");
    const key = p[0];
    const value = p[1] || true;
    // Switch between different set-types
    switch (type) {
      case "LIVE":
        set(this.data, key, value);
        PubSub.publish(key, "SET LIVE " + key + "=" + value + " 0");
        break;
      case "STATIC":
        set(this.data, key, value);
        PubSub.publish(key, "SET STATIC " + key + "=" + value + " 0");
        set(this.static, key, value);
        // ToDo: Save changes
        break;
      case "LINK":
        // ToDo
        break;
      case "TICK":

        break;
    }
    return "0";
  }
  public sub(key, cb, t) {
    const token = PubSub.subscribe(key, (m, d) => {
      cb(m, d, t);
    });
    return token;
  }
  public unsub(token) {
    PubSub.unsubscribe(token);
  }
}
