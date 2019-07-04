import Controller from '@ember/controller';
import { computed } from '@ember/object';
import { inject as service } from '@ember/service';

const { BaofengDriver, BaofengDecoder } = requireNode('@springfield/baofeng-driver');

export default Controller.extend({
  router: service(),

  InputGroupProps: {
    rightIcon: 'caret-down',
    placeholder: 'select...',
  },

  ports: computed(async function() {
    const ports = await requireNode('serialport').Binding.list();
    return ports.map((port) => port.comName);
  }),

  async doImport() {
    const driver = new BaofengDriver(this.port);
    const decoder = new BaofengDecoder();
    const memory = await driver.importFromRadio(this.importProgress);
    this.set('importing', false);
    const programmedRadioChannels = decoder.decode(memory);
    this.router.transitionTo('radio', {channels: programmedRadioChannels});
  },

  actions: {
    importFromRadio() {
      const importProgress = { setValue: (value) => this.set('progress', value), isCanceled: false};
      this.set('importProgress', importProgress);
      this.set('importing', true);
      this.doImport();
    },

    cancelImport() {
      this.set('importing', false);
      this.set('importProgress.isCanceled', true);
    }
  }
});
