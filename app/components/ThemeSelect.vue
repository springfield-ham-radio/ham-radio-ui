<script setup lang="ts">
const colorMode = useColorMode();

const items = [
  { label: 'System', value: 'system', icon: 'i-lucide-monitor' },
  { label: 'Light', value: 'light', icon: 'i-lucide-sun' },
  { label: 'Dark', value: 'dark', icon: 'i-lucide-moon' },
];

const preference = computed({
  get: () => colorMode.preference,
  set: (value: string) => {
    colorMode.preference = value;
  },
});
</script>

<template>
  <ClientOnly>
    <USelectMenu v-model="preference" :items="items" value-key="value" color="neutral" :search-input="false" class="w-44" />
    <template #fallback>
      <div class="h-8 w-44 rounded-md bg-elevated" />
    </template>
  </ClientOnly>
</template>
