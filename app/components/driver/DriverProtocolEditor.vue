<script setup lang="ts">
import {
  DRIVER_READ_STEP_KINDS,
  DRIVER_STEP_KIND_LABELS,
  DRIVER_WRITE_STEP_KINDS,
  cloneDriverStep,
  createDriverStep,
  driverStepTitle,
  type DriverStepKind,
} from '~/utils/driver-draft';

const { draft, compiled, section, readStepId, writeStepId, patch, updateReadStep, updateWriteStep } = useDriverDraft();

const side = computed(() => (section.value === 'write' ? 'write' : 'read'));
const steps = computed(() => (side.value === 'write' ? draft.value.writeSteps : draft.value.readSteps));
const compiledSteps = computed(() => (side.value === 'write' ? compiled.value.write : compiled.value.read));
const segmentNames = computed(() => draft.value.segments.map((segment) => segment.name.trim()).filter((name) => name.length > 0));

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

const selected = computed(() => steps.value.find((step) => step.id === selectedId.value));
const selectedIssues = computed(() => compiledSteps.value.find((step) => step.id === selectedId.value)?.issues ?? []);
const addKind = shallowRef<DriverStepKind>(side.value === 'write' ? 'write' : 'read');

const kindItems = computed(() => {
  const kinds = side.value === 'write' ? DRIVER_WRITE_STEP_KINDS : DRIVER_READ_STEP_KINDS;
  return kinds.map((kind) => ({ label: DRIVER_STEP_KIND_LABELS[kind], value: kind }));
});

watch(side, (next) => {
  addKind.value = next === 'write' ? 'write' : 'read';
});

watch(
  steps,
  (list) => {
    if (!list.some((step) => step.id === selectedId.value)) {
      selectedId.value = list[0]?.id;
    }
  },
  { immediate: true },
);

function onAddKind(value: unknown): void {
  if (value === 'exchange' || value === 'read' || value === 'write' || value === 'catRead' || value === 'catWrite') {
    addKind.value = value;
  }
}

function replaceSteps(next: typeof steps.value): void {
  if (side.value === 'write') {
    patch({ writeSteps: next });
    return;
  }

  patch({ readSteps: next });
}

function addStep(): void {
  const step = createDriverStep(addKind.value);
  replaceSteps([...steps.value, step]);
  selectedId.value = step.id;
}

function removeStep(id: string): void {
  replaceSteps(steps.value.filter((step) => step.id !== id));
}

function moveStep(index: number, direction: -1 | 1): void {
  const nextIndex = index + direction;
  const next = steps.value.slice();
  const item = next[index];
  const other = next[nextIndex];

  if (!item || !other) {
    return;
  }

  next[index] = other;
  next[nextIndex] = item;
  replaceSteps(next);
}

function duplicateStep(id: string): void {
  const step = steps.value.find((item) => item.id === id);

  if (!step) {
    return;
  }

  const copy = cloneDriverStep(step);
  replaceSteps([...steps.value, copy]);
  selectedId.value = copy.id;
}

function onUpdate(step: (typeof steps.value)[number]): void {
  if (side.value === 'write') {
    updateWriteStep(step);
    return;
  }

  updateReadStep(step);
}

function stepHasError(id: string): boolean {
  return compiledSteps.value.some((step) => step.id === id && step.issues.some((issue) => issue.level === 'error'));
}
</script>

<template>
  <div class="grid min-h-0 gap-3 lg:grid-cols-[16rem_minmax(0,1fr)]">
    <div class="flex min-h-0 flex-col gap-2">
      <div class="flex gap-1.5">
        <USelect
          :model-value="addKind"
          :items="kindItems"
          value-key="value"
          class="min-w-0 flex-1"
          aria-label="Step type to add"
          @update:model-value="onAddKind"
        />
        <UButton label="Add" color="neutral" variant="outline" size="sm" icon="i-lucide-plus" @click="addStep" />
      </div>
      <p v-if="steps.length === 0" class="px-1 text-sm text-muted">No steps yet.</p>
      <div v-else class="flex flex-col gap-1 overflow-auto">
        <div v-for="(step, index) in steps" :key="step.id" class="flex items-center gap-1">
          <UButton
            :label="driverStepTitle(step, index)"
            :color="step.id === selectedId ? 'primary' : 'neutral'"
            :variant="step.id === selectedId ? 'soft' : 'ghost'"
            size="sm"
            class="min-w-0 flex-1 justify-start"
            :icon="stepHasError(step.id) ? 'i-lucide-circle-alert' : undefined"
            @click="selectedId = step.id"
          />
          <UButton
            icon="i-lucide-chevron-up"
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="index === 0"
            :aria-label="`Move step ${index + 1} earlier`"
            @click="moveStep(index, -1)"
          />
          <UButton
            icon="i-lucide-chevron-down"
            color="neutral"
            variant="ghost"
            size="xs"
            :disabled="index === steps.length - 1"
            :aria-label="`Move step ${index + 1} later`"
            @click="moveStep(index, 1)"
          />
          <UButton
            icon="i-lucide-copy"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="`Duplicate step ${index + 1}`"
            @click="duplicateStep(step.id)"
          />
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="`Remove step ${index + 1}`"
            @click="removeStep(step.id)"
          />
        </div>
      </div>
    </div>
    <div class="min-h-0 overflow-auto pr-1">
      <DriverStepForm
        v-if="selected"
        :step="selected"
        :side="side"
        :segment-names="segmentNames"
        :issues="selectedIssues"
        @update:step="onUpdate"
      />
      <p v-else class="text-sm text-muted">Add a step to describe what the radio does on the wire.</p>
    </div>
  </div>
</template>
