<script setup lang="ts">
import type { RadioMemoryMap, RadioProgrammedChannel, RadioSettingValue } from '@springfield/ham-radio-api';
import {
  collectChannelMemoryMapUiFields,
  type RadioMemoryMapUiField,
} from '@springfield/ham-radio-utils';
import {
  channelFieldEditor,
  channelNameMaxLength,
  formatFrequencyMHz,
  keyToTone,
  parseChannelFieldValue,
  parseFrequencyMHz,
  serializeChannelFieldValue,
  toneSelectItems,
  toneToKey,
  type ChannelPatch,
} from '~/utils/channel-edit';
import type { SavedChannel } from '~/utils/saved-channels-db';

const props = defineProps<{
  open: boolean;
  channel?: RadioProgrammedChannel;
  memoryMap?: RadioMemoryMap;
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
  'update:channel': [patch: ChannelPatch];
}>();

const { getTransmitPrivilegeWarning } = useOperatorLicense();
const { filteredChannels, search, refresh, isLoading } = useSavedChannels();

const name = ref('');
const receiveMHz = ref('');
const transmitMHz = ref('');
const receiveError = ref<string | undefined>();
const transmitError = ref<string | undefined>();
const libraryOpen = ref(false);

const radioChannel = computed(() => {
  if (!props.channel || typeof props.channel.radioChannel === 'string') {
    return undefined;
  }

  return props.channel.radioChannel;
});

const nameMaxLength = computed(() => channelNameMaxLength(props.memoryMap));
const toneItems = toneSelectItems();
const extraFields = computed(() => (props.memoryMap ? collectChannelMemoryMapUiFields(props.memoryMap) : []));

const title = computed(() => {
  if (props.channel === undefined) {
    return 'Edit channel';
  }

  return `Channel ${props.channel.channelNumber}`;
});

const privilegeWarning = computed(() => {
  const hz = parseFrequencyMHz(transmitMHz.value) ?? radioChannel.value?.transmitFrequency;
  return getTransmitPrivilegeWarning(hz);
});

watch(
  () => [props.open, props.channel?.channelNumber] as const,
  () => {
    if (!props.open || !radioChannel.value) {
      return;
    }

    name.value = radioChannel.value.name ?? '';
    receiveMHz.value = formatFrequencyMHz(radioChannel.value.receiveFrequency);
    transmitMHz.value = formatFrequencyMHz(radioChannel.value.transmitFrequency);
    receiveError.value = undefined;
    transmitError.value = undefined;
  },
);

function close(): void {
  libraryOpen.value = false;
  emit('update:open', false);
}

async function openLibrary(): Promise<void> {
  libraryOpen.value = true;
  search.value = '';
  await refresh();
}

function applyLibraryChannel(channel: SavedChannel): void {
  name.value = nameMaxLength.value === undefined ? (channel.name ?? '') : (channel.name ?? '').slice(0, nameMaxLength.value);
  receiveMHz.value = formatFrequencyMHz(channel.receiveFrequency);
  transmitMHz.value = formatFrequencyMHz(channel.transmitFrequency);
  receiveError.value = undefined;
  transmitError.value = undefined;

  emit('update:channel', {
    name: name.value,
    receiveFrequencyHz: channel.receiveFrequency,
    transmitFrequencyHz: channel.transmitFrequency,
    receiveTone: channel.receiveTone,
    transmitTone: channel.transmitTone,
  });

  libraryOpen.value = false;
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

  emit('update:channel', { name: next });
}

function commitFrequency(kind: 'receive' | 'transmit'): void {
  if (!radioChannel.value) {
    return;
  }

  const draft = kind === 'receive' ? receiveMHz : transmitMHz;
  const error = kind === 'receive' ? receiveError : transmitError;
  const currentHz = kind === 'receive' ? radioChannel.value.receiveFrequency : radioChannel.value.transmitFrequency;
  const parsed = parseFrequencyMHz(draft.value);

  if (parsed === undefined) {
    error.value = 'Enter a frequency in MHz';
    draft.value = formatFrequencyMHz(currentHz);
    return;
  }

  error.value = undefined;
  draft.value = formatFrequencyMHz(parsed);

  if (parsed === currentHz) {
    return;
  }

  if (kind === 'receive') {
    emit('update:channel', { receiveFrequencyHz: parsed });
    return;
  }

  emit('update:channel', { transmitFrequencyHz: parsed });
}

function updateTone(kind: 'receive' | 'transmit', key: string): void {
  const tone = keyToTone(key);

  if (kind === 'receive') {
    emit('update:channel', { receiveTone: tone });
    return;
  }

  emit('update:channel', { transmitTone: tone });
}

function extraValue(field: RadioMemoryMapUiField): RadioSettingValue | undefined {
  return props.channel?.settings?.[field.fieldId];
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

  emit('update:channel', {
    settings: {
      [field.fieldId]: parseChannelFieldValue(field, value),
    },
  });
}
</script>

<template>
  <USlideover
    :open="open"
    :title="title"
    :description="radioChannel?.name || 'Memory channel'"
    :ui="{ content: 'max-w-md' }"
    @update:open="emit('update:open', $event)"
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

    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-library"
          label="Load from library"
          :disabled="!radioChannel"
          @click="openLibrary"
        />
        <UButton color="neutral" variant="outline" label="Done" @click="close" />
      </div>
    </template>
  </USlideover>

  <UModal v-model:open="libraryOpen" title="Load from library" description="Apply a portable saved channel to this memory slot.">
    <template #body>
      <div class="space-y-3">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Search saved channels" />
        <div class="max-h-80 space-y-1 overflow-y-auto">
          <p v-if="isLoading" class="px-1 py-4 text-sm text-muted">Loading library…</p>
          <p v-else-if="filteredChannels.length === 0" class="px-1 py-4 text-sm text-muted">
            No saved channels match. Save channels from the Radio page first.
          </p>
          <button
            v-for="channel in filteredChannels"
            :key="channel.id"
            type="button"
            class="flex w-full flex-col rounded-md px-2 py-2 text-left hover:bg-elevated"
            @click="applyLibraryChannel(channel)"
          >
            <span class="text-sm font-medium text-highlighted">{{ channel.name || 'Untitled channel' }}</span>
            <span class="text-xs tabular-nums text-muted">
              TX {{ formatFrequencyMHz(channel.transmitFrequency) }} · RX {{ formatFrequencyMHz(channel.receiveFrequency) }}
            </span>
          </button>
        </div>
      </div>
    </template>
  </UModal>
</template>
