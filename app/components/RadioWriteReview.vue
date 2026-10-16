<script setup lang="ts">
import { compareMemoryImages } from '~/utils/driver-debug';
import type { ChannelValidationFinding } from '~/utils/channel-validation';
import {
  summarizeWriteReview,
  type WriteReviewCapabilitySummary,
  type WriteReviewChannelKind,
  type WriteReviewDiff,
} from '~/utils/radio-write-review';

const props = defineProps<{
  status: 'no-baseline' | 'no-codec' | 'decode-error' | 'ready';
  diff?: WriteReviewDiff;
  capability?: WriteReviewCapabilitySummary;
  beforeImage?: Uint8Array;
  afterImage?: Uint8Array;
  canRead: boolean;
  reading: boolean;
}>();

const errorsAcknowledged = defineModel<boolean>('errorsAcknowledged', { default: false });

const emit = defineEmits<{
  read: [];
}>();

const bytesOpen = ref(false);

const summary = computed(() => (props.diff ? summarizeWriteReview(props.diff) : ''));
const hasChanges = computed(
  () => (props.diff?.channels.length ?? 0) > 0 || (props.diff?.settingsGroups.length ?? 0) > 0,
);
const bytesDiffer = computed(() => {
  if (!props.beforeImage || !props.afterImage) {
    return false;
  }

  return compareMemoryImages(props.beforeImage, props.afterImage).length > 0;
});
const showBytes = computed(() => Boolean(props.beforeImage && props.afterImage));

watch(
  () => [props.beforeImage, props.afterImage] as const,
  () => {
    bytesOpen.value = false;
  },
);

function kindLabel(kind: WriteReviewChannelKind): string {
  if (kind === 'added') {
    return 'Added';
  }

  if (kind === 'cleared') {
    return 'Cleared';
  }

  return 'Changed';
}

function findingBadgeColor(level: ChannelValidationFinding['level']): 'error' | 'warning' {
  return level === 'error' ? 'error' : 'warning';
}

function kindColor(kind: WriteReviewChannelKind): 'success' | 'error' | 'warning' {
  if (kind === 'added') {
    return 'success';
  }

  if (kind === 'cleared') {
    return 'error';
  }

  return 'warning';
}
</script>

<template>
  <div class="mb-4 space-y-3">
    <section v-if="capability" class="space-y-2 rounded-lg bg-default p-3 ring-1 ring-default">
      <p class="text-sm font-medium text-highlighted">Channel fit</p>
      <p v-if="capability.allFit" class="text-sm text-muted">All channels fit this radio.</p>
      <template v-else>
        <ul class="max-h-48 space-y-2 overflow-y-auto text-sm">
          <li v-for="row in capability.rows" :key="row.channelNumber" class="space-y-1">
            <p class="font-medium text-highlighted">
              Channel {{ row.channelNumber }}
              <span v-if="row.name" class="font-normal text-toned">· {{ row.name }}</span>
            </p>
            <ul class="flex flex-col gap-1">
              <li v-for="(finding, findingIndex) in row.findings" :key="findingIndex" class="flex items-start gap-2">
                <UBadge
                  :color="findingBadgeColor(finding.level)"
                  variant="subtle"
                  size="xs"
                  class="mt-0.5 shrink-0 uppercase"
                >
                  {{ finding.level }}
                </UBadge>
                <span class="text-muted">{{ finding.message }}</span>
              </li>
            </ul>
          </li>
        </ul>
      </template>
      <p v-if="capability.limitedChecks" class="text-xs text-muted">
        Name and tone limits need a memory map; only band and license checks ran.
      </p>
      <UCheckbox
        v-if="capability.hasErrors"
        v-model="errorsAcknowledged"
        label="Write this image even though some channels have validation errors"
      />
    </section>

    <template v-if="status === 'no-baseline'">
      <UAlert
        color="info"
        variant="subtle"
        icon="i-lucide-info"
        title="No radio image to compare"
        description="HamBench has not read this radio in this session, so it cannot show which channels and settings will change."
      />
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          label="Read radio"
          icon="i-hambench-radio-read"
          color="neutral"
          variant="outline"
          :disabled="!canRead || reading"
          :loading="reading"
          @click="emit('read')"
        />
        <p v-if="!canRead" class="text-xs text-muted">Select a serial port to read the radio.</p>
      </div>
    </template>

    <UAlert
      v-else-if="status === 'no-codec'"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      title="Channel review is not available"
      description="This radio has no memory map, so HamBench cannot list channel and setting changes."
    />

    <UAlert
      v-else-if="status === 'decode-error'"
      color="warning"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Could not decode the memory image"
      description="Channel and setting changes could not be listed."
    />

    <template v-else-if="diff">
      <p class="text-sm text-muted">
        {{ summary }}
        Compared with the last image read from or written to this radio.
      </p>
      <div v-if="hasChanges" class="max-h-[28rem] space-y-3 overflow-y-auto pe-1">
        <article
          v-for="channel in diff.channels"
          :key="channel.channelNumber"
          class="rounded-lg bg-default p-3 ring-1 ring-default"
        >
          <div class="mb-2 flex items-center gap-2">
            <UBadge :label="kindLabel(channel.kind)" :color="kindColor(channel.kind)" variant="subtle" size="sm" />
            <p class="min-w-0 truncate text-sm font-medium text-highlighted">
              Channel {{ channel.channelNumber }}
              <span v-if="channel.name" class="font-normal text-toned">· {{ channel.name }}</span>
            </p>
          </div>
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="text-xs text-muted">
                <th class="py-1 pr-3 font-medium">Field</th>
                <th class="py-1 pr-3 font-medium">On radio</th>
                <th class="py-1 font-medium">To write</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="field in channel.fields" :key="field.id" class="border-t border-default">
                <td class="py-1 pr-3 text-toned">{{ field.label }}</td>
                <td class="py-1 pr-3 text-muted">{{ field.before }}</td>
                <td class="py-1 text-highlighted">{{ field.after }}</td>
              </tr>
            </tbody>
          </table>
        </article>

        <section
          v-for="group in diff.settingsGroups"
          :key="group.id"
          class="rounded-lg bg-default p-3 ring-1 ring-default"
        >
          <p class="mb-2 text-sm font-medium text-highlighted">{{ group.label }}</p>
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="text-xs text-muted">
                <th class="py-1 pr-3 font-medium">Setting</th>
                <th class="py-1 pr-3 font-medium">On radio</th>
                <th class="py-1 font-medium">To write</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="field in group.fields" :key="field.id" class="border-t border-default">
                <td class="py-1 pr-3 text-toned">{{ field.label }}</td>
                <td class="py-1 pr-3 text-muted">{{ field.before }}</td>
                <td class="py-1 text-highlighted">{{ field.after }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </template>

    <div v-if="showBytes">
      <UButton
        :label="bytesOpen ? 'Hide byte changes' : 'Show byte changes'"
        :icon="bytesOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="bytesOpen = !bytesOpen"
      />
      <p v-if="bytesOpen && !bytesDiffer" class="mt-2 text-sm text-muted">No byte changes.</p>
      <div v-else-if="bytesOpen && beforeImage && afterImage" class="mt-2">
        <DriverMemoryHexDiff
          :before="beforeImage"
          :after="afterImage"
          before-label="On radio"
          after-label="To write"
        />
      </div>
    </div>
  </div>
</template>
