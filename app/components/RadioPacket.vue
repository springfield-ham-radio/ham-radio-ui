<script setup lang="ts">
import { canonicalAx25Call } from '~/utils/aprs-ax25';
import { aprsReceiveProfile } from '~/utils/aprs-capability';
import { packetNeedsHostNotice } from '~/utils/aprs-connection';
import { formatPacketTime, packetFixturePayloads } from '~/utils/packet-monitor';
import type { PacketTypeFilter } from '~/utils/packet-monitor';
import { packetMyCallLabel } from '~/utils/packet-settings';
import { packetCallStationTooltip, packetTerminalView } from '~/utils/packet-terminal';

const props = defineProps<{
  cardId?: string;
  model?: string;
  radioName?: string;
}>();

const host = useAprsHost();
const monitor = useAprs();
const packet = usePacket();
const { requestedModes } = useAprsTncMode();
const { radioById } = useSavedRadios();
const { configurations } = useRadio();
const { choiceForRadio, identityFor } = useOperatorLicense();
const route = useRoute();
const fixture = computed(() => import.meta.dev && route.query.fixture === 'packet');
const pane = ref<'monitor' | 'terminal'>('monitor');
const peer = ref('');
const path = ref('');
const line = ref('');
const savedRadio = computed(() => (props.cardId ? radioById(props.cardId) : undefined));
const profile = computed(() => {
  const config = configurations.value.find((item) => String(item.id.model) === props.model);
  return aprsReceiveProfile({ config, model: props.model, name: props.radioName ?? savedRadio.value?.name });
});
const hostSnapshot = computed(() => (props.cardId ? host.snapshots.value[props.cardId] : undefined));
const state = computed(() => (props.cardId ? packet.states.value[props.cardId] : undefined));
const baseCall = computed(() => identityFor(choiceForRadio(savedRadio.value)).callSign);
const ssidLocked = computed(() => baseCall.value?.includes('-') === true);
const myCall = computed(() => packetMyCallLabel(baseCall.value, state.value?.settings.ssid ?? 0));
const portOpen = computed(() => hostSnapshot.value?.connected === true);
const terminal = computed(() => packetTerminalView({
  portOpen: portOpen.value,
  detectPhase: hostSnapshot.value?.detectPhase ?? 'idle',
  kissConfirmed: hostSnapshot.value?.kissConfirmed === true,
  hardwareTransmit: hostSnapshot.value?.hardwareTransmit !== false,
  phase: state.value?.phase ?? 'none',
  myCall: myCall.value,
  peer: state.value?.peer,
}));
const packetPanes = [
  { label: 'Monitor', value: 'monitor', slot: 'monitor' },
  { label: 'Terminal', value: 'terminal', slot: 'terminal' },
];
const typeItems: Array<{ label: string; value: PacketTypeFilter }> = [
  { label: 'All frames', value: 'all' },
  { label: 'I', value: 'I' },
  { label: 'S', value: 'S' },
  { label: 'U', value: 'U' },
  { label: 'UI', value: 'UI' },
  { label: 'RR', value: 'RR' },
  { label: 'RNR', value: 'RNR' },
  { label: 'REJ', value: 'REJ' },
  { label: 'SREJ', value: 'SREJ' },
  { label: 'SABM', value: 'SABM' },
  { label: 'SABME', value: 'SABME' },
  { label: 'UA', value: 'UA' },
  { label: 'DM', value: 'DM' },
  { label: 'DISC', value: 'DISC' },
  { label: 'FRMR', value: 'FRMR' },
  { label: 'XID', value: 'XID' },
  { label: 'TEST', value: 'TEST' },
];
const ssidItems = Array.from({ length: 16 }, (_, ssid) => ({ label: String(ssid), value: ssid }));
const moduloItems = [
  { label: '8 (AX.25 2.0)', value: 8 },
  { label: '128 (AX.25 2.2)', value: 128 },
];

const hostNotice = computed(() => packetNeedsHostNotice({
  hostOpen: portOpen.value,
  passiveOpen: props.cardId ? monitor.snapshots.value[props.cardId]?.connected === true : false,
  selected: (props.cardId ? requestedModes.value[props.cardId] : undefined) ?? (profile.value?.host ? 'host' : 'passive'),
}));

