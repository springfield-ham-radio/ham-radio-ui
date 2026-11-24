<script setup lang="ts">
import type { MenuCaptureStepRecord } from '~/utils/menu-capture';
import {
  formatMenuCaptureCapturedStepSummary,
  menuCaptureCapturedStepFieldLines,
} from '~/utils/menu-capture-review';

defineProps<{
  steps: readonly MenuCaptureStepRecord[];
}>();
</script>

<template>
  <ul v-if="steps.length > 0" class="divide-y divide-default rounded-lg ring-1 ring-default">
    <li v-for="step in steps" :key="step.index" class="space-y-1 px-3 py-2">
      <p class="text-sm font-medium text-toned">
        Step {{ step.index }} · {{ formatMenuCaptureCapturedStepSummary(step) }}
      </p>
      <ul v-if="menuCaptureCapturedStepFieldLines(step).length > 0" class="list-inside list-disc text-xs text-muted">
        <li v-for="(line, index) in menuCaptureCapturedStepFieldLines(step)" :key="index">
          {{ line }}
        </li>
      </ul>
    </li>
  </ul>
</template>