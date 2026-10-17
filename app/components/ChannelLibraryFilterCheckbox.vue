<script setup lang="ts">
const model = defineModel<boolean>({ required: true });

defineProps<{
  label: string;
}>();

/** Matches sm outline inputs: h-8, rounded-md, ring-accented; card variant makes the whole row clickable. */
const checkboxUi = {
  root:
    'inline-flex h-8 min-h-8 !p-0 px-2.5 cursor-pointer items-center gap-2 rounded-md border-0 bg-default shadow-none ring ring-inset ring-accented transition-colors hover:not-has-disabled:not-has-focus-visible:not-has-data-[state=checked]:bg-elevated/50',
  wrapper: 'text-xs font-normal text-default',
  label: 'font-normal cursor-pointer',
};
</script>

<template>
  <UFormField :label="label" class="shrink-0" :ui="{ label: 'sr-only' }">
    <UCheckbox v-model="model" :label="label" variant="card" color="primary" size="sm" :ui="checkboxUi" />
  </UFormField>
</template>
