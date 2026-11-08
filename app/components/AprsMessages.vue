<script setup lang="ts">
import type { AprsHostMessage } from '~/utils/aprs-host-session';
import { APRS_HOST_RECOVERY, APRS_HOST_SETUP } from '~/utils/aprs-kiss-restore';
import { APRS_MESSAGE_ATTEMPTS, APRS_MESSAGE_RETRY_MS, APRS_MESSAGE_TEXT_MAX } from '~/utils/aprs-message';

const props = defineProps<{
  cardId?: string;
}>();

const route = useRoute();
const example = computed(() => import.meta.dev && (route.query.fixture === 'aprs-messages' || route.query.fixture === 'aprs-host-trace'));
const traceFixture = computed(() => import.meta.dev && route.query.fixture === 'aprs-host-trace');
const host = useAprsHost();
const { send, cancel, setAckOptIn, setTransmitOptIn, requestCommandPrompt, cancelCommand, enterHostKiss } = host;
const snapshot = computed(() => (props.cardId ? host.snapshots.value[props.cardId] : undefined));
const hostOpen = computed(() => snapshot.value?.connected === true);

const mine = ref('');
const to = ref('');
const text = ref('');
const transmitRequested = ref(false);
const ackRequested = ref(false);
const ackReason = ref<string | undefined>();
const enterNote = ref<string | undefined>();
const commandNote = ref<string | undefined>();
const selectedOther = ref<string | undefined>();

if (props.cardId) {
  host.watchCard(props.cardId);
}

const exampleMessages: AprsHostMessage[] = [
  {
    key: 'example-in',
    direction: 'in',
    other: 'K5KTF-4',
    text: 'Sample thread only. This did not come from the radio.',
    messageId: '1',
    status: 'heard',
    at: 0,
  },
  {
    key: 'example-out',
    direction: 'out',
    other: 'K5KTF-4',
    text: 'Sample reply. Allow transmit is off, so this was not sent.',
    messageId: '2',
    status: 'blocked',
    detail: 'Allow transmit is off.',
    at: 1,
  },
];

const messages = computed(() => [...(example.value ? exampleMessages : []), ...(snapshot.value?.messages ?? [])]);
const others = computed(() => {
  const names: string[] = [];

  for (const message of messages.value) {
    if (message.other && !names.includes(message.other)) {
      names.push(message.other);
    }
  }

  return names;
});
const thread = computed(() => messages.value.filter((message) => message.other === selectedOther.value));

watch(others, (names) => {
  if (selectedOther.value && names.includes(selectedOther.value)) {
    return;
  }

  selectedOther.value = names[0];
}, { immediate: true });

const statusLabel: Record<AprsHostMessage['status'], string> = {
  heard: 'Heard',
  'waiting-ack': 'Waiting for ack',
  acked: 'Acked',
  rejected: 'Rejected',
  'timed-out': 'No ack',
  cancelled: 'Cancelled',
  blocked: 'Not sent',
};

const statusColor: Record<AprsHostMessage['status'], 'neutral' | 'success' | 'warning' | 'error'> = {
  heard: 'neutral',
  'waiting-ack': 'warning',
  acked: 'success',
  rejected: 'error',
  'timed-out': 'error',
  cancelled: 'neutral',
  blocked: 'neutral',
};

function latestFor(name: string): AprsHostMessage | undefined {
  return [...messages.value].reverse().find((message) => message.other === name);
}

const kissStatus = computed(() => {
  if (traceFixture.value) {
    return 'Fixture. KISS unconfirmed. These lines were not read from a radio.';
  }

  if (snapshot.value?.kissConfirmed) {
    return 'AX.25 UI seen. Send can write only while Allow transmit is on.';
  }

  if (snapshot.value?.hostEnterRequested || enterNote.value) {
    return 'Command written. KISS unconfirmed. No message was sent, and the command is not repeated.';
  }

  return 'KISS unconfirmed. Send does not write until an AX.25 UI frame is parsed.';
});

