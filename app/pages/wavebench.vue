<script setup lang="ts">
useHead({ title: 'WaveBench' });
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex shrink-0 items-start justify-between gap-3 border-b border-default px-4 py-3">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold text-highlighted">WaveBench</h2>
        <p class="text-xs text-muted">
          A bench for ham-radio theory. Filters first — matching networks, antennas, and modulation can grow from here.
        </p>
      </div>
      <UBadge label="Filters" color="primary" variant="subtle" icon="i-lucide-audio-waveform" />
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto">
      <WaveBenchFilterLab />
    </div>
  </div>
</template>
