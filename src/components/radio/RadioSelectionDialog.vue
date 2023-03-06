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

      <q-card-actions align="right">
        <q-btn flat label="Cancel" color="primary" v-close-popup />
        <q-btn flat label="Import" color="primary" @click="importFromRadio" v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import RadioSelector from './RadioSelector.vue';
import SerialPortSelector from './SerialPortSelector.vue';
import { RadioConnection } from '@springfield/ham-radio-api';

const emit = defineEmits(['radioSelected']);

const showDialog = ref(false);
const radioConnection = ref<RadioConnection>({ serialPortPath: '', manufacturerId: '', model: 'UNKNOWN'});

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
  emit('radioSelected', radioConnection.value);
}

</script>
