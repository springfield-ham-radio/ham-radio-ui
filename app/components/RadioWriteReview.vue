<script setup lang="ts">
import { compareMemoryImages } from '~/utils/driver-debug';
import {
  summarizeWriteReview,
  type WriteReviewChannelKind,
  type WriteReviewDiff,
} from '~/utils/radio-write-review';

const props = defineProps<{
  status: 'no-baseline' | 'no-codec' | 'decode-error' | 'ready';
  diff?: WriteReviewDiff;
  beforeImage?: Uint8Array;
  afterImage?: Uint8Array;
  canRead: boolean;
  reading: boolean;
}>();

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
