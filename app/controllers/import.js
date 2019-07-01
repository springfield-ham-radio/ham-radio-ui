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

  actions: {
    async importFromRadio() {
      const driver = new BaofengDriver(this.port);
      const decoder = new BaofengDecoder();
      const memory = await driver.importFromRadio({ setValue: (value) => this.set('progress', value), isCanceled: false});
      const programmedRadioChannels = decoder.decode(memory);
      this.router.transitionTo('radio', {channels: programmedRadioChannels});
    }
  }
});
