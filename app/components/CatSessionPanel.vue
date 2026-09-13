<script setup lang="ts">
import type { CatLiveRadio } from '~/composables/useCat';
import type { CatVfo } from '~/utils/kenwood-cat-session';
import { serialPortLabel } from '~/utils/serial-port-list';

const props = defineProps<{
  radio: CatLiveRadio;
}>();

const emit = defineEmits<{
  disconnect: [];
  frequency: [vfo: CatVfo, frequencyHz: number];
  mode: [vfo: CatVfo, mode: string];
  power: [vfo: CatVfo, power: string];
  transmit: [transmit: boolean];
  log: [vfo: CatVfo];
}>();

const modes = computed(() => props.radio.status.modes);
const powers = computed(() => props.radio.status.powers);
const disabled = computed(() => props.radio.busy);
</script>

<template>
  <section class="flex flex-col gap-3 rounded-xl bg-default p-4 shadow-sm ring-1 ring-default">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <p class="text-sm font-medium text-highlighted">{{ radio.radio.name }}</p>
        <p class="text-xs text-muted">
          {{ radio.status.radioIdentity }}
          <span v-if="radio.status.dualBand"> · dual band</span>
          · {{ serialPortLabel(radio.port) }}
        </p>
      </div>
      <UButton
        color="neutral"
        variant="outline"
        size="sm"
        icon="i-lucide-plug"
        label="Disconnect"
        :disabled="disabled"
        @click="emit('disconnect')"
      />
    </div>

    <UAlert
      v-if="radio.error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="CAT error"
      :description="radio.error"
    />

    <div
      class="grid gap-4"
      :class="radio.status.vfos.length > 1 ? 'lg:grid-cols-2' : ''"
    >
      <CatVfoCard
        v-for="vfo in radio.status.vfos"
        :key="`${radio.port}-${vfo.band}`"
        :vfo="vfo"
        :modes="modes"
        :powers="powers"
        :is-control="vfo.band === radio.status.controlBand"
        :transmitting="radio.status.transmitting"
        :disabled="disabled"
        @frequency="emit('frequency', vfo, $event)"
        @mode="emit('mode', vfo, $event)"
        @power="emit('power', vfo, $event)"
        @transmit="emit('transmit', $event)"
        @log="emit('log', vfo)"
      />
    </div>
  </section>
</template>
