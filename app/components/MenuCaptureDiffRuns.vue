<script setup lang="ts">
import { computed } from 'vue';
import type { MenuCaptureStepDiff } from '~/utils/menu-capture';
import { menuCaptureFieldReviewLines } from '~/utils/menu-capture-review';

const props = defineProps<{
  diff: MenuCaptureStepDiff;
  menuNumber?: number;
  beforeLabel?: string;
  afterLabel?: string;
}>();

const beforeColumn = computed(() => props.beforeLabel ?? 'Previous read');
const afterColumn = computed(() => props.afterLabel ?? 'This read');
</script>

<template>
  <div class="space-y-4">
    <article v-for="(run, runIndex) in diff.runs" :key="`${run.offset}-${runIndex}`" class="space-y-2">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span class="font-mono font-medium text-toned">{{ run.address }}</span>
        <span v-if="run.unmapped" class="text-warning">Unmapped bytes</span>
        <span v-else class="text-muted">Mapped</span>
      </div>

      <ul v-if="run.fields.length > 0" class="list-inside list-disc text-sm text-toned">
        <li v-for="(line, index) in menuCaptureFieldReviewLines(run.fields, menuNumber)" :key="index">
          {{ line }}
        </li>
      </ul>
      <p v-else class="text-sm text-muted">No memory-map fields cover this change.</p>

      <div class="overflow-hidden rounded-lg bg-default ring-1 ring-default">
        <div class="flex border-b border-default bg-elevated px-3 py-2 font-mono text-xs text-muted">
          <div class="w-24 shrink-0 font-medium">Address</div>
          <div class="min-w-0 flex-1 font-medium">{{ beforeColumn }}</div>
          <div class="min-w-0 flex-1 font-medium">{{ afterColumn }}</div>
        </div>
        <div class="divide-y divide-default font-mono text-xs">
          <div
            v-for="(row, rowIndex) in run.context"
            :key="`${run.address}-${row.address}-${rowIndex}`"
            class="grid grid-cols-[6rem_1fr_1fr] gap-2 px-3 py-1.5"
          >
            <span class="text-toned">{{ row.address }}</span>
            <span class="whitespace-pre break-all text-muted">{{ row.before }}</span>
            <span class="whitespace-pre break-all text-primary">{{ row.after }}</span>
          </div>
          <div
            v-if="run.context.length === 0"
            class="grid grid-cols-[6rem_1fr_1fr] gap-2 px-3 py-1.5"
          >
            <span class="text-toned">{{ run.address }}</span>
            <span class="whitespace-pre break-all text-muted">{{ run.before }}</span>
            <span class="whitespace-pre break-all text-primary">{{ run.after }}</span>
          </div>
        </div>
      </div>
    </article>
  </div>
</template>