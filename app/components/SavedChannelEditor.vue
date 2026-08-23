<script setup lang="ts">
import type { RadioChannel } from '@springfield/ham-radio-api';
import {
  formatFrequencyMHz,
  keyToTone,
  parseFrequencyMHz,
  toneSelectItems,
  toneToKey,
} from '~/utils/channel-edit';
import { createBlankRadioChannel, type SavedChannel } from '~/utils/saved-channels-db';

const props = defineProps<{
  open: boolean;
  channel?: SavedChannel;
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
  save: [payload: { channel: RadioChannel; notes?: string; id?: SavedChannel['id'] }];
}>();

const { getTransmitPrivilegeWarning } = useOperatorLicense();

const name = ref('');
const receiveMHz = ref('');
const transmitMHz = ref('');
const receiveToneKey = ref('none');
const transmitToneKey = ref('none');
const notes = ref('');
const receiveError = ref<string | undefined>();
const transmitError = ref<string | undefined>();
const isSaving = ref(false);

const toneItems = toneSelectItems();
const isCreate = computed(() => props.channel === undefined);

const title = computed(() => (isCreate.value ? 'New library channel' : 'Edit library channel'));
const description = computed(() =>
  isCreate.value ? 'Add a portable channel to the library.' : props.channel?.name || 'Saved channel',
);

const privilegeWarning = computed(() => {
  const hz = parseFrequencyMHz(transmitMHz.value);
  return getTransmitPrivilegeWarning(hz);
});

watch(
  () => [props.open, props.channel?.id] as const,
  () => {
    if (!props.open) {
      return;
    }

    const source = props.channel ?? createBlankRadioChannel();
    name.value = source.name ?? '';
    receiveMHz.value = formatFrequencyMHz(source.receiveFrequency);
    transmitMHz.value = formatFrequencyMHz(source.transmitFrequency);
    receiveToneKey.value = toneToKey(source.receiveTone);
    transmitToneKey.value = toneToKey(source.transmitTone);
    notes.value = props.channel?.notes ?? '';
    receiveError.value = undefined;
    transmitError.value = undefined;
    isSaving.value = false;
  },
);

function close(): void {
  emit('update:open', false);
}

async function save(): Promise<void> {
  const receiveHz = parseFrequencyMHz(receiveMHz.value);
  const transmitHz = parseFrequencyMHz(transmitMHz.value);

  receiveError.value = receiveHz === undefined ? 'Enter a frequency in MHz' : undefined;
  transmitError.value = transmitHz === undefined ? 'Enter a frequency in MHz' : undefined;

  if (receiveHz === undefined || transmitHz === undefined) {
    return;
  }

  const channel: RadioChannel = {
    name: name.value.trim() || undefined,
    receiveFrequency: receiveHz,
    transmitFrequency: transmitHz,
    receiveTone: keyToTone(receiveToneKey.value),
    transmitTone: keyToTone(transmitToneKey.value),
  };

  const trimmedNotes = notes.value.trim();

  isSaving.value = true;

  try {
    emit('save', {
      channel,
      notes: trimmedNotes || undefined,
      id: props.channel?.id,
    });
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <USlideover
    :open="open"
    :title="title"
    :description="description"
    :ui="{ content: 'max-w-md' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="space-y-4">
        <UAlert
          v-if="privilegeWarning"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :title="privilegeWarning.title"
          :description="privilegeWarning.detail"
        />

        <UFormField label="Name">
          <UInput v-model="name" class="w-full" placeholder="Optional label" />
        </UFormField>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Receive (MHz)" :error="receiveError">
            <UInput v-model="receiveMHz" inputmode="decimal" class="w-full tabular-nums" />
          </UFormField>

          <UFormField label="Transmit (MHz)" :error="transmitError">
            <UInput v-model="transmitMHz" inputmode="decimal" class="w-full tabular-nums" />
          </UFormField>
        </div>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="RX Tone">
            <USelect v-model="receiveToneKey" :items="toneItems" class="w-full" />
          </UFormField>

          <UFormField label="TX Tone">
            <USelect v-model="transmitToneKey" :items="toneItems" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Notes" description="Optional. Not written to radios.">
          <UTextarea v-model="notes" :rows="3" class="w-full" autoresize />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
        <UButton
          color="primary"
          :label="isCreate ? 'Create' : 'Save'"
          :loading="isSaving"
          @click="save"
        />
      </div>
    </template>
  </USlideover>
</template>
