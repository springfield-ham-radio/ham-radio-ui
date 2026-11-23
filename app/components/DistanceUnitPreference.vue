<script setup lang="ts">
const { unit, setUnit } = useDistanceUnit();

const items = [
  { label: 'Miles', value: 'mi' as const },
  { label: 'Kilometers', value: 'km' as const },
];

function onDistanceUnitChange(value: unknown): void {
  commitRequiredToggleGroupValue(value, setUnit);
}
</script>

<template>
  <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
    <div class="flex items-center justify-between gap-4 px-4 py-3">
      <div class="min-w-0">
        <p class="text-sm font-medium text-highlighted">Distance units</p>
        <p class="text-xs text-muted">Miles or kilometers for the Channels distance column. Miles is the default.</p>
      </div>
      <UToggleGroup
        :model-value="unit"
        attached
        color="neutral"
        variant="outline"
        active-variant="subtle"
        :items="items"
        aria-label="Distance units"
        @update:model-value="onDistanceUnitChange"
      />
    </div>
  </div>
</template>
