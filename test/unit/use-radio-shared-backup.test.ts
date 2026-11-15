import { computed, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasPendingBackupFailureDecision,
  resetBackupFailureDecisionForTests,
  waitForBackupFailureDecision,
} from '../../app/utils/radio-backup-failure-decision.ts';

const stateStore = new Map<string, ReturnType<typeof ref>>();

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
  lockedPorts: ref([]),
  holderFor: () => undefined,
  setHolderPorts: vi.fn(),
}));
vi.stubGlobal('useRadioBoard', () => ({
  transferCardId: ref('transfer-card'),
  focusedCardId: ref('focused-card'),
  cards: ref([]),
  openGuestCard: vi.fn(),
  focusCard: vi.fn(),
  beginTransfer: vi.fn(),
  clearTransfer: vi.fn(),
  setLayout: vi.fn(),
}));
vi.stubGlobal('useSavedRadios', () => ({ radios: ref([]) }));

describe('useRadio shared backup failure decision', () => {
  beforeEach(() => {
    resetBackupFailureDecisionForTests();
    stateStore.clear();
  });

  it('lets a second useRadio() instance settle the backup wait the write path is awaiting', async () => {
    const { useRadio } = await import('../../app/composables/useRadio.ts');
    const decision = waitForBackupFailureDecision('focused-card');
    const progressDialog = useRadio();
    const writeDialog = useRadio();

    stateStore.get('radio-card-transfers')!.value = {
      'focused-card': {
        cardId: 'focused-card',
        port: '/dev/ttyS0',
        kind: 'backup',
        progress: 0.4,
        error: { summary: 'fail' },
        startedAt: 1,
        canceled: false,
        open: true,
        inFlight: true,
      },
    };

    progressDialog.continueWriteWithoutBackupFromDialog();

    await expect(decision).resolves.toBe('skip');
    expect(hasPendingBackupFailureDecision('focused-card')).toBe(false);
    expect(stateStore.get('radio-card-transfers')!.value['focused-card'].error).toBeNull();
    expect(stateStore.get('radio-card-transfers')!.value['focused-card'].inFlight).toBe(true);

    stateStore.get('radio-card-transfers')!.value = {
      ...stateStore.get('radio-card-transfers')!.value,
      'focused-card': {
        ...stateStore.get('radio-card-transfers')!.value['focused-card'],
        open: false,
        inFlight: false,
      },
    };
    writeDialog.onProgressDialogClosed();
    expect(stateStore.get('radio-card-transfers')!.value['focused-card']).toBeUndefined();
  });

  it('aborts only that card when its progress overlay closes with a pending decision', async () => {
    const { useRadio } = await import('../../app/composables/useRadio.ts');
    const decision = waitForBackupFailureDecision('focused-card');
    const other = waitForBackupFailureDecision('other-card');
    const progressDialog = useRadio();

    stateStore.get('radio-card-transfers')!.value = {
      'focused-card': {
        cardId: 'focused-card',
        port: '/dev/ttyS0',
        kind: 'backup',
        progress: 0.4,
        error: { summary: 'fail' },
        startedAt: 1,
        canceled: false,
        open: false,
        inFlight: true,
      },
    };

    progressDialog.onProgressDialogClosed();

    await expect(decision).resolves.toBe('abort');
    expect(hasPendingBackupFailureDecision('focused-card')).toBe(false);
    expect(stateStore.get('radio-card-transfers')!.value['focused-card'].inFlight).toBe(true);

    other.then(() => undefined, () => undefined);
    const { resolveBackupFailureDecision } = await import('../../app/utils/radio-backup-failure-decision.ts');
    expect(resolveBackupFailureDecision('other-card', 'skip')).toBe(true);
    await expect(other).resolves.toBe('skip');
  });
});
