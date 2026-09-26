<script setup lang="ts">
defineProps<{
  title?: string;
}>();
</script>

<template>
  <section class="flex w-full flex-col gap-3 rounded-lg border border-default bg-muted/40 p-3">
    <h3 v-if="title" class="text-sm font-medium text-highlighted">{{ title }}</h3>
    <slot />
  </section>
</template>