async function onAck(next: boolean): Promise<void> {
  ackReason.value = props.cardId ? setAckOptIn(props.cardId, next) : 'Save this radio before changing ack replies.';
  ackRequested.value = !ackReason.value && next;
}

async function onRequestPrompt(): Promise<void> {
  if (!props.cardId) {
    return;
  }

  commandNote.value = (await requestCommandPrompt(props.cardId)) ?? 'Ctrl+C written. Waiting for cmd:.';
}

function onCancelCommand(): void {
  if (!props.cardId) {
    return;
  }

  cancelCommand(props.cardId);
  commandNote.value = 'Cancelled.';
}

async function onEnterHost(): Promise<void> {
  if (!props.cardId) {
    return;
  }

  enterNote.value = (await enterHostKiss(props.cardId)) ?? 'Command written. KISS unconfirmed. No message was sent.';
}

function onTransmit(next: boolean): void {
  transmitRequested.value = next;

  if (props.cardId) {
    setTransmitOptIn(props.cardId, next);
  }
}

async function onSend(): Promise<void> {
  if (!props.cardId) {
    return;
  }

  const message = await send(props.cardId, {
    mine: mine.value,
    to: to.value,
    text: text.value,
    transmitRequested: transmitRequested.value,
  });
  selectedOther.value = message.other;
}

