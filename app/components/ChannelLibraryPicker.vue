<script setup lang="ts">
import type { RadioChannelId } from '@springfield/ham-radio-api';
import { ALL_CHANNELS_TAB_ID, channelsInGroup } from '~/utils/channel-groups';
import { describeLibrarySlotAssignment, formatFrequencyMHz } from '~/utils/channel-edit';
import { formatSavedTone, matchesSavedChannelSearch, type SavedChannel } from '~/utils/saved-channels-db';

const open = defineModel<boolean>('open', { required: true });

const props = withDefaults(
  defineProps<{
    /** Replace one memory slot, or add several channels into unused slots. */
    mode?: 'replace' | 'add';
    radioName?: string;
    freeSlotNumbers?: number[];
  }>(),
  {
    mode: 'replace',
    radioName: 'this radio',
    freeSlotNumbers: () => [],
  },
);

const emit = defineEmits<{
  select: [channel: SavedChannel];
  add: [channels: SavedChannel[]];
}>();

const { channels, groups, memberships, isLoading, error, refresh } = useSavedChannels();

const query = shallowRef('');
const selectedId = shallowRef<RadioChannelId | undefined>();
const selectedIds = shallowRef<RadioChannelId[]>([]);
const groupId = shallowRef(ALL_CHANNELS_TAB_ID);

const scopedChannels = computed(() => channelsInGroup(channels.value, memberships.value, groupId.value));
const filteredChannels = computed(() => scopedChannels.value.filter((channel) => matchesSavedChannelSearch(channel, query.value)));

const showLoading = computed(() => isLoading.value && channels.value.length === 0);
const libraryEmpty = computed(() => !isLoading.value && !error.value && channels.value.length === 0);
const groupEmpty = computed(
  () => !showLoading.value && channels.value.length > 0 && scopedChannels.value.length === 0 && query.value.trim() === '',
);
const noMatches = computed(() => !showLoading.value && scopedChannels.value.length > 0 && filteredChannels.value.length === 0);
const canReplace = computed(() => filteredChannels.value.some((channel) => channel.id === selectedId.value));
const addCount = computed(() => Math.min(selectedIds.value.length, props.freeSlotNumbers.length));
const canAdd = computed(() => props.mode === 'add' && addCount.value > 0);
const modalTitle = computed(() => (props.mode === 'add' ? 'Add from library' : 'Replace from library'));
const modalDescription = computed(() => {
  if (props.mode !== 'add') {
    return 'Copies the saved channel’s name, frequencies, and tones into this memory slot. Power, mode, scan, and other radio settings stay as they are.';
  }

  return describeLibrarySlotAssignment({
    radioName: props.radioName,
    sourceCount: selectedIds.value.length,
    slotNumbers: props.freeSlotNumbers,
  });
});
const confirmLabel = computed(() => {
  if (props.mode !== 'add') {
    return 'Replace';
  }

  if (addCount.value === 0) {
    return 'Add';
  }

  return addCount.value === 1 ? 'Add channel' : `Add ${addCount.value} channels`;
});
const canConfirm = computed(() => (props.mode === 'add' ? canAdd.value : canReplace.value));

watch(open, (isOpen) => {
  if (!isOpen) {
    return;
  }

  query.value = '';
  selectedId.value = undefined;
  selectedIds.value = [];
  groupId.value = ALL_CHANNELS_TAB_ID;
  void refresh();
});

watch(groupId, () => {
  if (props.mode === 'replace') {
    selectedId.value = undefined;
  }
});

function channelTitle(channel: SavedChannel): string {
  const name = channel.name?.trim();

  if (name) {
    return name;
  }

  const callsign = channel.callsign?.trim();

  if (callsign) {
    return callsign;
  }

  return 'Untitled';
}

function channelDetail(channel: SavedChannel): string {
  const frequencies = `RX ${formatFrequencyMHz(channel.receiveFrequency)} · TX ${formatFrequencyMHz(channel.transmitFrequency)}`;
  const receiveTone = formatSavedTone(channel.receiveTone);
  const transmitTone = formatSavedTone(channel.transmitTone);
  const tones = [receiveTone ? `RX ${receiveTone}` : '', transmitTone ? `TX ${transmitTone}` : ''].filter(Boolean);
  const callsign = channel.kind === 'repeater' && channel.name?.trim() ? channel.callsign?.trim() : '';

  return [callsign, frequencies, tones.join(' · ')].filter(Boolean).join(' · ');
}

