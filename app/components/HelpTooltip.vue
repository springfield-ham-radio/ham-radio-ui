<template>
  <UTooltip
    :text="text"
    :delay-duration="200"
    :ui="{
      content: 'h-auto max-w-xs items-start py-1.5',
      text: 'whitespace-normal',
    }"
  >
    <button
      type="button"
      class="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted hover:text-highlighted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      :aria-label="text"
      @click.stop
    >
      <UIcon name="i-lucide-circle-help" class="size-3.5" />
    </button>
  </UTooltip>
</template>

<script setup lang="ts">
defineProps<{
  text: string;
}>();
</script>
