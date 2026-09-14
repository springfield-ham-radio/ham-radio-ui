<script setup lang="ts">
import { formatStationLocation, type RadioStation } from '~/utils/antenna-station';

const {
  stations,
  canRemoveStation,
  addStation,
  saveStation,
  removeStation,
} = useStationAntennas();

const editorOpen = ref(false);
const editing = ref<RadioStation | undefined>();
const removeConfirmOpen = ref(false);
const pendingRemove = ref<RadioStation | undefined>();

function openCreate(): void {
  editing.value = undefined;
  editorOpen.value = true;
}

function openEdit(station: RadioStation): void {
  editing.value = station;
  editorOpen.value = true;
}

function onSave(draft: Parameters<typeof addStation>[0]): void {
  const current = editing.value;

  if (current) {
    saveStation(current.id, draft);
  } else {
    addStation(draft);
  }

  editorOpen.value = false;
  editing.value = undefined;
}

function requestRemove(station: RadioStation): void {
  pendingRemove.value = station;
  removeConfirmOpen.value = true;
}

function cancelRemove(): void {
  removeConfirmOpen.value = false;
  pendingRemove.value = undefined;
}

function confirmRemove(): void {
  const station = pendingRemove.value;

  if (station) {
    removeStation(station.id);
  }

  cancelRemove();
}
</script>

<template>
  <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
    <div class="flex flex-col gap-4 px-4 py-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">Stations</p>
          <p class="text-xs text-muted">
            Sites you operate from, with the antennas installed at each one. Grid and coordinates are editable; a license grid only fills Home when it is empty.
          </p>
        </div>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          size="xs"
          label="Add station"
          @click="openCreate"
        />
      </div>

      <ul class="divide-y divide-default rounded-lg bg-muted">
        <li
          v-for="station in stations"
          :key="station.id"
          class="flex flex-col gap-2 px-3 py-2.5"
        >
          <div class="flex items-center gap-3">
            <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-default ring-1 ring-default">
              <UIcon name="i-lucide-map-pin" class="size-4 text-highlighted" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-highlighted">{{ station.nickname }}</p>
              <p class="truncate text-xs text-muted">{{ formatStationLocation(station) }}</p>
            </div>
            <div class="flex shrink-0 items-center gap-1">
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-pencil"
                size="xs"
                aria-label="Edit station"
                @click="openEdit(station)"
              />
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-trash-2"
                size="xs"
                aria-label="Remove station"
                :disabled="!canRemoveStation"
                @click="requestRemove(station)"
              />
            </div>
          </div>
          <AntennaStationPreference :station-id="station.id" />
        </li>
      </ul>
    </div>
  </div>

  <RadioStationEditor v-model:open="editorOpen" :station="editing" @save="onSave" />

  <UModal v-model:open="removeConfirmOpen" :ui="{ content: 'sm:max-w-md' }">
    <template #content>
      <div class="flex flex-col gap-4 p-5">
        <div>
          <h2 class="text-lg font-semibold text-highlighted">Remove station?</h2>
          <p class="mt-2 text-sm text-muted">
            {{
              pendingRemove
                ? `Remove ${pendingRemove.nickname} and the antennas assigned to it?`
                : ''
            }}
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
