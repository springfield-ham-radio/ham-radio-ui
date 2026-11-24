import { readFileSync } from 'node:fs';
import { computed, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const driver = vi.hoisted(() => ({
  readRadio: vi.fn(),
  writeRadio: vi.fn(),
  getSerialLogData: vi.fn((): unknown => undefined),
}));

const captureRadioImageBackup = vi.hoisted(() => vi.fn(async () => ({ status: 'saved' as const, fileName: 'x.img', prunedFileNames: [] })));

vi.mock('@springfield/ham-radio-driver', () => ({
  RadioDriver: class {
    readRadio(path: string, progress: unknown) {
      return driver.readRadio(path, progress);
    }

    writeRadio(path: string, data: Uint8Array, progress: unknown) {
      return driver.writeRadio(path, data, progress);
    }

    getSerialLogData() {
      return driver.getSerialLogData();
    }
  },
}));

vi.mock('../../app/utils/radio-image-backup.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/utils/radio-image-backup.ts')>();

  return {
    ...actual,
    captureRadioImageBackup,
    shouldCaptureRadioImageBackup: () => false,
  };
});

const stateStore = new Map<string, ReturnType<typeof ref>>();
const focusedCardId = ref('saved-radio-1');
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
  transferCardId: ref<string | undefined>(undefined),
  focusedCardId,
  cards: ref([{ id: 'saved-radio-1', savedRadioId: 'saved-radio-1' }]),
  openGuestCard: vi.fn(),
  focusCard: vi.fn(),
  beginTransfer: vi.fn(),
  clearTransfer: vi.fn(),
  setLayout: vi.fn(),
}));
vi.stubGlobal('useSavedRadios', () => ({
  radios: ref([{ id: 'saved-radio-1', name: 'Handheld', manufacturer: 'Kenwood', model: 'TH-D74' }]),
}));
vi.stubGlobal('navigator', { userAgent: 'vitest' });

const radioId = {
  manufacturer: 'Kenwood',
  model: 'TH-D74',
  name: 'TH-D74',
};

const config = {
  id: radioId,
  version: '1.0.0',
  description: 'Test radio',
  settingsSchema: {},
  memoryConfig: {
    chunkSize: 256,
    addressSize: 2,
    addressEndianness: 'big',
    segments: {},
  },
  serialConfig: { baudRate: 57600 },
  writeMemory: [{ send: [0x01] }],
  readMemory: [{}],
};

function seedState(key: string, value: unknown): void {
  if (!stateStore.has(key)) {
    stateStore.set(key, ref(value));
    return;
  }

  stateStore.get(key)!.value = value;
}

describe('writeRadioImageForMenuCapture', () => {
  beforeEach(() => {
    stateStore.clear();
    toasts.length = 0;
    driver.readRadio.mockReset();
    driver.writeRadio.mockReset();
    driver.writeRadio.mockResolvedValue(undefined);
    captureRadioImageBackup.mockClear();
    focusedCardId.value = 'saved-radio-1';
    seedState('radio-configurations', [config]);
    seedState('radio-card-transfers', {});
    seedState('menu-capture-port-holds', {});
    seedState('radio-card-sessions', {});
    seedState('radio-progress', {});
  });

  it('writes when the card has no editor session (no prior read)', async () => {
    const { useRadio } = await import('../../app/composables/useRadio.ts');
    const radio = useRadio();
    const image = Uint8Array.from([1, 2, 3]);

    const ok = await radio.writeRadioImageForMenuCapture('saved-radio-1', '/dev/ttyUSB0', image);

    expect(ok).toBe(true);
    expect(driver.writeRadio).toHaveBeenCalledTimes(1);
    expect(driver.readRadio).not.toHaveBeenCalled();
  });

  it('uses the provided step image for prewrite backup without a fresh backup read', async () => {
    const { useRadio } = await import('../../app/composables/useRadio.ts');
    const radio = useRadio();
    const stepImage = Uint8Array.from([9, 9, 9]);
    const baselineImage = Uint8Array.from([1, 1, 1]);

    const ok = await radio.writeRadioImageForMenuCapture('saved-radio-1', '/dev/ttyUSB0', baselineImage, 57600, {
      preRestoreBackupImage: stepImage,
    });

    expect(ok).toBe(true);
    expect(driver.readRadio).not.toHaveBeenCalled();
    expect(driver.writeRadio).toHaveBeenCalledTimes(1);
  });

  it('keeps card Write on preparePrewriteBackup while menu capture restore can use a step image', () => {
    const text = readFileSync(new URL('../../app/composables/useRadio.ts', import.meta.url), 'utf8');
    const menuCaptureWrite = text.slice(text.indexOf('writeRadioImageForMenuCapture'));

    expect(text).toMatch(/async function writeToRadio[\s\S]*preparePrewriteBackup/);
    expect(menuCaptureWrite).toContain('persistPrewriteBackupImage');
    expect(menuCaptureWrite).toContain('preRestoreBackupImage');
    expect(menuCaptureWrite).not.toContain('if (!session || !radioId)');
  });
});