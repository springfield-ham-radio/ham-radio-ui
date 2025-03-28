<template>
  <Button icon="pi pi-upload" rounded @click="showDialog = true" v-tooltip="'Import from radio'" />

  <Dialog v-model:visible="showDialog" modal :style="{ width: '500px' }" header="Import from Radio">
    <div class="mb-4">
      Plug the programming cable for your radio into your computer. Select the serial port, then plug the programming cable into your radio.
    </div>
    <div class="flex flex-column gap-3">
      <RadioSelector @radio-manufacturer-selected="updateRadioManufacturer" @radio-model-selected="updateRadioModel"/>
      <SerialPortSelector @port-selected="updateSerialPort"/>
    </div>

    <template #footer>
      <div class="flex justify-content-end gap-2">
        <Button label="Cancel" @click="showDialog = false" />
        <Button label="Import" :disabled="!complete" @click="importFromRadio" />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import RadioSelector from './RadioSelector.vue';
import SerialPortSelector from './SerialPortSelector.vue';
import { Button, Dialog } from 'primevue';

interface RadioConnection {
  serialPortPath: string;
  modelId: string;
}

const emit = defineEmits(['importFromRadio']);

const showDialog = ref(false);
const radioConnection = ref<RadioConnection>({ serialPortPath: '', modelId: ''});

const complete = computed(() => {
  return radioConnection.value.modelId.length > 0 && radioConnection.value.serialPortPath.length > 0;
});

async function updateSerialPort(path: string) {
  radioConnection.value.serialPortPath = path;
  await window.electron.serialPort.reset(path);
}

function updateRadioManufacturer(manufacturerId: string) {
  // No-op as we don't need to store manufacturer
}

function updateRadioModel(modelId: string) {
  radioConnection.value.modelId = modelId;
}

function importFromRadio() {
  emit('importFromRadio', radioConnection.value);
  showDialog.value = false;
}
</script>
