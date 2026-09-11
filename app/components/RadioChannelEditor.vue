<script setup lang="ts">
import type { RadioMemoryMap, RadioProgrammedChannel, RadioSettingValue } from '@springfield/ham-radio-api';
import {
  collectChannelMemoryMapUiFields,
  type RadioMemoryMapUiField,
} from '@springfield/ham-radio-utils';
import {
  applyChannelPatch,
  channelFieldEditor,
  channelNameMaxLength,
  createProgrammedChannel,
  duplexFromFrequencies,
  formatFrequencyMHz,
  keyToTone,
  nextAvailableChannelNumber,
  parseChannelFieldValue,
  parseFrequencyMHz,
  patchFromDuplex,
  serializeChannelFieldValue,
  toneSelectItems,
  toneToKey,
  type ChannelPatch,
} from '~/utils/channel-edit';

const props = defineProps<{
  open: boolean;
  channel?: RadioProgrammedChannel;
  memoryMap?: RadioMemoryMap;
  occupiedChannelNumbers?: number[];
  channelCapacity?: number;
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
  'update:channel': [patch: ChannelPatch];
  create: [channel: RadioProgrammedChannel];
}>();

const { getTransmitPrivilegeWarning } = useOperatorLicense();

const name = ref('');
const receiveMHz = ref('');
const transmitMHz = ref('');
const receiveError = ref<string | undefined>();
const transmitError = ref<string | undefined>();
const draftChannel = ref<RadioProgrammedChannel | undefined>();
const slotNumber = ref(0);

const isCreate = computed(() => props.channel === undefined);
const occupiedSlots = computed(() => new Set(props.occupiedChannelNumbers ?? []));
const capacity = computed(() => props.channelCapacity ?? 0);

const programmed = computed(() => (isCreate.value ? draftChannel.value : props.channel));

const radioChannel = computed(() => {
  if (!programmed.value || typeof programmed.value.radioChannel === 'string') {
    return undefined;
  }

  return programmed.value.radioChannel;
});

const nameMaxLength = computed(() => channelNameMaxLength(props.memoryMap));
const toneItems = toneSelectItems();
const extraFields = computed(() => (props.memoryMap ? collectChannelMemoryMapUiFields(props.memoryMap) : []));

const title = computed(() => {
  if (isCreate.value) {
    return 'New channel';
  }

  return `Channel ${props.channel?.channelNumber}`;
});

const slideoverOpen = computed({
  get: () => props.open,
  set: (value: boolean) => {
    emit('update:open', value);
  },
});

const slotError = computed(() => {
  if (!isCreate.value) {
    return undefined;
  }

  if (!Number.isInteger(slotNumber.value) || slotNumber.value < 0 || slotNumber.value >= capacity.value) {
    return capacity.value > 0 ? `Enter a memory slot from 0 to ${capacity.value - 1}` : 'This radio has no memory slots';
  }

  if (occupiedSlots.value.has(slotNumber.value)) {
    return `Memory slot ${slotNumber.value} is already programmed`;
  }

  return undefined;
});

const canCreate = computed(() => isCreate.value && slotError.value === undefined && capacity.value > 0);

const privilegeWarning = computed(() => {
  const hz = parseFrequencyMHz(transmitMHz.value) ?? radioChannel.value?.transmitFrequency;
  return getTransmitPrivilegeWarning(hz);
});

watch(
  () => [props.open, props.channel?.channelNumber] as const,
  () => {
    if (!props.open) {
      return;
    }

    if (props.channel === undefined) {
      const available = nextAvailableChannelNumber(props.occupiedChannelNumbers ?? [], capacity.value) ?? 0;
      draftChannel.value = createProgrammedChannel({
        channelNumber: available,
        memoryMap: props.memoryMap,
      });
      slotNumber.value = available;
      applyDraftToFields(draftChannel.value);
      return;
    }

    draftChannel.value = undefined;

    if (typeof props.channel.radioChannel === 'string') {
      return;
    }

    name.value = props.channel.radioChannel.name ?? '';
    receiveMHz.value = formatFrequencyMHz(props.channel.radioChannel.receiveFrequency);
    transmitMHz.value = formatFrequencyMHz(props.channel.radioChannel.transmitFrequency);
    receiveError.value = undefined;
    transmitError.value = undefined;
  },
  { immediate: true },
);

function applyDraftToFields(programmedChannel: RadioProgrammedChannel): void {
  if (typeof programmedChannel.radioChannel === 'string') {
    return;
  }

  name.value = programmedChannel.radioChannel.name ?? '';
  receiveMHz.value = formatFrequencyMHz(programmedChannel.radioChannel.receiveFrequency);
  transmitMHz.value = formatFrequencyMHz(programmedChannel.radioChannel.transmitFrequency);
  receiveError.value = undefined;
  transmitError.value = undefined;
}

