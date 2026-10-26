<script setup lang="ts">
import type { DriverTrustBadge } from '~/utils/driver-trust-badge';

defineProps<{
  badges: readonly DriverTrustBadge[];
}>();
</script>

<template>
  <span v-if="badges.length > 0" class="inline-flex flex-wrap items-center gap-1">
    <template v-for="badge in badges" :key="badge.kind">
      <UTooltip v-if="badge.tooltip" :text="badge.tooltip">
        <span class="inline-flex">
          <UBadge :label="badge.label" :color="badge.color" variant="subtle" size="sm" />
        </span>
      </UTooltip>
      <UBadge
        v-else
        :label="badge.label"
        :color="badge.color"
        variant="subtle"
        size="sm"
      />
    </template>
  </span>
</template>
