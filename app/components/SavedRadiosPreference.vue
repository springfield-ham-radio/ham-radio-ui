<script setup lang="ts">
import { serialPortLabel } from '~/utils/serial-port-list';
import { savedRadioModelLabel, type SavedRadio, type SavedRadioDraft } from '~/utils/saved-radios';

const { radios, addRadio, saveRadio, deleteRadio } = useSavedRadios();
const { clearCardSession, configurations } = useRadio();
const { cardById, closeCard } = useRadioBoard();
const { disconnect } = useCat();

const editorOpen = shallowRef(false);
const editing = shallowRef<SavedRadio | undefined>();
const removeConfirmOpen = shallowRef(false);
const pendingRemove = shallowRef<SavedRadio | undefined>();

function openCreate(): void {
  editing.value = undefined;
  editorOpen.value = true;
}

function openEdit(radio: SavedRadio): void {
  editing.value = radio;
  editorOpen.value = true;
}

function onSave(draft: SavedRadioDraft): void {
  const current = editing.value;

  if (current) {
    const saved = saveRadio(current.id, draft);

    if (!saved) {
      return;
    }

    if (saved.model !== current.model) {
      clearCardSession(saved.id);
    }
  } else if (!addRadio(draft)) {
    return;
  }

  editorOpen.value = false;
}

function requestRemove(radio: SavedRadio): void {
  pendingRemove.value = radio;
  removeConfirmOpen.value = true;
}

function cancelRemove(): void {
  removeConfirmOpen.value = false;
  pendingRemove.value = undefined;
}

async function confirmRemove(): Promise<void> {
  const radio = pendingRemove.value;

  if (radio) {
    const port = cardById(radio.id)?.catPort;

    if (port) {
      await disconnect(port);
    }

    clearCardSession(radio.id);
    closeCard(radio.id);
    deleteRadio(radio.id);
  }

  cancelRemove();
}

function radioDetail(radio: SavedRadio): string {
  const parts = [savedRadioModelLabel(radio, configurations.value), serialPortLabel(radio.serialPort)];

  if (radio.baudRate !== undefined) {
    parts.splice(1, 0, `${radio.baudRate} baud`);
  }

  return parts.join(' · ');
}
</script>

<template>
  <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
    <div class="flex flex-col gap-4 px-4 py-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">Your radios</p>
          <p class="text-xs text-muted">
            Name each radio, then choose its manufacturer, model, baud rate when the driver lists more than one, and
            the serial port you usually use. The Radio page opens these as cards.
          </p>
        </div>
        <UButton
          icon="i-lucide-plus"
          color="primary"
          size="xs"
          label="Add radio"
          @click="openCreate"
        />
      </div>

      <ul v-if="radios.length > 0" class="divide-y divide-default rounded-lg bg-muted">
        <li
          v-for="radio in radios"
          :key="radio.id"
          class="flex items-center gap-3 px-3 py-2.5"
        >
          <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-default ring-1 ring-default">
            <UIcon name="i-lucide-radio" class="size-4 text-highlighted" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-highlighted">{{ radio.name }}</p>
            <p class="truncate text-xs text-muted">{{ radioDetail(radio) }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-pencil"
              size="xs"
              aria-label="Edit radio"
              @click="openEdit(radio)"
            />
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-trash-2"
              size="xs"
              aria-label="Remove radio"
              @click="requestRemove(radio)"
            />
          </div>
        </li>
      </ul>
      <p v-else class="text-sm text-muted">No radios yet. Add one for each radio you keep plugged in.</p>
    </div>
  </div>

  <SavedRadioEditor v-model:open="editorOpen" :radio="editing" @save="onSave" />

  <UModal
    v-model:open="removeConfirmOpen"
    title="Remove radio?"
    :description="pendingRemove ? `Remove ${pendingRemove.name} from your radios? An open card for it will close. The driver stays installed.` : ''"
    :ui="{ footer: 'justify-end' }"
  >
    <template #footer>
      <UButton color="neutral" variant="outline" label="Cancel" @click="cancelRemove" />
      <UButton color="error" label="Remove" @click="confirmRemove" />
    </template>
  </UModal>
</template>
