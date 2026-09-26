<script setup lang="ts">
import { driverFieldError } from '~/utils/driver-compile';
import {
  DRIVER_MEMORY_FIELD_KINDS,
  DRIVER_MEMORY_FIELD_TYPES,
  DRIVER_MEMORY_WIDGETS,
  type DriverMemoryFieldDraft,
  type DriverMemoryFieldKind,
  type DriverMemoryFieldType,
  type DriverMemoryWidget,
} from '~/utils/driver-draft';

const props = defineProps<{
  structId: string;
  fieldId: string;
}>();

const { draft, memoryMap, patch } = useDriverDraft();

const typeItems = DRIVER_MEMORY_FIELD_TYPES.map((type) => ({ label: type, value: type }));
const kindItems = [
  { label: 'Integer', value: 'integer' },
  { label: 'Boolean', value: 'boolean' },
  { label: 'Enum', value: 'enum' },
  { label: 'ASCII', value: 'ascii' },
  { label: 'Digits', value: 'digits' },
  { label: 'DTMF', value: 'dtmf' },
  { label: 'Packed BCD', value: 'bbcd' },
  { label: 'Little-endian BCD', value: 'lbcd' },
  { label: 'Tone word', value: 'tone' },
  { label: 'CTCSS index', value: 'ctcss-index' },
  { label: 'DCS index', value: 'dcs-index' },
] as const;

const field = computed(() => {
  const struct = draft.value.memoryMap.structs.find((item) => item.id === props.structId);
  return struct?.fields.find((item) => item.id === props.fieldId);
});

const widgetItems = [
  { label: 'Integer', value: 'integer' },
  { label: 'Select', value: 'select' },
  { label: 'Switch', value: 'switch' },
  { label: 'Text', value: 'text' },
  { label: 'Number', value: 'number' },
] as const;

const groupItems = computed(() => {
  const ids = draft.value.memoryMap.groups.map((group) => group.groupId.trim()).filter((id) => id.length > 0);
  const current = field.value?.uiGroup.trim();

  if (current && !ids.includes(current)) {
    ids.push(current);
  }

  return ids.map((id) => ({ label: id, value: id }));
});

const subgroupItems = computed(() => {
  const groupId = field.value?.uiGroup.trim();
  const group = draft.value.memoryMap.groups.find((item) => item.groupId.trim() === groupId);
  const ids = group?.subgroups.map((section) => section.subgroupId.trim()).filter((id) => id.length > 0) ?? [];
  const current = field.value?.uiSubgroup.trim();

  if (current && !ids.includes(current)) {
    ids.push(current);
  }

  return [{ label: 'Top of the panel', value: '' }, ...ids.map((id) => ({ label: id, value: id }))];
});

const showsLength = computed(() => field.value && ['ascii', 'digits', 'dtmf', 'bbcd', 'lbcd'].includes(field.value.kind));
const showsScale = computed(() => field.value && (field.value.kind === 'digits' || field.value.kind === 'lbcd'));
const showsValues = computed(() => field.value && ['enum', 'tone', 'ctcss-index', 'dcs-index'].includes(field.value.kind));

function errorAt(suffix: string): string | undefined {
  return driverFieldError(memoryMap.value.issues, `memory.structs.${props.structId}.fields.${props.fieldId}.${suffix}`);
}

function patchField(partial: Partial<DriverMemoryFieldDraft>): void {
  patch({
    memoryMap: {
      ...draft.value.memoryMap,
      structs: draft.value.memoryMap.structs.map((struct) => {
        if (struct.id !== props.structId) {
          return struct;
        }

        return {
          ...struct,
          fields: struct.fields.map((item) => (item.id === props.fieldId ? { ...item, ...partial } : item)),
        };
      }),
    },
  });
}

function onType(value: unknown): void {
  if (typeof value === 'string' && (DRIVER_MEMORY_FIELD_TYPES as readonly string[]).includes(value)) {
    patchField({ type: value as DriverMemoryFieldType });
  }
}

function onKind(value: unknown): void {
  if (typeof value === 'string' && (DRIVER_MEMORY_FIELD_KINDS as readonly string[]).includes(value)) {
    patchField({ kind: value as DriverMemoryFieldKind });
  }
}

function setReserved(value: boolean | 'indeterminate'): void {
  if (value !== 'indeterminate') {
    patchField({ reserved: value });
  }
}

function setShowUi(value: boolean | 'indeterminate'): void {
  if (value !== 'indeterminate') {
    patchField({ showUi: value });
  }
}

function setWritable(value: boolean | 'indeterminate'): void {
  if (value !== 'indeterminate') {
    patchField({ uiWritable: value });
  }
}

function onWidget(value: unknown): void {
  if (typeof value === 'string' && (DRIVER_MEMORY_WIDGETS as readonly string[]).includes(value)) {
    patchField({ uiWidget: value as DriverMemoryWidget });
  }
}

function onUiGroup(value: unknown): void {
  patchField({ uiGroup: typeof value === 'string' ? value : '' });
}

