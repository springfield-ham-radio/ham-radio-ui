import { compileChannelSchema } from '~/utils/channel-schema';
import { compileDriverDraft } from '~/utils/driver-compile';
import { compileMemoryMap } from '~/utils/memory-map';
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
  const sectionState = useState<string>('driver-editor-section', () => 'setup');
  const section = computed<DriverEditorSection>({
    get() {
      if (
        sectionState.value === 'read' ||
        sectionState.value === 'write' ||
        sectionState.value === 'channel' ||
        sectionState.value === 'memory'
      ) {
        return sectionState.value;
      }

      return 'setup';
    },
    set(value) {
      sectionState.value = value;
    },
  });
  const readStepId = useState<string | undefined>('driver-editor-read-step', () => undefined);
  const writeStepId = useState<string | undefined>('driver-editor-write-step', () => undefined);
  const compiled = computed(() => compileDriverDraft(draft.value));
  const channelSchema = computed(() => compileChannelSchema(draft.value.channelSchema));
  const memoryMap = computed(() => compileMemoryMap(draft.value.memoryMap));

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
    channelSchema,
    memoryMap,
    patch,
    replaceDraft,
    updateReadStep,
    updateWriteStep,
  };
}
