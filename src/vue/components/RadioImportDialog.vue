<template>
  <Dialog v-model:visible="showDialog" modal :style="{ width: '600px' }" header="Import from Radio">
    <div class="mb-8">
      Plug the programming cable for your radio into your computer. Select the serial port, then plug the programming cable into your radio.
    </div>
    <div class="flex flex-col gap-3">
      <RadioSelector v-model="selectedRadio" />
      <SerialPortSelector v-model="selectedPort" />
    </div>

    <template #footer>
      <div class="flex gap-2 justify-content-end">
        <Button label="Cancel" @click="showDialog = false" />
        <Button label="Import" :disabled="!complete" @click="importFromRadio" />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import RadioSelector from './RadioSelector.vue';
import SerialPortSelector from './SerialPortSelector.vue';
import { Button, Dialog } from 'primevue';
import { RadioConnection, RadioModel } from '@springfield/ham-radio-api';
import { PortInfo } from "@serialport/bindings-interface";

const selectedRadio = ref<RadioModel>();
const selectedPort = ref<PortInfo>();

const showDialog = ref(false);

const complete = computed(() => {
  return selectedRadio.value !== undefined && selectedPort.value !== undefined;
});

const importFromRadio = () => {
  showDialog.value = false;
  const connection: RadioConnection = {
    serialPortPath: selectedPort.value.path,
    model: { ...selectedRadio.value },
  };

  window.radio.importFromRadio(connection);
}

onMounted(() => {
  // Listen for menu trigger
  window.radio.onShowImportDialog(() => {
    showDialog.value = true;
  });
});
</script>
