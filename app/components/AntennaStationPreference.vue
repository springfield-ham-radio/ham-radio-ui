<script setup lang="ts">
import {
  formatAntennaBands,
  formatAntennaGeometry,
  type StationAntenna,
} from '~/utils/antenna-station';

const { stationAntennas, addAntenna, saveAntenna, removeAntenna } = useStationAntennas();

const editorOpen = ref(false);
const editing = ref<StationAntenna | undefined>();
const removeConfirmOpen = ref(false);
const pendingRemove = ref<StationAntenna | undefined>();

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
    saveAntenna(editing.value.id, draft);
  } else {
    addAntenna(draft);
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
  <div class="flex flex-col gap-4">
    <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
      <div class="flex flex-col gap-4 px-4 py-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-medium text-highlighted">Antennas</p>
            <p class="text-xs text-muted">
              Generic types at the selected station, with height and heading. Commercial catalogs are not in this cut.
            </p>
          </div>
          <UButton
            icon="i-lucide-plus"
            color="primary"
            size="xs"
            label="Add"
            @click="openCreate"
          />
        </div>

        <ul v-if="stationAntennas.length > 0" class="divide-y divide-default rounded-lg bg-muted">
          <li
            v-for="antenna in stationAntennas"
            :key="antenna.id"
            class="flex items-center gap-3 px-3 py-2.5"
          >
            <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-default ring-1 ring-default">
              <UIcon name="i-lucide-antenna" class="size-4 text-highlighted" />
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
        <p v-else class="text-sm text-muted">No antennas at this station yet. Add a dipole, vertical, or Yagi to use on Propagation.</p>
      </div>
    </div>
  </div>

  <AntennaStationEditor v-model:open="editorOpen" :antenna="editing" @save="onSave" />

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
