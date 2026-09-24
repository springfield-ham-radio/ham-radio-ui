<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import { ALL_CHANNELS_TAB_ID, type ChannelGroup } from '~/utils/channel-groups';

const props = defineProps<{
  groups: ChannelGroup[];
}>();

const activeId = defineModel<string>('activeId', { required: true });

const emit = defineEmits<{
  createEmpty: [];
  rename: [];
  remove: [];
}>();

const canRemove = computed(() => activeId.value !== ALL_CHANNELS_TAB_ID);

const items = computed<TabsItem[]>(() => [
  { label: 'All', value: ALL_CHANNELS_TAB_ID, icon: 'i-lucide-library' },
  ...props.groups.map((group) => ({
    label: group.name,
    value: group.id,
    icon: 'i-lucide-folder',
  })),
]);
</script>

<template>
  <div class="flex min-w-0 items-center gap-1.5">
    <UTabs
      v-model="activeId"
      :items="items"
      :content="false"
      color="neutral"
      variant="link"
      size="sm"
      class="min-w-0"
      :ui="{ list: 'overflow-x-auto', trigger: 'shrink-0' }"
    />
    <UTooltip text="Create an empty group, then import a CSV">
      <UButton
        icon="i-lucide-folder-plus"
        color="neutral"
        variant="outline"
        size="sm"
        label="Empty group"
        @click="emit('createEmpty')"
      />
    </UTooltip>
    <UTooltip v-if="canRemove" text="Rename this group">
      <UButton
        icon="i-lucide-folder-pen"
        color="neutral"
        variant="outline"
        size="sm"
        label="Rename"
        @click="emit('rename')"
      />
    </UTooltip>
    <UTooltip v-if="canRemove" text="Remove this group. Channels stay in All.">
      <UButton
        icon="i-lucide-folder-minus"
        color="error"
        variant="outline"
        size="sm"
        label="Remove group"
        @click="emit('remove')"
      />
    </UTooltip>
  </div>
</template>