function onUiSubgroup(value: unknown): void {
  patchField({ uiSubgroup: typeof value === 'string' ? value : '' });
}

function removeField(): void {
  patch({
    memoryMap: {
      ...draft.value.memoryMap,
      structs: draft.value.memoryMap.structs.map((struct) => {
        if (struct.id !== props.structId) {
          return struct;
        }

        return { ...struct, fields: struct.fields.filter((item) => item.id !== props.fieldId) };
      }),
    },
  });
}
</script>

<template>
  <div v-if="field" class="flex flex-col gap-3 rounded-lg bg-default p-3 ring-1 ring-default">
    <div class="grid items-end gap-2 sm:grid-cols-[minmax(0,1.2fr)_7rem_minmax(0,11rem)_auto]">
      <UFormField label="Field id" required :error="errorAt('fieldId')">
        <UInput
          :model-value="field.fieldId"
          class="w-full font-mono"
          placeholder="rxfreq"
          spellcheck="false"
          @update:model-value="patchField({ fieldId: String($event ?? '') })"
        />
      </UFormField>
      <UFormField label="Type">
        <USelect :model-value="field.type" :items="typeItems" value-key="value" class="w-full" @update:model-value="onType" />
      </UFormField>
      <UFormField label="Value">
        <template #hint>
          <HelpTooltip text="How the stored bytes become a channel value. UV-5R frequencies are little-endian BCD. Names are ASCII." />
        </template>
        <USelect :model-value="field.kind" :items="kindItems" value-key="value" class="w-full" @update:model-value="onKind" />
      </UFormField>
      <UButton icon="i-lucide-x" color="neutral" variant="ghost" aria-label="Remove field" @click="removeField" />
    </div>

    <div class="flex flex-wrap items-end gap-3">
      <UCheckbox :model-value="field.reserved" label="Reserved padding" @update:model-value="setReserved" />
      <UFormField v-if="field.type === 'bits'" label="Bit width" required :error="errorAt('width')" class="w-28">
        <UInput
          :model-value="field.width"
          class="w-full font-mono"
          inputmode="numeric"
          placeholder="1"
          @update:model-value="patchField({ width: String($event ?? '') })"
        />
      </UFormField>
    </div>

    <div v-if="field.kind === 'integer'" class="grid gap-3 sm:grid-cols-2">
      <UFormField label="Minimum" :error="errorAt('minimum')">
        <UInput
          :model-value="field.minimum"
          class="w-full font-mono"
          inputmode="decimal"
          @update:model-value="patchField({ minimum: String($event ?? '') })"
        />
      </UFormField>
      <UFormField label="Maximum" :error="errorAt('maximum')">
        <UInput
          :model-value="field.maximum"
          class="w-full font-mono"
          inputmode="decimal"
          @update:model-value="patchField({ maximum: String($event ?? '') })"
        />
      </UFormField>
    </div>

    <div v-if="showsLength" class="grid gap-3 sm:grid-cols-2">
      <UFormField label="Length" required :error="errorAt('length')">
        <template #hint>
          <HelpTooltip text="Bytes this value occupies." />
        </template>
        <UInput
          :model-value="field.length"
          class="w-full font-mono"
          inputmode="numeric"
          @update:model-value="patchField({ length: String($event ?? '') })"
        />
      </UFormField>
      <UFormField v-if="showsScale" label="Scale" :error="errorAt('scale')">
        <template #hint>
          <HelpTooltip text="Multiplier after the digits are read. UV-5R frequencies use 10, so the stored value becomes hertz." />
        </template>
        <UInput
          :model-value="field.scale"
          class="w-full font-mono"
          inputmode="decimal"
          @update:model-value="patchField({ scale: String($event ?? '') })"
        />
      </UFormField>
      <UFormField v-if="field.kind === 'ascii'" label="Pad byte" :error="errorAt('pad')">
        <template #hint>
          <HelpTooltip text="Fill for unused characters. Leave blank for 0xFF. Kenwood names use 0x00." />
        </template>
        <UInput
          :model-value="field.pad"
          class="w-full font-mono"
          placeholder="0xFF"
          spellcheck="false"
          @update:model-value="patchField({ pad: String($event ?? '') })"
        />
      </UFormField>
      <UFormField v-if="field.kind === 'dtmf'" label="Character set" :error="errorAt('charset')">
        <UInput
          :model-value="field.charset"
          class="w-full font-mono"
          spellcheck="false"
          @update:model-value="patchField({ charset: String($event ?? '') })"
        />
      </UFormField>
    </div>

    <UFormField v-if="showsValues" :label="field.kind === 'enum' ? 'Labels' : 'Values'" required :error="errorAt('values')">
      <template #hint>
        <HelpTooltip
          :text="
            field.kind === 'enum'
              ? 'Comma-separated labels, in the order stored in the radio.'
              : 'Comma-separated numbers, in radio order. A UV-5R tone word lists its DCS codes here.'
          "
        />
      </template>
      <UTextarea
        :model-value="field.values"
        class="w-full font-mono"
        :rows="field.kind === 'enum' ? 2 : 4"
        autoresize
        spellcheck="false"
        @update:model-value="patchField({ values: String($event ?? '') })"
      />
    </UFormField>

    <div v-if="field.kind === 'tone'" class="grid gap-3 sm:grid-cols-2">
      <UFormField label="CTCSS minimum" :error="errorAt('ctcssMinimum')">
        <template #hint>
          <HelpTooltip text="A raw tone at or above this is CTCSS. A UV-5R uses 600." />
        </template>
        <UInput
          :model-value="field.ctcssMinimum"
          class="w-full font-mono"
          inputmode="numeric"
          @update:model-value="patchField({ ctcssMinimum: String($event ?? '') })"
        />
      </UFormField>
      <UFormField label="Reverse offset" :error="errorAt('reverseOffset')">
        <template #hint>
          <HelpTooltip text="Added to a DCS index for reverse polarity. A UV-5R uses 105." />
        </template>
        <UInput
          :model-value="field.reverseOffset"
          class="w-full font-mono"
          inputmode="numeric"
          @update:model-value="patchField({ reverseOffset: String($event ?? '') })"
        />
      </UFormField>
    </div>

    <div v-if="!field.reserved" class="flex flex-col gap-3 border-t border-default pt-3">
      <UCheckbox :model-value="field.showUi" label="Show on the Settings tab" @update:model-value="setShowUi" />
      <div v-if="field.showUi" class="grid gap-3 sm:grid-cols-2">
        <UFormField label="Settings group" required :error="errorAt('uiGroup')">
          <template #hint>
            <HelpTooltip text="Which entry in the Settings list holds this field." />
          </template>
          <USelect
            v-if="groupItems.length > 0"
            :model-value="field.uiGroup"
            :items="groupItems"
            value-key="value"
            class="w-full"
            @update:model-value="onUiGroup"
          />
          <UInput
            v-else
            :model-value="field.uiGroup"
            class="w-full font-mono"
            spellcheck="false"
            @update:model-value="patchField({ uiGroup: String($event ?? '') })"
          />
        </UFormField>
        <UFormField label="Section" :error="errorAt('uiSubgroup')">
          <template #hint>
            <span class="inline-flex items-center gap-1.5">
              Optional
              <HelpTooltip text="Headed section inside the group. Leave blank to keep the field at the top of the panel." />
            </span>
          </template>
          <USelect
            v-if="subgroupItems.length > 1"
            :model-value="field.uiSubgroup"
            :items="subgroupItems"
            value-key="value"
            class="w-full"
            @update:model-value="onUiSubgroup"
          />
          <UInput
            v-else
            :model-value="field.uiSubgroup"
            class="w-full font-mono"
            spellcheck="false"
            @update:model-value="patchField({ uiSubgroup: String($event ?? '') })"
          />
        </UFormField>
        <UFormField label="Label" required :error="errorAt('uiLabel')">
          <UInput :model-value="field.uiLabel" class="w-full" @update:model-value="patchField({ uiLabel: String($event ?? '') })" />
        </UFormField>
        <UFormField label="Widget">
          <USelect :model-value="field.uiWidget" :items="widgetItems" value-key="value" class="w-full" @update:model-value="onWidget" />
        </UFormField>
        <UFormField class="sm:col-span-2" label="Description">
          <template #hint>
            <HelpTooltip text="Shown in the help icon after the label." />
          </template>
          <UInput
            :model-value="field.uiDescription"
            class="w-full"
            @update:model-value="patchField({ uiDescription: String($event ?? '') })"
          />
        </UFormField>
        <UFormField label="Menu number" :error="errorAt('uiMenuNumber')">
          <template #hint>
            <HelpTooltip text="Front-panel menu index, starting at 0. Leave blank when this is not a numbered menu item." />
          </template>
          <UInput
            :model-value="field.uiMenuNumber"
            class="w-full font-mono"
            inputmode="numeric"
            @update:model-value="patchField({ uiMenuNumber: String($event ?? '') })"
          />
        </UFormField>
        <UFormField label="Menu code" :error="errorAt('uiMenuCode')">
          <UInput
            :model-value="field.uiMenuCode"
            class="w-full font-mono"
            placeholder="SQL"
            spellcheck="false"
            @update:model-value="patchField({ uiMenuCode: String($event ?? '') })"
          />
        </UFormField>
        <UFormField label="Display order" :error="errorAt('uiOrder')">
          <template #hint>
            <HelpTooltip text="Lower numbers appear first. Leave blank to keep the field in byte order." />
          </template>
          <UInput
            :model-value="field.uiOrder"
            class="w-full font-mono"
            inputmode="numeric"
            @update:model-value="patchField({ uiOrder: String($event ?? '') })"
          />
        </UFormField>
        <div class="flex items-end">
          <UCheckbox :model-value="field.uiWritable" label="Writable" @update:model-value="setWritable" />
        </div>
      </div>
    </div>
  </div>
</template>