function patchCurrent(patch: ChannelPatch): void {
  if (isCreate.value) {
    if (!draftChannel.value) {
      return;
    }

    draftChannel.value = applyChannelPatch(draftChannel.value, patch, { nameMaxLength: nameMaxLength.value });
    return;
  }

  emit('update:channel', patch);
}

function closeEditor(dismiss?: unknown): void {
  emit('update:open', false);

  if (typeof dismiss === 'function') {
    dismiss();
  }
}

function updateSlotNumber(value: number | undefined | null): void {
  if (value === undefined || value === null || !draftChannel.value) {
    return;
  }

  slotNumber.value = value;
  draftChannel.value = {
    ...draftChannel.value,
    channelNumber: value,
  };
}

function commitName(): void {
  if (!radioChannel.value) {
    return;
  }

  const next = nameMaxLength.value === undefined ? name.value : name.value.slice(0, nameMaxLength.value);
  name.value = next;
  const current = radioChannel.value.name ?? '';

  if (next === current) {
    return;
  }

  patchCurrent({ name: next });
}

function commitFrequency(kind: 'receive' | 'transmit'): void {
  if (!radioChannel.value) {
    return;
  }

  const field = kind === 'receive' ? receiveMHz : transmitMHz;
  const error = kind === 'receive' ? receiveError : transmitError;
  const currentHz = kind === 'receive' ? radioChannel.value.receiveFrequency : radioChannel.value.transmitFrequency;
  const parsed = parseFrequencyMHz(field.value);

  if (parsed === undefined) {
    error.value = 'Enter a frequency in MHz';
    field.value = formatFrequencyMHz(currentHz);
    return;
  }

  error.value = undefined;
  field.value = formatFrequencyMHz(parsed);

  if (parsed === currentHz) {
    return;
  }

  if (kind === 'receive') {
    patchCurrent({ receiveFrequencyHz: parsed });
    return;
  }

  patchCurrent({ transmitFrequencyHz: parsed });
}

function updateTone(kind: 'receive' | 'transmit', key: string): void {
  const tone = keyToTone(key);

  if (kind === 'receive') {
    patchCurrent({ receiveTone: tone });
    return;
  }

  patchCurrent({ transmitTone: tone });
}

function extraValue(field: RadioMemoryMapUiField): RadioSettingValue | undefined {
  if (field.fieldId === 'duplex' && radioChannel.value) {
    const derived = duplexFromFrequencies(
      radioChannel.value.receiveFrequency,
      radioChannel.value.transmitFrequency,
      programmed.value?.settings,
    );

    if (derived === 'split' && !extraSelectItems(field).some((item) => item.value === 'split')) {
      const { receiveFrequency, transmitFrequency } = radioChannel.value;
      return transmitFrequency === receiveFrequency ? '' : transmitFrequency > receiveFrequency ? '+' : '-';
    }

    return derived;
  }

  return programmed.value?.settings?.[field.fieldId];
}

function extraEditor(field: RadioMemoryMapUiField) {
  return channelFieldEditor(field);
}

function extraSelectItems(field: RadioMemoryMapUiField) {
  const editor = extraEditor(field);
  return editor.kind === 'select' ? editor.items : [];
}

function extraIntegerValue(field: RadioMemoryMapUiField): number {
  const editor = extraEditor(field);
  const raw = extraValue(field);
  const numeric = typeof raw === 'number' ? raw : 0;

  if (editor.kind === 'integer') {
    return numeric + (editor.displayOffset ?? 0);
  }

  return numeric;
}

function extraIntegerMin(field: RadioMemoryMapUiField): number | undefined {
  const editor = extraEditor(field);

  if (editor.kind !== 'integer' || editor.min === undefined) {
    return undefined;
  }

  return editor.min + (editor.displayOffset ?? 0);
}

function extraIntegerMax(field: RadioMemoryMapUiField): number | undefined {
  const editor = extraEditor(field);

  if (editor.kind !== 'integer' || editor.max === undefined) {
    return undefined;
  }

  return editor.max + (editor.displayOffset ?? 0);
}

function updateExtra(field: RadioMemoryMapUiField, value: string | number | boolean | undefined): void {
  if (value === undefined) {
    return;
  }

  if (field.fieldId === 'duplex' && radioChannel.value) {
    const patch = patchFromDuplex(radioChannel.value.receiveFrequency, radioChannel.value.transmitFrequency, String(value));

    if (patch.transmitFrequencyHz !== undefined) {
      transmitMHz.value = formatFrequencyMHz(patch.transmitFrequencyHz);
      transmitError.value = undefined;
    }

    patchCurrent(patch);
    return;
  }

  patchCurrent({
    settings: {
      [field.fieldId]: parseChannelFieldValue(field, value),
    },
  });
}

