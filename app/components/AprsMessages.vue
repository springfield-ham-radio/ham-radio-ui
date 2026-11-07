<script setup lang="ts">
import { aprsPortMissingMessage } from '~/utils/aprs-d710';
import type { AprsHostMessage } from '~/utils/aprs-host-session';
import {
  APRS_HOST_RECOVERY,
  APRS_HOST_SETUP,
  APRS_HOST_TRANSMIT_BLOCKER,
} from '~/utils/aprs-kiss-restore';
import { APRS_MESSAGE_ATTEMPTS, APRS_MESSAGE_RETRY_MS, APRS_MESSAGE_TEXT_MAX } from '~/utils/aprs-message';
import { isSerialPortPathAvailable } from '~/utils/serial-port-reconnect';

const props = defineProps<{
  cardId?: string;
  port?: string;
  portLabel?: string;
  baud: number;
  monitorUsingPort: boolean;
}>();

const route = useRoute();
const example = computed(() => import.meta.dev && route.query.fixture === 'aprs-messages');
const host = useAprsHost();
const { connecting, connect, unavailable, disconnect, send, cancel, setAckOptIn } = host;
const snapshot = computed(() => (props.cardId ? host.snapshots.value[props.cardId] : undefined));
const isConnected = computed(() => snapshot.value?.connected === true);
const isConnecting = computed(() => (props.cardId ? connecting.value[props.cardId] === true : false));

const mine = ref('');
const to = ref('');
const text = ref('');
const transmitRequested = ref(false);
const ackRequested = ref(false);
const ackReason = ref<string | undefined>();
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

  await connect(props.cardId, props.port, props.baud);
}

async function onDisconnect(): Promise<void> {
  if (!props.cardId) {
    return;
  }

  await disconnect(props.cardId);
}

async function onAck(next: boolean): Promise<void> {
  ackRequested.value = false;
  ackReason.value = props.cardId ? setAckOptIn(props.cardId, next) : APRS_HOST_TRANSMIT_BLOCKER;

  if (!ackReason.value) {
    ackRequested.value = next;
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
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Host messaging does not transmit in this build"
      :description="APRS_HOST_TRANSMIT_BLOCKER"
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
          Listening on {{ portLabel }} at {{ baud }} baud. Frames {{ snapshot?.frames ?? 0 }}. Not KISS
          {{ snapshot?.nonKissBytes ?? 0 }}. Bytes written {{ snapshot?.bytesWritten ?? 0 }}.
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

    <UAlert v-if="snapshot?.error" color="error" variant="subtle" icon="i-lucide-circle-alert" title="COM port" :description="snapshot.error" />

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
            v-model="transmitRequested"
            label="Allow transmit"
            description="Standalone APRS menus 600–612 do not run during host KISS. This switch does not send by itself, and this build still will not write a frame."
          />
          <USwitch
            :model-value="ackRequested"
            label="Reply to incoming messages with an ack"
            description="An ack is a transmission. It stays off for the connection test."
            @update:model-value="onAck"
          />
          <p v-if="ackReason" class="text-xs text-muted">{{ ackReason }}</p>
          <div class="flex items-center justify-between gap-2">
            <p class="text-xs text-muted">
              When transmit is allowed, a message is sent at most {{ APRS_MESSAGE_ATTEMPTS }} times,
              {{ APRS_MESSAGE_RETRY_MS / 1000 }} seconds apart. Cancel stops it. Disconnect does not send it again.
              An ack counts only when it comes from that station and carries your message id.
            </p>
            <UButton color="primary" icon="i-lucide-send" label="Send" :disabled="!cardId" @click="onSend" />
          </div>
        </div>
      </div>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
      <section>
        <h3 class="mb-1 text-sm font-medium text-highlighted">Before using PACKET</h3>
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
