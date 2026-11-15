import { computed, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const driver = vi.hoisted(() => ({
  readRadio: vi.fn(),
}));

vi.mock('@springfield/ham-radio-driver', () => ({
  RadioDriver: class {
    readRadio(path: string, progress: { setValue: (value: number) => void }) {
      return driver.readRadio(path, progress);
    }

    getSerialLogData() {
      return undefined;
    }
  },
}));

const stateStore = new Map<string, ReturnType<typeof ref>>();
const transferCardId = ref<string | undefined>('card-a');
const focusedCardId = ref<string | undefined>('card-a');
const toasts: Array<{ title?: string }> = [];

vi.stubGlobal('useState', (key: string, init?: () => unknown) => {
  if (!stateStore.has(key)) {
    stateStore.set(key, ref(typeof init === 'function' ? init() : undefined));
  }

  return stateStore.get(key)!;
});
vi.stubGlobal('computed', computed);
vi.stubGlobal('useToast', () => ({
  add: (toast: { title?: string }) => {
    toasts.push(toast);
  },
}));
vi.stubGlobal('getCurrentInstance', () => null);
vi.stubGlobal('useCatPortLock', () => ({
  lockedPorts: ref([]),
  holderFor: () => undefined,
  setHolderPorts: vi.fn(),
}));
vi.stubGlobal('useRadioBoard', () => ({
  transferCardId,
  focusedCardId,
  cards: ref([]),
  openGuestCard: vi.fn(),
  focusCard: vi.fn(),
  beginTransfer: vi.fn(),
  clearTransfer: vi.fn(),
  setLayout: vi.fn(),
}));
vi.stubGlobal('useSavedRadios', () => ({ radios: ref([]) }));
vi.stubGlobal('navigator', { userAgent: 'vitest' });

const radioId = {
  manufacturer: 'Test',
  model: 'test-ht',
  name: 'Test HT',
};

describe('concurrent radio reads', () => {
  beforeEach(() => {
    stateStore.clear();
    toasts.length = 0;
    driver.readRadio.mockReset();
    transferCardId.value = 'card-a';
    focusedCardId.value = 'card-a';
  });

  it('tracks progress per card and blocks a second use of the same port', async () => {
    const pending = new Map<string, (value: undefined) => void>();
    driver.readRadio.mockImplementation(async (path: string, progress: { setValue: (value: number) => void }) => {
      progress.setValue(path.endsWith('0') ? 0.2 : 0.7);
      return new Promise((resolve) => {
        pending.set(path, resolve);
      });
    });

    const { useRadio } = await import('../../app/composables/useRadio.ts');
    const radio = useRadio();
    stateStore.get('radio-configurations')!.value = [
      {
        id: radioId,
        version: '1.0.0',
        description: 'Test radio',
        settingsSchema: {},
        memoryConfig: { chunkSize: 8, addressSize: 1, addressEndianness: 'big', segments: {} },
        serialConfig: { baudRate: 9600 },
        readMemory: [],
        writeMemory: [],
      },
    ];

    transferCardId.value = 'card-a';
    const first = radio.readFromRadio('/dev/ttyUSB0', radioId);
    transferCardId.value = 'card-b';
    const second = radio.readFromRadio('/dev/ttyUSB1', radioId);

    await vi.waitFor(() => {
      expect(driver.readRadio).toHaveBeenCalledTimes(2);
    });

    const transfers = () => stateStore.get('radio-card-transfers')!.value as Record<string, {
      port: string;
      progress: number;
      inFlight: boolean;
      open: boolean;
    }>;

    expect(transfers()['card-a']).toMatchObject({ port: '/dev/ttyUSB0', progress: 0.2, inFlight: true, open: true });
    expect(transfers()['card-b']).toMatchObject({ port: '/dev/ttyUSB1', progress: 0.7, inFlight: true, open: true });

    focusedCardId.value = 'card-b';
    expect(radio.progress.value).toBe(0.7);
    focusedCardId.value = 'card-a';
    expect(radio.progress.value).toBe(0.2);
    expect(transfers()['card-b'].progress).toBe(0.7);

    transferCardId.value = 'card-c';
    await radio.readFromRadio('/dev/ttyUSB0', radioId);

    expect(driver.readRadio).toHaveBeenCalledTimes(2);
    expect(toasts.some((toast) => toast.title === 'Serial port in use')).toBe(true);
    expect(transfers()['card-c']).toBeUndefined();

    pending.get('/dev/ttyUSB0')?.(undefined);
    pending.get('/dev/ttyUSB1')?.(undefined);
    await first;
    await second;
  });
});