if (props.cardId) {
  host.watchCard(props.cardId);
}

watch(
  () => [props.cardId, profile.value?.host?.link] as const,
  () => {
    if (!props.cardId) {
      return;
    }

    host.setHostLink(props.cardId, profile.value?.host?.link);
    packet.attach(props.cardId);
  },
  { immediate: true },
);

watch(hostSnapshot, (snapshot) => {
  if (props.cardId) {
    packet.notePort(props.cardId, snapshot);
  }
});

onMounted(() => {
  if (!fixture.value || !props.cardId) {
    return;
  }

  packet.showFixture(props.cardId, packetFixturePayloads(), Date.parse('2026-11-11T18:00:00Z'));
});

onUnmounted(() => {
  if (props.cardId) {
    void packet.endLink(props.cardId);
  }
});

function onFilterCall(value: string | number): void {
  if (!props.cardId) {
    return;
  }

  packet.setFilter(props.cardId, String(value), state.value?.filterType ?? 'all');
}

function onFilterType(value: unknown): void {
  if (!props.cardId || typeof value !== 'string') {
    return;
  }

  packet.setFilter(props.cardId, state.value?.filterCall ?? '', value as PacketTypeFilter);
}

function onSsid(value: unknown): void {
  if (!props.cardId) {
    return;
  }

  const ssid = Number(value);

  if (!Number.isInteger(ssid)) {
    return;
  }

  packet.updateSettings(props.cardId, { ssid });
}

function onModulo(value: unknown): void {
  const modulo = Number(value);

  if (!props.cardId || (modulo !== 8 && modulo !== 128)) {
    return;
  }

  packet.updateSettings(props.cardId, { modulo });
}

function onNumber(key: 'paclen' | 'maxframe' | 't1Ms' | 't3Ms' | 'n2', value: string | number): void {
  if (!props.cardId) {
    return;
  }

  packet.updateSettings(props.cardId, { [key]: Number(value) });
}

async function onLinkConnect(): Promise<void> {
  if (!props.cardId || !terminal.value.canConnect) {
    return;
  }

  await packet.connectLink(props.cardId, baseCall.value, peer.value, path.value);
}

async function onLinkDisconnect(): Promise<void> {
  if (!props.cardId) {
    return;
  }

  await packet.disconnectLink(props.cardId);
}

async function onSend(): Promise<void> {
  if (!props.cardId || !terminal.value.canSend) {
    return;
  }

  const text = line.value;
  line.value = '';
  await packet.sendLine(props.cardId, text);
}

async function onCopy(): Promise<void> {
  if (!props.cardId || !import.meta.client) {
    return;
  }

  const text = packet.copyText(props.cardId);

  if (text.length > 0) {
    await navigator.clipboard.writeText(text);
  }
}

