<script setup lang="ts">
import {
  formatAntennaBands,
  formatAntennaGeometry,
  type StationAntenna,
} from '~/utils/antenna-station';

const props = defineProps<{
  stationId: string;
}>();

const { antennas, addAntenna, saveAntenna, removeAntenna } = useStationAntennas();

const editorOpen = ref(false);
const editing = ref<StationAntenna | undefined>();
const removeConfirmOpen = ref(false);
const pendingRemove = ref<StationAntenna | undefined>();

const stationAntennas = computed(() =>
  antennas.value.filter((antenna) => antenna.stationId === props.stationId),
);

function openCreate(): void {
  editing.value = undefined;
  editorOpen.value = true;
}

function openEdit(antenna: StationAntenna): void {
  editing.value = antenna;
  editorOpen.value = true;
}

function onSave(draft: Parameters<typeof addAntenna>[0]): void {
  if (editing.value) {
    saveAntenna(editing.value.id, { ...draft, stationId: draft.stationId ?? props.stationId });
  } else {
    addAntenna({ ...draft, stationId: draft.stationId ?? props.stationId });
  }

  editorOpen.value = false;
  editing.value = undefined;
}

function requestRemove(antenna: StationAntenna): void {
  pendingRemove.value = antenna;
  removeConfirmOpen.value = true;
}

function cancelRemove(): void {
  removeConfirmOpen.value = false;
  pendingRemove.value = undefined;
}

function confirmRemove(): void {
  const antenna = pendingRemove.value;

  if (antenna) {
    removeAntenna(antenna.id);
  }

  cancelRemove();
}
</script>

<template>
  <div class="ml-12 flex flex-col gap-2">
    <ul v-if="stationAntennas.length > 0" class="divide-y divide-default overflow-hidden rounded-lg bg-default ring-1 ring-default">
      <li
        v-for="antenna in stationAntennas"
        :key="antenna.id"
        class="flex items-center gap-3 px-3 py-2"
      >
        <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted ring-1 ring-default">
          <UIcon name="i-lucide-antenna" class="size-3.5 text-highlighted" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-highlighted">{{ antenna.nickname }}</p>
          <p class="truncate text-xs text-muted">{{ formatAntennaGeometry(antenna) }}</p>
          <p class="truncate text-xs text-muted">{{ formatAntennaBands(antenna.bands, antenna.trapped === true) }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-pencil"
            size="xs"
            aria-label="Edit antenna"
            @click="openEdit(antenna)"
          />
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-trash-2"
            size="xs"
            aria-label="Remove antenna"
            @click="requestRemove(antenna)"
          />
        </div>
      </li>
    </ul>
    <p v-else class="text-xs text-muted">No antennas at this site yet.</p>
    <div>
      <UButton
        icon="i-lucide-plus"
        color="neutral"
        variant="ghost"
        size="xs"
        label="Add antenna"
        @click="openCreate"
      />
    </div>
  </div>

  <AntennaStationEditor
    v-model:open="editorOpen"
    :antenna="editing"
    :station-id="stationId"
    @save="onSave"
  />

  <UModal v-model:open="removeConfirmOpen" :ui="{ content: 'sm:max-w-md' }">
    <template #content>
      <div class="flex flex-col gap-4 p-5">
        <div>
          <h2 class="text-lg font-semibold text-highlighted">Remove antenna?</h2>
          <p class="mt-2 text-sm text-muted">
            {{ pendingRemove ? `Remove ${pendingRemove.nickname} from this station?` : '' }}
          </p>
        </div>
        <div class="flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="cancelRemove" />
          <UButton label="Remove" color="error" @click="confirmRemove" />
        </div>
      </div>
    </template>
  </UModal>
</template>
