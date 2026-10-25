<script setup lang="ts">
import { SerialPort } from 'tauri-plugin-serialplugin-api';
import { defaultProgrammingBaudRate, programmingBaudRateSelectItems } from '~/utils/radio-baud-rate';
import { installOfficialModule } from '~/utils/radio-module-install';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';
import { radioDisplayName } from '~/utils/radio-module-listing';
import { serialPortSelectItems, type SerialPortOption } from '~/utils/serial-port-list';
import { readSerialPortSettings } from '~/utils/serial-port-settings';
import { draftFromSavedRadio, type SavedRadio, type SavedRadioDraft } from '~/utils/saved-radios';
import {
  onboardingPendingRadioChange,
  onboardingRadioGroups,
  onboardingRadioPicksAfterToggle,
  planOnboardingDriverInstalls,
  planOnboardingSavedRadios,
  type OnboardingPendingRadio,
} from '~/utils/onboarding';

const props = defineProps<{
  ownedModuleIds: string[];
  pendingRadios: readonly OnboardingPendingRadio[];
}>();

const emit = defineEmits<{
  'update:picks': [picks: { ownedModuleIds: string[]; pendingRadios: OnboardingPendingRadio[] }];
  'update:installing': [installing: boolean];
}>();

interface DriverRowState {
  status: 'installing' | 'installed' | 'failed';
  message?: string;
}

const { catalogEntries, catalogFailure, catalogLoading, loadOfficialCatalog, reload } = useRadioModuleCatalog();
const { radios, addRadio, saveRadio, deleteRadio } = useSavedRadios();
const { configurations, clearCardSession, refreshCatalogState } = useRadio();
const { removeRadioAntennas } = useStationAntennas();
const { cardById, closeCard } = useRadioBoard();
const { disconnect } = useCat();

const ports = ref<SerialPortOption[]>([]);
const loadingPorts = ref(false);
const installing = ref(false);
const rowStatus = ref<Record<string, DriverRowState>>({});
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

function setRow(modelId: string, status: DriverRowState['status'], message?: string): void {
  const next: DriverRowState = { status };

  if (message) {
    next.message = message;
  }

  rowStatus.value = { ...rowStatus.value, [modelId]: next };
}

function driverInstalled(modelId: string): boolean {
  return configurations.value.some((config) => String(config.id.model) === modelId)
    || rowStatus.value[modelId]?.status === 'installed';
}

function rowState(modelId: string): DriverRowState | undefined {
  return rowStatus.value[modelId];
}

function saveInstalledRadio(modelId: string): void {
  const models = configurations.value
    .filter((config) => String(config.id.model) === modelId)
    .map((config) => ({
      id: String(config.id.model),
      manufacturer: String(config.id.manufacturer),
      displayName: radioDisplayName(String(config.id.manufacturer), config.id.name),
      baudRate: defaultProgrammingBaudRate(config.serialConfig),
      baudRates: programmingBaudRateSelectItems(config.serialConfig).map((item) => item.value),
    }));
  const { drafts } = planOnboardingSavedRadios({
    pending: props.pendingRadios.filter((radio) => radio.modelId === modelId),
    models,
    existing: radios.value.map((radio) => ({ name: radio.name, model: radio.model })),
  });
  const created: string[] = [];

  for (const draft of drafts) {
    const model = models.find((entry) => entry.id === draft.model);

    if (addRadio(draft, model?.baudRates)) {
      created.push(draft.model);
    }
  }

  if (created.length === 0) {
    return;
  }

  emit('update:picks', {
    ownedModuleIds: props.ownedModuleIds,
    pendingRadios: props.pendingRadios.filter((radio) => !created.includes(radio.modelId)),
  });
}

async function installModels(modelIds: readonly string[]): Promise<boolean> {
  if (!isTauriRuntime()) {
    for (const modelId of modelIds) {
      setRow(modelId, 'failed', 'Installing radio modules requires the Tauri desktop app.');
    }

    return false;
  }

  let ok = true;

  for (const modelId of modelIds) {
    const entry = catalogEntries.value.find((item) => item.id === modelId);

    if (!entry) {
      setRow(modelId, 'failed', 'This model is not in the official catalog.');
      ok = false;
      continue;
    }

    setRow(modelId, 'installing');

    try {
      await installOfficialModule(entry);
      await refreshCatalogState();
      saveInstalledRadio(modelId);
      setRow(modelId, 'installed');
    } catch (cause) {
      ok = false;
      setRow(modelId, 'failed', cause instanceof Error ? cause.message : 'Install failed');
    }
  }

  return ok;
}

