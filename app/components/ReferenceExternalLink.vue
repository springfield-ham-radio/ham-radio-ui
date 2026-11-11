<script setup lang="ts">
import { openExternalUrl } from '~/utils/open-external-url';

defineProps<{
  href: string;
}>();

function open(href: string): void {
  void openExternalUrl(href);
}
</script>

<template>
  <button
    type="button"
    class="underline decoration-dotted underline-offset-2 hover:text-default"
    @click="open(href)"
  >
    <slot />
  </button>
</template>
