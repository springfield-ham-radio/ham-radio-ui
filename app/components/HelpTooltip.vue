<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  text?: string;
  menu?: string;
  constraint?: string;
}>();

const ariaLabel = computed(() => {
  return [props.menu, props.text, props.constraint]
    .filter((part): part is string => Boolean(part && part.length > 0))
    .map((part) => part.replace(/\.+$/, ''))
    .join('. ');
});
</script>

<template>
  <UTooltip
    :delay-duration="200"
    :content="{ side: 'top', sideOffset: 8, collisionPadding: 8 }"
    :ui="{
      content:
        'h-auto max-w-xs flex-col items-stretch gap-1.5 rounded-md bg-elevated px-3 py-2.5 text-left shadow-lg ring-2 ring-primary/70',
    }"
  >
    <button
      type="button"
      class="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-muted hover:text-highlighted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      :aria-label="ariaLabel"
      @click.stop
    >
      <UIcon name="i-lucide-circle-help" class="size-3.5" />
    </button>

    <template #content>
      <p v-if="menu" class="text-xs font-semibold tracking-wide text-primary">{{ menu }}</p>
      <p v-if="text" class="text-sm whitespace-normal text-default">{{ text }}</p>
      <p v-if="constraint" class="text-xs whitespace-normal text-muted">{{ constraint }}</p>
    </template>
  </UTooltip>
</template>
