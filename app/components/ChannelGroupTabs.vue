<script setup lang="ts">
import type { TabsItem } from '@nuxt/ui';
import { ALL_CHANNELS_TAB_ID, type ChannelGroup } from '~/utils/channel-groups';
import { isChannelPackSourceUrl } from '~/utils/channel-pack-fetch';

const props = withDefaults(
  defineProps<{
    groups: ChannelGroup[];
    /** Show rename and remove. The picker lists groups without those actions. */
    manage?: boolean;
  }>(),
  { manage: true },
);

const activeId = defineModel<string>('activeId', { required: true });

const emit = defineEmits<{
  rename: [];
  remove: [];
  checkUpdates: [];
}>();

const activeGroup = computed(() => props.groups.find((group) => group.id === activeId.value));
const canEditGroup = computed(() => Boolean(activeGroup.value) && activeGroup.value?.builtin !== true);
const canCheckPackUpdates = computed(
  () => props.manage && canEditGroup.value && isChannelPackSourceUrl(activeGroup.value?.packSourceUrl),
);

const items = computed<TabsItem[]>(() => [
  { label: 'All', value: ALL_CHANNELS_TAB_ID, icon: 'i-lucide-library' },
  ...props.groups.map((group) => ({
    label: group.name,
    value: group.id,
    icon: group.icon ?? 'i-lucide-folder',
  })),
]);
</script>

<template>
  <div class="flex min-w-0 items-center gap-1.5">
    <UTabs
      v-model="activeId"
      :items="items"
      :content="false"
      color="primary"
      variant="link"
      size="sm"
      class="min-w-0"
      :ui="{
        list: 'overflow-x-auto',
        trigger: 'shrink-0 data-[state=inactive]:text-muted data-[state=active]:text-primary',
        leadingIcon: 'text-current',
        indicator: 'bg-primary bottom-0 h-0.5 rounded-full',
      }"
    />
    <UTooltip v-if="canCheckPackUpdates" text="Download the pack from this group’s source URL and compare versions">
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        size="sm"
        label="Check for updates"
        @click="emit('checkUpdates')"
      />
    </UTooltip>
    <UTooltip v-if="manage && canEditGroup" text="Rename this group">
      <UButton
        icon="i-lucide-folder-pen"
        color="neutral"
        variant="outline"
        size="sm"
        label="Rename"
        @click="emit('rename')"
      />
    </UTooltip>
    <UTooltip v-if="manage && canEditGroup" text="Remove this group. Channels stay in All.">
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
