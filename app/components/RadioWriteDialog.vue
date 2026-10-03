<script setup lang="ts">
import { resolveProgrammingBaudRate } from '~/utils/radio-baud-rate';
import { readRadioImageBackupSettings } from '~/utils/radio-image-backup';
import { isTauriRuntime } from '~/utils/radio-memory-file-io';
import { savedRadioModelLabel } from '~/utils/saved-radios';

const { configurations, writeOpen, writeToRadio } = useRadio();
const { transferCardId, clearTransfer, cardById } = useRadioBoard();
const { radioById } = useSavedRadios();
const { lockedPorts } = useCatPortLock();
const toast = useToast();

const saved = computed(() => radioById(transferCardId.value) ?? cardById(transferCardId.value)?.guest);
const config = computed(() => {
  if (!saved.value) {
    return undefined;
  }

  return configurations.value.find((item) => String(item.id.model) === saved.value?.model);
});

const description = computed(() => {
  if (!saved.value) {
    return 'Choose the serial port for this radio.';
  }

  return `Write the loaded memory to ${saved.value.name}. The saved port is selected; pick another if this cable is on a different adapter.`;
});

const backupsEnabled = ref(false);

const warningDescription = computed(() => {
  const base = "The loaded memory image will overwrite what is currently stored in the radio.";

  if (!backupsEnabled.value) {
    return base;
  }

  return `${base} HamBench saves a backup of the radio's current image first.`;
});

watch(writeOpen, (open) => {
  if (open) {
    backupsEnabled.value = readRadioImageBackupSettings().enabled && isTauriRuntime();
  }

  if (!open) {
    clearTransfer();
  }
});

async function writeRadio(serialPortPath: string): Promise<void> {
  const radio = saved.value;
  const selected = config.value;

  if (!radio || !selected) {
    toast.add({
      title: 'Driver not installed',
      description: radio
        ? `Install the ${savedRadioModelLabel(radio, configurations.value)} driver under Preferences → Drivers.`
        : 'Open a radio card before writing.',
      color: 'warning',
      icon: 'i-lucide-triangle-alert',
    });
    return;
  }

  await writeToRadio(serialPortPath, resolveProgrammingBaudRate(selected.serialConfig, radio.baudRate));
}
</script>

<template>
  <RadioPortDialog
    v-model:open="writeOpen"
    title="Write to Radio"
    :description="description"
    confirm-label="Write"
    confirm-color="warning"
    confirm-icon="i-hambench-radio-write"
    warning-title="This replaces the radio's memory"
    :warning-description="warningDescription"
    :default-port="saved?.serialPort"
    :unavailable-ports="lockedPorts"
    @confirm="writeRadio"
  />
</template>
