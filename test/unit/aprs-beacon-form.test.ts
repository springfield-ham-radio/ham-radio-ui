// @vitest-environment happy-dom
import { computed, defineComponent, h, nextTick, ref, watch } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AprsBeacon from '../../app/components/AprsBeacon.vue';
import DmsCoordinateInput from '../../app/components/DmsCoordinateInput.vue';
import {
  HOME_STATION_ID,
  defaultStationAntennaStore,
  replaceStationInStore,
  updateRadioStation,
} from '../../app/utils/antenna-station.ts';
import { dmsInputFromDecimal } from '../../app/utils/location-format.ts';
import { readSavedRadioStore, SAVED_RADIOS_STORAGE_KEY } from '../../app/utils/saved-radios.ts';
import { useAprsHost } from '../../app/composables/useAprsHost.ts';
import { useSavedRadios } from '../../app/composables/useSavedRadios.ts';
import { useStationAntennas } from '../../app/composables/useStationAntennas.ts';

const stateStore = new Map<string, ReturnType<typeof ref>>();
const LOCKED_HOME_SUMMARY = `From Home: 30° 31' 07.32" N 97° 52' 44.40" W`;

const hostStub = {
  snapshots: ref<Record<string, unknown>>({}),
  watchCard: vi.fn(),
  sendBeacon: vi.fn(async () => ({ ok: true, detail: 'Sent' })),
  setBeaconInterval: vi.fn(),
};

function kissReadySnapshot(armed = false) {
  return {
    connected: true,
    hardwareTransmit: true,
    kissConfirmed: true,
    beaconIntervalArmed: armed,
  };
}

function homeStoreWithCoords() {
  let store = defaultStationAntennaStore();
  const home = store.stations.find((entry) => entry.id === HOME_STATION_ID);

  if (!home) {
    throw new Error('home');
  }

  store = replaceStationInStore(
    store,
    updateRadioStation(home, {
      nickname: 'Home',
      latitude: 30.5187,
      longitude: -97.879,
      locationSource: 'coordinates',
    }),
  );

  return store;
}

const stubs = {
  UModal: defineComponent({
    name: 'UModal',
    props: ['open', 'title', 'description'],
    emits: ['update:open'],
    setup(props, { slots }) {
      return () => (props.open ? h('div', { class: 'u-modal' }, [slots.body?.(), slots.footer?.()]) : null);
    },
  }),
  UButton: defineComponent({
    name: 'UButton',
    props: ['label', 'disabled'],
    emits: ['click'],
    setup(props, { emit }) {
      return () =>
        h(
          'button',
          {
            type: 'button',
            disabled: props.disabled === true,
            onClick: () => emit('click'),
          },
          props.label as string,
        );
    },
  }),
  USwitch: defineComponent({
    name: 'USwitch',
    props: ['disabled', 'label'],
    emits: ['update:model-value'],
    setup(props, { emit }) {
      return () =>
        h(
          'button',
          {
            type: 'button',
            class: 'u-switch',
            disabled: props.disabled === true,
            onClick: () => emit('update:model-value', true),
          },
          props.label as string,
        );
    },
  }),
  UFormField: defineComponent({
    props: ['label', 'error', 'hint'],
    template: '<label class="u-form-field"><span class="field-label">{{ label }}</span><span v-if="hint" class="field-hint">{{ hint }}</span><span v-if="error" class="field-error">{{ error }}</span><slot /></label>',
  }),
  UInput: defineComponent({
    props: ['modelValue', 'maxlength'],
    emits: ['update:modelValue', 'change'],
    setup(props, { emit }) {
      return () =>
        h('input', {
          class: 'u-input',
          value: props.modelValue as string,
          maxlength: props.maxlength,
          onInput: (event: Event) => {
            const input = event.target as HTMLInputElement;
            let value = input.value;
            const limit = props.maxlength !== undefined ? Number(props.maxlength) : undefined;

            if (limit !== undefined && value.length > limit) {
              value = value.slice(0, limit);
              input.value = value;
            }

            emit('update:modelValue', value);
          },
          onChange: () => emit('change'),
        });
    },
  }),
  USelect: defineComponent({
    props: ['modelValue', 'items'],
    emits: ['update:model-value'],
    setup(props, { emit }) {
      return () =>
        h(
          'select',
          {
            class: 'u-select',
            value: props.modelValue as string,
            onChange: (event: Event) => emit('update:model-value', (event.target as HTMLSelectElement).value),
          },
          (props.items as string[]).map((item) => h('option', { value: item }, item)),
        );
    },
  }),
  UTooltip: defineComponent({
    template: '<span class="u-tooltip"><slot /></span>',
  }),
};

