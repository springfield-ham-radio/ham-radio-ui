<script setup lang="ts">
defineProps<{
  title?: string;
  help?: string;
}>();
</script>

<template>
  <section class="flex w-full flex-col gap-3 rounded-lg border border-default bg-muted/40 p-3">
    <div v-if="title" class="flex items-center gap-1">
      <h3 class="text-sm font-medium text-highlighted">{{ title }}</h3>
      <HelpTooltip v-if="help" :text="help" />
    </div>
    <slot />
  </section>
</template>