async function continueRadios(): Promise<boolean> {
  if (installing.value) {
    return false;
  }

  installing.value = true;

  try {
    if (catalogLoading.value || (catalogEntries.value.length === 0 && !catalogFailure.value)) {
      await reload();
    }

    const plan = planOnboardingDriverInstalls({
      modelIds: props.ownedModuleIds,
      installedModelIds: configurations.value.map((config) => String(config.id.model)),
      catalogModelIds: catalogEntries.value.map((entry) => entry.id),
    });

    if (catalogFailure.value && (plan.install.length > 0 || plan.missing.length > 0)) {
      return false;
    }

    for (const modelId of plan.missing) {
      setRow(modelId, 'failed', 'This model is not in the official catalog.');
    }

    const installed = plan.install.length === 0 ? true : await installModels(plan.install);

    return installed && plan.missing.length === 0;
  } finally {
    installing.value = false;
  }
}

async function retryInstall(modelId: string): Promise<void> {
  if (installing.value) {
    return;
  }

  installing.value = true;

  try {
    if (catalogFailure.value) {
      await loadOfficialCatalog();
    }

    if (catalogFailure.value) {
      return;
    }

    await installModels([modelId]);
  } finally {
    installing.value = false;
  }
}

watch(installing, (value) => {
  emit('update:installing', value);
});

onMounted(() => {
  void reload();
  void loadPorts();
});

defineExpose({ continueRadios });
</script>

<template>
  <div class="mt-4">
    <div class="overflow-hidden rounded-xl bg-default shadow-sm ring-1 ring-default">
      <div class="flex flex-col gap-4 px-4 py-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-medium text-highlighted">Which radios do you have?</p>
            <p class="text-xs text-muted">
              Check the models you own. Each radio keeps its own port. Continue installs the driver for each checked
              radio and saves it when that driver finishes.
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

        <UAlert
          v-if="catalogFailure"
          color="warning"
          variant="subtle"
          icon="i-lucide-wifi-off"
          :title="catalogFailure.title"
          :description="`${catalogFailure.detail} ${catalogFailure.guidance}`"
        >
          <template #actions>
            <UButton size="xs" color="neutral" variant="outline" label="Retry" @click="loadOfficialCatalog" />
          </template>
        </UAlert>

        <div v-if="catalogLoading && catalogEntries.length === 0" class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          Loading official catalog…
        </div>

        <ul v-else-if="groups.length > 0" class="divide-y divide-default rounded-lg bg-muted">
          <li v-for="group in groups" :key="group.manufacturer" class="px-3 py-2.5">
            <p class="truncate text-sm font-medium text-highlighted">{{ group.manufacturer }}</p>
            <ul class="mt-2 flex flex-col gap-3">
              <li v-for="radio in group.radios" :key="radio.id">
                <div class="flex flex-wrap items-center gap-2">
                  <UCheckbox
                    :model-value="radio.checked"
                    :label="radio.name"
                    :disabled="installing"
                    @update:model-value="toggle(radio.id, radio.name, $event)"
                  />
                  <UBadge
                    v-if="driverInstalled(radio.id)"
                    label="Installed"
                    color="success"
                    variant="subtle"
                    size="sm"
                  />
                  <span
                    v-else-if="radio.checked && rowState(radio.id)?.status === 'installing'"
                    class="inline-flex items-center gap-1 text-xs text-muted"
                  >
                    <UIcon name="i-lucide-loader-circle" class="size-3.5 animate-spin" />
                    Installing
                  </span>
                  <span
                    v-else-if="radio.checked && rowState(radio.id)?.status === 'failed'"
                    class="inline-flex flex-wrap items-center gap-2"
                  >
                    <span class="text-xs text-error">{{ rowState(radio.id)?.message }}</span>
                    <UButton
                      label="Retry"
                      color="neutral"
                      variant="outline"
                      size="xs"
                      :disabled="installing"
                      @click="retryInstall(radio.id)"
                    />
                  </span>
                </div>
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
        <p v-else-if="!catalogFailure" class="text-sm text-muted">The official catalog has no radios yet.</p>
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
