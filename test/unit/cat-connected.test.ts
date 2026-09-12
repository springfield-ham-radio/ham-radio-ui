import { describe, it } from 'node:test';
import { expect } from 'chai';
import { computed, ref } from 'vue';

describe('CAT connected sessions', () => {
  it('should treat each live radio as its own connected session', () => {
    const liveRadios = ref<Array<{ port: string }>>([]);
    const connected = computed(() => liveRadios.value.length > 0);

    expect(connected.value).to.equal(false);

    liveRadios.value = [{ port: '/dev/cu.usbserial-a' }];
    expect(connected.value).to.equal(true);

    liveRadios.value = [
      { port: '/dev/cu.usbserial-a' },
      { port: '/dev/cu.usbserial-b' },
    ];
    expect(liveRadios.value).to.have.length(2);
    expect(connected.value).to.equal(true);

    liveRadios.value = liveRadios.value.filter((radio) => radio.port !== '/dev/cu.usbserial-a');
    expect(liveRadios.value).to.have.length(1);
    expect(connected.value).to.equal(true);

    liveRadios.value = [];
    expect(connected.value).to.equal(false);
  });
});
