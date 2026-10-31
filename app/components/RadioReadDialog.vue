<script setup lang="ts">
import { IMPORT_EXPORT_IDS } from '~/importExport/ids';
import { importExportEntry } from '~/importExport/registry';
import { resolveProgrammingBaudRate } from '~/utils/radio-baud-rate';
import {
  radioTransferDialogTitle,
  radioTransferModalSubtitle,
  resolveRadioTransferTarget,
} from '~/utils/radio-transfer-target';
import { radioDialogMessage } from '~/utils/radio-dialog-message';
import { savedRadioModelLabel } from '~/utils/saved-radios';

const readEntry = importExportEntry(IMPORT_EXPORT_IDS.readFromRadio);

const { readFromRadio, readOpen, configurations, transferInFlight } = useRadio();
const { transferCardId, clearTransfer, cardById } = useRadioBoard();
const { radioById, rememberSavedRadioPort } = useSavedRadios();
const { lockedPorts } = useCatPortLock();
const toast = useToast();

const saved = computed(() =>
  resolveRadioTransferTarget(transferCardId.value, (id) => radioById(id), (id) => cardById(id)),
);
const transferGuest = computed(() => {
  const card = cardById(transferCardId.value);

  return Boolean(card?.guest && !card.savedRadioId);
});

const title = computed(() => radioTransferDialogTitle('read', saved.value?.name));
const subtitle = computed(() => radioTransferModalSubtitle(saved.value, configurations.value));
const config = computed(() => {
  if (!saved.value) {
    return undefined;
  }

  return configurations.value.find((item) => String(item.id.model) === saved.value?.model);
});
const setupAlert = computed(() => radioDialogMessage(config.value, 'read'));

watch(readOpen, (open) => {
  if (!open) {
    clearTransfer();
  }
});

async function importRadio(serialPortPath: string): Promise<void> {
  rememberSavedRadioPort(cardById(transferCardId.value)?.savedRadioId, serialPortPath);

  const radio = saved.value;

  if (!radio) {
    return;
  }

  const config = configurations.value.find((item) => String(item.id.model) === radio.model);

  if (!config) {
    toast.add({
      title: 'Driver not installed',
      description: `Install the ${savedRadioModelLabel(radio, configurations.value)} driver under Preferences → Drivers.`,
      color: 'warning',
      icon: 'i-lucide-triangle-alert',
    });
    return;
  }

  await readFromRadio(
    serialPortPath,
    config.id,
    resolveProgrammingBaudRate(config.serialConfig, radio.baudRate),
  );
}
</script>

<template>
  <RadioPortDialog
    v-model:open="readOpen"
    :title="title"
    :description="subtitle"
    confirm-label="Read"
    :confirm-loading="transferInFlight"
    :confirm-icon="readEntry.icon"
    :default-port="saved?.serialPort"
    :unavailable-ports="lockedPorts"
    :setup-alert="setupAlert"
    @confirm="importRadio"
  >
    <template v-if="transferGuest" #description>
      <span class="inline-flex flex-wrap items-center gap-2">
        <span>{{ subtitle }}</span>
        <UBadge color="neutral" variant="outline" size="sm">Guest</UBadge>
      </span>
    </template>
  </RadioPortDialog>
</template>