const peerReady = computed(() => canonicalAx25Call(peer.value) !== undefined);
const callStationTooltip = computed(() => packetCallStationTooltip({
  portOpen: portOpen.value,
  phase: state.value?.phase ?? 'none',
  detectPhase: hostSnapshot.value?.detectPhase ?? 'idle',
  kissConfirmed: hostSnapshot.value?.kissConfirmed === true,
  hardwareTransmit: hostSnapshot.value?.hardwareTransmit !== false,
  myCall: myCall.value,
  station: peer.value,
}));
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
    <AprsConnectionBar :card-id="cardId" :model="model" :radio-name="radioName" />
    <p v-if="hostNotice" class="mb-2 text-xs text-muted">{{ hostNotice }}</p>
    <div class="mb-2 flex shrink-0 flex-wrap items-end gap-2">
      <p class="pb-1.5 font-mono text-sm text-highlighted">{{ myCall ?? 'No callsign' }}</p>
      <UFormField v-if="!ssidLocked" label="SSID" class="w-20">
        <USelect
          :model-value="state?.settings.ssid ?? 0"
          :items="ssidItems"
          value-key="value"
          class="w-full"
          @update:model-value="onSsid"
        />
      </UFormField>
    </div>

    <UTabs
      v-model="pane"
      color="primary"
      variant="link"
      :items="packetPanes"
      class="flex min-h-0 flex-1 flex-col overflow-hidden"
      :ui="{
        list: 'w-full shrink-0 items-center gap-0.5 border-b border-default',
        trigger: 'grow-0 px-3 data-[state=inactive]:text-muted data-[state=active]:text-primary',
        indicator: 'bg-primary h-0.5 rounded-full',
        content: 'flex min-h-0 flex-1 flex-col overflow-hidden pt-2 focus-visible:outline-none',
      }"
    >
      <template #monitor>
    <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div class="flex shrink-0 flex-wrap items-end gap-2">
        <UFormField label="Callsign" class="w-40">
          <UInput
            :model-value="state?.filterCall ?? ''"
            placeholder="Filter"
            class="w-full font-mono"
            @update:model-value="onFilterCall"
          />
        </UFormField>
        <UFormField label="Frame" class="w-36">
          <USelect
            :model-value="state?.filterType ?? 'all'"
            :items="typeItems"
            value-key="value"
            class="w-full"
            @update:model-value="onFilterType"
          />
        </UFormField>
        <UButton size="sm" color="neutral" variant="outline" :label="state?.paused ? 'Resume' : 'Pause'" @click="props.cardId && packet.togglePause(props.cardId)" />
        <UButton size="sm" color="neutral" variant="outline" label="Clear" @click="props.cardId && packet.clearMonitor(props.cardId)" />
        <UButton size="sm" color="neutral" variant="outline" label="Copy" icon="i-lucide-copy" @click="onCopy" />
        <p class="pb-1.5 text-xs text-muted">
          {{ state?.visible.length ?? 0 }} shown
          <span v-if="state?.paused"> · paused, {{ state.heldCount }} held</span>
        </p>
      </div>
      <div class="min-h-0 flex-1 overflow-auto rounded-xl bg-default shadow-sm ring-1 ring-default">
        <table class="w-full border-collapse text-left text-xs">
          <thead class="sticky top-0 bg-elevated text-muted">
            <tr>
              <th class="px-2 py-1 font-medium">Time</th>
              <th class="px-2 py-1 font-medium">From</th>
              <th class="px-2 py-1 font-medium">To</th>
              <th class="px-2 py-1 font-medium">Path</th>
              <th class="px-2 py-1 font-medium">Ctl</th>
              <th class="px-2 py-1 font-medium">N(S)</th>
              <th class="px-2 py-1 font-medium">N(R)</th>
              <th class="px-2 py-1 font-medium">P/F</th>
              <th class="px-2 py-1 font-medium">PID</th>
              <th class="px-2 py-1 font-medium">Info</th>
              <th class="px-2 py-1 font-medium">Hex</th>
            </tr>
          </thead>
          <tbody class="font-mono">
            <tr v-for="row in state?.visible ?? []" :key="row.id" class="border-t border-default align-top">
              <td class="px-2 py-1 whitespace-nowrap text-muted">{{ formatPacketTime(row.at) }}</td>
              <td class="px-2 py-1 whitespace-nowrap">{{ row.source }}</td>
              <td class="px-2 py-1 whitespace-nowrap">{{ row.destination }}</td>
              <td class="px-2 py-1 whitespace-nowrap">{{ row.path }}</td>
              <td class="px-2 py-1">{{ row.control }} <span class="text-muted">{{ row.cr }}</span></td>
              <td class="px-2 py-1">{{ row.ns }}</td>
              <td class="px-2 py-1">{{ row.nr }}</td>
              <td class="px-2 py-1">{{ row.pf }}</td>
              <td class="px-2 py-1">{{ row.pid }}</td>
              <td class="px-2 py-1 break-all">{{ row.text }}</td>
              <td class="px-2 py-1 break-all text-muted">{{ row.hex }}</td>
            </tr>
            <tr v-if="(state?.visible.length ?? 0) === 0">
              <td colspan="11" class="px-2 py-4 text-sm text-muted">No frames yet. KISS traffic from the shared host session is listed here, including frames that are not APRS.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
      </template>

      <template #terminal>
    <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div class="flex shrink-0 flex-wrap items-end gap-2">
        <UBadge :label="terminal.linkLabel" :color="state?.phase === 'connected' ? 'success' : 'neutral'" variant="subtle" />
        <UFormField label="Station" class="w-36" :error="peer.length > 0 && !peerReady ? 'Enter a callsign' : undefined">
          <UInput v-model="peer" placeholder="W1AW-1" class="w-full font-mono" :disabled="terminal.canDisconnect" />
        </UFormField>
        <UFormField label="Path" class="w-48">
          <UInput v-model="path" placeholder="Optional digipeaters" class="w-full font-mono" :disabled="terminal.canDisconnect" />
        </UFormField>
        <UTooltip :text="callStationTooltip ?? ''" :disabled="!callStationTooltip">
          <span class="inline-flex">
            <UButton
              size="sm"
              label="Call station"
              icon="i-lucide-link"
              :color="portOpen && terminal.canConnect ? 'primary' : 'neutral'"
              :variant="portOpen && terminal.canConnect ? 'solid' : 'outline'"
              :disabled="!portOpen || !terminal.canConnect || !peerReady"
              @click="onLinkConnect"
            />
          </span>
        </UTooltip>
        <UButton size="sm" color="neutral" variant="outline" label="Disconnect" :disabled="!terminal.canDisconnect" @click="onLinkDisconnect" />
        <p v-if="portOpen && terminal.connectBlocked && !terminal.canDisconnect" class="pb-1.5 text-xs text-muted">{{ terminal.connectBlocked }}</p>
        <p v-else-if="state?.error" class="pb-1.5 text-xs text-error">{{ state.error }}</p>
      </div>
      <div class="flex shrink-0 flex-wrap items-end gap-2">
        <UFormField label="Modulo" class="w-40">
          <USelect :model-value="state?.settings.modulo ?? 8" :items="moduloItems" value-key="value" @update:model-value="onModulo" />
        </UFormField>
        <UFormField label="Paclen" class="w-24">
          <UInput :model-value="state?.settings.paclen ?? 128" type="number" @update:model-value="onNumber('paclen', $event)" />
        </UFormField>
        <UFormField label="Maxframe" class="w-24">
          <UInput :model-value="state?.settings.maxframe ?? 4" type="number" @update:model-value="onNumber('maxframe', $event)" />
        </UFormField>
        <UFormField label="T1 ms" class="w-28">
          <UInput :model-value="state?.settings.t1Ms ?? 3000" type="number" @update:model-value="onNumber('t1Ms', $event)" />
        </UFormField>
        <UFormField label="N2" class="w-20">
          <UInput :model-value="state?.settings.n2 ?? 10" type="number" @update:model-value="onNumber('n2', $event)" />
        </UFormField>
        <USwitch
          :model-value="state?.settings.acceptIncoming === true"
          label="Accept incoming connections"
          @update:model-value="props.cardId && packet.updateSettings(props.cardId, { acceptIncoming: Boolean($event) })"
        />
      </div>
      <p class="shrink-0 text-xs text-muted">
        Defaults are paclen 128, maxframe 4, T1 3 s, T3 3 min, N2 10, modulo 8. An unsolicited SABM is ignored while Accept incoming connections is off, so the radio stays silent. Settings other than that switch apply on the next link. Leaving this tab sends DISC and stops the timers.
      </p>
      <pre class="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-xl bg-default p-3 font-mono text-sm shadow-sm ring-1 ring-default">{{ state?.scrollback || ' ' }}</pre>
      <form class="flex shrink-0 gap-2" @submit.prevent="onSend">
        <UInput v-model="line" class="flex-1 font-mono" placeholder="Line to send" :disabled="!terminal.canSend" />
        <UButton type="submit" label="Send" :disabled="!terminal.canSend" />
        <UButton color="neutral" variant="ghost" label="Clear" @click="props.cardId && packet.clearScrollback(props.cardId)" />
      </form>
    </div>
      </template>
    </UTabs>
  </div>
</template>
