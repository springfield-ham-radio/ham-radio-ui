import Controller from '@ember/controller';
import { inject as service } from '@ember/service';

export default Controller.extend({
  ipc: service(),

  init() {
    this._super(...arguments);
    this.ipc.start();
  }
});
