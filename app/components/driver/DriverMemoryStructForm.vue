<script setup lang="ts">
import { driverFieldError } from '~/utils/driver-compile';
import {
  canonicalizeSkipAddress,
  createMemoryField,
  formatFinishedDriverAddress,
  memoryFieldInSettingsGroup,
  type DriverMemoryFieldDraft,
  type DriverMemoryStructDraft,
} from '~/utils/driver-draft';

const props = defineProps<{
  structId: string;
}>();

const { draft, memoryMap, patch } = useDriverDraft();

const struct = computed(() => draft.value.memoryMap.structs.find((item) => item.id === props.structId));
const seekOpened = shallowRef(false);
const declaredGroupIds = computed(() => {
  return new Set(draft.value.memoryMap.groups.map((group) => group.groupId.trim()).filter((id) => id.length > 0));
});

function layoutFieldList(): DriverMemoryFieldDraft[] {
  const groups = declaredGroupIds.value;
  return (struct.value?.fields ?? []).filter((field) => !memoryFieldInSettingsGroup(field, groups));
}

const layoutFields = computed(() => layoutFieldList());
const settingsFieldCount = computed(() => (struct.value?.fields.length ?? 0) - layoutFields.value.length);
const detailsOpen = shallowRef(layoutFieldList().length > 0 && layoutFieldList().length <= 8);
const pickedFieldId = shallowRef<string | undefined>();
const manyFields = computed(() => layoutFields.value.length > 8);
const fieldItems = computed(() => {
  return layoutFields.value.map((field) => ({
    label: field.fieldId.trim() || 'Untitled field',
    value: field.id,
  }));
});
const shownFieldId = computed(() => {
  const fields = layoutFields.value;

  if (fields.some((field) => field.id === pickedFieldId.value)) {
    return pickedFieldId.value;
  }

  return fields[0]?.id;
});

function errorAt(suffix: string): string | undefined {
  return driverFieldError(memoryMap.value.issues, `memory.structs.${props.structId}.${suffix}`);
}

function patchStruct(partial: Partial<DriverMemoryStructDraft>): void {
  const current = struct.value;

  if (!current || Object.entries(partial).every(([key, value]) => current[key as keyof DriverMemoryStructDraft] === value)) {
    return;
  }

  patch({
    memoryMap: {
      ...draft.value.memoryMap,
      structs: draft.value.memoryMap.structs.map((item) => (item.id === props.structId ? { ...item, ...partial } : item)),
    },
  });
}

watch(
  () => struct.value?.seek,
  (seek) => {
    if (seek === undefined) {
      return;
    }

    const force = !seekOpened.value;
    seekOpened.value = true;
    const next = !seek.trim() ? seek : force ? canonicalizeSkipAddress(seek) : formatFinishedDriverAddress(seek);

    if (next !== seek) {
      patchStruct({ seek: next });
    }
  },
  { immediate: true },
);

function commitSeek(event: FocusEvent): void {
  const target = event.target;
  const value = canonicalizeSkipAddress(target instanceof HTMLInputElement ? target.value : '');

  if (struct.value && struct.value.seek !== value) {
    patchStruct({ seek: value });
  }
}

function setClearEmpty(value: boolean | 'indeterminate'): void {
  if (value !== 'indeterminate') {
    patchStruct({ clearEmpty: value });
  }
}

function addField(): void {
  if (!struct.value) {
    return;
  }

  const field = createMemoryField();
  patchStruct({ fields: [...struct.value.fields, field] });
  detailsOpen.value = true;
  pickedFieldId.value = field.id;
}

function chooseField(value: unknown): void {
  if (typeof value === 'string') {
    pickedFieldId.value = value;
  }
}

function removeStruct(): void {
  patch({
    memoryMap: {
      ...draft.value.memoryMap,
      structs: draft.value.memoryMap.structs.filter((item) => item.id !== props.structId),
    },
  });
}
</script>

