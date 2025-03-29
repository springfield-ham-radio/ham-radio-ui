<template>
  <RadioSelector v-model="selectedRadio" />
  <SerialPortSelector v-model="selectedPort" />
  <RadioImportDialog @import="importRadio" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import SerialPortSelector from './components/SerialPortSelector.vue';
import RadioSelector from './components/RadioSelector.vue';
import RadioImportDialog from './components/RadioImportDialog.vue';
import { RadioModel, RadioConnection } from '@springfield/ham-radio-api';
import { PortInfo } from '@serialport/bindings-interface';

const selectedPort = ref<PortInfo>();
const selectedRadio = ref<RadioModel>();

const importRadio = (connection: RadioConnection) => {
  console.log('importRadio', connection);
}
</script>
