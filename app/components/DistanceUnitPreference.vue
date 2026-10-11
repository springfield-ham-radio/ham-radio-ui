<script setup lang="ts">
const { unit, setUnit } = useDistanceUnit();

const items = [
  { label: 'Miles', value: 'mi' },
  { label: 'Kilometers', value: 'km' },
];
</script>

<template>
  <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
    <div class="flex items-center justify-between gap-4 px-4 py-3">
      <div class="min-w-0">
        <p class="text-sm font-medium text-highlighted">Distance units</p>
        <p class="text-xs text-muted">Miles or kilometers for the Channels distance column. Miles is the default.</p>
      </div>
      <USelect
        :model-value="unit"
        :items="items"
        value-key="value"
        color="neutral"
        class="w-40"
        aria-label="Distance units"
        @update:model-value="setUnit"
      />
    </div>
  </div>
</template>