<template>
  <DriverFormSection
    v-if="struct"
    :title="struct.structId.trim() || 'Struct'"
    help="Fields are laid out in order from the start address. Count and stride repeat the struct, such as 128 channels of 16 bytes."
  >
    <div class="flex justify-end">
      <UButton label="Remove struct" color="neutral" variant="ghost" size="xs" icon="i-lucide-x" @click="removeStruct" />
    </div>
    <div class="grid gap-3 sm:grid-cols-2">
      <UFormField label="Struct id" required :error="errorAt('structId')">
        <UInput
          :model-value="struct.structId"
          class="w-full font-mono"
          placeholder="channels"
          spellcheck="false"
          @update:model-value="patchStruct({ structId: String($event ?? '') })"
        />
      </UFormField>
      <UFormField label="Start address" required :error="errorAt('seek')">
        <template #hint>
          <HelpTooltip text="Radio address, shown as 0x0000." />
        </template>
        <UInput
          :model-value="struct.seek"
          class="w-full font-mono"
          placeholder="0x0000"
          spellcheck="false"
          autocapitalize="characters"
          @update:model-value="patchStruct({ seek: String($event ?? '') })"
          @blur="commitSeek"
        />
      </UFormField>
      <UFormField label="Count" :error="errorAt('count')">
        <template #hint>
          <HelpTooltip text="How many times the struct repeats. Leave blank for a single copy." />
        </template>
        <UInput
          :model-value="struct.count"
          class="w-full font-mono"
          inputmode="numeric"
          @update:model-value="patchStruct({ count: String($event ?? '') })"
        />
      </UFormField>
      <UFormField label="Stride" :error="errorAt('stride')">
        <template #hint>
          <HelpTooltip text="Bytes from one record to the next." />
        </template>
        <UInput
          :model-value="struct.stride"
          class="w-full font-mono"
          inputmode="numeric"
          @update:model-value="patchStruct({ stride: String($event ?? '') })"
        />
      </UFormField>
      <UFormField label="Group size" :error="errorAt('groupSize')">
        <template #hint>
          <HelpTooltip text="Records packed into one clone block. A Kenwood TH-D74 group holds 6." />
        </template>
        <UInput
          :model-value="struct.groupSize"
          class="w-full font-mono"
          inputmode="numeric"
          @update:model-value="patchStruct({ groupSize: String($event ?? '') })"
        />
      </UFormField>
      <UFormField label="Group padding" :error="errorAt('groupPad')">
        <template #hint>
          <HelpTooltip text="Bytes after each group. A TH-D74 group is followed by 16." />
        </template>
        <UInput
          :model-value="struct.groupPad"
          class="w-full font-mono"
          inputmode="numeric"
          @update:model-value="patchStruct({ groupPad: String($event ?? '') })"
        />
      </UFormField>
      <UFormField label="Empty byte" :error="errorAt('emptyEquals')">
        <template #hint>
          <HelpTooltip text="When the first byte equals this, the slot is empty. A UV-5R uses 0xFF." />
        </template>
        <UInput
          :model-value="struct.emptyEquals"
          class="w-full font-mono"
          placeholder="0xFF"
          spellcheck="false"
          @update:model-value="patchStruct({ emptyEquals: String($event ?? '') })"
        />
      </UFormField>
    </div>
    <UCheckbox :model-value="struct.clearEmpty" label="Clear empty slots with 0xFF" @update:model-value="setClearEmpty" />
    <p v-if="settingsFieldCount > 0" class="text-sm text-muted">
      {{ settingsFieldCount }} {{ settingsFieldCount === 1 ? 'field is' : 'fields are' }} edited in settings groups.
    </p>
    <p v-if="!detailsOpen && layoutFields.length > 0" class="text-sm text-muted">
      {{ layoutFields.length }} {{ layoutFields.length === 1 ? 'field' : 'fields' }}
      <span v-if="struct.seek.trim()">starting at {{ struct.seek.trim() }}</span>
    </p>
    <div class="flex items-center justify-between gap-2">
      <p class="text-sm font-medium text-highlighted">Fields</p>
      <div class="flex gap-1.5">
        <UButton
          v-if="!detailsOpen && layoutFields.length > 0"
          label="Edit fields"
          color="neutral"
          variant="outline"
          size="xs"
          @click="detailsOpen = true"
        />
        <UButton
          v-else-if="manyFields"
          label="Hide fields"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="detailsOpen = false"
        />
        <UButton label="Add field" color="neutral" variant="outline" size="xs" icon="i-lucide-plus" @click="addField" />
      </div>
    </div>
    <p v-if="errorAt('fields')" class="text-sm text-error">{{ errorAt('fields') }}</p>
    <template v-if="detailsOpen && manyFields">
      <UFormField label="Field">
        <USelect
          :model-value="shownFieldId"
          :items="fieldItems"
          value-key="value"
          class="w-full"
          @update:model-value="chooseField"
        />
      </UFormField>
      <DriverMemoryFieldForm v-if="shownFieldId" :struct-id="struct.id" :field-id="shownFieldId" />
    </template>
    <template v-else-if="detailsOpen">
      <DriverMemoryFieldForm v-for="item in layoutFields" :key="item.id" :struct-id="struct.id" :field-id="item.id" />
    </template>
  </DriverFormSection>
</template>
