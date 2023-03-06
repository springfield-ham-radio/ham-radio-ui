<template>
  <q-btn round color="primary" icon="input" @click="showDialog = true">
    <q-tooltip>
      Import from radio
    </q-tooltip>
  </q-btn>

  <q-dialog v-model="showDialog">
    <q-card style="width: 500px">
      <q-card-section>
        Plug the programming cable for your radio into your computer.  Select the serial port, then plug the programming cable into your radio.
      </q-card-section>
      <q-card-section class="col items-center">
        <radio-selector @radio-manufacturer-selected="updateRadioManufacturer" @radio-model-selected="updateRadioModel"/>
        <serial-port-selector @port-selected="updateSerialPort"/>
      </q-card-section>

      <q-card-actions class="row justify-between">
        <q-btn label="Cancel" v-close-popup />
        <q-btn label="Import" color="primary" :disable="!complete" @click="importFromRadio" v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import RadioSelector from './RadioSelector.vue';
import SerialPortSelector from './SerialPortSelector.vue';
import { RadioConnection } from '@springfield/ham-radio-api';

const emit = defineEmits(['importFromRadio']);

const showDialog = ref(false);
const radioConnection = ref<RadioConnection>({ serialPortPath: '', manufacturerId: '', model: ''});

const complete = computed(() => {
  return radioConnection.value.manufacturerId.length > 0 && radioConnection.value.model.length > 0 && radioConnection.value.serialPortPath.length > 0;
});
async function updateSerialPort(path: string) {
  radioConnection.value.serialPortPath = path;
  await window.serialport.reset(path);
};

function updateRadioManufacturer(manufacturerId: string) {
  radioConnection.value.manufacturerId = manufacturerId;
};

function updateRadioModel(model: string) {
  radioConnection.value.model = model;
};

function importFromRadio() {
  emit('importFromRadio', radioConnection.value);
}

</script>