function onCancel(key: string): void {
  if (!props.cardId) {
    return;
  }

  cancel(props.cardId, key);
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-auto py-2">
    <p class="text-xs text-muted">
      Messages on this connection. Nothing here is saved, and the radio’s stored messages are not read. The byte log is on Raw log.
      <template v-if="example"> The K5KTF-4 lines are sample text.</template>
    </p>

    <div class="grid min-h-0 gap-3 lg:grid-cols-[16rem_1fr]">
      <div class="flex flex-col gap-1">
        <p v-if="others.length === 0" class="text-sm text-muted">No messages yet.</p>
        <button
          v-for="name in others"
          :key="name"
          type="button"
          class="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left"
          :class="name === selectedOther ? 'bg-elevated text-highlighted' : 'text-muted'"
          @click="selectedOther = name"
        >
          <span class="truncate font-mono text-sm">{{ name }}</span>
          <UBadge
            v-if="latestFor(name)"
            :label="statusLabel[latestFor(name)!.status]"
            :color="statusColor[latestFor(name)!.status]"
            variant="subtle"
          />
        </button>
      </div>

      <div class="flex min-h-64 flex-col gap-3 rounded-md border border-default p-3">
        <div class="flex min-h-24 flex-1 flex-col gap-2">
          <p v-if="thread.length === 0" class="text-sm text-muted">Choose a station, or write a message below.</p>
          <div v-for="message in thread" :key="message.key" class="flex flex-col gap-1 border-b border-default pb-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-sm text-highlighted">{{ message.direction === 'out' ? 'You' : message.other }}</span>
              <UBadge :label="statusLabel[message.status]" :color="statusColor[message.status]" variant="subtle" />
              <UButton
                v-if="message.status === 'waiting-ack'"
                size="xs"
                color="neutral"
                variant="ghost"
                label="Cancel"
                @click="onCancel(message.key)"
              />
            </div>
            <p class="text-sm">{{ message.text }}</p>
            <p v-if="message.detail" class="text-xs text-muted">{{ message.detail }}</p>
          </div>
        </div>

        <div class="grid gap-2 border-t border-default pt-3">
          <div class="grid gap-2 sm:grid-cols-2">
            <UFormField label="My callsign">
              <UInput v-model="mine" class="w-full" placeholder="N0CALL" autocapitalize="characters" />
            </UFormField>
            <UFormField label="To">
              <UInput v-model="to" class="w-full" placeholder="K5KTF-4" autocapitalize="characters" />
            </UFormField>
          </div>
          <UFormField label="Message" :description="`${text.length}/${APRS_MESSAGE_TEXT_MAX}`">
            <UTextarea v-model="text" class="w-full" :rows="2" :maxlength="APRS_MESSAGE_TEXT_MAX" placeholder="Message text" />
          </UFormField>
          <div class="grid gap-2 sm:grid-cols-2">
            <USwitch
              :model-value="transmitRequested"
              label="Allow transmit"
              description="Off. Send writes nothing, and a message already waiting is cancelled. Turning it on does not send."
              @update:model-value="onTransmit"
            />
            <USwitch
              :model-value="ackRequested"
              label="Reply with an ack"
              description="Off. On answers a message to your callsign. That answer is a transmission."
              @update:model-value="onAck"
            />
          </div>
          <p v-if="ackReason" class="text-xs text-muted">{{ ackReason }}</p>
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs text-muted">
              Up to {{ APRS_MESSAGE_ATTEMPTS }} tries, {{ APRS_MESSAGE_RETRY_MS / 1000 }} seconds apart, and only after an AX.25 UI frame.
              Allow transmit off, Cancel, or Disconnect stops it.
            </p>
            <UButton
              color="primary"
              icon="i-lucide-send"
              :label="transmitRequested ? 'Send' : 'Send (transmit off)'"
              :disabled="!cardId"
              @click="onSend"
            />
          </div>
        </div>
      </div>
    </div>

    <UCollapsible :unmount-on-hide="false" class="shrink-0 rounded-md border border-default px-3 py-2">
      <UButton color="neutral" variant="ghost" label="Host KISS" trailing-icon="i-lucide-chevron-down" />
      <template #content>
        <p class="mb-2 text-xs text-muted">
          Connect does not enter KISS. These buttons write only after you click them, and only on an open host session.
          {{ kissStatus }}
          <template v-if="hostOpen"> Bytes written {{ snapshot?.bytesWritten ?? 0 }}.</template>
        </p>
        <div class="mb-2 flex flex-wrap gap-1.5">
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            icon="i-lucide-terminal"
            label="Request command prompt"
            :disabled="!cardId || !hostOpen || snapshot?.commandPhase === 'prompt'"
            @click="onRequestPrompt"
          />
          <UButton
            size="sm"
            color="neutral"
            variant="ghost"
            label="Cancel command"
            :disabled="!cardId || (snapshot?.commandPhase !== 'waiting-prompt' && snapshot?.commandPhase !== 'waiting-accept')"
            @click="onCancelCommand"
          />
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            icon="i-lucide-arrow-right-left"
            label="Enter host KISS"
            :disabled="!cardId || snapshot?.commandPhase !== 'prompt'"
            @click="onEnterHost"
          />
        </div>
        <p class="mb-2 text-xs text-muted">{{ snapshot?.commandDetail ?? 'No command requested.' }}</p>
        <p v-if="commandNote" class="mb-2 text-xs text-muted">{{ commandNote }}</p>
        <p v-if="enterNote || snapshot?.hostEnterRequested" class="mb-2 text-xs text-muted">
          {{ snapshot?.kissConfirmed ? 'AX.25 UI seen.' : (enterNote ?? 'Command written. KISS unconfirmed. No message was sent.') }}
        </p>
        <UCollapsible :unmount-on-hide="false">
          <UButton color="neutral" variant="ghost" size="xs" label="How KISS enter and exit work" trailing-icon="i-lucide-chevron-down" />
          <template #content>
            <div class="grid gap-3 py-2 md:grid-cols-2">
              <ol class="list-decimal space-y-1 pl-5 text-xs text-muted">
                <li v-for="step in APRS_HOST_SETUP" :key="step">{{ step }}</li>
              </ol>
              <ol class="list-decimal space-y-1 pl-5 text-xs text-muted">
                <li v-for="step in APRS_HOST_RECOVERY" :key="step">{{ step }}</li>
              </ol>
            </div>
          </template>
        </UCollapsible>
      </template>
    </UCollapsible>
  </div>
</template>
