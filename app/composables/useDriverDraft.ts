import { compileDriverDraft } from '~/utils/driver-compile';
import {
  readStoredDriverDraft,
  writeStoredDriverDraft,
  type DriverDraft,
  type DriverEditorSection,
  type DriverStepDraft,
} from '~/utils/driver-draft';

/**
 * In-progress driver kept across the Driver page and the section forms.
 */
export function useDriverDraft() {
  const draft = useState<DriverDraft>('driver-editor-draft', () => readStoredDriverDraft());
  const section = useState<DriverEditorSection>('driver-editor-section', () => 'identity');
  const readStepId = useState<string | undefined>('driver-editor-read-step', () => undefined);
  const writeStepId = useState<string | undefined>('driver-editor-write-step', () => undefined);
  const compiled = computed(() => compileDriverDraft(draft.value));

  function commit(next: DriverDraft): void {
    draft.value = next;
    writeStoredDriverDraft(next);
  }

  function patch(partial: Partial<DriverDraft>): void {
    commit({ ...draft.value, ...partial });
  }

  function replaceDraft(next: DriverDraft): void {
    readStepId.value = next.readSteps[0]?.id;
    writeStepId.value = next.writeSteps[0]?.id;
    commit(next);
  }

  function updateReadStep(step: DriverStepDraft): void {
    commit({
      ...draft.value,
      readSteps: draft.value.readSteps.map((item) => (item.id === step.id ? step : item)),
    });
  }

  function updateWriteStep(step: DriverStepDraft): void {
    commit({
      ...draft.value,
      writeSteps: draft.value.writeSteps.map((item) => (item.id === step.id ? step : item)),
    });
  }

  return {
    draft,
    section,
    readStepId,
    writeStepId,
    compiled,
    patch,
    replaceDraft,
    updateReadStep,
    updateWriteStep,
  };
}
