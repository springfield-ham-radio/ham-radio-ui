import { computed, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Frequency, type RadioProgram, type RadioProgrammedChannel, RadioToneType } from '@springfield/ham-radio-api';

const driver = vi.hoisted(() => ({
  writeRadio: vi.fn(),
  getSerialLogData: vi.fn((): unknown => undefined),
}));

vi.mock('@springfield/ham-radio-driver', () => ({
  RadioDriver: class {
    writeRadio(path: string, data: Uint8Array, progress: unknown) {
      return driver.writeRadio(path, data, progress);
    }

    getSerialLogData() {
      return driver.getSerialLogData();
    }
  },
}));

const stateStore = new Map<string, ReturnType<typeof ref>>();
const focusedCardId = ref('card-1');
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
vi.stubGlobal('useCatPortLock', () => ({ lockedPorts: ref([]) }));
vi.stubGlobal('useRadioBoard', () => ({
  transferCardId: ref<string | undefined>(undefined),
  focusedCardId,
  cards: ref([]),
  openGuestCard: vi.fn(),
  focusCard: vi.fn(),
  beginTransfer: vi.fn(),
  clearTransfer: vi.fn(),
}));
vi.stubGlobal('useSavedRadios', () => ({ radios: ref([]) }));
vi.stubGlobal('navigator', { userAgent: 'vitest' });

const radioId = {
  manufacturer: 'Test',
  model: 'test-ht',
  name: 'Test HT',
};

const config = {
  id: radioId,
  version: '1.0.0',
  description: 'Test radio',
  settingsSchema: {},
  memoryConfig: {
    chunkSize: 8,
    addressSize: 1,
    addressEndianness: 'big',
    segments: {},
  },
  serialConfig: { baudRate: 9600 },
  writeMemory: [{ send: [0x01] }],
  readMemory: [],
};

function channel(channelNumber: number, name: string): RadioProgrammedChannel {
  return {
    channelNumber,
    radioChannel: {
      name,
      receiveFrequency: Frequency(146_520_000),
      transmitFrequency: Frequency(146_520_000),
      receiveTone: { tone: 0, type: RadioToneType.CTCSS },
      transmitTone: { tone: 0, type: RadioToneType.CTCSS },
    },
  };
}

const onRadio: RadioProgram = {
  channels: [channel(1, 'KEEP'), channel(4, 'OLD')],
  settings: {},
};
const edited: RadioProgram = {
  channels: [channel(1, 'KEEP')],
  settings: {},
};

function sessionRecord(): {
  radioBaseline?: Uint8Array;
  radioBaselineProgram?: RadioProgram;
  memory?: Uint8Array;
  program?: RadioProgram;
  backupBaselineStale?: boolean;
} {
  const sessions = stateStore.get('radio-card-sessions')!.value as Record<string, {
    radioBaseline?: Uint8Array;
    radioBaselineProgram?: RadioProgram;
    memory?: Uint8Array;
    program?: RadioProgram;
    backupBaselineStale?: boolean;
  }>;

  return sessions['card-1']!;
}

