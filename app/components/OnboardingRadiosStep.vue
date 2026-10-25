<script setup lang="ts">
import { groupCatalogRadiosByManufacturer } from '~/utils/radio-module-listing';

const props = defineProps<{
  ownedModuleIds: string[];
  savedRadioCount: number;
}>();

const emit = defineEmits<{
  'update:ownedModuleIds': [ids: string[]];
}>();

const { catalogEntries, catalogFailure, catalogLoading, loadOfficialCatalog, reload } = useRadioModuleCatalog();

const groups = computed(() => groupCatalogRadiosByManufacturer(catalogEntries.value));
const owned = computed(() => new Set(props.ownedModuleIds));

function toggle(id: string, checked: boolean | 'indeterminate'): void {
  const next = new Set(props.ownedModuleIds);

  if (checked === true) {
    next.add(id);
  } else {
    next.delete(id);
  }

  emit('update:ownedModuleIds', [...next]);
}

onMounted(() => {
  void reload();
});
</script>

<template>
  <div class="mt-4 flex flex-col gap-4">
    <SavedRadiosPreference v-if="savedRadioCount > 0" />

    <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
      <div class="flex flex-col gap-4 px-4 py-4">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">Radios you own</p>
          <p class="text-xs text-muted">
            Check each model. The next step installs its driver. A radio already saved under Preferences counts, and
            skip does not remove it. Adding a new saved radio waits until its driver and a programming port exist.
          </p>
        </div>

        <div v-if="catalogLoading && catalogEntries.length === 0" class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          Loading official catalog…
        </div>

        <div v-else-if="catalogFailure" class="rounded-lg bg-muted px-3 py-3 text-sm">
          <p class="font-medium text-highlighted">{{ catalogFailure.title }}</p>
          <p class="mt-1 text-muted">{{ catalogFailure.detail }}</p>
          <p class="mt-2 text-muted">{{ catalogFailure.guidance }}</p>
          <UButton class="mt-3" size="sm" color="neutral" variant="outline" label="Retry" @click="loadOfficialCatalog" />
        </div>

        <ul v-else-if="groups.length > 0" class="divide-y divide-default rounded-lg bg-muted">
          <li v-for="group in groups" :key="group.manufacturer" class="px-3 py-2.5">
            <p class="truncate text-sm font-medium text-highlighted">{{ group.manufacturer }}</p>
            <ul class="mt-2 flex flex-col gap-2">
              <li v-for="radio in group.radios" :key="radio.id">
                <UCheckbox
                  :model-value="owned.has(radio.id)"
                  :label="radio.name"
                  :description="radio.id"
                  @update:model-value="toggle(radio.id, $event)"
                />
              </li>
            </ul>
          </li>
        </ul>
        <p v-else class="text-sm text-muted">The official catalog has no radios yet.</p>
      </div>
    </div>
  </div>
</template>
