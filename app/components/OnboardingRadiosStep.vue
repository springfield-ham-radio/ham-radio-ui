<script setup lang="ts">
import { SerialPort } from 'tauri-plugin-serialplugin-api';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';
import { radioDisplayName } from '~/utils/radio-module-listing';
import { serialPortLabel, serialPortSelectItems } from '~/utils/serial-port-list';
import { readSerialPortSettings } from '~/utils/serial-port-settings';
import type { SavedRadio, SavedRadioDraft } from '~/utils/saved-radios';
import { onboardingRadioGroups, onboardingRadioOwnedIdsAfterToggle, type OnboardingRadioSavedDetail } from '~/utils/onboarding';

const props = defineProps<{
  ownedModuleIds: string[];
}>();

const emit = defineEmits<{
  'update:ownedModuleIds': [ids: string[]];
}>();

const { catalogEntries, catalogFailure, catalogLoading, loadOfficialCatalog, reload } = useRadioModuleCatalog();
const { radios, addRadio, saveRadio, deleteRadio } = useSavedRadios();
const { configurations, clearCardSession } = useRadio();
const { removeRadioAntennas } = useStationAntennas();
const { cardById, closeCard } = useRadioBoard();
const { disconnect } = useCat();

const livePortCount = ref(0);
const editorOpen = shallowRef(false);
const editing = shallowRef<SavedRadio | undefined>();
const naming = shallowRef<{ manufacturer: string; model: string; name: string } | undefined>();
const removeConfirmOpen = shallowRef(false);
const pendingRemove = shallowRef<SavedRadio | undefined>();

const hasPort = computed(
  () => livePortCount.value > 0 || radios.value.some((radio) => radio.serialPort.trim().length > 0),
);
const groups = computed(() =>
  onboardingRadioGroups({
    models: catalogEntries.value.map((entry) => ({
      id: entry.id,
      manufacturer: entry.manufacturer,
      name: radioDisplayName(entry.manufacturer, entry.name),
    })),
    ownedModuleIds: props.ownedModuleIds,
    saved: radios.value,
    installedModelIds: configurations.value.map((config) => String(config.id.model)),
    hasPort: hasPort.value,
  }),
);

function toggle(id: string, checked: boolean | 'indeterminate'): void {
  emit(
    'update:ownedModuleIds',
    onboardingRadioOwnedIdsAfterToggle({
      ownedModuleIds: props.ownedModuleIds,
      modelId: id,
      checked: checked === true,
    }),
  );
}

function detail(radio: OnboardingRadioSavedDetail): string {
  const parts = [radio.name, serialPortLabel(radio.serialPort, readSerialPortSettings().portAliases)];

  if (radio.baudRate !== undefined) {
    parts.push(`${radio.baudRate} baud`);
  }

  return parts.join(' · ');
}

function openName(manufacturer: string, modelId: string, name: string): void {
  editing.value = undefined;
  naming.value = { manufacturer, model: modelId, name };
  editorOpen.value = true;
}

function openEdit(savedId: string): void {
  const radio = radios.value.find((entry) => entry.id === savedId);

  if (!radio) {
    return;
  }

  naming.value = undefined;
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

function requestRemove(savedId: string): void {
  const radio = radios.value.find((entry) => entry.id === savedId);

  if (!radio) {
    return;
  }

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
    removeRadioAntennas(radio.id);
    deleteRadio(radio.id);
  }

  cancelRemove();
}

async function loadPorts(): Promise<void> {
  if (!isTauriRuntime()) {
    livePortCount.value = 0;
    return;
  }

  try {
    const available = await SerialPort.available_ports();
    livePortCount.value = serialPortSelectItems(Object.keys(available), readSerialPortSettings()).length;
  } catch {
    livePortCount.value = 0;
  }
}

onMounted(() => {
  void reload();
  void loadPorts();
});
</script>

<template>
  <div class="mt-4">
    <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
      <div class="flex flex-col gap-4 px-4 py-4">
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">Which radios do you have?</p>
          <p class="text-xs text-muted">Check the models you own so the next step can install their drivers.</p>
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
            <ul class="mt-2 flex flex-col gap-3">
              <li v-for="radio in group.radios" :key="radio.id">
                <UCheckbox
                  :model-value="radio.checked"
                  :label="radio.name"
                  @update:model-value="toggle(radio.id, $event)"
                />
                <div v-for="saved in radio.saved" :key="saved.id" class="mt-1 ml-7 flex items-center gap-2">
                  <p class="min-w-0 flex-1 truncate text-xs text-muted">{{ detail(saved) }}</p>
                  <UButton
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-pencil"
                    size="xs"
                    aria-label="Edit radio"
                    @click="openEdit(saved.id)"
                  />
                  <UButton
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    size="xs"
                    aria-label="Remove radio"
                    @click="requestRemove(saved.id)"
                  />
                </div>
                <UButton
                  v-if="radio.canName"
                  class="mt-1 ml-7"
                  color="neutral"
                  variant="link"
                  size="xs"
                  label="Name it / set port"
                  @click="openName(group.manufacturer, radio.id, radio.name)"
                />
              </li>
            </ul>
          </li>
        </ul>
        <p v-else class="text-sm text-muted">The official catalog has no radios yet.</p>
      </div>
    </div>

    <SavedRadioEditor
      v-model:open="editorOpen"
      :radio="editing"
      :initial-manufacturer="naming?.manufacturer"
      :initial-model="naming?.model"
      :initial-name="naming?.name"
      @save="onSave"
    />

    <UModal
      v-model:open="removeConfirmOpen"
      title="Remove radio?"
      :description="pendingRemove ? `Remove ${pendingRemove.name}? The driver stays installed.` : ''"
      :ui="{ overlay: 'z-50', content: 'z-50', footer: 'justify-end' }"
    >
      <template #footer>
        <UButton color="neutral" variant="outline" label="Cancel" @click="cancelRemove" />
        <UButton color="error" label="Remove" @click="confirmRemove" />
      </template>
    </UModal>
  </div>
</template>
