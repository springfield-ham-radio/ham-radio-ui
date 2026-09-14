<script setup lang="ts">
import { openExternalUrl } from '~/utils/open-external-url';
import { getSolarConditions, type SolarConditions } from '~/utils/propagation-solar';

useHead({ title: 'Propagation' });

const conditions = ref<SolarConditions | undefined>();
const loading = ref(false);
const error = ref<string | undefined>();

async function refresh(force = false): Promise<void> {
  loading.value = true;
  error.value = undefined;

  try {
    conditions.value = await getSolarConditions({ force });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Unknown NOAA fetch error';
    error.value = message;
  } finally {
    loading.value = false;
  }
}

function openNoaa(): void {
  void openExternalUrl('https://www.swpc.noaa.gov/');
}

onMounted(() => {
  void refresh(false);
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-4 overflow-auto px-4 py-3">
    <div class="flex shrink-0 flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold text-highlighted">Propagation</h2>
        <p class="text-xs text-muted">
          Live NOAA solar indices and a WWV-style estimate of which HF bands look open.
        </p>
      </div>
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        size="sm"
        label="Refresh"
        :loading="loading"
        @click="refresh(true)"
      />
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Could not load solar conditions"
      :description="error"
    />

    <PropagationSolarPanel :conditions="conditions" :loading="loading" />

    <PropagationBandChart :solar-flux="conditions?.solarFlux" :k-index="conditions?.kIndex" />

    <p class="shrink-0 pb-2 text-[11px] text-muted">
      Solar indices from
      <button
        type="button"
        class="underline decoration-dotted underline-offset-2 hover:text-default"
        @click="openNoaa"
      >
        NOAA SWPC
      </button>.
      Band openings are local estimates from SFI and K, not a circuit forecast.
    </p>
  </div>
</template>
