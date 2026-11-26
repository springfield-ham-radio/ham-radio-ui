// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computed, defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PACKET_RADIO_IDENTITY_MIGRATED_KEY, PACKET_SETTINGS_KEY } from '../../app/utils/packet-settings.ts';
import { SAVED_RADIOS_STORAGE_KEY } from '../../app/utils/saved-radios.ts';
import { usePacket, watchPacketStation } from '../../app/composables/usePacket.ts';
import { useSavedRadios } from '../../app/composables/useSavedRadios.ts';

const stateStore = new Map<string, ReturnType<typeof ref>>();

describe('Packet tab station watch', () => {
  beforeEach(() => {
    stateStore.clear();
    localStorage.clear();
    vi.stubGlobal('computed', computed);
    vi.stubGlobal('useState', (key: string, init?: () => unknown) => {
      if (!stateStore.has(key)) {
        stateStore.set(key, ref(typeof init === 'function' ? init() : undefined));
      }

      return stateStore.get(key)!;
    });
    vi.stubGlobal('useAprsHost', () => ({
      addKissDataListener: () => () => undefined,
      addDisconnectHook: () => () => undefined,
      writeKissData: async () => undefined,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('settles a pre-migration saved radio without recursive updates', async () => {
    localStorage.setItem(PACKET_SETTINGS_KEY, JSON.stringify({
      ssid: 8,
      acceptIncoming: true,
      modulo: 8,
      paclen: 128,
      maxframe: 4,
      t1Ms: 3000,
      t3Ms: 180_000,
      n2: 10,
    }));
    localStorage.setItem(SAVED_RADIOS_STORAGE_KEY, JSON.stringify({
      radios: [{
        id: 'home',
        name: 'Home',
        manufacturer: 'Kenwood',
        model: 'TM-D710',
        serialPort: '/dev/ttyUSB0',
        createdAt: 1,
        updatedAt: 1,
      }],
    }));

    const notices: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      notices.push(args.map((item) => String(item)).join(' '));
    });
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      notices.push(args.map((item) => String(item)).join(' '));
    });

    let syncs = 0;
    let packetApi: ReturnType<typeof usePacket> | undefined;
    const Harness = defineComponent({
      name: 'PacketStationHarness',
      props: {
        cardId: { type: String, required: true },
      },
      setup(props) {
        const packet = usePacket();
        packetApi = packet;
        const { radioById } = useSavedRadios();
        const saved = computed(() => radioById(props.cardId));
        const baseCall = computed(() => (saved.value?.name === 'Home' ? 'N0TST' : undefined));
        watchPacketStation(
          () => props.cardId,
          () => baseCall.value,
          {
            states: packet.states,
            syncStation(cardId, call) {
              syncs += 1;
              packet.syncStation(cardId, call);
            },
          },
        );
        const label = computed(() => {
          const settings = packet.states.value[props.cardId]?.settings;
          return `${settings?.ssid ?? ''}:${settings?.acceptIncoming ? 'in' : 'out'}`;
        });
        return () => h('div', label.value);
      },
    });

    const wrapper = mount(Harness, { props: { cardId: 'home' } });
    await nextTick();
    await nextTick();

    expect(notices.join('\n')).not.toMatch(/Maximum recursive updates/);
    expect(syncs).toBeLessThan(5);
    expect(wrapper.text()).toBe('8:in');
    expect(localStorage.getItem(PACKET_RADIO_IDENTITY_MIGRATED_KEY)).toBe('1');

    const stored = JSON.parse(localStorage.getItem(SAVED_RADIOS_STORAGE_KEY) ?? '{}') as {
      radios: Array<{ name?: string; packetSsid?: number; packetAcceptIncoming?: boolean }>;
    };
    expect(stored.radios[0]?.name).toBe('Home');
    expect(stored.radios[0]?.packetSsid).toBe(8);
    expect(stored.radios[0]?.packetAcceptIncoming).toBe(true);
    const persisted = localStorage.getItem(SAVED_RADIOS_STORAGE_KEY);

    const packet = packetApi;
    if (!packet) {
      throw new Error('Packet composable did not start');
    }

    for (let time = 0; time < 5; time += 1) {
      packet.syncStation('home', 'N0TST');
    }

    await nextTick();
    expect(syncs).toBeLessThan(5);
    expect(localStorage.getItem(SAVED_RADIOS_STORAGE_KEY)).toBe(persisted);
    expect(wrapper.text()).toBe('8:in');

    const source = readFileSync(resolve('app/components/RadioPacket.vue'), 'utf8');
    expect(source).toContain('watchPacketStation(');
    expect(source).not.toContain('state.value?.settings.ssid, state.value?.settings.acceptIncoming');
  });
});
