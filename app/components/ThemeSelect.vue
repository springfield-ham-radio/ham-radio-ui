<script setup lang="ts">
import type { ToggleGroupItem } from '@nuxt/ui';

const colorMode = useColorMode();

const items: ToggleGroupItem[] = [
  { value: 'system', icon: 'i-lucide-monitor', title: 'System', 'aria-label': 'System color scheme' },
  { value: 'light', icon: 'i-lucide-sun', title: 'Light', 'aria-label': 'Light color scheme' },
  { value: 'dark', icon: 'i-lucide-moon', title: 'Dark', 'aria-label': 'Dark color scheme' },
];

const preference = requiredToggleGroupModel(
  () => colorMode.preference,
  (value: string) => {
    colorMode.preference = value;
  },
);
</script>

<template>
  <ClientOnly>
    <UToggleGroup
      v-model="preference"
      attached
      color="neutral"
      variant="outline"
      active-variant="subtle"
      :items="items"
    />
    <template #fallback>
      <div class="h-8 w-[7.75rem] rounded-md bg-elevated" />
    </template>
  </ClientOnly>
</template>
