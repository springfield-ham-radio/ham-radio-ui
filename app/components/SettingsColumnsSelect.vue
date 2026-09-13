<script setup lang="ts">
import { SETTINGS_COLUMN_COUNTS } from '~/utils/appearance-settings';

const { settingsColumns, setSettingsColumns } = useAppearanceSettings();

const items = SETTINGS_COLUMN_COUNTS.map((count) => ({
  label: count === 1 ? '1 column' : `${count} columns`,
  value: String(count),
}));

const preference = computed({
  get: () => String(settingsColumns.value),
  set: (value: string) => {
    setSettingsColumns(value);
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
