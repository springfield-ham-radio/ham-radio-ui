<template>
  <RadioSelector v-model="selectedRadio" />
  <SerialPortSelector v-model="selectedPort" />
  <RadioImportDialog v-model="selectedRadioConnection" />
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
const selectedRadioConnection = ref<RadioConnection>({
  modelId: undefined,
  serialPortPath: undefined,
});
</script>
