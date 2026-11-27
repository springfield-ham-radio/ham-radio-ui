// @vitest-environment happy-dom
import { computed, defineComponent, h, nextTick, ref, watch } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AprsBeacon from '../../app/components/AprsBeacon.vue';
import {
  HOME_STATION_ID,
  defaultStationAntennaStore,
  replaceStationInStore,
  updateRadioStation,
} from '../../app/utils/antenna-station.ts';
import { readSavedRadioStore, SAVED_RADIOS_STORAGE_KEY } from '../../app/utils/saved-radios.ts';
import { useAprsHost } from '../../app/composables/useAprsHost.ts';
import { useSavedRadios } from '../../app/composables/useSavedRadios.ts';
import { useStationAntennas } from '../../app/composables/useStationAntennas.ts';

const stateStore = new Map<string, ReturnType<typeof ref>>();

const hostStub = {
  snapshots: ref<Record<string, unknown>>({}),
  watchCard: vi.fn(),
  sendBeacon: vi.fn(async () => ({ ok: true, detail: 'Sent' })),
  setBeaconInterval: vi.fn(),
};

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
    template: '<button type="button" class="u-switch" :disabled="disabled">{{ label }}</button>',
  }),
  UFormField: defineComponent({
    props: ['label', 'error', 'hint'],
    template: '<label class="u-form-field"><span class="field-label">{{ label }}</span><span v-if="error" class="field-error">{{ error }}</span><slot /></label>',
  }),
  UInput: defineComponent({
    props: ['modelValue'],
    emits: ['update:modelValue', 'change'],
    setup(props, { emit }) {
      return () =>
        h('input', {
          class: 'u-input',
          value: props.modelValue as string,
          onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
          onChange: () => emit('change'),
        });
    },
  }),
  USelect: defineComponent({
    props: ['modelValue', 'items'],
    emits: ['update:model-value'],
    template: '<select class="u-select"><option /></select>',
  }),
  UTooltip: defineComponent({
    template: '<span class="u-tooltip"><slot /></span>',
  }),
};

describe('AprsBeacon layout', () => {
  beforeEach(() => {
    stateStore.clear();
    localStorage.clear();
    hostStub.watchCard.mockClear();
    hostStub.sendBeacon.mockClear();
    hostStub.setBeaconInterval.mockClear();

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

  it('prefills coordinates in memory with a From label and opens the modal on Edit beacon', async () => {
    const wrapper = mount(AprsBeacon, {
      props: { cardId: 'radio-1', mine: 'KF5UFJ-1' },
      global: { stubs },
    });

    expect(wrapper.text()).toContain('From Home:');
    expect(wrapper.text()).toContain('Edit beacon');
    expect(wrapper.find('.u-modal').exists()).toBe(false);
    await wrapper.findAll('button').find((button) => button.text() === 'Edit beacon')!.trigger('click');
    await nextTick();

    expect(wrapper.find('.u-modal').exists()).toBe(true);
    expect(wrapper.text()).toContain('From Home');

    const latitude = wrapper.findAll('input.u-input')[0];
    expect((latitude?.element as HTMLInputElement).value).toBe('30.5187');
    expect(wrapper.find('.field-error').exists()).toBe(false);
  });

  it('persists on Save and clears the From label after save', async () => {
    const wrapper = mount(AprsBeacon, {
      props: { cardId: 'radio-1', mine: 'KF5UFJ-1' },
      global: { stubs },
    });

    await wrapper.findAll('button').find((button) => button.text() === 'Edit beacon')!.trigger('click');
    await nextTick();

    await wrapper.findAll('button').find((button) => button.text() === 'Save')!.trigger('click');
    await nextTick();

    const store = JSON.parse(localStorage.getItem(SAVED_RADIOS_STORAGE_KEY) ?? '{}');
    expect(store.radios[0]?.aprsBeacon?.latitude).toBe(30.5187);
    expect(wrapper.text()).not.toContain('From Home:');
    expect(wrapper.find('.u-modal').exists()).toBe(false);
  });

  it('restores the form on Cancel without persisting', async () => {
    const wrapper = mount(AprsBeacon, {
      props: { cardId: 'radio-1', mine: 'KF5UFJ-1' },
      global: { stubs },
    });

    await wrapper.findAll('button').find((button) => button.text() === 'Edit beacon')!.trigger('click');
    await nextTick();

    const latitude = wrapper.findAll('input.u-input')[0];
    await latitude!.setValue('12.345');
    await latitude!.trigger('input');

    await wrapper.findAll('button').find((button) => button.text() === 'Cancel')!.trigger('click');
    await nextTick();

    expect(JSON.parse(localStorage.getItem(SAVED_RADIOS_STORAGE_KEY) ?? '{}').radios[0]?.aprsBeacon).toBeUndefined();
    await wrapper.findAll('button').find((button) => button.text() === 'Edit beacon')!.trigger('click');
    await nextTick();
    expect((wrapper.findAll('input.u-input')[0]!.element as HTMLInputElement).value).toBe('30.5187');
  });

  it('does not persist when altitude text is invalid', async () => {
    const wrapper = mount(AprsBeacon, {
      props: { cardId: 'radio-1', mine: 'KF5UFJ-1' },
      global: { stubs },
    });

    await wrapper.findAll('button').find((button) => button.text() === 'Edit beacon')!.trigger('click');
    await nextTick();

    const altitude = wrapper.findAll('input.u-input').at(-1);
    await altitude!.setValue('abc');
    await altitude!.trigger('input');
    await altitude!.trigger('change');

    await wrapper.findAll('button').find((button) => button.text() === 'Save')!.trigger('click');
    await nextTick();

    expect(JSON.parse(localStorage.getItem(SAVED_RADIOS_STORAGE_KEY) ?? '{}').radios[0]?.aprsBeacon).toBeUndefined();
    expect(wrapper.find('.u-modal').exists()).toBe(true);
    expect(wrapper.text()).toContain('Enter altitude in feet');
  });
});