<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import { driverIssuesUnder, explainProtocolStep } from '~/utils/driver-compile';
import { DRIVER_STEP_KIND_LABELS, type DriverEditorSection } from '~/utils/driver-draft';
import { describeProtocolSteps, type ProtocolDisplayStep } from '~/utils/protocol-display';

const { draft, compiled, section, readStepId, writeStepId } = useDriverDraft();
const toast = useToast();
const copying = shallowRef(false);

const panel = shallowRef<'guide' | 'json'>('guide');
const panelItems: TabsItem[] = [
  { label: 'Guide', value: 'guide', icon: 'i-lucide-list-checks' },
  { label: 'JSON', value: 'json', icon: 'i-lucide-braces' },
];

const sectionGuides: Record<DriverEditorSection, string> = {
  identity: 'Name the radio. The model id is the catalog key. Schema and memory-map paths are optional while you are still learning the protocol.',
  serial: 'These settings open the programming port. A speed change in the middle of a clone belongs on an exchange step, not here.',
  memory: 'Segments name the address ranges later steps read and write. The end address is inclusive, so 0–1023 is 1024 bytes.',
  read: 'The diagram draws the whole read protocol. The highlighted step is the one open in the form. Hex, one ASCII character, and placeholders are the only byte forms, so the JSON cannot contain a malformed token.',
  write: 'The diagram draws the whole write protocol the same way. $data in a chunked write is the slice of the memory image sent to the radio.',
};

const side = computed(() => (section.value === 'write' ? 'write' : 'read'));
const steps = computed(() => (side.value === 'write' ? draft.value.writeSteps : draft.value.readSteps));
const compiledSide = computed(() => (side.value === 'write' ? compiled.value.write : compiled.value.read));

const selectedId = computed({
  get: () => (side.value === 'write' ? writeStepId.value : readStepId.value),
  set: (id: string | undefined) => {
    if (side.value === 'write') {
      writeStepId.value = id;
      return;
    }

    readStepId.value = id;
  },
});

const selectedIndex = computed(() => {
  const index = steps.value.findIndex((step) => step.id === selectedId.value);
  return index >= 0 ? index : 0;
});

const selectedCompiled = computed(() => compiledSide.value[selectedIndex.value]);
const explanation = computed(() => {
  const step = selectedCompiled.value?.step;

  if (!step) {
    return [];
  }

  return explainProtocolStep(step, compiled.value.memoryConfig);
});

const showDiagram = computed(() => section.value === 'read' || section.value === 'write');

const diagram = computed(() => {
  return steps.value.map((step, index): ProtocolDisplayStep => {
    const compiledStep = compiledSide.value[index]?.step;

    if (!compiledStep) {
      return {
        kind: step.kind,
        title: step.description.trim() || DRIVER_STEP_KIND_LABELS[step.kind],
        notes: ['Fix the errors on this step to draw it.'],
        messages: [],
      };
    }

    const [display] = describeProtocolSteps([compiledStep], compiled.value.memoryConfig);

    return (
      display ?? {
        kind: step.kind,
        title: step.description.trim() || DRIVER_STEP_KIND_LABELS[step.kind],
        notes: [],
        messages: [],
      }
    );
  });
});

const sectionIssues = computed(() => {
  if (section.value === 'identity') {
    return compiled.value.issues.filter((issue) => {
      return (
        issue.path.startsWith('id.') ||
        issue.path === 'version' ||
        issue.path.startsWith('schemas')
      );
    });
  }

  if (section.value === 'serial') {
    return driverIssuesUnder(compiled.value.issues, 'serial');
  }

  if (section.value === 'memory') {
    return driverIssuesUnder(compiled.value.issues, 'memory');
  }

  return driverIssuesUnder(compiled.value.issues, side.value);
});

function selectRelative(direction: -1 | 1): void {
  const next = steps.value[selectedIndex.value + direction];

  if (next) {
    selectedId.value = next.id;
  }
}

function onDiagramSelect(index: number): void {
  const step = steps.value[index];

  if (step) {
    selectedId.value = step.id;
  }
}

