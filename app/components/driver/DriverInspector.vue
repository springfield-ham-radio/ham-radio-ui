<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import { driverIssuesUnder, explainProtocolStep } from '~/utils/driver-compile';
import { DRIVER_STEP_KIND_LABELS, type DriverEditorSection } from '~/utils/driver-draft';
import { describeProtocolSteps, type ProtocolDisplayStep } from '~/utils/protocol-display';

const { draft, compiled, channelSchema, memoryMap, section, readStepId, writeStepId } = useDriverDraft();
const toast = useToast();
const copying = shallowRef(false);

const panel = shallowRef<'guide' | 'json'>('guide');
const panelItems: TabsItem[] = [
  { label: 'Guide', value: 'guide', icon: 'i-lucide-list-checks' },
  { label: 'JSON', value: 'json', icon: 'i-lucide-braces' },
];

const sectionGuides: Record<DriverEditorSection, string> = {
  setup:
    'Name the radio, then set the programming port and the memory segments. Schema and memory-map paths are optional while you are still learning the protocol. A speed change in the middle of a clone belongs on an exchange step. Segment end addresses are inclusive, so 0x0000–0x03FF is 1024 bytes.',
  channel:
    'This is the channel the editor edits: an optional name, receive and transmit frequencies in hertz, and optional CTCSS or DCS tones. The JSON panel is the schema file. Copy it, then point the Channel schema path on Setup at that file. The Memory tab places these fields into the radio image.',
  memory:
    'Bindings name the channel struct and the fields for the name, frequencies, and tones. Settings groups are the list on the Settings screen, and a field can point at a group with a label and a widget. The JSON panel is the memory-map file. Copy it, then point the Memory map path on Setup at that file.',
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
const previewJson = computed(() => {
  if (section.value === 'channel') {
    return channelSchema.value.json;
  }

  if (section.value === 'memory') {
    return memoryMap.value.json;
  }

  return compiled.value.json;
});
const previewErrors = computed(() => {
  if (section.value === 'channel') {
    return channelSchema.value.errorCount;
  }

  if (section.value === 'memory') {
    return memoryMap.value.errorCount;
  }

  return compiled.value.errorCount;
});
const previewWarnings = computed(() => {
  if (section.value === 'channel') {
    return 0;
  }

  if (section.value === 'memory') {
    return memoryMap.value.warningCount;
  }

  return compiled.value.warningCount;
});

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
  if (section.value === 'channel') {
    return channelSchema.value.issues;
  }

  if (section.value === 'memory') {
    return memoryMap.value.issues;
  }

  if (section.value === 'setup') {
    const identity = compiled.value.issues.filter((issue) => {
      return issue.path.startsWith('id.') || issue.path === 'version' || issue.path.startsWith('schemas');
    });

    return [...identity, ...driverIssuesUnder(compiled.value.issues, 'serial'), ...driverIssuesUnder(compiled.value.issues, 'memory')];
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

function copyTitle(): string {
  if (previewErrors.value > 0) {
    return 'Copied JSON that still has errors';
  }

  if (section.value === 'channel') {
    return 'Copied channel schema';
  }

  if (section.value === 'memory') {
    return 'Copied memory map';
  }

  return 'Copied driver JSON';
}

async function copyJson(): Promise<void> {
  copying.value = true;

  try {
    await navigator.clipboard.writeText(previewJson.value);
    toast.add({
      title: copyTitle(),
      color: previewErrors.value > 0 ? 'warning' : 'success',
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
        :color="previewErrors > 0 ? 'error' : previewWarnings > 0 ? 'warning' : 'success'"
        variant="subtle"
        :label="
          previewErrors > 0
            ? `${previewErrors} to fix`
            : previewWarnings > 0
              ? `${previewWarnings} notes`
              : 'Syntax ok'
        "
      />
    </div>

    <div v-if="panel === 'json'" class="relative min-h-0 w-full min-w-0 flex-1">
      <div class="h-full overflow-auto rounded-lg bg-default ring-1 ring-default">
        <p v-if="previewErrors > 0" class="pt-3 pr-12 pl-3 text-xs text-muted">
          Fields that still have errors are left out, so this preview stays valid JSON.
        </p>
        <JsonCode :code="previewJson" class="!pr-12" />
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
