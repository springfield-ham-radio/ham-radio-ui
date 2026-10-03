<script setup lang="ts">
import { STATION_LOG_MAP_STYLE_IDS } from '~/utils/station-log-map';

const { mapStyle, setMapStyle } = useAppearanceSettings();

const labels: Record<(typeof STATION_LOG_MAP_STYLE_IDS)[number], string> = {
  theme: 'Match theme',
  liberty: 'Liberty',
  bright: 'Bright',
  positron: 'Positron',
  dark: 'Dark',
  fiord: 'Fiord',
};

const items = STATION_LOG_MAP_STYLE_IDS.map((id) => ({
  label: labels[id],
  value: id,
}));

const preference = computed({
  get: () => mapStyle.value,
  set: (value: string) => {
    setMapStyle(value);
  },
});
</script>

<template>
  <ClientOnly>
    <USelect v-model="preference" :items="items" value-key="value" color="neutral" class="w-44" />
    <template #fallback>
      <div class="h-8 w-44 rounded-md bg-elevated" />
    </template>
  </ClientOnly>
</template>
