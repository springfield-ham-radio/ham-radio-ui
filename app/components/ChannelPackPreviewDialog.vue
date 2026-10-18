<script setup lang="ts">
import type { ChannelPackDocument } from '~/utils/channel-pack';
import { formatChannelPackUpdated } from '~/utils/format-date';
import {
  CHANNEL_PACK_DIFF_PREVIEW_LIMIT,
  type ChannelPackDiffEntry,
  type ChannelPackGroupResolution,
  type ChannelPackImportPlan,
} from '~/utils/channel-pack-import';

const open = defineModel<boolean>('open', { required: true });

const groupName = defineModel<string>('groupName', { required: true });

const props = defineProps<{
  pack: ChannelPackDocument;
  plan: ChannelPackImportPlan;
  resolution: ChannelPackGroupResolution;
  applying?: boolean;
}>();

const emit = defineEmits<{
  apply: [];
}>();

const blockedReason = computed(() => (props.resolution.action === 'blocked' ? props.resolution.reason : undefined));
const canApply = computed(() => !blockedReason.value && groupName.value.trim().length > 0);
const actionLabel = computed(() => (props.resolution.action === 'create' ? 'Create group' : 'Update group'));
const previewDiff = computed(() => props.plan.diff.slice(0, CHANNEL_PACK_DIFF_PREVIEW_LIMIT));
const hiddenDiffCount = computed(() => Math.max(0, props.plan.diff.length - CHANNEL_PACK_DIFF_PREVIEW_LIMIT));
const summaryLine = computed(
  () => `${props.plan.added} added · ${props.plan.changed} changed · ${props.plan.removed} removed`,
);
const headerDescription = computed(() => {
  const author = props.pack.author ? `${props.pack.author} · ` : '';

  return `${author}version ${props.pack.version} · updated ${formatChannelPackUpdated(props.pack.updated)}`;
});

function diffPrefix(kind: ChannelPackDiffEntry['kind']): string {
  if (kind === 'add') {
    return '+';
  }

  if (kind === 'remove') {
    return '−';
  }

  return '~';
}

function diffColor(kind: ChannelPackDiffEntry['kind']): 'success' | 'warning' | 'error' {
  if (kind === 'add') {
    return 'success';
  }

  if (kind === 'remove') {
    return 'error';
  }

  return 'warning';
}

function apply(): void {
  if (!canApply.value) {
    return;
  }

  emit('apply');
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Import channel pack"
    :description="headerDescription"
    modal
    dismissible
    :ui="{ content: 'sm:max-w-lg', footer: 'justify-end' }"
  >
    <template #body>
      <div class="space-y-4">
        <div>
          <p class="text-sm font-medium text-highlighted">{{ pack.name }}</p>
          <p v-if="pack.description" class="mt-1 text-sm text-muted">{{ pack.description }}</p>
        </div>
        <UFormField label="Group name" :error="blockedReason">
          <UInput v-model="groupName" maxlength="40" :disabled="Boolean(applying)" />
        </UFormField>
        <UAlert
          v-if="blockedReason"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Cannot import with this group name"
          :description="blockedReason"
        />
        <section class="space-y-2 rounded-lg ring-1 ring-default p-3">
          <p class="text-xs font-medium text-muted">{{ summaryLine }}</p>
          <ul class="space-y-2 text-sm">
            <li v-for="(entry, index) in previewDiff" :key="`${entry.kind}-${entry.packChannelId ?? entry.label}-${index}`">
              <div class="flex items-start gap-2">
                <UBadge :color="diffColor(entry.kind)" variant="subtle" class="mt-0.5 shrink-0 font-mono">
                  {{ diffPrefix(entry.kind) }}
                </UBadge>
                <span>
                  <span class="font-medium text-highlighted">{{ entry.label }}</span>
                  <span v-if="entry.summary" class="text-muted"> — {{ entry.summary }}</span>
                </span>
              </div>
            </li>
          </ul>
          <p v-if="hiddenDiffCount > 0" class="text-xs text-muted">and {{ hiddenDiffCount }} more</p>
        </section>
      </div>
    </template>
    <template #footer="{ close }">
      <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
      <UButton color="primary" :label="actionLabel" :disabled="!canApply" :loading="applying" @click="apply" />
    </template>
  </UModal>
</template>
