import Service from '@ember/service';
import { inject as service } from '@ember/service';

export default Service.extend({
  router: service(),

  start() {
    this.ipcRenderer = requireNode('electron').ipcRenderer;
    this.ipcRenderer.on('import-from-radio', () => {
      this.router.transitionTo('import');
    });
  }

});
