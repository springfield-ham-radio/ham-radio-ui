<script setup lang="ts">
import type { ChannelGroup } from '~/utils/channel-groups';
import type { ChannelPackDocument } from '~/utils/channel-pack';
import { formatChannelPackUpdated } from '~/utils/format-date';
import {
  assessChannelPackUpdate,
  ChannelPackFetchError,
  fetchChannelPack,
  type ChannelPackFetchFailure,
  type ChannelPackRevisionCompare,
} from '~/utils/channel-pack-fetch';

const open = defineModel<boolean>('open', { required: true });

const props = defineProps<{
  group: ChannelGroup;
}>();

const emit = defineEmits<{
  preview: [
    payload: {
      pack: ChannelPackDocument;
      requestedUrl: string;
      adoptDeclaredSource: boolean;
      packIdMismatch: boolean;
    },
  ];
}>();

const loading = ref(false);
const failure = shallowRef<ChannelPackFetchFailure | null>(null);
const remote = shallowRef<ChannelPackDocument | null>(null);
const compare = shallowRef<ChannelPackRevisionCompare | null>(null);
const packIdMismatch = ref(false);
const declaredSourceUrl = ref<string | undefined>();
const declaredSourceHttps = ref(false);
const adoptDeclaredSource = ref(false);

const sourceUrl = computed(() => props.group.packSourceUrl?.trim() ?? '');

watch(open, (isOpen) => {
  if (!isOpen) {
    return;
  }

  failure.value = null;
  remote.value = null;
  compare.value = null;
  packIdMismatch.value = false;
  declaredSourceUrl.value = undefined;
  declaredSourceHttps.value = false;
  adoptDeclaredSource.value = false;

  if (sourceUrl.value) {
    void check();
  }
});

async function check(): Promise<void> {
  if (!sourceUrl.value || loading.value) {
    return;
  }

  loading.value = true;
  failure.value = null;
  remote.value = null;

  try {
    const result = await fetchChannelPack(sourceUrl.value);
    remote.value = result.pack;
    const assessment = assessChannelPackUpdate(props.group, result.pack);
    compare.value = assessment.compare;
    packIdMismatch.value = assessment.packIdMismatch;
    declaredSourceUrl.value = assessment.declaredSourceUrl;
    declaredSourceHttps.value = assessment.declaredSourceHttps;
  } catch (cause) {
    if (cause instanceof ChannelPackFetchError) {
      failure.value = cause.details;
    } else {
      const message = cause instanceof Error ? cause.message : 'Channel pack download failed';
      failure.value = {
        summary: message,
        requestedUrl: sourceUrl.value,
        cause,
      };
    }
  } finally {
    loading.value = false;
  }
}

const alertColor = computed(() => {
  if (packIdMismatch.value) {
    return 'warning';
  }

  if (compare.value === 'newer') {
    return 'info';
  }

  if (compare.value === 'same') {
    return 'neutral';
  }

  if (compare.value === 'older' || compare.value === 'unknown') {
    return 'warning';
  }

  return 'neutral';
});

const alertTitle = computed(() => {
  if (packIdMismatch.value) {
    return 'This URL returned a different channel pack';
  }

  if (compare.value === 'newer') {
    return 'The remote pack is newer';
  }

  if (compare.value === 'same') {
    return 'This group already matches that pack';
  }

  if (compare.value === 'older') {
    return 'The remote pack is older than this group';
  }

  if (compare.value === 'unknown') {
    return 'Could not compare timestamps';
  }

  return 'Checking for updates';
});

const alertDescription = computed(() => {
  if (!remote.value) {
    return undefined;
  }

  const remoteLine = `Remote version ${remote.value.version} · updated ${formatChannelPackUpdated(remote.value.updated)}`;
  const localLine = props.group.packVersion || props.group.packUpdated
    ? `Your group version ${props.group.packVersion ?? '—'} · updated ${props.group.packUpdated ? formatChannelPackUpdated(props.group.packUpdated) : '—'}`
    : undefined;

  if (packIdMismatch.value) {
    return `${remote.value.name} (${remote.value.id}). ${remoteLine}`;
  }

  if (compare.value === 'same' && props.group.packVersion && props.group.packVersion !== remote.value.version) {
    return `${remoteLine}. Version label differs (yours ${props.group.packVersion}, remote ${remote.value.version}).`;
  }

  return [remoteLine, localLine].filter(Boolean).join(' ');
});

const showPreviewPrimary = computed(
  () => !packIdMismatch.value && (compare.value === 'newer' || compare.value === 'unknown'),
);

const showPreviewAnyway = computed(
  () => !packIdMismatch.value && (compare.value === 'same' || compare.value === 'older'),
);

function preview(): void {
  if (!remote.value || !sourceUrl.value) {
    return;
  }

  open.value = false;
  emit('preview', {
    pack: remote.value,
    requestedUrl: sourceUrl.value,
    adoptDeclaredSource: adoptDeclaredSource.value,
    packIdMismatch: packIdMismatch.value,
  });
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Check for updates"
    :description="group.name"
    modal
    dismissible
    :ui="{ content: 'sm:max-w-lg', footer: 'justify-end' }"
  >
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-muted break-all">{{ sourceUrl }}</p>
        <div v-if="loading" class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          Downloading pack…
        </div>
        <ChannelPackFetchAlert v-else-if="failure" :failure="failure" />
        <UAlert
          v-else-if="remote"
          :color="alertColor"
          variant="subtle"
          :icon="packIdMismatch ? 'i-lucide-triangle-alert' : 'i-lucide-package'"
          :title="alertTitle"
          :description="alertDescription"
        />
        <div
          v-if="remote && declaredSourceUrl && declaredSourceUrl !== sourceUrl && !packIdMismatch"
          class="space-y-2"
        >
          <p class="text-sm text-muted">The pack declares a different source URL:</p>
          <p class="text-sm break-all text-default">{{ declaredSourceUrl }}</p>
          <UCheckbox
            v-if="declaredSourceHttps"
            v-model="adoptDeclaredSource"
            label="Use the source URL declared in the pack for later checks"
          />
          <UAlert
            v-else
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            title="Declared source URL is not https"
            description="Later checks will keep using the URL stored on this group."
          />
        </div>
      </div>
    </template>
    <template #footer="{ close }">
      <UButton color="neutral" variant="outline" label="Close" @click="close" />
      <UButton
        v-if="packIdMismatch && remote"
        color="neutral"
        variant="outline"
        label="Import as new pack"
        @click="preview"
      />
      <UButton v-if="showPreviewAnyway" color="neutral" variant="outline" label="Preview anyway" @click="preview" />
      <UButton v-if="showPreviewPrimary" color="primary" label="Preview update" @click="preview" />
    </template>
  </UModal>
</template>
