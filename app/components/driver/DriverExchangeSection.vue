<script setup lang="ts">
defineProps<{
  title: string;
  direction: 'send' | 'receive';
  description?: string;
}>();
</script>

<template>
  <section
    class="flex w-full flex-col gap-3 rounded-lg border p-3"
    :class="direction === 'send' ? 'border-warning/30 bg-warning/5' : 'border-success/30 bg-success/5'"
  >
    <div class="flex items-start gap-2">
      <span
        class="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md"
        :class="direction === 'send' ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success'"
      >
        <UIcon :name="direction === 'send' ? 'i-lucide-arrow-right' : 'i-lucide-arrow-left'" class="size-3.5" />
      </span>
      <div class="min-w-0">
        <h3 class="text-sm font-medium text-highlighted">{{ title }}</h3>
        <p v-if="description" class="text-xs text-muted">{{ description }}</p>
      </div>
    </div>
    <slot />
  </section>
</template>
