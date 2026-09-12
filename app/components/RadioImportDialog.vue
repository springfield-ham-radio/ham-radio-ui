<script setup lang="ts">
import type { RadioConnectionSelection } from '~/composables/useRadioConnectionForm';

const { importFromRadio, importOpen } = useRadio();
const { lockedPorts } = useCatPortLock();

async function importRadio(selection: RadioConnectionSelection): Promise<void> {
  await importFromRadio(selection.serialPortPath, selection.radioId, selection.baudRate);
}
</script>

<template>
  <RadioConnectionDialog
    v-model:open="importOpen"
    title="Import from Radio"
    description="Plug the programming cable into the computer, choose the serial port, then plug the cable into the radio."
    confirm-label="Import"
    :unavailable-ports="lockedPorts"
    @confirm="importRadio"
  />
</template>
