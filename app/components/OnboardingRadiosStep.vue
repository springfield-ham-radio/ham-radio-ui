<script setup lang="ts">
import { SerialPort } from 'tauri-plugin-serialplugin-api';
import { programmingBaudRateSelectItems } from '~/utils/radio-baud-rate';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';
import { radioDisplayName } from '~/utils/radio-module-listing';
import { serialPortSelectItems, type SerialPortOption } from '~/utils/serial-port-list';
import { readSerialPortSettings } from '~/utils/serial-port-settings';
import { draftFromSavedRadio, type SavedRadio, type SavedRadioDraft } from '~/utils/saved-radios';
import {
  onboardingPendingRadioChange,
  onboardingRadioGroups,
  onboardingRadioPicksAfterToggle,
  type OnboardingPendingRadio,
} from '~/utils/onboarding';

const props = defineProps<{
  ownedModuleIds: string[];
  pendingRadios: readonly OnboardingPendingRadio[];
}>();

const emit = defineEmits<{
  'update:picks': [picks: { ownedModuleIds: string[]; pendingRadios: OnboardingPendingRadio[] }];
}>();

const { catalogEntries, catalogFailure, catalogLoading, loadOfficialCatalog, reload } = useRadioModuleCatalog();
const { radios, saveRadio, deleteRadio } = useSavedRadios();
const { configurations, clearCardSession } = useRadio();
const { removeRadioAntennas } = useStationAntennas();
const { cardById, closeCard } = useRadioBoard();
const { disconnect } = useCat();

const ports = ref<SerialPortOption[]>([]);
const loadingPorts = ref(false);
const editorOpen = shallowRef(false);
const editing = shallowRef<SavedRadio | undefined>();
const removeConfirmOpen = shallowRef(false);
const pendingRemove = shallowRef<SavedRadio | undefined>();

const groups = computed(() =>
  onboardingRadioGroups({
    models: catalogEntries.value.map((entry) => ({
      id: entry.id,
      manufacturer: entry.manufacturer,
      name: radioDisplayName(entry.manufacturer, entry.name),
    })),
    ownedModuleIds: props.ownedModuleIds,
    saved: radios.value,
  }),
);

function pendingFor(modelId: string): OnboardingPendingRadio | undefined {
  return props.pendingRadios.find((radio) => radio.modelId === modelId);
}

function portItems(selected: string | undefined): SerialPortOption[] {
  const port = selected?.trim();

  if (!port || ports.value.some((item) => item.value === port)) {
    return ports.value;
  }

  return [{ label: port, value: port }, ...ports.value];
}

function portIsUnplugged(selected: string | undefined): boolean {
  if (ports.value.length === 0) {
    return true;
  }

  const port = selected?.trim();

  return Boolean(port) && !ports.value.some((item) => item.value === port);
}

function baudRatesFor(modelId: string): number[] | undefined {
  const config = configurations.value.find((item) => String(item.id.model) === modelId);

  if (!config) {
    return undefined;
  }

  return programmingBaudRateSelectItems(config.serialConfig).map((item) => item.value);
}

function toggle(id: string, name: string, checked: boolean | 'indeterminate'): void {
  emit(
    'update:picks',
    onboardingRadioPicksAfterToggle({
      ownedModuleIds: props.ownedModuleIds,
      pendingRadios: props.pendingRadios,
      modelId: id,
      modelName: name,
      checked: checked === true,
    }),
  );
}

function patchPending(modelId: string, patch: { name?: string; serialPort?: string }): void {
  emit('update:picks', {
    ownedModuleIds: props.ownedModuleIds,
    pendingRadios: onboardingPendingRadioChange(props.pendingRadios, modelId, patch),
  });
}

function openEdit(savedId: string): void {
  const radio = radios.value.find((entry) => entry.id === savedId);

  if (!radio) {
    return;
  }

  editing.value = radio;
  editorOpen.value = true;
}

function onSave(draft: SavedRadioDraft): void {
  const current = editing.value;

  if (!current || !saveRadio(current.id, draft, baudRatesFor(current.model))) {
    return;
  }

  if (draft.model !== current.model) {
    clearCardSession(current.id);
  }

  editorOpen.value = false;
}

function updateSaved(savedId: string, patch: { name?: string; serialPort?: string }): void {
  const radio = radios.value.find((entry) => entry.id === savedId);

  if (!radio) {
    return;
  }

  const draft = draftFromSavedRadio(radio);

  if (patch.name !== undefined) {
    draft.name = patch.name;
  }

  if (patch.serialPort !== undefined) {
    draft.serialPort = patch.serialPort;
  }

  saveRadio(radio.id, draft, baudRatesFor(radio.model));
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
    ports.value = [];
    return;
  }

  loadingPorts.value = true;

  try {
    const available = await SerialPort.available_ports();
    ports.value = serialPortSelectItems(Object.keys(available), readSerialPortSettings());
  } catch {
    ports.value = [];
  } finally {
    loadingPorts.value = false;
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
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-medium text-highlighted">Which radios do you have?</p>
            <p class="text-xs text-muted">
              Check the models you own. Each radio keeps its own port. The driver step saves it once that driver is
              installed.
            </p>
          </div>
          <UTooltip text="Refresh serial ports">
            <UButton
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="outline"
              size="sm"
              :loading="loadingPorts"
              aria-label="Refresh serial ports"
              @click="loadPorts"
            />
          </UTooltip>
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
                  @update:model-value="toggle(radio.id, radio.name, $event)"
                />
                <div
                  v-if="radio.checked && radio.saved.length === 0"
                  class="mt-2 ml-7 flex flex-wrap items-center gap-2"
                >
                  <UInput
                    :model-value="pendingFor(radio.id)?.name || radio.name"
                    size="sm"
                    class="w-40"
                    aria-label="Radio name"
                    @update:model-value="patchPending(radio.id, { name: String($event ?? '') })"
                  />
                  <USelect
                    :model-value="pendingFor(radio.id)?.serialPort || undefined"
                    :items="portItems(pendingFor(radio.id)?.serialPort)"
                    value-key="value"
                    placeholder="Port"
                    size="sm"
                    class="w-48"
                    aria-label="Serial port"
                    @update:model-value="patchPending(radio.id, { serialPort: String($event ?? '') })"
                  />
                  <span v-if="portIsUnplugged(pendingFor(radio.id)?.serialPort)" class="text-xs text-muted">Unplugged</span>
                </div>
                <div v-for="saved in radio.saved" :key="saved.id" class="mt-2 ml-7 flex flex-wrap items-center gap-2">
                  <UInput
                    :model-value="saved.name"
                    size="sm"
                    class="w-40"
                    aria-label="Radio name"
                    @update:model-value="updateSaved(saved.id, { name: String($event ?? '') })"
                  />
                  <USelect
                    :model-value="saved.serialPort || undefined"
                    :items="portItems(saved.serialPort)"
                    value-key="value"
                    placeholder="Port"
                    size="sm"
                    class="w-48"
                    aria-label="Serial port"
                    @update:model-value="updateSaved(saved.id, { serialPort: String($event ?? '') })"
                  />
                  <span v-if="saved.baudRate !== undefined" class="text-xs text-muted">{{ saved.baudRate }} baud</span>
                  <span v-if="portIsUnplugged(saved.serialPort)" class="text-xs text-muted">Unplugged</span>
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
              </li>
            </ul>
          </li>
        </ul>
        <p v-else class="text-sm text-muted">The official catalog has no radios yet.</p>
      </div>
    </div>

    <SavedRadioEditor v-model:open="editorOpen" :radio="editing" @save="onSave" />

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
