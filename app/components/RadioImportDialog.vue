<script setup lang="ts">
import { resolveProgrammingBaudRate } from '~/utils/radio-baud-rate';
import { savedRadioModelLabel } from '~/utils/saved-radios';

const { importFromRadio, importOpen, configurations } = useRadio();
const { transferCardId, clearTransfer } = useRadioBoard();
const { radioById } = useSavedRadios();
const { lockedPorts } = useCatPortLock();
const toast = useToast();

const saved = computed(() => radioById(transferCardId.value));

const description = computed(() => {
  if (!saved.value) {
    return 'Choose the serial port for this radio.';
  }

  return `Import memory from ${saved.value.name}. The saved port is selected; pick another if this cable is on a different adapter.`;
});

watch(importOpen, (open) => {
  if (!open) {
    clearTransfer();
  }
});

async function importRadio(serialPortPath: string): Promise<void> {
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

  await importFromRadio(
    serialPortPath,
    config.id,
    resolveProgrammingBaudRate(config.serialConfig, radio.baudRate),
  );
}
</script>

<template>
  <RadioPortDialog
    v-model:open="importOpen"
    title="Import from Radio"
    :description="description"
    confirm-label="Import"
    :default-port="saved?.serialPort"
    :unavailable-ports="lockedPorts"
    @confirm="importRadio"
  />
</template>
