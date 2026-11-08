<script setup lang="ts">
import { aprsPortMissingMessage } from '~/utils/aprs-d710';
import type { AprsHostMessage } from '~/utils/aprs-host-session';
import { APRS_HOST_RECOVERY, APRS_HOST_SETUP } from '~/utils/aprs-kiss-restore';
import { APRS_HOST_TRACE_FIXTURE, formatTrace } from '~/utils/aprs-serial-trace';
import { APRS_MESSAGE_ATTEMPTS, APRS_MESSAGE_RETRY_MS, APRS_MESSAGE_TEXT_MAX } from '~/utils/aprs-message';
import { isSerialPortPathAvailable } from '~/utils/serial-port-reconnect';
import type { AprsHostFlowControl } from '~/utils/aprs-serial-options';

const props = defineProps<{
  cardId?: string;
  port?: string;
  portLabel?: string;
  baud: number;
  monitorUsingPort: boolean;
}>();

const route = useRoute();
const example = computed(() => import.meta.dev && (route.query.fixture === 'aprs-messages' || route.query.fixture === 'aprs-host-trace'));
const traceFixture = computed(() => import.meta.dev && route.query.fixture === 'aprs-host-trace');
const host = useAprsHost();
const { connecting, connect, unavailable, disconnect, send, cancel, setAckOptIn, setTransmitOptIn, requestCommandPrompt, cancelCommand, enterHostKiss, clearTrace } = host;
const snapshot = computed(() => (props.cardId ? host.snapshots.value[props.cardId] : undefined));
const isConnected = computed(() => snapshot.value?.connected === true);
const isConnecting = computed(() => (props.cardId ? connecting.value[props.cardId] === true : false));

const mine = ref('');
const to = ref('');
const text = ref('');
const transmitRequested = ref(false);
const ackRequested = ref(false);
const ackReason = ref<string | undefined>();
const enterNote = ref<string | undefined>();
const commandNote = ref<string | undefined>();
const hostFlow = ref<AprsHostFlowControl>('software');
const hostFlowItems: Array<{ label: string; value: AprsHostFlowControl }> = [
  { label: 'Software (XON/XOFF)', value: 'software' },
  { label: 'Off', value: 'none' },
  { label: 'Hardware (RTS/CTS)', value: 'hardware' },
];
const hostFlowDescription = computed(() => {
  if (hostFlow.value === 'hardware') {
    return 'For a TNC already at XFLOW OFF. The driver manages RTS and CTS. RTS is not forced low. This does not send XFLOW.';
  }

  if (hostFlow.value === 'none') {
    return 'Same lines as the passive monitor. RTS and DTR stay low. This does not send XFLOW.';
  }

  return 'Factory XFLOW ON on the computer side. RTS and DTR stay low. This does not send XFLOW. Default stays here.';
});
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
});

const statusLabel: Record<AprsHostMessage['status'], string> = {
  heard: 'Heard',
  'waiting-ack': 'Waiting for ack',
  acked: 'Acked',
  rejected: 'Rejected',
  'timed-out': 'Timed out',
  cancelled: 'Cancelled',
  blocked: 'Not sent',
};

async function onListen(): Promise<void> {
  if (!props.cardId || !props.port || props.monitorUsingPort) {
    return;
  }

  try {
    const present = await isSerialPortPathAvailable(props.port);

    if (!present) {
      unavailable(props.cardId, aprsPortMissingMessage(props.port));
      return;
    }
  } catch {
    // The port list is unavailable outside the desktop shell. Open reports that failure.
  }

  await connect(props.cardId, props.port, props.baud, hostFlow.value);
}

function onHostFlow(value: unknown): void {
  if (value === 'software' || value === 'none' || value === 'hardware') {
    hostFlow.value = value;
  }
}

async function onDisconnect(): Promise<void> {
  if (!props.cardId) {
    return;
  }

  await disconnect(props.cardId);
}

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

const traceLines = computed(() => (traceFixture.value ? APRS_HOST_TRACE_FIXTURE : (snapshot.value?.trace ?? [])));
const traceText = computed(() => formatTrace(traceLines.value));

const kissStatus = computed(() => {
  if (traceFixture.value) {
    return 'FIXTURE. KISS unconfirmed. These lines were not read from a radio.';
  }

  if (snapshot.value?.kissConfirmed) {
    return 'AX.25 UI seen.';
  }

  if (snapshot.value?.hostEnterRequested || enterNote.value) {
    return 'Command written. KISS unconfirmed. No message was sent, and the command is not repeated.';
  }

  return 'No AX.25 UI frame on this Listen. Send does not write a message.';
});