function rowSelected(channel: SavedChannel): boolean {
  if (props.mode === 'add') {
    return selectedIds.value.includes(channel.id);
  }

  return channel.id === selectedId.value;
}

function choose(channel: SavedChannel): void {
  selectedId.value = channel.id;
}

function toggle(channel: SavedChannel): void {
  if (selectedIds.value.includes(channel.id)) {
    selectedIds.value = selectedIds.value.filter((id) => id !== channel.id);
    return;
  }

  selectedIds.value = [...selectedIds.value, channel.id];
}

function onRowClick(channel: SavedChannel, event: Event): void {
  if (props.mode === 'add') {
    if (event instanceof MouseEvent && event.detail > 1) {
      return;
    }

    toggle(channel);
    return;
  }

  choose(channel);
}

function confirmSelection(): void {
  if (props.mode === 'add') {
    const chosen = selectedIds.value.flatMap((id) => {
      const channel = channels.value.find((item) => item.id === id);
      return channel ? [channel] : [];
    });

    if (chosen.length === 0) {
      return;
    }

    emit('add', chosen);
    open.value = false;
    return;
  }

  const channel = channels.value.find((item) => item.id === selectedId.value);

  if (!channel) {
    return;
  }

  emit('select', channel);
  open.value = false;
}

function chooseAndConfirm(channel: SavedChannel): void {
  if (props.mode === 'add') {
    return;
  }

  choose(channel);
  confirmSelection();
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="modalTitle"
    :description="modalDescription"
    :ui="{ content: 'sm:max-w-lg', footer: 'justify-end' }"
  >
    <template #body>
      <div class="space-y-3">
        <ChannelGroupTabs v-if="groups.length > 0" v-model:active-id="groupId" :groups="groups" :manage="false" />

        <UInput v-model="query" icon="i-lucide-search" autofocus placeholder="Search by name, frequency, or repeater" class="w-full" />

        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Could not load channel library"
          :description="error"
        />

        <div v-if="showLoading" class="space-y-2">
          <USkeleton class="h-14 w-full" />
          <USkeleton class="h-14 w-full" />
          <USkeleton class="h-14 w-full" />
        </div>

        <p v-else-if="libraryEmpty" class="text-sm text-muted">
          The channel library is empty. Save channels from the Radio page, or import a CSV on the Channels page.
        </p>

        <p v-else-if="groupEmpty" class="text-sm text-muted">This group is empty.</p>

        <p v-else-if="noMatches" class="text-sm text-muted">No channels match that search.</p>

        <div
          v-else-if="filteredChannels.length > 0"
          class="max-h-80 space-y-1 overflow-y-auto"
          role="listbox"
          aria-label="Channel library"
          :aria-multiselectable="mode === 'add'"
        >
          <button
            v-for="channel in filteredChannels"
            :key="channel.id"
            type="button"
            role="option"
            class="flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left ring-1 ring-transparent hover:bg-elevated"
            :class="rowSelected(channel) ? 'bg-elevated ring-primary' : ''"
            :aria-selected="rowSelected(channel)"
            @click="onRowClick(channel, $event)"
            @dblclick="chooseAndConfirm(channel)"
          >
            <span class="flex min-w-0 items-center gap-1.5">
              <UIcon
                v-if="mode === 'add'"
                :name="rowSelected(channel) ? 'i-lucide-circle-check' : 'i-lucide-circle'"
                class="size-4 shrink-0"
                :class="rowSelected(channel) ? 'text-primary' : 'text-muted'"
              />
              <UBadge
                v-if="channel.kind === 'repeater'"
                color="primary"
                variant="subtle"
                size="xs"
                icon="i-lucide-radio-tower"
                label="Repeater"
                class="shrink-0"
              />
              <span class="truncate text-sm text-highlighted">{{ channelTitle(channel) }}</span>
            </span>
            <span class="truncate text-xs text-muted tabular-nums">{{ channelDetail(channel) }}</span>
          </button>
        </div>
      </div>
    </template>

    <template #footer="{ close }">
      <UButton color="neutral" variant="outline" label="Cancel" @click="close" />
      <UButton color="primary" :label="confirmLabel" :disabled="!canConfirm" @click="confirmSelection" />
    </template>
  </UModal>
</template>
