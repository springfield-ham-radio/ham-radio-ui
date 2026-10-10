<script setup lang="ts">
import type { RadioChannel } from '@springfield/ham-radio-api';
import {
  formatFrequencyMHz,
  keyToTone,
  parseFrequencyMHz,
  toneSelectItems,
  toneToKey,
} from '~/utils/channel-edit';
import { parseLinkedNode } from '~/utils/linked-nodes';
import { createBlankRadioChannel, type RepeaterUse, type SavedChannel } from '~/utils/saved-channels-db';

const props = defineProps<{
  open: boolean;
  channel?: SavedChannel;
}>();

const emit = defineEmits<{
  'update:open': [open: boolean];
  save: [
    payload: {
      channel: RadioChannel;
      notes?: string;
      kind?: SavedChannel['kind'];
      use?: RepeaterUse;
      onAir?: boolean;
      callsign?: string;
      allstarNode?: string;
      echolinkNode?: string;
      irlpNode?: string;
      wiresNode?: string;
      allstar?: boolean;
      echolink?: boolean;
      irlp?: boolean;
      wires?: boolean;
      id?: SavedChannel['id'];
    },
  ];
}>();

const { solePrivilege, getTransmitPrivilegeWarning } = useOperatorLicense();

const name = ref('');
const callsign = ref('');
const receiveMHz = ref('');
const transmitMHz = ref('');
const receiveToneKey = ref('none');
const transmitToneKey = ref('none');
const notes = ref('');
const isRepeater = ref(false);
const repeaterUse = shallowRef<RepeaterUse>('open');
const onAir = shallowRef(true);
const allstarOn = ref(false);
const echolinkOn = ref(false);
const irlpOn = ref(false);
const wiresOn = ref(false);
const allstarNode = ref('');
const echolinkNode = ref('');
const irlpNode = ref('');
const wiresNode = ref('');
const receiveError = ref<string | undefined>();
const transmitError = ref<string | undefined>();
const isSaving = ref(false);

const toneItems = toneSelectItems();
const useItems = [
  { label: 'Open', value: 'open' },
  { label: 'Closed', value: 'closed' },
];
const isCreate = computed(() => props.channel === undefined);

const title = computed(() => (isCreate.value ? 'New library channel' : 'Edit library channel'));
const description = computed(() =>
  isCreate.value ? 'Add a portable channel to the library.' : props.channel?.name || 'Saved channel',
);

const privilegeWarning = computed(() => {
  const hz = parseFrequencyMHz(transmitMHz.value);
  return getTransmitPrivilegeWarning(hz, solePrivilege.value);
});

watch(
  () => [props.open, props.channel?.id] as const,
  () => {
    if (!props.open) {
      return;
    }

    const source = props.channel ?? createBlankRadioChannel();
    name.value = source.name ?? '';
    callsign.value = props.channel?.callsign ?? '';
    receiveMHz.value = formatFrequencyMHz(source.receiveFrequency);
    transmitMHz.value = formatFrequencyMHz(source.transmitFrequency);
    receiveToneKey.value = toneToKey(source.receiveTone);
    transmitToneKey.value = toneToKey(source.transmitTone);
    notes.value = props.channel?.notes ?? '';
    isRepeater.value = props.channel?.kind === 'repeater';
    repeaterUse.value = props.channel?.use ?? 'open';
    onAir.value = props.channel?.onAir ?? true;
    allstarNode.value = props.channel?.allstarNode ?? '';
    echolinkNode.value = props.channel?.echolinkNode ?? '';
    irlpNode.value = props.channel?.irlpNode ?? '';
    wiresNode.value = props.channel?.wiresNode ?? '';
    allstarOn.value = Boolean(props.channel?.allstar || props.channel?.allstarNode);
    echolinkOn.value = Boolean(props.channel?.echolink || props.channel?.echolinkNode);
    irlpOn.value = Boolean(props.channel?.irlp || props.channel?.irlpNode);
    wiresOn.value = Boolean(props.channel?.wires || props.channel?.wiresNode);
    receiveError.value = undefined;
    transmitError.value = undefined;
    isSaving.value = false;
  },
);

function close(): void {
  emit('update:open', false);
}

function onToggleLinked(system: 'allstar' | 'echolink' | 'irlp' | 'wires', enabled: boolean | 'indeterminate'): void {
  if (enabled) {
    return;
  }

  if (system === 'allstar') {
    allstarNode.value = '';
  } else if (system === 'echolink') {
    echolinkNode.value = '';
  } else if (system === 'irlp') {
    irlpNode.value = '';
  } else {
    wiresNode.value = '';
  }
}