function mountBeacon() {
  return mount(AprsBeacon, {
    props: { cardId: 'radio-1', mine: 'KF5UFJ-1' },
    global: {
      components: { DmsCoordinateInput },
      stubs,
    },
  });
}

async function openEditBeacon(wrapper: ReturnType<typeof mountBeacon>) {
  await wrapper.findAll('button').find((button) => button.text() === 'Edit beacon')!.trigger('click');
  await nextTick();
}

function storedBeacon() {
  return JSON.parse(localStorage.getItem(SAVED_RADIOS_STORAGE_KEY) ?? '{}').radios[0]?.aprsBeacon;
}

function findAltitudeInput(wrapper: ReturnType<typeof mountBeacon>) {
  return wrapper.findAll('input.u-input').find((input) => {
    const field = input.element.closest('.u-form-field');
    return field?.textContent?.includes('Altitude');
  })!;
}

function findCommentInput(wrapper: ReturnType<typeof mountBeacon>) {
  return wrapper.findAll('input.u-input').find((input) => {
    const field = input.element.closest('.u-form-field');
    return field?.textContent?.includes('Comment');
  })!;
}

describe('AprsBeacon layout', () => {
  beforeEach(() => {
    stateStore.clear();
    localStorage.clear();
    hostStub.watchCard.mockClear();
    hostStub.sendBeacon.mockClear();
    hostStub.setBeaconInterval.mockClear();
    hostStub.snapshots.value = { 'radio-1': kissReadySnapshot() };

    localStorage.setItem(
      SAVED_RADIOS_STORAGE_KEY,
      JSON.stringify({
        radios: [{
          id: 'radio-1',
          name: 'Mobile',
          manufacturer: 'Kenwood',
          model: 'TM-D710',
          serialPort: '/dev/ttyUSB0',
          createdAt: 1,
          updatedAt: 1,
        }],
      }),
    );

    vi.stubGlobal('computed', computed);
    vi.stubGlobal('useState', (key: string, init?: () => unknown) => {
      if (!stateStore.has(key)) {
        if (key === 'station-antenna-store') {
          stateStore.set(key, ref(homeStoreWithCoords()));
        } else if (key === 'saved-radios') {
          stateStore.set(key, ref(readSavedRadioStore()));
        } else if (key === 'station-antenna-store-hydrated') {
          stateStore.set(key, ref(true));
        } else {
          stateStore.set(key, ref(typeof init === 'function' ? init() : undefined));
        }
      }

      return stateStore.get(key)!;
    });
    vi.stubGlobal('useAprsHost', () => hostStub);
    vi.stubGlobal('useSavedRadios', useSavedRadios);
    vi.stubGlobal('useStationAntennas', useStationAntennas);
    vi.stubGlobal('useOperatorLicense', () => ({ homeGridsquare: ref(undefined) }));
    vi.stubGlobal('onScopeDispose', () => undefined);
    vi.stubGlobal('watch', watch);
    vi.stubGlobal('ref', ref);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefills DMS in memory with a From label and opens the modal on Edit beacon', async () => {
    const wrapper = mountBeacon();

    expect(wrapper.text()).toContain(LOCKED_HOME_SUMMARY);
    expect(wrapper.text()).not.toContain('30.5187');
    expect(wrapper.find('.u-modal').exists()).toBe(false);
    expect(wrapper.find('.field-error').exists()).toBe(false);

    await openEditBeacon(wrapper);

    expect(wrapper.find('.u-modal').exists()).toBe(true);
    const latDegrees = dmsInputFromDecimal(30.5187, 'latitude').degrees;
    expect((wrapper.findAll('input.u-input')[0]!.element as HTMLInputElement).value).toBe(latDegrees);
  });

  it('persists on Save with west longitude and clears the From label after save', async () => {
    const wrapper = mountBeacon();

    await openEditBeacon(wrapper);

    expect((wrapper.findAll('select.u-select')[1]!.element as HTMLSelectElement).value).toBe('W');

    await wrapper.findAll('button').find((button) => button.text() === 'Save')!.trigger('click');
    await nextTick();

    const beacon = storedBeacon();
    expect(beacon?.latitude).toBeCloseTo(30.5187, 4);
    expect(beacon?.longitude).toBeCloseTo(-97.879, 4);
    expect(wrapper.text()).not.toContain('From Home:');
    expect(wrapper.find('.u-modal').exists()).toBe(false);
  });

  it('restores the form on Cancel without persisting', async () => {
    const wrapper = mountBeacon();

    await openEditBeacon(wrapper);

    const degrees = wrapper.findAll('input.u-input')[0]!;
    await degrees.setValue('12');
    await degrees.trigger('input');
    expect((degrees.element as HTMLInputElement).value).toBe('12');

    await wrapper.findAll('button').find((button) => button.text() === 'Cancel')!.trigger('click');
    await nextTick();

    expect(storedBeacon()).toBeUndefined();
    await openEditBeacon(wrapper);
    expect((wrapper.findAll('input.u-input')[0]!.element as HTMLInputElement).value).toBe(
      dmsInputFromDecimal(30.5187, 'latitude').degrees,
    );
  });

  it('clears altitudeFt on Save and omits it when Beacon now runs after a clear', async () => {
    const wrapper = mountBeacon();

    await openEditBeacon(wrapper);

    let altitude = findAltitudeInput(wrapper);
    await altitude.setValue('1180');
    await altitude.trigger('input');
    await altitude.trigger('change');

    await wrapper.findAll('button').find((button) => button.text() === 'Save')!.trigger('click');
    await nextTick();
    expect(storedBeacon()?.altitudeFt).toBe(1180);

    await openEditBeacon(wrapper);
    altitude = findAltitudeInput(wrapper);
    await altitude.setValue('');
    await altitude.trigger('input');
    await altitude.trigger('change');
    await wrapper.findAll('button').find((button) => button.text() === 'Save')!.trigger('click');
    await nextTick();

    expect(storedBeacon()?.altitudeFt).toBeUndefined();

    hostStub.sendBeacon.mockClear();
    await wrapper.findAll('button').find((button) => button.text() === 'Beacon now')!.trigger('click');
    await nextTick();

    expect(hostStub.sendBeacon).toHaveBeenCalledTimes(1);
    const payload = hostStub.sendBeacon.mock.calls[0]?.[1] as { settings: { altitudeFt?: number } };
    expect(payload.settings.altitudeFt).toBeUndefined();
  });

  it('does not persist when altitude text is invalid', async () => {
    const wrapper = mountBeacon();

    await openEditBeacon(wrapper);

    const altitude = findAltitudeInput(wrapper);
    await altitude.setValue('abc');
    await altitude.trigger('input');
    await altitude.trigger('change');

    await wrapper.findAll('button').find((button) => button.text() === 'Save')!.trigger('click');
    await nextTick();

    expect(storedBeacon()).toBeUndefined();
    expect(wrapper.find('.u-modal').exists()).toBe(true);
    expect(wrapper.text()).toContain('Enter altitude in feet');
  });

  it('blocks Beacon now when altitude text is invalid', async () => {
    const wrapper = mountBeacon();

    await openEditBeacon(wrapper);
    await wrapper.findAll('button').find((button) => button.text() === 'Save')!.trigger('click');
    await nextTick();

    await openEditBeacon(wrapper);
    const altitude = findAltitudeInput(wrapper);
    await altitude.setValue('abc');
    await altitude.trigger('input');
    await altitude.trigger('change');
    await nextTick();

    const beaconNow = wrapper.findAll('button').find((button) => button.text() === 'Beacon now')!;
    await beaconNow.trigger('click');
    await nextTick();
    expect(hostStub.sendBeacon).not.toHaveBeenCalled();
  });

  it('blocks Save and Beacon now when latitude DMS is invalid', async () => {
    const wrapper = mountBeacon();

    await openEditBeacon(wrapper);

    const degrees = wrapper.findAll('input.u-input')[0]!;
    await degrees.setValue('999');
    await degrees.trigger('input');
    await degrees.trigger('change');

    await wrapper.findAll('button').find((button) => button.text() === 'Save')!.trigger('click');
    await nextTick();

    expect(storedBeacon()).toBeUndefined();
    expect(wrapper.find('.u-modal').exists()).toBe(true);
    expect(wrapper.text()).toMatch(/Latitude|Degrees/);

    const beaconNow = wrapper.findAll('button').find((button) => button.text() === 'Beacon now');
    await beaconNow?.trigger('click');
    await nextTick();
    expect(hostStub.sendBeacon).not.toHaveBeenCalled();
  });

  it('blocks Save when latitude seconds are 60 or more', async () => {
    const wrapper = mountBeacon();

    await openEditBeacon(wrapper);

    const seconds = wrapper.findAll('input.u-input')[2]!;
    await seconds.setValue('60');
    await seconds.trigger('input');
    await seconds.trigger('change');

    await wrapper.findAll('button').find((button) => button.text() === 'Save')!.trigger('click');
    await nextTick();

    expect(storedBeacon()).toBeUndefined();
    expect(wrapper.find('.u-modal').exists()).toBe(true);
    expect(wrapper.text()).toMatch(/Seconds must be from 0 up to \(but not including\) 60/);
  });

  it('shows a live comment counter and maxlength, and shrinks comment when altitude is added', async () => {
    const wrapper = mountBeacon();

    await openEditBeacon(wrapper);

    const comment = findCommentInput(wrapper);
    expect(comment.attributes('maxlength')).toBe('43');
    expect(wrapper.text()).toContain('0/43');

    await comment.setValue('c'.repeat(50));
    await comment.trigger('input');
    expect((comment.element as HTMLInputElement).value.length).toBe(43);
    expect(wrapper.text()).toContain('43/43');

    await findAltitudeInput(wrapper).setValue('1180');
    await findAltitudeInput(wrapper).trigger('input');
    await nextTick();

    expect(comment.attributes('maxlength')).toBe('34');
    expect((comment.element as HTMLInputElement).value.length).toBeLessThanOrEqual(34);
    expect(wrapper.text()).toMatch(/\/34/);
  });

  it('does not disarm the interval when the modal has invalid altitude before Save', async () => {
    const wrapper = mountBeacon();

    await openEditBeacon(wrapper);
    await wrapper.findAll('button').find((button) => button.text() === 'Save')!.trigger('click');
    await nextTick();

    hostStub.setBeaconInterval.mockClear();
    await wrapper.find('.u-switch').trigger('click');
    await nextTick();
    expect(hostStub.setBeaconInterval).toHaveBeenCalledWith('radio-1', expect.objectContaining({ armed: true }));

    hostStub.snapshots.value = { 'radio-1': kissReadySnapshot(true) };
    hostStub.setBeaconInterval.mockClear();

    await openEditBeacon(wrapper);
    const altitude = findAltitudeInput(wrapper);
    await altitude.setValue('abc');
    await altitude.trigger('input');
    await altitude.trigger('change');
    await nextTick();

    const disarmCalls = hostStub.setBeaconInterval.mock.calls.filter((call) => call[1]?.armed === false);
    expect(disarmCalls).toHaveLength(0);
  });
});