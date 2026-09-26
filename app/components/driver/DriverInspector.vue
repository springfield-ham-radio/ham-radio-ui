<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import { driverIssuesUnder, explainProtocolStep } from '~/utils/driver-compile';
import { describeProtocolSteps } from '~/utils/protocol-display';
import type { DriverEditorSection } from '~/utils/driver-draft';

const { draft, compiled, section, readStepId, writeStepId } = useDriverDraft();

const panel = shallowRef<'guide' | 'json'>('guide');
const panelItems: TabsItem[] = [
  { label: 'Guide', value: 'guide', icon: 'i-lucide-list-checks' },
  { label: 'JSON', value: 'json', icon: 'i-lucide-braces' },
];

const sectionGuides: Record<DriverEditorSection, string> = {
  identity: 'Name the radio. The model id is the catalog key. Schema and memory-map paths are optional while you are still learning the protocol.',
  serial: 'These settings open the programming port. A speed change in the middle of a clone belongs on an exchange step, not here.',
  memory: 'Segments name the address ranges later steps read and write. The end address is inclusive, so 0–1023 is 1024 bytes.',
  read: 'Walk the read protocol one step at a time. Hex, one ASCII character, and placeholders are the only byte forms, so the JSON cannot contain a malformed token.',
  write: 'Walk the write protocol the same way. $data in a chunked write is the slice of the memory image sent to the radio.',
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

const diagram = computed(() => {
  const step = selectedCompiled.value?.step;

  if (!step) {
    return [];
  }

  return describeProtocolSteps([step], compiled.value.memoryConfig);
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
</script>

<template>
  <aside class="flex min-h-0 w-full flex-col gap-3 xl:w-[28rem] xl:shrink-0">
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

    <div v-if="panel === 'json'" class="min-h-0 flex-1 overflow-auto rounded-lg bg-default ring-1 ring-default">
      <p v-if="compiled.errorCount > 0" class="px-3 pt-3 text-xs text-muted">
        Fields that still have errors are left out, so this preview stays valid JSON.
      </p>
      <JsonCode :code="compiled.json" />
    </div>

    <div v-else class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
      <p class="text-sm text-muted">{{ sectionGuides[section] }}</p>
      <p v-if="section === 'read' || section === 'write'" class="text-xs text-muted">
        $address is the chunk address, $block is the chunk index, $chunkSize and $length are one-byte sizes, and $data is the payload.
      </p>

      <div v-if="section === 'read' || section === 'write'" class="flex items-center justify-between gap-2">
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
      <p v-else-if="(section === 'read' || section === 'write') && selectedCompiled && !selectedCompiled.step" class="text-sm text-muted">
        This step stays out of the JSON until the errors below are fixed.
      </p>

      <ul v-if="sectionIssues.length > 0" class="flex flex-col gap-1">
        <li v-for="issue in sectionIssues" :key="`${issue.path}-${issue.message}`" class="text-xs text-muted">
          {{ issue.level === 'warning' ? 'Note: ' : '' }}{{ issue.message }}
        </li>
      </ul>
      <p v-else class="text-sm text-muted">Nothing to fix in this section.</p>

      <div
        v-if="(section === 'read' || section === 'write') && diagram.length > 0"
        class="flex h-80 flex-col overflow-hidden rounded-lg bg-muted ring-1 ring-default"
      >
        <RadioDriverSequence :steps="diagram" :serial-summary="compiled.serialSummary" />
      </div>
    </div>
  </aside>
</template>
