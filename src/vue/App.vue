<template>
  <RadioImportDialog @import="importRadio" />
</template>

<script setup lang="ts">
import RadioImportDialog from './components/RadioImportDialog.vue';
import { RadioConnection } from '@springfield/ham-radio-api';
import { PortInfo } from '@serialport/bindings-interface';

const importRadio = (connection: RadioConnection) => {
  console.log('importRadio', connection);
}
</script>