describe('writeToRadio baseline', () => {
  beforeEach(() => {
    stateStore.clear();
    toasts.length = 0;
    driver.writeRadio.mockReset();
    driver.getSerialLogData.mockReset();
    driver.getSerialLogData.mockReturnValue(undefined);
    focusedCardId.value = 'card-1';
  });

  async function openSession(options: { writable?: boolean; stale?: boolean } = {}) {
    const { useRadio } = await import('../../app/composables/useRadio.ts');
    const radio = useRadio();
    const baseline = Uint8Array.from([9, 9, 9]);
    const memory = Uint8Array.from([1, 2, 3]);

    stateStore.get('radio-card-sessions')!.value = {
      'card-1': {
        memory,
        radioBaseline: baseline,
        radioBaselineProgram: onRadio,
        loadedProgram: onRadio,
        program: edited,
        channels: [],
        activeRadioId: radioId,
        backupBaselineStale: options.stale ? true : undefined,
      },
    };
    stateStore.get('radio-configurations')!.value = [
      {
        ...config,
        writeMemory: options.writable === false ? undefined : config.writeMemory,
      },
    ];

    return { radio, baseline, memory };
  }

  it('keeps the baseline when the write is canceled', async () => {
    const { radio, baseline } = await openSession();
    driver.writeRadio.mockRejectedValue(Object.assign(new Error('stopped'), { name: 'CancelledException' }));

    await radio.writeToRadio('/dev/ttyUSB9');

    const session = sessionRecord();
    expect(session.radioBaseline).toBe(baseline);
    expect(session.radioBaselineProgram).toEqual(onRadio);
    expect(session.backupBaselineStale).toBeUndefined();
    expect(toasts.some((toast) => toast.title === 'Write canceled')).toBe(true);
    expect(toasts.some((toast) => toast.title === 'Wrote to radio')).toBe(false);
  });

  it('keeps the diff baseline and marks the backup stale when cancel happens after bytes were sent', async () => {
    const { radio, baseline } = await openSession();
    driver.writeRadio.mockImplementation(async (_path, _data, progress: { setValue: (value: number) => void }) => {
      progress.setValue(0.4);
      throw Object.assign(new Error('stopped'), { name: 'CancelledException' });
    });

    await radio.writeToRadio('/dev/ttyUSB9');

    const session = sessionRecord();
    expect(session.radioBaseline).toBe(baseline);
    expect(session.radioBaselineProgram).toEqual(onRadio);
    expect(session.backupBaselineStale).toBe(true);
  });

  it('keeps the baseline when the driver returns after the operator canceled', async () => {
    const { radio, baseline } = await openSession();
    driver.writeRadio.mockImplementation(async () => {
      stateStore.get('radio-canceled')!.value = true;
    });

    await radio.writeToRadio('/dev/ttyUSB9');

    const session = sessionRecord();
    expect(session.radioBaseline).toBe(baseline);
    expect(session.radioBaselineProgram).toEqual(onRadio);
    expect(toasts.some((toast) => toast.title === 'Write canceled')).toBe(true);
    expect(toasts.some((toast) => toast.title === 'Wrote to radio')).toBe(false);
  });

  it('keeps the baseline when the serial port fails', async () => {
    const { radio, baseline } = await openSession();
    driver.writeRadio.mockRejectedValue(new Error('Failed to open serial port'));

    await radio.writeToRadio('/dev/ttyUSB9');

    const session = sessionRecord();
    expect(session.radioBaseline).toBe(baseline);
    expect(session.radioBaselineProgram).toEqual(onRadio);
    expect(session.backupBaselineStale).toBeUndefined();
    expect(toasts.some((toast) => toast.title === 'Wrote to radio')).toBe(false);
    expect(toasts.some((toast) => toast.title === 'Write canceled')).toBe(false);
  });

  it('leaves a stale backup flag set when the port fails before any bytes are sent', async () => {
    const { radio, baseline } = await openSession({ stale: true });
    driver.writeRadio.mockRejectedValue(new Error('Failed to open serial port'));

    await radio.writeToRadio('/dev/ttyUSB9');

    expect(sessionRecord().radioBaseline).toBe(baseline);
    expect(sessionRecord().backupBaselineStale).toBe(true);
  });

  it('marks the backup stale when a port error happens after bytes were sent', async () => {
    const { radio, baseline } = await openSession();
    driver.getSerialLogData.mockReturnValue({ entries: [{ direction: 'send', data: [1] }] });
    driver.writeRadio.mockRejectedValue(new Error('port disconnected'));

    await radio.writeToRadio('/dev/ttyUSB9');

    const session = sessionRecord();
    expect(session.radioBaseline).toBe(baseline);
    expect(session.radioBaselineProgram).toEqual(onRadio);
    expect(session.backupBaselineStale).toBe(true);
  });

  it('keeps the baseline when the write is aborted before the radio is opened', async () => {
    const { radio, baseline } = await openSession({ writable: false, stale: true });

    await radio.writeToRadio('/dev/ttyUSB9');

    expect(driver.writeRadio).not.toHaveBeenCalled();
    expect(sessionRecord().radioBaseline).toBe(baseline);
    expect(sessionRecord().radioBaselineProgram).toEqual(onRadio);
    expect(sessionRecord().backupBaselineStale).toBe(true);
    expect(toasts.some((toast) => toast.title === 'Write not supported')).toBe(true);
  });

  it('stores the editor image only after a successful write', async () => {
    const { radio, memory } = await openSession();
    driver.writeRadio.mockResolvedValue(undefined);

    await radio.writeToRadio('/dev/ttyUSB9');

    const session = sessionRecord();
    expect(session.radioBaseline).toEqual(memory);
    expect(session.radioBaseline).not.toBe(memory);
    expect(session.radioBaselineProgram).toEqual(edited);
    expect(session.radioBaselineProgram).not.toBe(edited);
    expect(session.backupBaselineStale).toBe(false);
    expect(toasts.some((toast) => toast.title === 'Wrote to radio')).toBe(true);
  });

  it('clears a stale backup flag after a successful write', async () => {
    const { radio } = await openSession({ stale: true });
    driver.writeRadio.mockResolvedValue(undefined);

    await radio.writeToRadio('/dev/ttyUSB9');

    expect(sessionRecord().backupBaselineStale).toBe(false);
  });
});
