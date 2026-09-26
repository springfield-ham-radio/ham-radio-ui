<script setup lang="ts">
import type { SplitterItem } from '@nuxt/ui';
import { insertNodeAt, removeNode, useSortable } from '@vueuse/integrations/useSortable';
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

function reorderSteps(fromIndex: number, toIndex: number): void {
  const next = steps.value.slice();
  const [item] = next.splice(fromIndex, 1);

  if (!item) {
    return;
  }

  next.splice(toIndex, 0, item);
  replaceSteps(next);
}

const stepList = useTemplateRef<HTMLElement>('stepList');
const sortableSteps = shallowRef(steps.value);

watch(steps, (list) => {
  sortableSteps.value = [...list];
});

useSortable(stepList, sortableSteps, {
  animation: 150,
  handle: '.step-drag-handle',
  draggable: '.step-row',
  ghostClass: 'token-row-ghost',
  forceFallback: true,
  onUpdate(event) {
    const fromIndex = event.oldIndex;
    const toIndex = event.newIndex;

    if (fromIndex === undefined || toIndex === undefined || fromIndex === toIndex) {
      return;
    }

    if (event.item && event.from) {
      removeNode(event.item);
      insertNodeAt(event.from, event.item, fromIndex);
    }

    reorderSteps(fromIndex, toIndex);
  },
});

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

const panes: SplitterItem[] = [
  { id: 'steps', slot: 'steps', defaultSize: 16, minSize: 12, maxSize: 36, class: 'min-h-0 min-w-0' },
  { id: 'editor', slot: 'editor', defaultSize: 42, minSize: 22, class: 'min-h-0 min-w-0' },
  { id: 'guide', slot: 'guide', defaultSize: 42, minSize: 22, class: 'min-h-0 min-w-0' },
];
</script>

<template>
  <USplitter
    id="driver-protocol"
    auto-save-id="ham-radio-driver-protocol"
    :items="panes"
    class="h-full min-h-0"
    :ui="{ handle: 'w-3' }"
  >
    <template #steps>
    <div class="flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-hidden">
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
      <div v-else ref="stepList" class="flex flex-col gap-1 overflow-auto">
        <div v-for="(step, index) in steps" :key="step.id" class="step-row flex items-center gap-1">
          <span
            v-if="steps.length > 1"
            class="step-drag-handle inline-flex cursor-grab text-muted active:cursor-grabbing"
            role="button"
            tabindex="0"
            :aria-label="`Drag step ${index + 1}`"
          >
            <UIcon name="i-lucide-grip-vertical" class="pointer-events-none size-4" />
          </span>
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
    </template>
    <template #editor>
    <div class="h-full min-h-0 w-full min-w-0 flex-1 overflow-auto px-1">
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
    </template>
    <template #guide>
      <div class="h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden pl-1">
        <slot />
      </div>
    </template>
    <template #resize-handle>
      <DriverPaneHandle />
    </template>
  </USplitter>
</template>
