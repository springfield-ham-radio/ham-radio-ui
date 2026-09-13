<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';

useHead({ title: 'WaveBench' });

type WaveBenchExperiment = 'filters' | 'modulation';

const experiment = ref<WaveBenchExperiment>('filters');
const experimentItems: TabsItem[] = [
  { label: 'Filters', value: 'filters', icon: 'i-lucide-audio-waveform' },
  { label: 'AM / FM', value: 'modulation', icon: 'i-lucide-radio' },
];

const subtitle = computed(() => {
  if (experiment.value === 'modulation') {
    return 'Start from the sine wave, pick a carrier, then write a tone into AM and FM on a CRT.';
  }

  return 'Lumped filter design — schematic, equations, Bode plots, and the same oscilloscope time view.';
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex shrink-0 items-start justify-between gap-3 border-b border-default px-4 py-3">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold text-highlighted">WaveBench</h2>
        <p class="text-xs text-muted">
          {{ subtitle }}
        </p>
      </div>
      <UTabs
        v-model="experiment"
        :items="experimentItems"
        :content="false"
        color="primary"
        variant="pill"
        size="sm"
        class="w-auto"
        :ui="{ list: 'w-auto', trigger: 'grow-0' }"
      />
    </div>
    <div class="relative min-h-0 flex-1 overflow-hidden">
      <KeepAlive>
        <WaveBenchFilterLab
          v-if="experiment === 'filters'"
          :key="'filters'"
          class="absolute inset-0"
        />
        <WaveBenchModulationLab
          v-else
          :key="'modulation'"
          class="absolute inset-0"
        />
      </KeepAlive>
    </div>
  </div>
</template>