function onTransmit(next: boolean): void {
  transmitRequested.value = next;

  if (props.cardId) {
    setTransmitOptIn(props.cardId, next);
  }
}

async function onCopyTrace(): Promise<void> {
  const body = traceText.value;

  if (!body || !import.meta.client) {
    return;
  }

  await navigator.clipboard.writeText(body);
}

function onClearTrace(): void {
  if (props.cardId) {
    clearTrace(props.cardId);
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
    <UAlert
      color="neutral"
      variant="subtle"
      icon="i-lucide-radio"
      title="This is the host session, not the passive APRS test"
      description="Stations listens with the radio left on APRS. Nothing on that tab asks you to select PACKET. Listen here only reads. Allow transmit and Send write a message only when that switch is on. Enter host KISS is a separate mode change."
    />

    <UAlert
      v-if="example"
      color="neutral"
      variant="subtle"
      icon="i-lucide-message-square"
      title="Sample thread"
      description="The K5KTF-4 line is example text for the layout. Listen does not send KISS ON or RESTART."
    />

    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="min-w-0 text-xs text-muted">
        <template v-if="isConnected">
          Listening on {{ portLabel }} at {{ baud }} baud. RX {{ snapshot?.rxBytes ?? 0 }} bytes in
          {{ snapshot?.rxChunks ?? 0 }} chunks. Command text {{ snapshot?.commandTextBytes ?? 0 }}. Incomplete
          {{ snapshot?.incompleteBytes ?? 0 }}. Invalid {{ snapshot?.invalidBytes ?? 0 }}. KISS frames
          {{ snapshot?.frames ?? 0 }}. Bytes written {{ snapshot?.bytesWritten ?? 0 }}.
        </template>
        <template v-else-if="monitorUsingPort">
          The monitor is using this port. Disconnect it on the Stations tab before listening here. The monitor is left as it is.
        </template>
        <template v-else-if="portLabel"> Saved port {{ portLabel }} at {{ baud }} baud. Listen only reads. </template>
        <template v-else> Choose an APRS serial port under Preferences. The memory port is not used. </template>
      </p>
      <div class="flex items-center gap-1.5">
        <UBadge
          :label="isConnected ? 'Listening' : 'Not listening'"
          :color="isConnected ? 'success' : 'neutral'"
          variant="subtle"
        />
        <UButton
          v-if="!isConnected"
          size="sm"
          icon="i-lucide-cable"
          label="Listen"
          :loading="isConnecting"
          :disabled="!cardId || !port || monitorUsingPort"
          @click="onListen"
        />
        <UButton v-else size="sm" color="neutral" variant="outline" icon="i-lucide-unplug" label="Disconnect" @click="onDisconnect" />
      </div>
    </div>
    <UFormField
      v-if="!isConnected"
      label="Host flow control"
      description="Choose this before Listen. Software and Off keep RTS low. Hardware lets the driver manage RTS. None of these sends XFLOW, and the choice applies on the next Listen."
      :hint="hostFlowDescription"
    >
      <USelect
        :model-value="hostFlow"
        :items="hostFlowItems"
        value-key="value"
        class="w-full sm:max-w-xs"
        @update:model-value="onHostFlow"
      />
    </UFormField>

    <UAlert v-if="snapshot?.error" color="error" variant="subtle" icon="i-lucide-circle-alert" title="COM port" :description="snapshot.error" />

    <section class="flex flex-col gap-2 rounded-md border border-default p-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-sm font-medium text-highlighted">Serial reply</h3>
        <div class="flex items-center gap-1.5">
          <UButton size="xs" color="neutral" variant="outline" label="Copy" :disabled="traceText.length === 0" @click="onCopyTrace" />
          <UButton size="xs" color="neutral" variant="outline" label="Clear" :disabled="!cardId || traceFixture" @click="onClearTrace" />
        </div>
      </div>
      <p class="text-xs text-muted">{{ snapshot?.commandDetail ?? 'No command requested.' }}</p>
      <p class="text-xs text-muted">{{ kissStatus }}</p>
      <p class="text-xs text-muted">
        The log stays on this card when you change tabs. Clear removes the lines and keeps the counters. It does not
        write to the radio. Text is shown as characters, not run.
        <template v-if="(snapshot?.traceDropped ?? 0) > 0"> Oldest lines dropped: {{ snapshot?.traceDropped }}. The counters still include them. </template>
      </p>
      <pre class="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs text-highlighted">{{ traceText || 'No bytes yet.' }}</pre>
    </section>

    <div class="grid gap-3 lg:grid-cols-[16rem_1fr]">
      <div class="flex flex-col gap-1">
        <p v-if="others.length === 0" class="text-sm text-muted">No messages yet.</p>
        <button
          v-for="name in others"
          :key="name"
          type="button"
          class="rounded-md px-2 py-1.5 text-left font-mono text-sm"
          :class="name === selectedOther ? 'bg-elevated text-highlighted' : 'text-muted'"
          @click="selectedOther = name"
        >
          {{ name }}
        </button>
      </div>

      <div class="flex min-h-48 flex-col gap-2 rounded-md border border-default p-3">
        <p v-if="thread.length === 0" class="text-sm text-muted">Choose a station or send a message to open a thread.</p>
        <div v-for="message in thread" :key="message.key" class="flex flex-col gap-0.5 border-b border-default pb-2">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-mono text-sm text-highlighted">{{ message.direction === 'out' ? 'You' : message.other }}</span>
            <UBadge :label="statusLabel[message.status]" color="neutral" variant="subtle" />
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

        <div class="mt-auto grid gap-2 border-t border-default pt-3">
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
          <USwitch
            :model-value="transmitRequested"
            label="Allow transmit"
            description="Off: Send writes nothing, and a message already waiting is cancelled. On: Send can write only after this Listen has parsed an AX.25 UI frame. A KISS frame that is not a UI frame does not count. The switch alone does not send, and it does not enter KISS."
            @update:model-value="onTransmit"
          />
          <USwitch
            :model-value="ackRequested"
            label="Reply to incoming messages with an ack"
            description="Off for a listen test. On: a message addressed to your callsign is answered with an ack frame. That answer is a transmission."
            @update:model-value="onAck"
          />
          <p v-if="ackReason" class="text-xs text-muted">{{ ackReason }}</p>
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs text-muted">
              When transmit is allowed and this Listen has an AX.25 UI frame, a message is sent at most {{ APRS_MESSAGE_ATTEMPTS }} times,
              {{ APRS_MESSAGE_RETRY_MS / 1000 }} seconds apart. Allow transmit off stops it, and so does Cancel. Disconnect does not send it again.
              An ack counts only when it comes from that station and carries your message id.
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

    <div class="grid gap-3 md:grid-cols-2">
      <section>
        <h3 class="mb-1 text-sm font-medium text-highlighted">Host KISS, only when you leave standalone APRS</h3>
        <div class="mb-2 flex flex-wrap gap-1.5">
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            icon="i-lucide-terminal"
            label="Request command prompt"
            :disabled="!cardId || !isConnected || snapshot?.commandPhase === 'prompt'"
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
        <p class="mb-2 text-xs text-muted">
          The command list says Ctrl+C returns from Converse, and three Ctrl+C return from Transparent. It does not say Ctrl+C prints cmd: when the TNC is already in command mode. If cmd: arrives on this Listen, Request sends nothing. Enter host KISS then writes KISS ON, and writes RESTART only after another cmd:. Disconnect drops that prompt. cmd without the colon does not count.
        </p>
        <p v-if="commandNote" class="mb-2 text-xs text-muted">{{ commandNote }}</p>
        <p v-if="enterNote || snapshot?.hostEnterRequested" class="mb-2 text-xs text-muted">
          {{ snapshot?.kissConfirmed ? 'AX.25 UI seen.' : (enterNote ?? 'Command written. KISS unconfirmed. No message was sent.') }}
        </p>
        <ol class="list-decimal space-y-1 pl-5 text-xs text-muted">
          <li v-for="step in APRS_HOST_SETUP" :key="step">{{ step }}</li>
        </ol>
      </section>
      <section>
        <h3 class="mb-1 text-sm font-medium text-highlighted">Getting back to the monitor</h3>
        <ol class="list-decimal space-y-1 pl-5 text-xs text-muted">
          <li v-for="step in APRS_HOST_RECOVERY" :key="step">{{ step }}</li>
        </ol>
      </section>
    </div>
  </div>
</template>
