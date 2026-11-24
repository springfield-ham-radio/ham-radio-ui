import { computed, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoadedRadioConfig } from '../../app/utils/radio-catalog-db.ts';

const transportClose = vi.hoisted(() => vi.fn(async () => undefined));
const openKenwoodCatSerialTransport = vi.hoisted(() =>
  vi.fn(async () => ({
    write: vi.fn(),
    readLine: vi.fn(),
    discardBuffered: vi.fn(),
    close: transportClose,
  })),
);

vi.mock('../../app/utils/kenwood-cat-serial.ts', () => ({
  openKenwoodCatSerialTransport: (...args: unknown[]) => openKenwoodCatSerialTransport(...args),
}));

vi.mock('../../app/utils/radio-memory-file-io.ts', () => ({
  isTauriRuntime: () => true,
  saveJsonFileWithPicker: vi.fn(),
}));

vi.mock('../../app/utils/serial-idle-hold.ts', () => ({
  releaseSerialPortHold: vi.fn(async () => undefined),
}));

vi.mock('../../app/composables/useRadioErrorToast.ts', () => ({
  showRadioErrorToast: vi.fn(),
}));

vi.mock('../../app/utils/radio-error-report.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/utils/radio-error-report.ts')>();

  return {
    ...actual,
    createRadioErrorReport: vi.fn(async () => ({
      summary: 'stub',
      errors: { name: 'Error', message: 'stub' },
      context: {},
      environment: { appVersion: '0', apiVersion: '0', driverVersion: '0', os: 'vitest' },
    })),
  };
});

const stateStore = new Map<string, ReturnType<typeof ref>>();
const lockedPortsRef = ref<string[]>([]);

vi.stubGlobal('useState', (key: string, init?: () => unknown) => {
  if (!stateStore.has(key)) {
    stateStore.set(key, ref(typeof init === 'function' ? init() : undefined));
  }

  return stateStore.get(key)!;
});
vi.stubGlobal('computed', computed);
vi.stubGlobal('useToast', () => ({ add: vi.fn() }));
vi.stubGlobal('getCurrentInstance', () => null);
vi.stubGlobal('useCatPortLock', () => ({
  lockedPorts: lockedPortsRef,
  setLockedPorts: (paths: string[]) => {
    lockedPortsRef.value = paths;
  },
}));

const outdatedD74: LoadedRadioConfig = {
  id: {
    model: 'kenwood-th-d74',
    name: 'Kenwood TH-D74',
    manufacturer: 'Kenwood',
  },
  capabilities: {
    liveControl: true,
    memoryRead: true,
    memoryWrite: true,
    channelProgramming: true,
    settingsProgramming: true,
  },
  cat: {
    protocol: 'kenwood',
    vfoCount: 2,
    modes: ['FM', 'NFM', 'AM', 'DV'],
    powers: ['H', 'M', 'L', 'EL'],
    modeCommand: 'MD',
    bandControl: true,
    powerBandIndex: true,
  },
  serialConfig: {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    rtscts: true,
  },
};

describe('useCat connect', () => {
  beforeEach(() => {
    stateStore.clear();
    lockedPortsRef.value = [];
    transportClose.mockClear();
    openKenwoodCatSerialTransport.mockClear();
    vi.resetModules();
  });

  it('should not open the serial port when the cat profile is invalid', async () => {
    const { useCat } = await import('../../app/composables/useCat.ts');
    const { connect, error, liveRadios } = useCat();

    await connect('/dev/ttyUSB0', outdatedD74, 9600);

    expect(openKenwoodCatSerialTransport).not.toHaveBeenCalled();
    expect(transportClose).not.toHaveBeenCalled();
    expect(lockedPortsRef.value).toEqual([]);
    expect(liveRadios.value).toHaveLength(0);
    expect(error.value).toMatch(/bandIndexed/);
  });

  it('should close the transport when the session fails after the port opens', async () => {
    const kenwoodCatSession = await import('../../app/utils/kenwood-cat-session.ts');
    const connectSpy = vi.spyOn(kenwoodCatSession.KenwoodCatSession.prototype, 'connect').mockRejectedValue(
      new Error('Radio rejected CAT command'),
    );

    const { useCat } = await import('../../app/composables/useCat.ts');
    const { connect, liveRadios } = useCat();

    await connect('/dev/ttyUSB0', {
      ...outdatedD74,
      cat: {
        protocol: 'kenwood',
        vfoCount: 2,
        frequencyCommands: ['FQ'],
        frequencyWidth: 10,
        bandIndexed: true,
        modes: ['FM'],
        powers: ['H'],
        bandControl: true,
      },
    }, 9600);

    connectSpy.mockRestore();

    expect(openKenwoodCatSerialTransport).toHaveBeenCalled();
    expect(transportClose).toHaveBeenCalled();
    expect(lockedPortsRef.value).toEqual([]);
    expect(liveRadios.value).toHaveLength(0);
  });
});