function submitCreate(): void {
  if (!draftChannel.value || typeof draftChannel.value.radioChannel === 'string') {
    return;
  }

  const receiveHz = parseFrequencyMHz(receiveMHz.value);
  const transmitHz = parseFrequencyMHz(transmitMHz.value);

  receiveError.value = receiveHz === undefined ? 'Enter a frequency in MHz' : undefined;
  transmitError.value = transmitHz === undefined ? 'Enter a frequency in MHz' : undefined;

  if (receiveHz === undefined || transmitHz === undefined || slotError.value) {
    return;
  }

  const nextName = nameMaxLength.value === undefined ? name.value : name.value.slice(0, nameMaxLength.value);
  const programmedChannel = applyChannelPatch(
    {
      ...draftChannel.value,
      channelNumber: slotNumber.value,
    },
    {
      name: nextName,
      receiveFrequencyHz: receiveHz,
      transmitFrequencyHz: transmitHz,
    },
    { nameMaxLength: nameMaxLength.value },
  );

  emit('create', programmedChannel);
  closeEditor();
}
</script>

<template>
  <USlideover
    v-model:open="slideoverOpen"
    :title="title"
    :description="isCreate ? 'Add a memory channel to the loaded radio image.' : radioChannel?.name || 'Memory channel'"
    :ui="{ content: 'max-w-md' }"
  >
    <template #body>
      <div v-if="radioChannel" class="space-y-4">
        <UAlert
          v-if="privilegeWarning"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="privilegeWarning.title"
          :description="privilegeWarning.detail"
        />

        <UFormField
          v-if="isCreate"
          label="Memory slot"
          :error="slotError"
          :hint="capacity > 0 ? `0 to ${capacity - 1}` : undefined"
        >
          <UInputNumber
            :model-value="slotNumber"
            :min="0"
            :max="Math.max(capacity - 1, 0)"
            class="w-full"
            @update:model-value="updateSlotNumber"
          />
        </UFormField>

        <UFormField label="Name" :hint="nameMaxLength ? `${nameMaxLength} characters` : undefined">
          <UInput
            v-model="name"
            :maxlength="nameMaxLength"
            class="w-full"
            @blur="commitName"
            @keydown.enter="commitName"
          />
        </UFormField>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Receive (MHz)" :error="receiveError">
            <UInput
              v-model="receiveMHz"
              inputmode="decimal"
              class="w-full tabular-nums"
              @blur="commitFrequency('receive')"
              @keydown.enter="commitFrequency('receive')"
            />
          </UFormField>

          <UFormField label="Transmit (MHz)" :error="transmitError">
            <UInput
              v-model="transmitMHz"
              inputmode="decimal"
              class="w-full tabular-nums"
              @blur="commitFrequency('transmit')"
              @keydown.enter="commitFrequency('transmit')"
            />
          </UFormField>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="RX Tone">
            <USelect
              :model-value="toneToKey(radioChannel.receiveTone)"
              :items="toneItems"
              class="w-full"
              @update:model-value="updateTone('receive', String($event))"
            />
          </UFormField>

          <UFormField label="TX Tone">
            <USelect
              :model-value="toneToKey(radioChannel.transmitTone)"
              :items="toneItems"
              class="w-full"
              @update:model-value="updateTone('transmit', String($event))"
            />
          </UFormField>
        </div>

        <div v-if="extraFields.length > 0" class="grid gap-3 sm:grid-cols-2">
          <UFormField
            v-for="field in extraFields"
            :key="field.fieldId"
            :label="field.ui.label"
            :description="field.ui.description"
          >
            <USelect
              v-if="extraEditor(field).kind === 'select'"
              :model-value="serializeChannelFieldValue(field, extraValue(field))"
              :items="extraSelectItems(field)"
              class="w-full"
              @update:model-value="updateExtra(field, String($event))"
            />

            <UInputNumber
              v-else-if="extraEditor(field).kind === 'integer'"
              :model-value="extraIntegerValue(field)"
              :min="extraIntegerMin(field)"
              :max="extraIntegerMax(field)"
              class="w-full"
              @update:model-value="updateExtra(field, $event ?? 0)"
            />

            <USwitch
              v-else-if="extraEditor(field).kind === 'switch'"
              :model-value="Boolean(extraValue(field))"
              @update:model-value="updateExtra(field, Boolean($event))"
            />

            <UInput
              v-else
              :model-value="serializeChannelFieldValue(field, extraValue(field))"
              class="w-full"
              @update:model-value="updateExtra(field, String($event))"
            />
          </UFormField>
        </div>
      </div>
    </template>

    <template #footer="{ close }">
      <div class="flex w-full items-center justify-end gap-2">
        <UButton v-if="isCreate" type="button" color="neutral" variant="outline" label="Cancel" @click="closeEditor(close)" />
        <UButton v-if="isCreate" type="button" color="primary" label="Add channel" :disabled="!canCreate" @click="submitCreate" />
        <UButton v-else type="button" color="neutral" variant="outline" label="Done" @click="closeEditor(close)" />
      </div>
    </template>
  </USlideover>
</template>
