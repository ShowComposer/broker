const set = require('set-value');

export class SCData {
  private data = {};

  public set(type, cmd) {
    const p = cmd.split("=");
    const key=p[0];
    const value=p[1] || true;
    switch(type) {
      case 'LIVE':
        set(this.data, key, value);
      break;
      case 'STATIC':

      break;
      case 'LINK':

      break;
      case 'TICK':

      break;
    }
    console.log(JSON.stringify(this.data, null, 4));
  }
}
