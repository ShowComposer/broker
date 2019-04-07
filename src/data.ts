const set = require('set-value');
const PubSub = require('pubsub-js');

export class SCData {
  private data = {};

  public set(type, cmd) {
    const p = cmd.split("=");
    const key=p[0];
    const value=p[1] || true;
    switch(type) {
      case 'LIVE':
        set(this.data, key, value);
        PubSub.publish(key, 'SET LIVE '+key+'='+value+' 0');
      break;
      case 'STATIC':

      break;
      case 'LINK':

      break;
      case 'TICK':

      break;
    }
    console.log(JSON.stringify(this.data, null, 4));
    return "0";
  }
}
