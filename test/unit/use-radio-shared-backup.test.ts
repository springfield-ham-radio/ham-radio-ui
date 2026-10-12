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
vi.stubGlobal('useCatPortLock', () => ({ lockedPorts: ref([]) }));
vi.stubGlobal('useRadioBoard', () => ({
  transferCardId: ref('transfer-card'),
  focusedCardId: ref('focused-card'),
  cards: ref([]),
  openGuestCard: vi.fn(),
  beginTransfer: vi.fn(),
  clearTransfer: vi.fn(),
}));
vi.stubGlobal('useSavedRadios', () => ({ radios: ref([]) }));

describe('useRadio shared backup failure decision', () => {
  beforeEach(() => {
    resetBackupFailureDecisionForTests();
    stateStore.clear();
  });

  it('lets a second useRadio() instance settle the backup wait the write path is awaiting', async () => {
    const { useRadio } = await import('../../app/composables/useRadio.ts');
    const decision = waitForBackupFailureDecision();
    const progressDialog = useRadio();
    const writeDialog = useRadio();

    stateStore.get('radio-transfer-in-flight')!.value = true;

    progressDialog.continueWriteWithoutBackupFromDialog();

    await expect(decision).resolves.toBe('skip');
    expect(hasPendingBackupFailureDecision()).toBe(false);

    stateStore.get('radio-progress-open')!.value = false;
    writeDialog.onProgressDialogClosed();
    expect(stateStore.get('radio-transfer-in-flight')?.value).toBe(false);
  });

  it('aborts the shared wait when the progress dialog closes with a pending decision', async () => {
    const { useRadio } = await import('../../app/composables/useRadio.ts');
    const decision = waitForBackupFailureDecision();
    const progressDialog = useRadio();

    stateStore.get('radio-transfer-in-flight')!.value = true;
    stateStore.get('radio-progress-open')!.value = false;

    progressDialog.onProgressDialogClosed();

    await expect(decision).resolves.toBe('abort');
    expect(stateStore.get('radio-transfer-in-flight')?.value).toBe(false);
  });
});
