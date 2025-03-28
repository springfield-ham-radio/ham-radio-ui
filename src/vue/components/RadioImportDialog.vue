<template>
  <Button icon="pi pi-upload" rounded @click="showDialog = true" v-tooltip="'Import from radio'" />

  <Dialog v-model:visible="showDialog" modal :style="{ width: '500px' }" header="Import from Radio">
    <div class="mb-4">
      Plug the programming cable for your radio into your computer. Select the serial port, then plug the programming cable into your radio.
    </div>
    <div class="flex flex-column gap-3">
      <RadioSelector v-model="selectedRadio" />
      <SerialPortSelector v-model="selectedPort" />
    </div>

    <template #footer>
      <div class="flex justify-content-end gap-2">
        <Button label="Cancel" @click="showDialog = false" />
        <Button label="Import" :disabled="!complete" @click="showDialog = false" />
      </div>
    </template>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import RadioSelector from './RadioSelector.vue';
import SerialPortSelector from './SerialPortSelector.vue';
import { Button, Dialog } from 'primevue';
import { RadioModel, RadioConnection } from '@springfield/ham-radio-api';
import { PortInfo } from "@serialport/bindings-interface";

const model = defineModel<RadioConnection>();
const selectedRadio = ref<RadioModel>();
const selectedPort = ref<PortInfo>();

const showDialog = ref(false);

const complete = computed(() => {
  return selectedRadio.value !== undefined && selectedPort.value !== undefined;
});

watch(selectedRadio, (newVal) => {
  if (newVal) {
    model.value.modelId = newVal.id;
  }
});

watch(selectedPort, (newVal) => {
  if (newVal) {
    model.value.serialPortPath = newVal.path;
  }
});
</script>
