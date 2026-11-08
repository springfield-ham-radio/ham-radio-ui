<script setup lang="ts">
import { aprsConversationCall, aprsConversations, aprsHeardAudience, formatAprsChatTime } from '~/utils/aprs-conversations';
import type { AprsHostMessage } from '~/utils/aprs-host-session';
import { APRS_HOST_RECOVERY, APRS_HOST_SETUP } from '~/utils/aprs-kiss-restore';
import { APRS_MESSAGE_ATTEMPTS, APRS_MESSAGE_RETRY_MS, APRS_MESSAGE_TEXT_MAX, callsignError } from '~/utils/aprs-message';

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
const text = ref('');
const transmitRequested = ref(false);
const ackRequested = ref(false);
const ackReason = ref<string | undefined>();
const enterNote = ref<string | undefined>();
const commandNote = ref<string | undefined>();
const selectedCall = ref<string | undefined>();
const showChat = ref(false);
const drafting = ref(false);
const draftCall = ref('');
const draftError = ref<string | undefined>();

if (props.cardId) {
  host.watchCard(props.cardId);
}

const exampleMessages: AprsHostMessage[] = [
  {
    key: 'example-overheard',
    direction: 'in',
    other: 'KF5UFJ-1',
    text: 'Sample heard on the channel. Not addressed to this station.',
    addressee: 'K5KTF-4',
    status: 'heard',
    at: 1_700_000_000_000,
  },
  {
    key: 'example-in',
    direction: 'in',
    other: 'KF5UFJ-7',
    text: 'Sample line addressed to N0CALL. Not from a radio.',
    addressee: 'N0CALL',
    status: 'heard',
    at: 1_700_000_100_000,
  },
  {
    key: 'example-out',
    direction: 'out',
    other: 'KF5UFJ-7',
    text: 'Sample reply. Allow transmit is off, so this was not sent.',
    addressee: 'KF5UFJ-7',
    status: 'blocked',
    detail: 'Transmit is off. Nothing was sent.',
    at: 1_700_000_200_000,
  },
];

const messages = computed(() => [...(example.value ? exampleMessages : []), ...(snapshot.value?.messages ?? [])]);
const conversations = computed(() => aprsConversations(messages.value));
const thread = computed(() => conversations.value.find((row) => row.callsign === selectedCall.value)?.messages ?? []);

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

function openCall(callsign: string): void {
  selectedCall.value = callsign;
  showChat.value = true;
  drafting.value = false;
}

function onNewMessage(): void {
  drafting.value = true;
  draftError.value = undefined;
}

function onOpenDraft(): void {
  const call = aprsConversationCall(draftCall.value);
  draftError.value = call ? undefined : (callsignError(draftCall.value) ?? 'Enter a callsign.');

  if (!call) {
    return;
  }

  draftCall.value = '';
  openCall(call);
}

function onBack(): void {
  showChat.value = false;
  selectedCall.value = undefined;
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
    to: selectedCall.value ?? '',
    text: text.value,
    transmitRequested: transmitRequested.value,
  });
  openCall(message.other);
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
    <div class="@container flex min-h-0 flex-1 flex-col gap-3">
      <p class="text-xs text-muted">
        Messages on this connection. Nothing here is saved, and the radio’s stored messages are not read. The byte log is on Raw log.
        <template v-if="example"> The KF5UFJ lines are sample text.</template>
      </p>

      <div class="grid min-h-0 gap-3 @min-[42rem]:grid-cols-[18rem_1fr]">
        <div class="min-h-0 flex-col gap-2" :class="showChat ? 'hidden @min-[42rem]:flex max-md:hidden' : 'flex'">
          <div class="flex items-center justify-between gap-2">
            <p class="text-sm font-medium text-highlighted">Callsigns</p>
            <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-square-pen" label="New message" @click="onNewMessage" />
          </div>
          <form v-if="drafting" class="flex flex-col gap-2 rounded-md border border-default p-2" @submit.prevent="onOpenDraft">
            <UFormField label="Callsign" :error="draftError" description="Opening a callsign does not send.">
              <UInput v-model="draftCall" class="w-full" placeholder="KF5UFJ-7" autocapitalize="characters" />
            </UFormField>
            <div class="flex justify-end gap-1.5">
              <UButton size="xs" color="neutral" variant="ghost" label="Cancel" type="button" @click="drafting = false" />
              <UButton size="xs" color="neutral" variant="outline" label="Open" type="submit" />
            </div>
          </form>
          <p v-if="conversations.length === 0" class="py-6 text-sm text-muted">No messages this session.</p>
          <div v-else class="flex flex-col">
            <button
              v-for="row in conversations"
              :key="row.callsign"
              type="button"
              class="flex flex-col gap-0.5 border-b border-default px-2 py-2 text-left"
              :class="row.callsign === selectedCall ? 'bg-elevated' : ''"
              @click="openCall(row.callsign)"
            >
              <span class="flex items-baseline justify-between gap-2">
                <span class="truncate font-mono text-sm text-highlighted">{{ row.callsign }}</span>
                <span class="shrink-0 text-xs text-muted">{{ formatAprsChatTime(row.latest.at) }}</span>
              </span>
              <span class="flex items-center justify-between gap-2">
                <span class="min-w-0 flex-1 truncate text-xs text-muted">{{ row.latest.text }}</span>
                <UBadge :label="statusLabel[row.latest.status]" :color="statusColor[row.latest.status]" variant="subtle" />
              </span>
            </button>
          </div>
        </div>

        <div
          class="min-h-72 flex-col gap-3 rounded-md border border-default p-3"
          :class="showChat ? 'flex' : 'hidden @min-[42rem]:flex max-md:hidden'"
        >
          <div class="flex items-center gap-2">
            <UButton v-if="selectedCall" size="xs" color="neutral" variant="ghost" icon="i-lucide-chevron-left" label="Back" @click="onBack" />
            <p class="min-w-0 truncate font-mono text-sm text-highlighted">{{ selectedCall ?? 'No callsign selected' }}</p>
          </div>
          <div class="flex min-h-24 flex-1 flex-col gap-2 overflow-auto">
            <p v-if="!selectedCall" class="text-sm text-muted">Choose a callsign. That does not send.</p>
            <p v-else-if="thread.length === 0" class="text-sm text-muted">No messages with {{ selectedCall }} yet. Send is the only control that writes.</p>
            <div
              v-for="message in thread"
              :key="message.key"
              class="flex max-w-[85%] flex-col gap-1 rounded-md px-3 py-2"
              :class="message.direction === 'out' ? 'self-end bg-elevated' : 'self-start border border-default'"
            >
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-xs text-muted">{{ message.direction === 'out' ? 'You' : message.other }}</span>
                <UBadge
                  v-if="message.direction === 'out'"
                  :label="statusLabel[message.status]"
                  :color="statusColor[message.status]"
                  variant="subtle"
                />
                <span v-else class="text-xs text-muted">{{ aprsHeardAudience(message, mine) }}</span>
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
              <p class="text-xs text-muted">{{ formatAprsChatTime(message.at) }}</p>
            </div>
          </div>

          <div v-if="selectedCall" class="grid gap-2 border-t border-default pt-3">
            <UFormField label="My callsign">
              <UInput v-model="mine" class="w-full" placeholder="N0CALL" autocapitalize="characters" />
            </UFormField>
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
                An ack is from that station for your message id. Up to {{ APRS_MESSAGE_ATTEMPTS }} tries,
                {{ APRS_MESSAGE_RETRY_MS / 1000 }} seconds apart, after an AX.25 UI frame.
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