async function copyJson(): Promise<void> {
  copying.value = true;

  try {
    await navigator.clipboard.writeText(compiled.value.json);
    toast.add({
      title: compiled.value.errorCount > 0 ? 'Copied JSON that still has errors' : 'Copied driver JSON',
      color: compiled.value.errorCount > 0 ? 'warning' : 'success',
      icon: 'i-lucide-check',
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Could not copy to the clipboard';
    toast.add({
      title: 'Copy failed',
      description: message,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    });
  } finally {
    copying.value = false;
  }
}
</script>

<template>
  <aside class="flex h-full min-h-0 w-full min-w-0 flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <UTabs
        v-model="panel"
        :items="panelItems"
        :content="false"
        color="neutral"
        variant="pill"
        size="xs"
        class="w-auto"
        :ui="{ list: 'w-auto', trigger: 'grow-0' }"
      />
      <UBadge
        :color="compiled.errorCount > 0 ? 'error' : compiled.warningCount > 0 ? 'warning' : 'success'"
        variant="subtle"
        :label="
          compiled.errorCount > 0
            ? `${compiled.errorCount} to fix`
            : compiled.warningCount > 0
              ? `${compiled.warningCount} notes`
              : 'Syntax ok'
        "
      />
    </div>

    <div v-if="panel === 'json'" class="relative min-h-0 w-full min-w-0 flex-1">
      <div class="h-full overflow-auto rounded-lg bg-default ring-1 ring-default">
        <p v-if="compiled.errorCount > 0" class="pt-3 pr-12 pl-3 text-xs text-muted">
          Fields that still have errors are left out, so this preview stays valid JSON.
        </p>
        <JsonCode :code="compiled.json" class="!pr-12" />
      </div>
      <UTooltip text="Copy JSON">
        <UButton
          icon="i-lucide-copy"
          color="neutral"
          variant="soft"
          size="xs"
          aria-label="Copy JSON"
          class="absolute top-2 right-2 z-10"
          :loading="copying"
          @click="copyJson"
        />
      </UTooltip>
    </div>

    <div v-else class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div class="flex shrink-0 flex-col gap-2">
        <p class="text-sm text-muted">{{ sectionGuides[section] }}</p>
        <p v-if="showDiagram" class="text-xs text-muted">
          $address is the chunk address, $block is the chunk index, $chunkSize and $length are one-byte sizes, and $data is the payload.
        </p>
      </div>

      <DriverFormSection v-if="showDiagram" class="max-h-[40%] shrink-0 overflow-auto">
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm font-medium text-highlighted">
            {{ steps.length === 0 ? 'No steps' : `Step ${selectedIndex + 1} of ${steps.length}` }}
          </p>
          <div class="flex gap-1">
            <UButton
              icon="i-lucide-chevron-left"
              color="neutral"
              variant="outline"
              size="xs"
              label="Previous"
              :disabled="selectedIndex <= 0"
              @click="selectRelative(-1)"
            />
            <UButton
              icon="i-lucide-chevron-right"
              color="neutral"
              variant="outline"
              size="xs"
              label="Next"
              :disabled="selectedIndex >= steps.length - 1"
              @click="selectRelative(1)"
            />
          </div>
        </div>

        <ul v-if="explanation.length > 0" class="flex flex-col gap-1">
          <li v-for="line in explanation" :key="line" class="text-sm text-highlighted">{{ line }}</li>
        </ul>
        <p v-else-if="selectedCompiled && !selectedCompiled.step" class="text-sm text-muted">
          This step stays out of the JSON until the errors below are fixed.
        </p>

        <ul v-if="sectionIssues.length > 0" class="flex flex-col gap-1">
          <li v-for="issue in sectionIssues" :key="`${issue.path}-${issue.message}`" class="text-xs text-muted">
            {{ issue.level === 'warning' ? 'Note: ' : '' }}{{ issue.message }}
          </li>
        </ul>
        <p v-else class="text-sm text-muted">Nothing to fix in this section.</p>
      </DriverFormSection>

      <div v-else class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
        <ul v-if="sectionIssues.length > 0" class="flex flex-col gap-1">
          <li v-for="issue in sectionIssues" :key="`${issue.path}-${issue.message}`" class="text-xs text-muted">
            {{ issue.level === 'warning' ? 'Note: ' : '' }}{{ issue.message }}
          </li>
        </ul>
        <p v-else class="text-sm text-muted">Nothing to fix in this section.</p>
      </div>

      <div
        v-if="showDiagram"
        class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-muted ring-1 ring-default"
      >
        <RadioDriverSequence
          :steps="diagram"
          :serial-summary="compiled.serialSummary"
          :selected-index="steps.length === 0 ? undefined : selectedIndex"
          empty-label="Add a step to see the sequence."
          @select="onDiagramSelect"
        />
      </div>
    </div>
  </aside>
</template>
