<template>
  <RadioSelector v-model="selectedRadio" />
  <SerialPortSelector v-model="selectedPort" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import SerialPortSelector from './components/SerialPortSelector.vue';
import RadioSelector from './components/RadioSelector.vue';

const selectedPort = ref();
const selectedRadio = ref();
</script>