function linkedEditorPayload(): {
  allstar?: boolean;
  echolink?: boolean;
  irlp?: boolean;
  wires?: boolean;
  allstarNode?: string;
  echolinkNode?: string;
  irlpNode?: string;
  wiresNode?: string;
} {
  if (!isRepeater.value) {
    return {};
  }

  const allstarNodeValue = parseLinkedNode(allstarNode.value);
  const echolinkNodeValue = parseLinkedNode(echolinkNode.value);
  const irlpNodeValue = parseLinkedNode(irlpNode.value);
  const wiresNodeValue = parseLinkedNode(wiresNode.value);
  const allstar = allstarOn.value || Boolean(allstarNodeValue);
  const echolink = echolinkOn.value || Boolean(echolinkNodeValue);
  const irlp = irlpOn.value || Boolean(irlpNodeValue);
  const wires = wiresOn.value || Boolean(wiresNodeValue);

  return {
    allstar,
    echolink,
    irlp,
    wires,
    allstarNode: allstar ? allstarNodeValue : undefined,
    echolinkNode: echolink ? echolinkNodeValue : undefined,
    irlpNode: irlp ? irlpNodeValue : undefined,
    wiresNode: wires ? wiresNodeValue : undefined,
  };
}

function onLinkedNodeInput(system: 'allstar' | 'echolink' | 'irlp' | 'wires', value: string): void {
  if (!parseLinkedNode(value)) {
    return;
  }

  if (system === 'allstar') {
    allstarOn.value = true;
  } else if (system === 'echolink') {
    echolinkOn.value = true;
  } else if (system === 'irlp') {
    irlpOn.value = true;
  } else {
    wiresOn.value = true;
  }
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
      kind: isRepeater.value ? 'repeater' : 'channel',
      use: isRepeater.value ? repeaterUse.value : undefined,
      onAir: isRepeater.value ? onAir.value : undefined,
      callsign: isRepeater.value ? callsign.value.trim() || undefined : undefined,
      ...linkedEditorPayload(),
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

        <UFormField v-if="isRepeater" label="Call sign" description="Repeater call sign. Not written to the radio name.">
          <UInput v-model="callsign" class="w-full uppercase" placeholder="W5KA" />
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

        <USwitch v-model="isRepeater" label="Repeater" description="Imported RepeaterBook and CHIRP rows are marked this way." />

        <template v-if="isRepeater">
          <UFormField label="Use" description="Open repeaters welcome any licensed operator. Closed repeaters are for members.">
            <USelect v-model="repeaterUse" :items="useItems" value-key="value" class="w-full" />
          </UFormField>

          <USwitch v-model="onAir" label="On-air" description="Turn this off when the repeater is off the air." />

          <div class="space-y-3">
            <p class="text-xs text-muted">
              Turn a linked system on when this repeater uses it. A node number turns that system on. Blank or 0 clears the number.
            </p>
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <UCheckbox v-model="allstarOn" label="AllStar" class="w-28 shrink-0" @update:model-value="onToggleLinked('allstar', $event)" />
                <UInput v-model="allstarNode" class="min-w-0 flex-1 tabular-nums" placeholder="Node" @update:model-value="onLinkedNodeInput('allstar', $event)" />
              </div>
              <div class="flex items-center gap-3">
                <UCheckbox v-model="echolinkOn" label="EchoLink" class="w-28 shrink-0" @update:model-value="onToggleLinked('echolink', $event)" />
                <UInput v-model="echolinkNode" class="min-w-0 flex-1 tabular-nums" placeholder="Node" @update:model-value="onLinkedNodeInput('echolink', $event)" />
              </div>
              <div class="flex items-center gap-3">
                <UCheckbox v-model="irlpOn" label="IRLP" class="w-28 shrink-0" @update:model-value="onToggleLinked('irlp', $event)" />
                <UInput v-model="irlpNode" class="min-w-0 flex-1 tabular-nums" placeholder="Node" @update:model-value="onLinkedNodeInput('irlp', $event)" />
              </div>
              <div class="flex items-center gap-3">
                <UCheckbox v-model="wiresOn" label="WIRES" class="w-28 shrink-0" @update:model-value="onToggleLinked('wires', $event)" />
                <UInput v-model="wiresNode" class="min-w-0 flex-1 tabular-nums" placeholder="Node" @update:model-value="onLinkedNodeInput('wires', $event)" />
              </div>
            </div>
          </div>
        </template>
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
