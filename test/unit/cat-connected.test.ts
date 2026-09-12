import { describe, it } from 'node:test';
import { expect } from 'chai';
import { computed, ref, shallowRef } from 'vue';

describe('CAT connected flag', () => {
  it('should turn true after session, status, and port lock are assigned', () => {
    const session = shallowRef<object | undefined>();
    const status = ref<object | undefined>();
    const lockedPort = ref<string | undefined>();
    const connected = computed(
      () => Boolean(session.value) && Boolean(status.value) && Boolean(lockedPort.value),
    );

    expect(connected.value).to.equal(false);

    status.value = { radioIdentity: 'TM-D710' };
    expect(connected.value).to.equal(false);

    session.value = {};
    lockedPort.value = '/dev/cu.usbserial';
    expect(connected.value).to.equal(true);
  });

  it('should stay false if a plain session variable short-circuits Vue tracking', () => {
    let session: object | undefined;
    const status = ref<object | undefined>();
    const lockedPort = ref<string | undefined>();
    const connected = computed(() => Boolean(session && status.value && lockedPort.value));

    expect(connected.value).to.equal(false);

    status.value = { radioIdentity: 'TM-D710' };
    session = {};
    lockedPort.value = '/dev/cu.usbserial';
    expect(connected.value).to.equal(false);
  });
});
